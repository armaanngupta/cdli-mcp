from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agent_paper.llm import ask
from agent_paper.state import PaperState, Theme

PROMPT = """Group these cuneiform artifacts into themes for a paper on:

"{topic}"

Summaries:
{summaries}

Each theme needs a short descriptive label and the P-numbers supporting it. Base themes on
what the texts actually share, not on the catalogue facets they were selected by. An
artifact may appear in more than one theme, and one that fits nowhere may be left out."""


class ThemeOut(BaseModel):
    label: str = Field(description="Short descriptive label")
    artifact_ids: list[str] = Field(description="Supporting P-numbers")


class Clusters(BaseModel):
    themes: list[ThemeOut]


async def cluster(state: PaperState, config: RunnableConfig) -> dict:
    """Node 3.5 — group the summaries into labeled themes with supporting artifact ids."""
    summaries = state["summaries"]
    rendered = "\n\n".join(f"{pid}: {text}" for pid, text in summaries.items())

    clusters = await ask(config, Clusters, PROMPT.format(topic=state["topic"], summaries=rendered))

    # Drop cited ids we never ingested so a hallucinated P-number can't reach the draft.
    themes: list[Theme] = []
    for theme in clusters.themes:
        supported = [pid for pid in theme.artifact_ids if pid in summaries]
        if supported:
            themes.append(Theme(label=theme.label, artifact_ids=supported))
    return {"themes": themes}
