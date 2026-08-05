from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agent_paper.llm import ask
from agent_paper.state import PaperState

PROMPT = """Write a short research note in Markdown on:

"{topic}"

Themes and their supporting artifacts:
{themes}

Artifact summaries:
{summaries}

Requirements:
- Open with a brief framing paragraph, then one section per theme, then a short conclusion.
- Every paragraph making a claim about the evidence must cite at least one P-number
  inline, written exactly as it appears above (e.g. P100166).
- Cite only P-numbers listed above. Never invent one.
- Say plainly where the evidence is thin. Do not overstate what {count} artifacts can show."""


class Draft(BaseModel):
    markdown: str = Field(description="The full research note in Markdown")


async def synthesize(state: PaperState, config: RunnableConfig) -> dict:
    """Node 5 — write the Markdown draft, every claim carrying a CDLI citation."""
    themes = "\n".join(
        f"- {theme['label']}: {', '.join(theme['artifact_ids'])}" for theme in state["themes"]
    )
    summaries = "\n\n".join(f"{pid}: {text}" for pid, text in state["summaries"].items())

    draft = await ask(
        config,
        Draft,
        PROMPT.format(
            topic=state["topic"],
            themes=themes,
            summaries=summaries,
            count=len(state["summaries"]),
        ),
    )
    return {"draft": draft.markdown}
