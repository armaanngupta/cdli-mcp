import json
import os
from typing import Any

from langchain_core.runnables import RunnableConfig
from mcp import Client
from mcp.types import TextContent

DEFAULT_MCP_URL = "http://localhost:3000/mcp"

# get_inscription reports "no inscription" and "not annotated" as *successful* text
# responses, not errors, so they have to be recognized by content.
_MISSING_INSCRIPTION_MARKERS = ("No inscription available", "annotations not available")


class ToolError(RuntimeError):
    """A tool returned the server's error envelope ({code, message, retryable})."""


def mcp_url() -> str:
    return os.environ.get("MCP_URL", DEFAULT_MCP_URL)


def connect(url: str | None = None) -> Client:
    """Open a client against the CDLI MCP server. Use as an async context manager.

    The `/mcp` endpoint is public and unauthenticated, so the paper agent talks to it
    directly rather than proxying through the chat backend.
    """
    return Client(url or mcp_url())


async def _call(client: Client, name: str, arguments: dict[str, Any]) -> list[str]:
    result = await client.call_tool(name, arguments)
    texts = [block.text for block in result.content if isinstance(block, TextContent)]
    if result.is_error:
        raise ToolError(f"{name}: {texts[0] if texts else 'unknown error'}")
    return texts


async def search_artifacts(
    client: Client, filters: dict[str, str], limit: int = 25
) -> list[dict[str, Any]]:
    """Run `advanced_search`. Returns the artifact summary cards.

    The tool's second content block is an orchestration note for a chat model
    (match totals, paging cursor) — irrelevant here, so it is dropped.
    """
    texts = await _call(client, "advanced_search", {**filters, "limit": limit})
    return json.loads(texts[0])


async def fetch_inscription(client: Client, artifact_id: str) -> str | None:
    """Return the ATF for an artifact, or None when it has no usable inscription."""
    texts = await _call(client, "get_inscription", {"id": artifact_id, "format": "atf"})
    body = texts[0] if texts else ""
    if any(marker in body for marker in _MISSING_INSCRIPTION_MARKERS):
        return None
    return body


async def list_entities(client: Client, entity: str) -> list[dict[str, Any]]:
    """List a CDLI entity type — e.g. every language, period, or provenience in the catalogue.

    This is how the discovery agent learns the corpus's real structure instead of inferring
    it from a handful of sampled artifacts.
    """
    texts = await _call(client, "get_metadata", {"entity": entity})
    data = json.loads(texts[0])
    return data if isinstance(data, list) else [data]


async def fetch_bibliography(client: Client, artifact_id: str) -> str:
    texts = await _call(client, "get_bibliography", {"id": artifact_id})
    return texts[0] if texts else "(no bibliography)"


def client_from(config: RunnableConfig) -> Client:
    """Pull the shared client out of the graph config, so one connection serves a whole run."""
    return config["configurable"]["mcp_client"]
