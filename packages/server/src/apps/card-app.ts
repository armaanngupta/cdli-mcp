// Browser entry for the artifact-card MCP App. Bundled by scripts/build-app.ts
// into src/apps/card-view.html; never imported by the server at runtime.
import { App } from '@modelcontextprotocol/ext-apps';
import { renderCards } from './card-render.js';

const root = document.getElementById('root') as HTMLElement;

// advanced_search returns two text items: [0] the ArtifactSummary[] JSON,
// [1] the human/model note (match total, paging, grounding corrections).
function texts(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(
      (c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && (c as { type?: unknown }).type === 'text',
    )
    .map((c) => c.text);
}

const app = new App({ name: 'cdli-artifact-cards', version: '0.1.0' }, {});

app.addEventListener('toolresult', (result) => {
  const [cards, note] = texts(result.content);
  root.innerHTML =
    cards === undefined
      ? '<pre class="plain">No search data received.</pre>'
      : renderCards(cards, note);
});

app.addEventListener('hostcontextchanged', (context) => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
});

// IIFE bundle (scripts/build-app.ts), so no top-level await.
void app.connect().then(() => {
  const theme = app.getHostContext()?.theme;
  if (theme) document.documentElement.dataset.theme = theme;
});
