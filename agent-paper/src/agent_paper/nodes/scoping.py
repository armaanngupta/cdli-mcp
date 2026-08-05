from agent_paper.state import PaperState

TOP_N = 10


def _rank_key(card: dict) -> tuple:
    # An artifact with no inscription can't support a claim about its text, so inscribed
    # ones sort first; publication count is a rough proxy for scholarly attention.
    return (not card["has_inscription"], -card["publication_count"], card["p_number"])


def scope(state: PaperState) -> dict:
    """Node 2 — filter and rank the candidates down to the most relevant handful.

    Also the re-entry point when node 4 judges the evidence too weak, so it must be safe
    to run more than once against the same candidate pool.

    Heuristic for now; model-judged relevance to the topic is the LLM step.
    """
    ranked = sorted(state["cards"].values(), key=_rank_key)
    return {"ranked_ids": [card["p_number"] for card in ranked[:TOP_N]]}
