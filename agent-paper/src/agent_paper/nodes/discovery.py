from typing import Any

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agent_paper.llm import ask
from agent_paper.mcp_client import ToolError, client_from, search_artifacts
from agent_paper.state import PaperState

CANDIDATES_PER_QUERY = 25
MAX_QUERIES = 3
SEARCH_ATTEMPTS = 2

PROMPT = """You are planning a corpus search of the CDLI cuneiform catalogue for a paper on:

"{topic}"

Write up to {max_queries} complementary catalogue queries. Each field is matched against
CDLI's own catalogue values, so use the vocabulary the catalogue uses, not modern prose.

Critical: `provenience` is the archaeological findspot a tablet was excavated at, which is
often NOT the name of the polity or dynasty a topic refers to. A state's archives are
catalogued under the specific site that produced them, which may be its administrative
capital rather than the state's name. Choose the site where the relevant tablets were
actually found.

Use AT MOST TWO fields per query, and leave every other field empty. Each field is a hard
AND filter, so a three- or four-field query almost always matches nothing — this is the
single most common way these searches fail. A broad query that returns too much is
recoverable; one that returns nothing is not.

Vary the queries so they cover different aspects of the topic rather than repeating one
query with small changes."""


class SearchQuery(BaseModel):
    provenience: str = Field("", description='Excavation site, e.g. "Girsu", "Nippur"')
    period: str = Field("", description='Period, e.g. "Ur III", "Old Babylonian"')
    genre: str = Field("", description='Genre, e.g. "Administrative", "Royal Inscription"')
    language: str = Field("", description='Language, e.g. "Sumerian", "Akkadian"')
    artifact_type: str = Field("", description='Artifact type, e.g. "tablet", "cylinder"')
    rationale: str = Field(description="Why this query suits the topic")


class QueryPlan(BaseModel):
    queries: list[SearchQuery]


async def _search_with_retry(client, query: dict[str, str], failed: list[str]) -> list[dict]:
    """Run one query, tolerating CDLI's intermittent search timeouts.

    A broad query regularly exceeds the 15s search timeout and then succeeds on a second
    attempt, so a single retry materially changes how many candidates a run collects.
    Losing one query of several is survivable — record it and let the others stand.
    """
    for attempt in range(SEARCH_ATTEMPTS):
        try:
            return await search_artifacts(client, query, limit=CANDIDATES_PER_QUERY)
        except ToolError as err:
            if attempt == SEARCH_ATTEMPTS - 1:
                failed.append(f"{query}: {err}")
    return []


def _to_filters(query: SearchQuery) -> dict[str, str]:
    fields = ("provenience", "period", "genre", "language", "artifact_type")
    return {field: getattr(query, field) for field in fields if getattr(query, field)}


async def discover(state: PaperState, config: RunnableConfig) -> dict:
    """Node 1 — turn the topic into a few broad searches and collect candidate artifacts.

    Caller-supplied filters, when present, override query planning entirely so a run can
    be pinned to an exact search.
    """
    if state["filters"]:
        queries = [state["filters"]]
    else:
        plan = await ask(
            config, QueryPlan, PROMPT.format(topic=state["topic"], max_queries=MAX_QUERIES)
        )
        queries = [f for f in (_to_filters(q) for q in plan.queries[:MAX_QUERIES]) if f]

    if not queries:
        raise ValueError(f"No usable search queries for topic {state['topic']!r}")

    client = client_from(config)
    cards: dict[str, dict[str, Any]] = {}
    failed: list[str] = []
    for query in queries:
        results = await _search_with_retry(client, query, failed)
        for card in results:
            cards[card["p_number"]] = card

    if not cards:
        raise ValueError(
            f"No artifacts found for topic {state['topic']!r}. "
            f"Queries: {queries}. Failures: {failed or 'none'}"
        )

    return {"queries": queries, "cards": cards, "artifact_ids": sorted(cards)}
