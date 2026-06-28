import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cdliFetch, cdliFetchText, cdliUrl, normalizeArtifactId } from '../cdliAPI/client.js';
import { CdliArtifact } from '../cdliAPI/types.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

type ConllFormat = 'cdli-conll' | 'conll-u';

const text = (body: string) => ({ content: [{ type: 'text' as const, text: body }] });

// CDLI returns /artifacts/{id}.json as a single-element array, not a bare object.
function extractAtf(records: CdliArtifact[]): string | undefined {
  const inscription = records[0]?.inscription;
  if (inscription && typeof inscription === 'object' && 'atf' in inscription) {
    const { atf } = inscription as { atf: unknown };
    return typeof atf === 'string' ? atf : undefined;
  }
  return undefined;
}

async function fetchAtf(nid: string, displayId: string) {
  const records = await cdliFetch<CdliArtifact[]>(cdliUrl(`/artifacts/${nid}.json`));
  const atf = extractAtf(records);
  return atf === undefined
    ? text(`No inscription available for artifact ${displayId}.`)
    : text(atf);
}

// CoNLL formats use the path-based route /artifacts/{id}/inscription/{format}; an Accept header or
// ?format query strips the redirect Location upstream, so neither is sent.
async function fetchConll(nid: string, displayId: string, format: ConllFormat) {
  const result = await cdliFetchText(cdliUrl(`/artifacts/${nid}/inscription/${format}`));
  if (result.ok) return text(result.text);
  if (result.status === 406) {
    return text(
      `Linguistic annotations (${format}) are not available for artifact ${displayId}; only the ATF transliteration exists. Use format 'atf' to read the text.`,
    );
  }
  return text(`No inscription available for artifact ${displayId}.`);
}

export function registerGetInscription(server: McpServer): void {
  server.registerTool(
    'get_inscription',
    {
      description: `Fetch the inscription for a CDLI artifact in a chosen format.

Accepts a P-number (P000001, P12345) or a bare integer (12345).

Formats:
- atf (default) — ASCII Transliteration Format, the canonical transliteration of the tablet. When a translation is available, it is embedded inline within the ATF (on #tr. translation lines), so look there for it.
- cdli-conll — CDLI linguistic annotation (lemmatization, morphology) in CoNLL.
- conll-u — Universal Dependencies CoNLL-U annotation.

Most artifacts are not linguistically annotated, so cdli-conll / conll-u are often unavailable; when that happens the tool says so and you should fall back to atf. Artifacts with no inscription at all are reported too.

Avoid more than ~5 consecutive calls in a single turn.`,
      inputSchema: {
        id: z
          .string()
          .describe('Artifact ID. Accepts P-numbers (P000001) or bare integers (12345).'),
        format: z
          .enum(['atf', 'cdli-conll', 'conll-u'])
          .default('atf')
          .describe('Output format. Defaults to atf.'),
      },
    },
    async ({ id, format }) =>
      withTiming('get_inscription', async () => {
        try {
          const nid = normalizeArtifactId(id);
          return format === 'atf' ? await fetchAtf(nid, id) : await fetchConll(nid, id, format);
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
