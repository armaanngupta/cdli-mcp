from agent_paper.state import PaperState

MIN_THEMES = 2
MIN_ARTIFACTS_PER_THEME = 2


def evaluate(state: PaperState) -> dict:
    """Node 4 — judge whether the themes are strong enough to write from.

    `rescope_count` counts how many times the evidence has been judged weak, not how many
    times we looped — the router reads it to decide whether another re-scope is still allowed.
    """
    usable = [
        theme for theme in state["themes"] if len(theme["artifact_ids"]) >= MIN_ARTIFACTS_PER_THEME
    ]
    is_weak = len(usable) < MIN_THEMES
    return {
        "evidence_is_weak": is_weak,
        "rescope_count": state["rescope_count"] + 1 if is_weak else state["rescope_count"],
    }
