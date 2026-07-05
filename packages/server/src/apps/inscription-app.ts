// Browser entry for the inscription MCP App. Bundled by scripts/build-app.ts into
// src/apps/inscription-view.html; never imported by the server at runtime.
import { App } from '@modelcontextprotocol/ext-apps';
import { renderInscription } from './atf-render.js';
import { looksLikeConll, renderConll } from './conll-render.js';

const root = document.getElementById('root') as HTMLElement;

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const item = content.find(
    (c): c is { type: 'text'; text: string } =>
      typeof c === 'object' && c !== null && (c as { type?: unknown }).type === 'text',
  );
  return item?.text;
}

const app = new App({ name: 'cdli-inscription-view', version: '0.1.0' }, {});

app.addEventListener('toolresult', (result) => {
  const text = firstText(result.content);
  root.innerHTML =
    text === undefined
      ? '<pre class="plain">No inscription data received.</pre>'
      : looksLikeConll(text)
        ? renderConll(text)
        : renderInscription(text);
});

app.addEventListener('hostcontextchanged', (context) => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
});

// IIFE bundle (scripts/build-app.ts), so no top-level await.
void app.connect().then(() => {
  const theme = app.getHostContext()?.theme;
  if (theme) document.documentElement.dataset.theme = theme;
});
