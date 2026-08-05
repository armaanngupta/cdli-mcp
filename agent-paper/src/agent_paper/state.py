from typing import Any, TypedDict


class Theme(TypedDict):
    """A cluster of artifacts sharing a topic, produced by node 3.5."""

    label: str
    artifact_ids: list[str]


class PaperState(TypedDict):
    """The object threaded through every node of the paper pipeline.

    Each node returns a partial dict; LangGraph merges it into the running state.
    """

    topic: str
    # Search filters for node 1. Supplied by the caller for now; node 1 will generate them
    # from the topic once the LLM step lands.
    filters: dict[str, str]
    queries: list[dict[str, str]]
    artifact_ids: list[str]
    # p_number -> the artifact summary card from advanced_search. Carried forward so later
    # nodes read metadata without re-fetching it per artifact.
    cards: dict[str, dict[str, Any]]
    ranked_ids: list[str]
    # artifact id -> ~3-sentence summary. Raw transliteration is discarded at ingestion
    # so it never reaches the synthesis context.
    summaries: dict[str, str]
    themes: list[Theme]
    evidence_is_weak: bool
    rescope_count: int
    draft: str
    # Cited ids that node 6 could not match against the artifacts actually ingested.
    unverified_citations: list[str]


def initial_state(topic: str, filters: dict[str, str] | None = None) -> PaperState:
    return PaperState(
        topic=topic,
        filters=filters or {},
        queries=[],
        artifact_ids=[],
        cards={},
        ranked_ids=[],
        summaries={},
        themes=[],
        evidence_is_weak=False,
        rescope_count=0,
        draft="",
        unverified_citations=[],
    )
