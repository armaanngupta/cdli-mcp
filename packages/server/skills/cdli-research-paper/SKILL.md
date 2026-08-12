---
name: cdli-research-paper
description: Write a rigorous, fully-cited research note from the CDLI cuneiform catalogue. Use when the user asks to research a cuneiform / Assyriology / ancient-Near-East topic or to write a paper about one, and the CDLI MCP server (cdli-mcp) is connected so its tools are available.
---

# CDLI research note

A client-agnostic mirror of the `research_paper` MCP prompt exposed by the CDLI MCP server.
Use it when you have the CDLI catalogue tools available and the user wants a researched,
cited note on a topic. **You** orchestrate the tools — deciding what to gather and when is
the point of the task.

Requires these CDLI MCP tools (all read-only): `advanced_search`, `get_metadata`,
`search_entity`, `get_inscription`, `get_bibliography`, `cqp_query`. If they are not
connected, say so rather than writing from memory.

## Process

Work through every step; do not skip.

1. **Gather.** Decide what sources the note needs and collect them.
   - If the topic is about the corpus itself (its languages, periods, proveniences, genres,
     rulers), call `get_metadata` for that entity FIRST to learn the real distribution across
     the whole catalogue. Do not infer the corpus's makeup from a handful of tablets.
   - Find candidate artifacts with `advanced_search` using ONE or TWO filter fields per call.
     Each field is a hard AND, so three or more fields usually match nothing.
   - `provenience` is the excavation findspot, often NOT the polity a topic names — a state's
     archives sit under the site that produced them (e.g. the Lagaš state under "Girsu", not
     "Lagash"). Search the site where the tablets were actually found.
   - Gather a broad, representative set — not just the first page. Use `limit` and the
     `search_after` cursor to go deeper when the topic warrants a larger or more balanced
     sample across languages, periods, or regions.
   - Use `get_bibliography` only when actual publications matter.

2. **Select** the artifacts you will rely on: enough to support the argument, few enough to
   read carefully.

3. **Read** each with `get_inscription` and note what the text records — quantities,
   officials, deities, month and year names, places. Summarize; never paste raw
   transliteration into the note.

4. **Organize** the findings into a small number of themes.

5. **Assess** whether the evidence is sufficient and balanced. If it is thin or one-sided,
   gather more before writing rather than overstating what you have.

6. **Write** the note in Markdown: a concise scholarly H1 title; a framing introduction
   (what the corpus is, what you argue, and honestly what the sample can and cannot show
   relative to the wider catalogue); one section per theme grounded in specific detail; and a
   conclusion stating the sample's limits.

7. **Cite rigorously** — non-negotiable:
   - Every paragraph making a claim cites at least one P-number inline, written exactly
     (e.g. `P100166`).
   - Cite ONLY artifacts you actually retrieved and read. NEVER cite or describe an artifact
     you did not retrieve.
   - It is far better to write less, or to say the evidence is thin, than to invent an
     artifact, a citation, or a detail — inventing anything invalidates the note.
   - Before finishing, re-read the draft and check every cited P-number against what you
     retrieved; remove or correct any you cannot support.

8. **End** with a `## Cited artifacts` section linking each cited P-number:
   `- [P100166](https://cdli.earth/artifacts/100166) — <its designation>`

Produce only the finished Markdown note.
