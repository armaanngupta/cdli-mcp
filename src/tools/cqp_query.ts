import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch } from '../cdliAPI/client.js';
import { ErrorCode, McpError, toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

// CQP4RDF lives behind a different service than the main CDLI REST API; the base
// URL is overridable so a local instance can be used while the deployed one is unstable.
const DEFAULT_CQP_URL = 'https://cdli.earth/cqp4rdf/api/query';
const CORPUS = 'cdli';
const CQP_TIMEOUT_MS = 15000;

interface WordToken {
  word: string;
  link: string;
}

interface ResultRow {
  l_context: WordToken[];
  keywords: WordToken[];
  r_context: WordToken[];
}

interface CqpResponse {
  page: number;
  first_page: boolean;
  last_page: boolean;
  results: ResultRow[];
}

const text = (body: string) => ({ content: [{ type: 'text' as const, text: body }] });

// A multi-token query without a :: join is a Cartesian product over the whole corpus and always
// times out Fuseki. Count labeled tokens (wN:[ — not conll:FORM, whose colon isn't followed by [).
function assertJoinedIfMultiToken(cqp: string): void {
  const tokenCount = (cqp.match(/[A-Za-z_]\w*\s*:\s*\[/g) ?? []).length;
  if (tokenCount >= 2 && !cqp.includes('::')) {
    throw new McpError(
      ErrorCode.INVALID_INPUT,
      'Multi-word queries require a :: join constraint, e.g. add :: (w1.nif:nextWord=w2) for adjacency or :: (w1.conll:HEAD=w2) for a syntactic relation. Without it the query times out.',
      false,
    );
  }
}

// KWIC line: left context ... [matched word(s)] ... right context. Raw RDF link URIs are dropped.
function formatRow(row: ResultRow): string {
  const left = row.l_context.map((w) => w.word).join(' ');
  const match = row.keywords.map((w) => w.word).join(' ');
  const right = row.r_context.map((w) => w.word).join(' ');
  return [left, `[${match}]`, right].filter((s) => s.trim() !== '').join(' ');
}

function formatResponse(data: CqpResponse): string {
  const lines = data.results.map(formatRow);
  const header =
    `Page ${data.page} — ${lines.length} result(s)` +
    (data.last_page ? '' : ` (more available — request page ${data.page + 1})`);
  return `${header}\n\n${lines.join('\n')}`;
}

export function registerCqpQuery(server: McpServer): void {
  server.tool(
    'cqp_query',
    `Search the CDLI corpus of ~375 Ur III Sumerian cuneiform administrative tablets using a CQP (Corpus Query Protocol) query. Texts are annotated with morphology and syntax; results come back as KWIC (keyword-in-context) lines.

QUERY SYNTAX
Single word:        w1:[ ( conll:FIELD = "value" ) ]
AND on one word:    w1:[ ( conll:FIELD1 = "v1" ) & ( conll:FIELD2 = "v2" ) ]
OR on one word:     w1:[ ( conll:FIELD = "v1" ) | ( conll:FIELD = "v2" ) ]
Adjacent words:     w1:[ ( conll:FORM = "udu" ) ] w2:[ ( conll:FORM = "niga" ) ] :: (w1.nif:nextWord=w2)
Three adjacent:     w1:[...] w2:[...] w3:[...] :: (w1.nif:nextWord=w2) & (w2.nif:nextWord=w3)
Syntactic head:     w1:[...] w2:[...] :: (w1.conll:HEAD=w2)

CRITICAL: every query with 2+ word tokens MUST include a :: join constraint (e.g. :: (w1.nif:nextWord=w2)). This is not about ordering — without a join the backend computes a Cartesian product over every word in the corpus (e.g. 139 x 2546 = 354,094 pairs) and ALWAYS times out. A bare multi-token query like w1:[...] w2:[...] will fail every time. Never emit one. If you only need two words anywhere together, you still must join them (use nif:nextWord for adjacency, or conll:HEAD for a syntactic relation).

KNOWN LIMITATION: multi-word queries (2+ word tokens) frequently TIME OUT on the backend right now, even when correctly joined. Single-word queries are reliable. Prefer a single-word query when one can answer the question; only use a multi-word join when the relation between words is essential, and expect it may fail. A timeout here means the query was too expensive — not that there are no matches.

FIELDS (always prefix with conll:)
- conll:FORM — Sumerian surface form on the tablet. Common: "lugal" (king), "udu" (sheep), "niga" (fattened), "mu" (year), "iti" (month), "ki" (place/from), "dumu" (son), "kiszib3" (seal), "szunigin" (total), "sze" (barley), "saga" (fine), "dub-sar" (scribe), "giri3" (via/authority). Do NOT query forms containing ( ) { } [ ] — they are regex metacharacters.
- conll:UPOSTAG — coarse POS: NOUN, NUM, PROPN, VERB, CCONJ.
- conll:XPOSTAG — fine POS (best for entity types): N (noun), NU (numeral), PN (personal name), V (verb), SN (structure name), MN (month name), DN (divine name), RN (royal name), CNJ (conjunction), FN (field name), GN (geographic name), EN (divine epithet), TN (temple name), ON (object name), WN (waterway name), AN (astronomical name).
- conll:FEATS — morphology. Only pipe-free values are safe: "Case=Gen", "Case=Abs", "Case=Abl", "Polarity=Neg".
- conll:LEMMA — DO NOT USE. Square brackets in the lemma notation break regex matching; use FORM or XPOSTAG.

MATCHING: every value is an anchored regex (^value$) — exact, case-sensitive. "lugal" will not match "lugal-ra". Avoid . * + ? ( ) [ ] { } | ^ $ in values unless you intend regex behavior.

EXAMPLES
King:                 w1:[ ( conll:FORM = "lugal" ) ]
Divine names:         w1:[ ( conll:XPOSTAG = "DN" ) ]
Negated words:        w1:[ ( conll:FEATS = "Polarity=Neg" ) ]
Fattened sheep:       w1:[ ( conll:FORM = "udu" ) ] w2:[ ( conll:FORM = "niga" ) ] :: (w1.nif:nextWord=w2)
Seal of [person]:     w1:[ ( conll:FORM = "kiszib3" ) ] w2:[ ( conll:UPOSTAG = "PROPN" ) ] :: (w1.nif:nextWord=w2)
Son of [person]:      w1:[ ( conll:FORM = "dumu" ) ] w2:[ ( conll:XPOSTAG = "PN" ) ] :: (w1.nif:nextWord=w2)
Nouns in genitive:    w1:[ ( conll:UPOSTAG = "NOUN" ) & ( conll:FEATS = "Case=Gen" ) ]

Returns 50 results per page. If the response says more are available, re-call with the next page number. An error usually means the CQP syntax is invalid — revise the query and retry.

Avoid more than ~5 consecutive calls in a single turn.`,
    {
      cqp_query: z
        .string()
        .describe('A CQP query string. See the tool description for syntax and fields.'),
      page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('Page number (50 results per page). Defaults to 1.'),
    },
    async ({ cqp_query, page }) =>
      withTiming('cqp_query', async () => {
        try {
          assertJoinedIfMultiToken(cqp_query);
          const base = process.env.CQP_BASE_URL ?? DEFAULT_CQP_URL;
          const params = new URLSearchParams({
            cqp: cqp_query,
            page: String(page),
            corpus: CORPUS,
          });
          const data = await cdliFetch<CqpResponse>(`${base}?${params.toString()}`, CQP_TIMEOUT_MS);
          if (data.results.length === 0)
            return text(
              'No matches in the corpus for this query. The query ran successfully — the corpus simply contains no words matching it. Do NOT retry unchanged.',
            );
          return text(formatResponse(data));
        } catch (err) {
          // A timeout here is the backend giving up on an expensive query (typically a multi-word
          // join or a very frequent form), NOT an empty result — matches may exist but cannot be
          // computed in time. Reword so the model narrows the query rather than reading it as "no data".
          if (err instanceof McpError && err.code === ErrorCode.TIMEOUT) {
            return toErrorResponse(
              new McpError(
                ErrorCode.TIMEOUT,
                'The corpus backend timed out on this query. This is a known limit on expensive queries (multi-word joins, or a very frequent leading token) — it does NOT mean there are no matches. Narrow the query (rarer leading token, fewer word tokens, or a more specific field) and retry.',
                true,
              ),
            );
          }
          return toErrorResponse(err);
        }
      }),
  );
}
