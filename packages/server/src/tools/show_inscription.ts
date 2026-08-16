import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { INSCRIPTION_VIEW_URI } from '../apps/inscription.js';
import { normalizeArtifactId } from '../cdliAPI/client.js';
import { toErrorResponse } from '../util/errors.js';
import { withTiming } from '../util/timing.js';
import { fetchAtf } from './get_inscription.js';

/**
 * The display-only counterpart to get_inscription — see show_artifact_cards for why
 * retrieval and display are separate tools.
 *
 * ATF only: the widget renders transliteration conventions, which is the whole point of
 * showing it. CoNLL formats stay on get_inscription, where they are read by the model
 * rather than looked at by a person.
 */
export function registerShowInscription(server: McpServer): void {
  registerAppTool(
    server,
    'show_inscription',
    {
      _meta: { ui: { resourceUri: INSCRIPTION_VIEW_URI } },
      description: `Display one artifact's ATF transliteration as a formatted view in the final answer.

Call this ONCE, at the end of a turn, for the inscription you are presenting. Do not call it while still reading inscriptions to work something out: each call renders another view, and repeated views clutter the conversation.

Use get_inscription to read an inscription (and for cdli-conll / conll-u annotations); use this only to present one.`,
      inputSchema: {
        id: z
          .string()
          .describe('Artifact ID. Accepts P-numbers (P000001) or bare integers (12345).'),
      },
    },
    async ({ id }) =>
      withTiming('show_inscription', async () => {
        try {
          return await fetchAtf(normalizeArtifactId(id), id);
        } catch (err) {
          return toErrorResponse(err);
        }
      }),
  );
}
