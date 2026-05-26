import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliUrl } from '../cdliAPI/client.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

// Authoritative filter keys per entity (source: Codex scan of cdli/framework, 2026-05-26)
const ENTITY_FILTERS = {
  abbreviations: ['abbreviation', 'fullform'],
  archives: ['archive', 'provenience_id'],
  'artifact-types': ['artifact_type', 'parent_id'],
  authors: ['author', 'institution', 'orcid_id'],
  collections: ['collection'],
  dynasties: ['polity', 'dynasty', 'provenience_id'],
  'external-resources': ['external_resource', 'abbrev'],
  genres: ['genre', 'parent_id'],
  journals: ['journal'],
  languages: ['language', 'parent_id'],
  materials: ['material', 'parent_id'],
  proveniences: ['provenience', 'region_id'],
  rulers: ['ruler', 'period_id', 'dynasty_id'],
  'sign-readings': ['sign_reading', 'sign_name', 'meaning', 'preferred_reading'],
} as const;

type EntityKey = keyof typeof ENTITY_FILTERS;
const ENTITY_ENUM = Object.keys(ENTITY_FILTERS) as [EntityKey, ...EntityKey[]];

const FILTER_DOCS = ENTITY_ENUM.map(
  (e) => `  ${e}: ${(ENTITY_FILTERS[e] as readonly string[]).join(', ')}`,
).join('\n');

export function registerSearchEntity(server: McpServer): void {
  server.tool(
    'search_entity',
    `Search CDLI reference entities using query filters.

Builds: GET https://cdli.earth/{entity}.json?{filters}

Supported entities and their valid filter keys:
${FILTER_DOCS}

Notes:
- abbreviations, authors, collections, and external-resources also accept "letter" for prefix browsing.
- Unknown filter keys are passed through to the API unchanged.
- To list all records without filtering, use get_metadata instead.
- Avoid more than ~5 consecutive calls in a single turn.`,
    {
      entity: z.enum(ENTITY_ENUM).describe('The CDLI entity type to search'),
      filters: z
        .record(z.string())
        .optional()
        .describe('Key-value filter params. See valid keys per entity in the tool description.'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    async ({ entity, filters, offset }) =>
      withTiming('search_entity', async () => {
        try {
          const params = new URLSearchParams(filters ?? {});
          if (offset !== undefined) params.set('offset', String(offset));

          const qs = params.toString();
          const url = cdliUrl(`/${entity}.json${qs ? `?${qs}` : ''}`);

          const data = await cdliFetch<unknown>(url);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
          };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
