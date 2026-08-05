import asyncio
from typing import Any

from langchain_core.runnables import RunnableConfig

from agent_paper.mcp_client import client_from, fetch_inscription
from agent_paper.state import PaperState

# ATF structural lines: & = artifact header, # = protocol/comment, @ = surface/column marker.
_ATF_MARKUP_PREFIXES = ("&", "#", "@", "$")


def _text_line_count(atf: str) -> int:
    return sum(
        1
        for line in atf.splitlines()
        if line.strip() and not line.lstrip().startswith(_ATF_MARKUP_PREFIXES)
    )


def _provisional_summary(card: dict[str, Any], atf: str | None) -> str:
    """Describe an artifact from its card. Placeholder until the LLM writes real summaries.

    Takes the ATF only to measure it — the transliteration itself is deliberately not
    carried into state, since it is the bulkiest field and nothing downstream reads it.
    """
    descriptors = [card.get(field) for field in ("period", "provenience", "genre", "language")]
    described = ", ".join(str(value) for value in descriptors if value)
    designation = card.get("designation") or card["p_number"]
    inscription = f"{_text_line_count(atf)} lines of text" if atf else "no inscription"
    return f"{designation} ({described}); {inscription}."


async def ingest(state: PaperState, config: RunnableConfig) -> dict:
    """Node 3 — fetch each ranked artifact and reduce it to a short summary."""
    client = client_from(config)
    cards = state["cards"]

    async def summarize(artifact_id: str) -> tuple[str, str]:
        card = cards[artifact_id]
        atf = await fetch_inscription(client, artifact_id) if card["has_inscription"] else None
        return artifact_id, _provisional_summary(card, atf)

    pairs = await asyncio.gather(*(summarize(i) for i in state["ranked_ids"]))
    return {"summaries": dict(pairs)}
