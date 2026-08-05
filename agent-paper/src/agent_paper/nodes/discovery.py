from typing import Any

from langchain_core.runnables import RunnableConfig

from agent_paper.mcp_client import client_from, search_artifacts
from agent_paper.state import PaperState

CANDIDATES_PER_QUERY = 25


async def discover(state: PaperState, config: RunnableConfig) -> dict:
    """Node 1 — run 1-3 broad searches and collect candidate artifacts.

    The queries are the caller's filters verbatim for now; generating them from the topic
    is the LLM step. Everything downstream is already shaped for several queries, so that
    change lands here alone.
    """
    queries = [state["filters"]] if state["filters"] else []
    if not queries:
        raise ValueError("No search filters supplied — pass at least one, e.g. provenience=Lagash")

    client = client_from(config)
    cards: dict[str, dict[str, Any]] = {}
    for query in queries:
        for card in await search_artifacts(client, query, limit=CANDIDATES_PER_QUERY):
            cards[card["p_number"]] = card

    return {"queries": queries, "cards": cards, "artifact_ids": sorted(cards)}
