from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from agent_paper.llm import model_from
from agent_paper.mcp_client import (
    ToolError,
    client_from,
    fetch_bibliography,
    list_entities,
    search_artifacts,
)
from agent_paper.state import PaperState

# Enough gathering to write from, capped so a wandering agent can't run up an unbounded bill.
MAX_TOOL_STEPS = 8
SEARCH_LIMIT = 25

SYSTEM_PROMPT = """You gather source material from the CDLI cuneiform catalogue for a research
note on:

"{topic}"

Decide what to collect and which tools to use — do not analyze or write, only gather.

Guidance:
- If the topic is about the corpus itself — its languages, periods, proveniences, genres,
  rulers — call `list_entities` FIRST to get the real distribution, before sampling artifacts.
  Do not infer the corpus's makeup from a handful of tablets.
- Collect a broad, relevant set of candidate artifacts with `search_artifacts` (aim for
  roughly 20-40 across the topic's facets). Use at most two filter fields per search: each is
  a hard AND, so three or more fields usually match nothing.
- `provenience` is the excavation site, often NOT the polity a topic names — a state's
  archives sit under the site that produced them (e.g. the Lagaš state under "Girsu").
- Use `get_bibliography` only if actual publications matter to the topic.

Call tools until you have enough, then reply with a one-line summary of what you gathered and
stop calling tools."""


class SearchArgs(BaseModel):
    provenience: str = Field("", description='Excavation site, e.g. "Girsu"')
    period: str = Field("", description='Period, e.g. "Ur III"')
    genre: str = Field("", description='Genre, e.g. "Administrative"')
    language: str = Field("", description='Language, e.g. "Akkadian"')
    artifact_type: str = Field("", description='Artifact type, e.g. "tablet"')


class EntityArgs(BaseModel):
    entity: str = Field(
        description="languages | periods | proveniences | genres | materials | rulers | "
        "dynasties | regions | collections"
    )


class BiblioArgs(BaseModel):
    artifact_id: str = Field(description="A P-number gathered from a search")


@dataclass
class _Gathered:
    cards: dict[str, dict[str, Any]] = field(default_factory=dict)
    findings: list[str] = field(default_factory=list)
    calls: list[dict[str, str]] = field(default_factory=list)


def _entity_names(items: list[dict]) -> list[str]:
    """A readable name per entity row, trying the common name keys before any string field."""
    names = []
    for item in items:
        value = next(
            (
                item[k]
                for k in ("language", "period", "provenience", "genre", "name", "label")
                if item.get(k)
            ),
            next((v for v in item.values() if isinstance(v, str) and v), "?"),
        )
        names.append(str(value))
    return names


def _build_tools(client, acc: _Gathered) -> dict[str, StructuredTool]:
    async def search(
        provenience: str = "",
        period: str = "",
        genre: str = "",
        language: str = "",
        artifact_type: str = "",
    ) -> str:
        filters = {
            k: v
            for k, v in {
                "provenience": provenience,
                "period": period,
                "genre": genre,
                "language": language,
                "artifact_type": artifact_type,
            }.items()
            if v
        }
        if not filters:
            return "Provide at least one filter field."
        acc.calls.append(filters)
        try:
            cards = await search_artifacts(client, filters, limit=SEARCH_LIMIT)
        except ToolError as err:
            return f"Search failed ({err}). Try broader or different filters."
        for card in cards:
            acc.cards[card["p_number"]] = card
        sample = ", ".join(f"{c['p_number']} ({c.get('designation')})" for c in cards[:5])
        return f"{len(cards)} artifacts (running total {len(acc.cards)}). Sample: {sample}"

    async def entities(entity: str) -> str:
        acc.calls.append({"list_entities": entity})
        try:
            items = await list_entities(client, entity)
        except ToolError as err:
            return f"Could not list {entity} ({err})."
        names = _entity_names(items)
        finding = f"CDLI {entity} ({len(items)}): {', '.join(names[:40])}"
        acc.findings.append(finding)
        return finding

    async def bibliography(artifact_id: str) -> str:
        acc.calls.append({"get_bibliography": artifact_id})
        try:
            text = await fetch_bibliography(client, artifact_id)
        except ToolError as err:
            return f"No bibliography ({err})."
        acc.findings.append(f"Bibliography {artifact_id}: {text[:400]}")
        return text[:600]

    return {
        "search_artifacts": StructuredTool.from_function(
            coroutine=search,
            name="search_artifacts",
            description="Search the catalogue for artifacts by facet. At most two fields.",
            args_schema=SearchArgs,
        ),
        "list_entities": StructuredTool.from_function(
            coroutine=entities,
            name="list_entities",
            description="List every value of a catalogue entity (languages, periods, ...).",
            args_schema=EntityArgs,
        ),
        "get_bibliography": StructuredTool.from_function(
            coroutine=bibliography,
            name="get_bibliography",
            description="Fetch the publications for one artifact by P-number.",
            args_schema=BiblioArgs,
        ),
    }


async def discover(state: PaperState, config: RunnableConfig) -> dict:
    """Node 1 — an agentic gather: the model chooses which catalogue tools to call.

    Only gathering is agentic; everything downstream stays deterministic, so the model
    decides *what* to collect but can't invent artifacts — ingestion summarizes only what was
    fetched and node 6 flags any cited id that wasn't. Caller-supplied filters, when present,
    pin the search and skip the agent entirely.
    """
    client = client_from(config)
    acc = _Gathered()

    if state["filters"]:
        acc.calls.append(state["filters"])
        for card in await search_artifacts(client, state["filters"], limit=SEARCH_LIMIT):
            acc.cards[card["p_number"]] = card
    else:
        tools = _build_tools(client, acc)
        llm = model_from(config).bind_tools(list(tools.values()))
        messages: list[Any] = [
            SystemMessage(SYSTEM_PROMPT.format(topic=state["topic"])),
            HumanMessage("Begin gathering."),
        ]
        for _ in range(MAX_TOOL_STEPS):
            reply = await llm.ainvoke(messages)
            messages.append(reply)
            if not reply.tool_calls:
                break
            for call in reply.tool_calls:
                tool = tools.get(call["name"])
                result = (
                    await tool.ainvoke(call["args"]) if tool else f"Unknown tool {call['name']}"
                )
                messages.append(ToolMessage(content=result, tool_call_id=call["id"]))

    if not acc.cards:
        raise ValueError(
            f"No artifacts gathered for topic {state['topic']!r}. Calls: {acc.calls or 'none'}"
        )

    return {
        "queries": acc.calls,
        "cards": acc.cards,
        "artifact_ids": sorted(acc.cards),
        "context_findings": acc.findings,
    }
