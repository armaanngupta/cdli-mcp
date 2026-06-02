import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliUrl } from '../cdliAPI/client.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

const DEFAULT_LIMIT = 25;

const SEARCH_FIELDS = [
  'provenience',
  'period',
  'genre',
  'language',
  'material',
  'collection',
  'artifact_type',
  'designation',
  'museum_no',
  'accession_no',
  'excavation_no',
  'composite_no',
  'dates_referenced',
  'id',
] as const;

export function registerAdvancedSearch(server: McpServer): void {
  server.tool(
    'advanced_search',
    `Search CDLI artifacts by metadata fields.

Builds: GET https://cdli.earth/search.json?{fields}&limit&page

Multiple fields are combined with AND. Per-field value syntax:
- Plain value: matches the indexed term — use the exact canonical value
  (period "Ur III" not "Ur 3"; provenience "Nippur"). Abbreviations/typos match poorly.
- "quoted" — exact phrase match.
- /pattern/ — regular expression.
- * and ? — wildcards, e.g. "Nipp*".
- a %OR% b  or  a %AND% b — multiple values within one field.

Use names, not numeric IDs, for descriptive fields (period, genre, provenience, …).
id and composite_no accept bare numbers (P/Q prefixes are stripped).

This searches artifact metadata only — for inscription text use get_inscription.

Pagination is page-based (no total count yet): inspect the returned result count
and request the next page with "page" (limit max 10000). Avoid more than ~5
consecutive calls in a single turn.`,
    {
      provenience: z.string().optional().describe('Findspot/origin, e.g. "Nippur"'),
      period: z.string().optional().describe('Period, e.g. "Ur III"'),
      genre: z.string().optional().describe('Genre, e.g. "Administrative"'),
      language: z.string().optional().describe('Language, e.g. "Sumerian"'),
      material: z.string().optional().describe('Material, e.g. "clay"'),
      collection: z.string().optional().describe('Holding collection, e.g. "Louvre"'),
      artifact_type: z.string().optional().describe('Artifact type, e.g. "tablet"'),
      designation: z.string().optional().describe('CDLI designation/title'),
      museum_no: z.string().optional().describe('Museum number, e.g. "VAT 01533"'),
      accession_no: z.string().optional().describe('Museum accession number'),
      excavation_no: z.string().optional().describe('Excavation number'),
      composite_no: z.string().optional().describe('Composite text number, e.g. "Q000002"'),
      dates_referenced: z.string().optional().describe('Referenced date string'),
      id: z.string().optional().describe('Numeric artifact id'),
      limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 25)'),
      page: z.number().int().min(1).optional().describe('1-based page number (default 1)'),
    },
    async (input) =>
      withTiming('advanced_search', async () => {
        try {
          const params = new URLSearchParams();
          for (const field of SEARCH_FIELDS) {
            const value = input[field];
            if (value !== undefined && value !== '') params.set(field, value);
          }

          const limit = input.limit ?? DEFAULT_LIMIT;
          const page = input.page ?? 1;
          params.set('limit', String(limit));
          params.set('page', String(page));

          const url = cdliUrl(`/search.json?${params.toString()}`);
          const results = await cdliFetch<unknown[]>(url);

          const note =
            `Returned ${results.length} result(s) on page ${page} (limit ${limit}). ` +
            `Request page ${page + 1} for more.`;

          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(results, null, 2) },
              { type: 'text' as const, text: note },
            ],
          };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
