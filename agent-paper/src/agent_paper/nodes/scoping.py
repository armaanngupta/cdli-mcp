from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agent_paper.llm import ask, render_cards
from agent_paper.state import PaperState

TOP_N = 10

PROMPT = """Select the {top_n} artifacts most useful for a paper on:

"{topic}"

Candidates:
{listing}

Return their P-numbers, most relevant first. Choose only from the list above.{retry_note}"""

RETRY_NOTE = """

Your previous selection did not yield enough coherent themes. Choose a materially
different set this time — broaden the range of material rather than reshuffling the
same artifacts."""


class Ranking(BaseModel):
    artifact_ids: list[str] = Field(description="P-numbers, most relevant first")


def _fallback_order(cards: dict[str, dict]) -> list[str]:
    # An artifact with no inscription can't support a claim about its text, so inscribed
    # ones sort first; publication count is a rough proxy for scholarly attention.
    ranked = sorted(
        cards.values(),
        key=lambda c: (not c["has_inscription"], -c["publication_count"], c["p_number"]),
    )
    return [card["p_number"] for card in ranked]


async def scope(state: PaperState, config: RunnableConfig) -> dict:
    """Node 2 — rank the candidates down to the most relevant handful.

    Also the re-entry point when node 4 judges the evidence weak, so it asks for a
    different selection on a retry — re-running the same ranking would loop on the same
    artifacts and the re-scope would achieve nothing.
    """
    cards = state["cards"]
    ranking = await ask(
        config,
        Ranking,
        PROMPT.format(
            top_n=TOP_N,
            topic=state["topic"],
            listing=render_cards(list(cards.values())),
            retry_note=RETRY_NOTE if state["rescope_count"] else "",
        ),
    )

    # The model can return ids that aren't in the candidate pool; keep only real ones and
    # top up from the heuristic order so a bad response can't starve the pipeline.
    chosen = [artifact_id for artifact_id in ranking.artifact_ids if artifact_id in cards]
    for artifact_id in _fallback_order(cards):
        if len(chosen) >= TOP_N:
            break
        if artifact_id not in chosen:
            chosen.append(artifact_id)

    return {"ranked_ids": chosen[:TOP_N]}
