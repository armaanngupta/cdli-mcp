from agent_paper.state import PaperState


def synthesize(state: PaperState) -> dict:
    """Node 5 — write the Markdown draft, every paragraph carrying a CDLI citation.

    STUB: the real node writes from the themes and summaries under a citation-required prompt.
    """
    sections = [f"# {state['topic']}\n"]
    for theme in state["themes"]:
        citations = ", ".join(theme["artifact_ids"])
        sections.append(f"## {theme['label']}\n\nStub paragraph. ({citations})\n")
    return {"draft": "\n".join(sections)}
