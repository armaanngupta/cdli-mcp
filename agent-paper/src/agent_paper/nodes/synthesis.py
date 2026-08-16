from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer

from agent_paper.llm import ask_text
from agent_paper.state import PaperState, Theme

_TITLE_MINOR_WORDS = {"a", "an", "the", "of", "at", "in", "on", "and", "or", "for", "to", "with"}

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

INTRO_PROMPT = """Write the title and opening of a research note on:

"{topic}"

The sections that follow are:
{outline}
{context}
The note draws only on these artifacts:
{summaries}

Begin with a concise, specific scholarly title as a single Markdown H1 (`# ...`) — a real
title, not the raw topic phrase. Then write 2-3 framing paragraphs with no further heading:
what the corpus is, what the note argues, and what {artifact_count} artifacts can and cannot
show. If corpus context is given above, use it to frame the scope honestly (e.g. how the
sampled artifacts sit within the catalogue's full range).
- Cite a P-number only for a specific claim about a listed artifact, copied exactly.
- The artifacts above are the ONLY ones that exist in this study. Never mention or cite any
  other P-number, and never describe an artifact that is not listed — inventing an example
  invalidates the paper."""

CONCLUSION_PROMPT = """Write the conclusion of a research note on:

"{topic}"

The sections were:
{outline}

It drew only on these artifacts:
{summaries}

Write 1-2 paragraphs of Markdown under a `## Conclusion` heading. Draw the threads together
and be explicit about the limits of a study resting on {artifact_count} artifacts. Cite only
the P-numbers listed above, and introduce no evidence the sections did not discuss."""


def _evidence_for(state: PaperState, theme: Theme) -> str:
    summaries = state["summaries"]
    return "\n\n".join(f"{pid}: {summaries[pid]}" for pid in theme["artifact_ids"])


def _outline(themes: list[Theme]) -> str:
    return "\n".join(f"{i + 1}. {theme['label']}" for i, theme in enumerate(themes))


def _all_evidence(state: PaperState) -> str:
    return "\n\n".join(f"{pid}: {text}" for pid, text in state["summaries"].items())


def _context_block(state: PaperState) -> str:
    findings = state.get("context_findings") or []
    if not findings:
        return ""
    joined = "\n".join(f"- {f}" for f in findings)
    return f"\nCorpus context gathered from the catalogue:\n{joined}\n"


def _titlecase(topic: str) -> str:
    words = topic.split()
    return " ".join(
        w if i and w.lower() in _TITLE_MINOR_WORDS else w[:1].upper() + w[1:]
        for i, w in enumerate(words)
    )


def _unwrap_emphasis(title: str) -> str:
    """Drop emphasis markers only when they wrap the *whole* title.

    A blanket strip of "*_" breaks a title that emphasises just one word — `*cdli*
    Administrative Texts` loses its opening marker and renders the closing one literally.
    The inner check keeps a title with several emphasised spans intact too.
    """
    for marker in ("**", "__", "*", "_"):
        if len(title) > 2 * len(marker) and title.startswith(marker) and title.endswith(marker):
            inner = title[len(marker) : -len(marker)]
            if marker not in inner:
                return inner.strip()
    return title


def _ensure_title(intro: str, topic: str) -> str:
    """Guarantee the intro opens with a clean H1 title.

    The model usually supplies one but sometimes wraps it in emphasis (`# *Title*`), which
    renders as an italic heading; and it may omit the heading entirely, which would leave the
    paper untitled. Normalize the former and fall back to the topic for the latter.
    """
    stripped = intro.lstrip()
    if stripped.startswith("# "):
        head, _, rest = stripped.partition("\n")
        return f"# {_unwrap_emphasis(head[2:].strip())}\n{rest}"
    return f"# {_titlecase(topic)}\n\n{intro}"


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

    # Intro and conclusion are written last and, crucially, are given the same evidence and
    # valid-id whitelist the sections had. Written blind to the evidence (as they once were),
    # the intro invents illustrative artifacts and citations that read convincingly — the
    # single worst failure this pipeline had. The intro also supplies the paper's real title.
    evidence = _all_evidence(state)
    context = _context_block(state)
    intro = await ask_text(
        config,
        INTRO_PROMPT.format(
            topic=state["topic"],
            outline=outline,
            context=context,
            summaries=evidence,
            artifact_count=artifact_count,
        ),
    )
    conclusion = await ask_text(
        config,
        CONCLUSION_PROMPT.format(
            topic=state["topic"],
            outline=outline,
            summaries=evidence,
            artifact_count=artifact_count,
        ),
    )

    parts = [_ensure_title(intro, state["topic"]), *sections, conclusion]
    return {"draft": "\n\n".join(parts)}
