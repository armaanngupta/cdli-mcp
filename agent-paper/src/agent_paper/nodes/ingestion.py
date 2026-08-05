import asyncio
from typing import Any

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agent_paper.llm import ask
from agent_paper.mcp_client import client_from, fetch_inscription
from agent_paper.state import PaperState

# Cap the transliteration sent per artifact: a few long tablets would otherwise dominate
# the run's token spend, and the summary only needs the gist.
MAX_ATF_CHARS = 4000

PROMPT = """Summarize this cuneiform artifact in about three sentences, for a paper on:

"{topic}"

Catalogue record:
{record}

Transliteration (ATF):
{atf}

State what the text is and what it records. Note anything bearing on the topic. Do not
speculate beyond the evidence, and do not repeat the catalogue fields verbatim."""

NO_INSCRIPTION = "(no transliteration available — describe from the catalogue record alone)"


class Summary(BaseModel):
    text: str = Field(description="About three sentences")


def _render_record(card: dict[str, Any]) -> str:
    fields = (
        "p_number",
        "designation",
        "period",
        "provenience",
        "genre",
        "language",
        "material",
        "artifact_type",
        "collection",
        "museum_no",
    )
    return "\n".join(f"{f}: {card[f]}" for f in fields if card.get(f))


async def ingest(state: PaperState, config: RunnableConfig) -> dict:
    """Node 3 — fetch each ranked artifact and reduce it to a short summary.

    The transliteration is summarized and dropped rather than carried in state: it is by
    far the bulkiest field, and every downstream node reads the summary instead.
    """
    client = client_from(config)
    cards = state["cards"]

    async def summarize(artifact_id: str) -> tuple[str, str]:
        card = cards[artifact_id]
        atf = await fetch_inscription(client, artifact_id) if card["has_inscription"] else None
        summary = await ask(
            config,
            Summary,
            PROMPT.format(
                topic=state["topic"],
                record=_render_record(card),
                atf=atf[:MAX_ATF_CHARS] if atf else NO_INSCRIPTION,
            ),
        )
        return artifact_id, summary.text

    pairs = await asyncio.gather(*(summarize(i) for i in state["ranked_ids"]))
    return {"summaries": dict(pairs)}
