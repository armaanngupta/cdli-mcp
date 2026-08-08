from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer

from agent_paper.llm import ask_text
from agent_paper.state import PaperState, Theme

# A whole paper written in one call is capped by the model's max output tokens, which is why
# single-call drafts landed near 5k characters whatever the topic. Writing a section at a
# time gives each its own output budget, and lets each see more evidence than a whole-paper
# call could fit in context.
TARGET_WORDS_PER_SECTION = 450

SECTION_PROMPT = """Write one section of a research note on:

"{topic}"

The note's full outline is:
{outline}

You are writing section {position}: **{label}**. The other sections cover the rest of the
outline — stay on your own theme and do not restate theirs.

Evidence for this section:
{evidence}

The ONLY P-numbers that exist in this study are:
{valid_ids}

Write roughly {target_words} words of Markdown, opening with a `## {label}` heading.
Requirements:
- Draw on the specific detail in the evidence — quantities, officials, deities, month and
  year names, place names. Do not settle for generalities the evidence does not support.
- Every paragraph making a claim must cite at least one P-number inline.
- Cite ONLY ids from the list above, copied exactly. Any other P-number is fabricated and
  invalidates the paper. If your section's evidence is thin, write less and say so — never
  invent an id to fill space.
- Say plainly where the evidence is thin rather than overstating it."""

INTRO_PROMPT = """Write the opening framing of a research note on:

"{topic}"

The sections that follow are:
{outline}

Write 2-3 paragraphs of Markdown with no heading. Set out what the corpus is, what the note
argues, and what {artifact_count} artifacts can and cannot show. Cite P-numbers only where
you make a specific claim about an artifact."""

CONCLUSION_PROMPT = """Write the conclusion of a research note on:

"{topic}"

The sections were:
{outline}

Write 1-2 paragraphs of Markdown under a `## Conclusion` heading. Draw the threads together
and be explicit about the limits of a study resting on {artifact_count} artifacts. Do not
introduce evidence the sections did not discuss."""


def _evidence_for(state: PaperState, theme: Theme) -> str:
    summaries = state["summaries"]
    return "\n\n".join(f"{pid}: {summaries[pid]}" for pid in theme["artifact_ids"])


def _outline(themes: list[Theme]) -> str:
    return "\n".join(f"{i + 1}. {theme['label']}" for i, theme in enumerate(themes))


async def synthesize(state: PaperState, config: RunnableConfig) -> dict:
    """Node 5 — write the draft one section at a time, every claim citing an artifact.

    Sections are written sequentially rather than concurrently: each is told what the others
    cover so it stays on its own theme, and the intro and conclusion come last so they
    describe what the sections actually say.
    """
    themes = state["themes"]
    outline = _outline(themes)
    artifact_count = len(state["summaries"])
    # A run reaches this node minutes in with nothing user-visible yet, so each finished
    # section is reported as it lands rather than only the whole draft at the end.
    emit = get_stream_writer()

    # Every section sees the full roster of valid ids, not just its own theme's. A section
    # shown only two artifacts will otherwise invent a plausible-looking run of P-numbers to
    # cite — observed as six fabricated ids in one draft. Detailed evidence stays
    # theme-scoped; only the list of permissible citations is global.
    valid_ids = ", ".join(sorted(state["summaries"]))

    sections: list[str] = []
    for position, theme in enumerate(themes, start=1):
        section = await ask_text(
            config,
            SECTION_PROMPT.format(
                topic=state["topic"],
                outline=outline,
                position=position,
                label=theme["label"],
                evidence=_evidence_for(state, theme),
                valid_ids=valid_ids,
                target_words=TARGET_WORDS_PER_SECTION,
            ),
        )
        sections.append(section)
        emit({"section": theme["label"], "index": position, "of": len(themes)})

    intro = await ask_text(
        config,
        INTRO_PROMPT.format(topic=state["topic"], outline=outline, artifact_count=artifact_count),
    )
    conclusion = await ask_text(
        config,
        CONCLUSION_PROMPT.format(
            topic=state["topic"], outline=outline, artifact_count=artifact_count
        ),
    )

    parts = [f"# {state['topic']}", intro, *sections, conclusion]
    return {"draft": "\n\n".join(parts)}
