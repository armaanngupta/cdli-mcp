from agent_paper.state import PaperState, Theme

STUB_THEME_COUNT = 2


def cluster(state: PaperState) -> dict:
    """Node 3.5 — group the summaries into labeled themes with supporting artifact ids.

    STUB: the real node asks the model to label thematic groups across the summaries.
    """
    artifact_ids = list(state["summaries"])
    size = -(-len(artifact_ids) // STUB_THEME_COUNT)  # ceil, so no artifact is dropped
    themes: list[Theme] = [
        Theme(
            label=f"Stub theme {index + 1}",
            artifact_ids=artifact_ids[index * size : (index + 1) * size],
        )
        for index in range(STUB_THEME_COUNT)
    ]
    return {"themes": [theme for theme in themes if theme["artifact_ids"]]}
