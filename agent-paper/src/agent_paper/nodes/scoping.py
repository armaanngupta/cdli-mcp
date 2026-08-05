from agent_paper.state import PaperState

TOP_N = 10


def scope(state: PaperState) -> dict:
    """Node 2 — filter and rank the candidates down to the most relevant handful.

    Also the re-entry point when node 4 judges the evidence too weak, so it must be
    safe to run more than once against the same candidate pool.

    STUB: the real node ranks by model-judged relevance to the topic.
    """
    return {"ranked_ids": state["artifact_ids"][:TOP_N]}
