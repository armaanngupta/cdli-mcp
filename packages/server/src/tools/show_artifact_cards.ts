import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ARTIFACT_CARD_URI } from '../apps/card.js';
import { cdliFetch, cdliUrl, normalizeArtifactId } from '../cdliAPI/client.js';
import { compressArtifact } from '../cdliAPI/compress.js';
import type { CdliArtifactRecord } from '../cdliAPI/types.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';

const MAX_CARDS = 24;

/**
 * A display-only tool, deliberately separate from advanced_search.
 *
 * MCP Apps binds a UI to a *tool*, not to a call, so any search that carries a widget
 * renders one on every call — including the several a model makes while it is still
 * working out an answer. Splitting display from retrieval is what lets a widget appear
 * once, in the final response, chosen by the model rather than forced by the search.
 */
export function registerShowArtifactCards(server: McpServer): void {
  registerAppTool(
    server,
    'show_artifact_cards',
    {
      _meta: { ui: { resourceUri: ARTIFACT_CARD_URI } },
      description: `Display artifacts as a visual card grid in the final answer.

Call this ONCE, at the end of a turn, with the artifacts you are presenting — after any searching is done. Do not call it while still exploring: each call renders another card grid, and repeated grids clutter the conversation.

Takes the P-numbers you want shown (max ${MAX_CARDS}) and fetches each one's summary. Hosts without MCP Apps support show the same data as text, so calling this is never harmful — but calling it repeatedly is.

Use advanced_search to find artifacts; use this only to present them.`,
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(MAX_CARDS)
          .describe('Artifact IDs to display. P-numbers (P000001) or bare integers (12345).'),
        note: z
          .string()
          .optional()
          .describe(
            'Optional one-line caption shown above the grid, e.g. what the set represents.',
          ),
      },
    },
    async ({ ids, note }) =>
      withTiming('show_artifact_cards', async () => {
        try {
          // Sequential rather than parallel: the shared cache dedupes repeats, and a burst
          // of parallel requests against cdli.earth is the kind of thing that gets a client
          // rate-limited for no gain at this size.
          const cards = [];
          for (const id of ids) {
            try {
              const url = cdliUrl(`/artifacts/${normalizeArtifactId(id)}.json`);
              // The artifacts endpoint returns a single-element array, not a bare object.
              const [record] = await cdliFetch<CdliArtifactRecord[]>(url);
              if (record) cards.push(compressArtifact(record));
            } catch {
              // A nonexistent id 404s, which cdliFetch raises. One bad id must not take
              // the whole grid down — this is a display call, and showing the rest is
              // more useful than showing nothing.
              continue;
            }
          }

          const lines = [note?.trim() || `${cards.length} artifact(s) shown.`];
          if (cards.length < ids.length) {
            lines.push(`${ids.length - cards.length} id(s) did not resolve and were skipped.`);
          }

          // Same content order as advanced_search: the card JSON first, then the note.
          // The widget reads them positionally.
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(cards) },
              { type: 'text' as const, text: lines.join('\n') },
            ],
          };
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
