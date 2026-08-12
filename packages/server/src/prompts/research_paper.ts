import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// The methodology distilled from the LangGraph /paper pipeline (discovery → scoping →
// ingestion → clustering → evaluation → synthesis → citation validation), rewritten as
// instructions a model executes itself. The pipeline enforces these steps in code; here they
// are a standard the model is asked to hold to — so the guidance is deliberately strict,
// especially the anti-fabrication rules, which are the pipeline's one hard guarantee.
function buildPrompt(topic: string): string {
  return `You are an expert Assyriologist writing a rigorous, fully-cited research note on the
topic below, using ONLY the CDLI catalogue tools available in this session. Work through the
whole process; do not skip steps. YOU decide what to gather and when — that judgement is the
point of this task.

TOPIC: ${topic}

Tools available (all read-only): advanced_search, get_metadata, search_entity,
get_inscription, get_bibliography, cqp_query.

PROCESS

1. GATHER. Decide what sources the note needs and collect them.
   - If the topic is about the corpus itself (its languages, periods, proveniences, genres,
     rulers), FIRST call get_metadata for that entity to learn the real distribution across
     the whole catalogue. Do not infer the corpus's makeup from a handful of tablets.
   - Find candidate artifacts with advanced_search using ONE or TWO filter fields per call.
     Each field is a hard AND filter, so three or more fields usually match nothing.
   - provenience is the excavation findspot, which is often NOT the polity a topic names: a
     state's archives sit under the site that produced them (e.g. the Lagaš state under
     "Girsu", not "Lagash"). Choose the site where the relevant tablets were actually found.
   - Gather a broad, representative set — not just the first page. Use the limit and the
     search_after cursor to go deeper when the topic warrants a larger or more balanced
     sample across languages, periods, or regions.
   - Use get_bibliography only when actual publications matter to the argument.

2. SELECT the artifacts you will actually rely on: enough to support the argument, few enough
   to read carefully.

3. READ each selected artifact with get_inscription and note what its text records —
   quantities, officials, deities, month and year names, places. Summarize; never paste raw
   transliteration into the note.

4. ORGANIZE your findings into a small number of themes.

5. ASSESS whether the evidence is sufficient and balanced. If it is thin or one-sided, gather
   more before writing rather than overstating what you have.

6. WRITE the note in Markdown:
   - A concise, specific scholarly title as an H1 heading.
   - A framing introduction: what the corpus is, what you argue, and — honestly — what your
     sample can and cannot show relative to the wider catalogue.
   - One section per theme, grounded in the specific detail you read.
   - A conclusion that states the limits of the sample plainly.

7. CITE rigorously — this is non-negotiable and is what separates a research note from an
   essay:
   - Every paragraph making a claim about the evidence cites at least one P-number inline,
     written exactly (e.g. P100166).
   - Cite ONLY artifacts you actually retrieved and read in this session. NEVER cite or
     describe an artifact you did not retrieve.
   - It is far better to write less, or to say the evidence is thin, than to invent an
     artifact, a citation, or a detail. Inventing anything invalidates the note.
   - Before finishing, re-read the draft and check every cited P-number against what you
     retrieved. Remove or correct any you cannot support.

8. END with a "## Cited artifacts" section listing each cited P-number as a link:
   - [P100166](https://cdli.earth/artifacts/100166) — <its designation>

Produce only the finished Markdown note.`;
}

export function registerResearchPaperPrompt(server: McpServer): void {
  server.registerPrompt(
    'research_paper',
    {
      title: 'Write a CDLI research note',
      description:
        'Guides the model through gathering CDLI evidence and writing a rigorous, fully-cited ' +
        'Markdown research note on a topic. The model orchestrates the catalogue tools itself.',
      argsSchema: {
        topic: z
          .string()
          .describe('The research topic, e.g. "languages attested in Ur III administrative texts"'),
      },
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: buildPrompt(topic) },
        },
      ],
    }),
  );
}
