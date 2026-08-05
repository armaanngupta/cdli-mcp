from agent_paper.state import PaperState

STUB_CANDIDATE_COUNT = 12


def discover(state: PaperState) -> dict:
    """Node 1 — turn the topic into 1-3 broad searches, collect candidate artifact ids.

    STUB: the real node asks the model for queries and runs them through `advanced_search`.
    """
    queries = [state["topic"]]
    artifact_ids = [f"P{100000 + i:06d}" for i in range(STUB_CANDIDATE_COUNT)]
    return {"queries": queries, "artifact_ids": artifact_ids}
