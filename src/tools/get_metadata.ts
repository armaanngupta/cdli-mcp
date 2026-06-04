import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliUrl, normalizeArtifactId } from '../cdliAPI/client.js';
import { denoise } from '../cdliAPI/compress.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

// Maps enum keys to CDLI URL path segments
const ENTITY_PATHS = {
  artifacts: 'artifacts',
  inscriptions: 'inscriptions',
  publications: 'publications',
  authors: 'authors',
  periods: 'periods',
  genres: 'genres',
  languages: 'languages',
  materials: 'materials',
  proveniences: 'proveniences',
  collections: 'collections',
  regions: 'regions',
  rulers: 'rulers',
  dynasties: 'dynasties',
  journals: 'journals',
  archives: 'archives',
  'artifact-types': 'artifact-types',
  'sign-readings': 'sign-readings',
} as const;

type EntityKey = keyof typeof ENTITY_PATHS;

const ENTITY_ENUM = Object.keys(ENTITY_PATHS) as [EntityKey, ...EntityKey[]];

export function registerGetMetadata(server: McpServer): void {
  server.tool(
    'get_metadata',
    `Fetch metadata from CDLI for any supported entity type.

Two modes:
- List mode (no id): returns all records of that entity type, e.g. all periods or all genres.
- By-ID mode (with id): returns a single record. For artifacts, accepts P-numbers (P000001, P12345) or bare integers.

Supported entities: artifacts, inscriptions, publications, authors, periods, genres, languages, materials, proveniences, collections, regions, rulers, dynasties, journals, archives, artifact-types, sign-readings.

Prefer advanced_search over listing all artifacts. Avoid more than ~5 consecutive calls in a single turn.`,
    {
      entity: z.enum(ENTITY_ENUM).describe('The CDLI entity type to fetch'),
      id: z
        .string()
        .optional()
        .describe('Record ID. For artifacts, accepts P-numbers (P000001) or bare integers.'),
    },
    async ({ entity, id }) =>
      withTiming('get_metadata', async () => {
        try {
          const path = ENTITY_PATHS[entity];
          const resolvedId =
            id !== undefined && entity === 'artifacts' ? normalizeArtifactId(id) : id;
          const url =
            resolvedId !== undefined
              ? cdliUrl(`/${path}/${resolvedId}.json`)
              : cdliUrl(`/${path}.json`);

          const data = await cdliFetch<unknown>(url);
          // By-ID artifact is the "give me everything" view: keep full depth but
          // strip FK/admin noise. All other entities and list mode stay raw.
          const projected =
            entity === 'artifacts' && resolvedId !== undefined ? denoise(data) : data;
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(projected, null, 2) }],
          };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
