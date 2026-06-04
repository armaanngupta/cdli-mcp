import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliUrl, normalizeArtifactId } from '../cdliAPI/client.js';
import { compressPublication } from '../cdliAPI/compress.js';
import { CdliArtifactRecord, CdliPublicationEntry } from '../cdliAPI/types.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

// CDLI returns /artifacts/{id}.json as a single-element array, not a bare object.
function extractPublications(records: CdliArtifactRecord[]): CdliPublicationEntry[] | undefined {
  const publications = records[0]?.publications;
  return Array.isArray(publications) ? publications : undefined;
}

export function registerGetBibliography(server: McpServer): void {
  server.tool(
    'get_bibliography',
    `Fetch the bibliography (publications) for a CDLI artifact.

Accepts a P-number (P000001, P12345) or a bare integer (12345). Returns the list of scholarly publications that have documented or studied the artifact — each entry carries publication_type (citation vs. history) and a nested publication object (title, authors, year, bibtexkey, etc.).

Not every artifact has publications; when none exist the tool reports that instead.

Avoid more than ~5 consecutive calls in a single turn.`,
    {
      id: z.string().describe('Artifact ID. Accepts P-numbers (P000001) or bare integers (12345).'),
    },
    async ({ id }) =>
      withTiming('get_bibliography', async () => {
        try {
          const url = cdliUrl(`/artifacts/${normalizeArtifactId(id)}.json`);
          const records = await cdliFetch<CdliArtifactRecord[]>(url);
          const publications = extractPublications(records);

          if (publications === undefined || publications.length === 0) {
            return {
              content: [
                { type: 'text' as const, text: `No bibliography available for artifact ${id}.` },
              ],
            };
          }

          const compressed = publications.map(compressPublication);
          const note = `${compressed.length} publication(s) found for artifact ${id}.`;
          return {
            content: [
              { type: 'text' as const, text: `${note}\n\n${JSON.stringify(compressed, null, 2)}` },
            ],
          };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
