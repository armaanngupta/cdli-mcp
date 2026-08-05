from typing import TypedDict


class Theme(TypedDict):
    """A cluster of artifacts sharing a topic, produced by node 3.5."""

    label: str
    artifact_ids: list[str]


class PaperState(TypedDict):
    """The object threaded through every node of the paper pipeline.

    Each node returns a partial dict; LangGraph merges it into the running state.
    """

    topic: str
    queries: list[str]
    artifact_ids: list[str]
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


def initial_state(topic: str) -> PaperState:
    return PaperState(
        topic=topic,
        queries=[],
        artifact_ids=[],
        ranked_ids=[],
        summaries={},
        themes=[],
        evidence_is_weak=False,
        rescope_count=0,
        draft="",
        unverified_citations=[],
    )
