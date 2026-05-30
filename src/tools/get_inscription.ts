import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliUrl, normalizeArtifactId } from '../cdliAPI/client.js';
import { CdliArtifact } from '../cdliAPI/types.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

// CDLI returns /artifacts/{id}.json as a single-element array, not a bare object.
function extractAtf(records: CdliArtifact[]): string | undefined {
  const inscription = records[0]?.inscription;
  if (inscription && typeof inscription === 'object' && 'atf' in inscription) {
    const { atf } = inscription as { atf: unknown };
    return typeof atf === 'string' ? atf : undefined;
  }
  return undefined;
}

export function registerGetInscription(server: McpServer): void {
  server.tool(
    'get_inscription',
    `Fetch the inscription transliteration (ATF) for a CDLI artifact.

Accepts a P-number (P000001, P12345) or a bare integer (12345). Returns the artifact's text in ATF (ASCII Transliteration Format) — the canonical transliteration of the tablet.

Not every artifact has an inscription; when none exists the tool reports that instead.

Avoid more than ~5 consecutive calls in a single turn.`,
    {
      id: z.string().describe('Artifact ID. Accepts P-numbers (P000001) or bare integers (12345).'),
    },
    async ({ id }) =>
      withTiming('get_inscription', async () => {
        try {
          const url = cdliUrl(`/artifacts/${normalizeArtifactId(id)}.json`);
          const records = await cdliFetch<CdliArtifact[]>(url);
          const atf = extractAtf(records);

          if (atf === undefined) {
            return {
              content: [
                { type: 'text' as const, text: `No inscription available for artifact ${id}.` },
              ],
            };
          }

          return { content: [{ type: 'text' as const, text: atf }] };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
