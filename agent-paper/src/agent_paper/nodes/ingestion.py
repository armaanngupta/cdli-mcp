from agent_paper.state import PaperState


def ingest(state: PaperState) -> dict:
    """Node 3 — fetch each ranked artifact and reduce it to a short summary.

    Raw transliteration is deliberately dropped here rather than carried forward: it is
    the bulkiest field by far and nothing downstream reads it.

    STUB: the real node calls `get_metadata` + `get_inscription` over MCP, then summarizes.
    """
    summaries = {
        artifact_id: f"Stub summary for {artifact_id}." for artifact_id in state["ranked_ids"]
    }
    return {"summaries": summaries}
