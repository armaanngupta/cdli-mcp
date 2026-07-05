// Pure ArtifactSummary[] → HTML rendering for the artifact-card MCP App. No DOM
// access, so the same code runs in the browser bundle and under vitest.
import type { ArtifactSummary } from '../cdliAPI/types.js';
import { escapeHtml } from './atf-render.js';

type Card = Partial<ArtifactSummary>;

// escapeHtml covers text nodes; attribute values also need quotes neutralized.
const escapeAttr = (s: string): string => escapeHtml(s).replaceAll('"', '&quot;');

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseCards(json: string): Card[] | undefined {
  try {
    const data: unknown = JSON.parse(json);
    return Array.isArray(data) && data.every(isPlainObject) ? (data as Card[]) : undefined;
  } catch {
    return undefined;
  }
}

// Only the note lines meant for a human reader: the match-count summary and any
// vocabulary corrections. The paging cursor and tool-chaining guidance are
// addressed to the model, not the person looking at the cards.
function headerHtml(note: string | undefined, shown: number): string {
  const lines = (note ?? '').split('\n');
  const summary = lines[0]?.trim() ? lines[0] : `${shown} artifact(s) returned.`;
  const grounded = lines.find((l) => l.startsWith('Grounded:'));
  return `<header class="cat"><span class="total">${escapeHtml(summary)}</span>${
    grounded ? `<span class="chip">${escapeHtml(grounded)}</span>` : ''
  }</header>`;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

const present = (values: unknown[]): string[] =>
  values.map(text).filter((v): v is string => v !== undefined);

function cardHtml(c: Card): string {
  const pnum = text(c.p_number);
  const url = text(c.url);
  const desig = text(c.designation);
  const head = [
    pnum && url
      ? `<a class="pnum" href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(pnum)}</a>`
      : pnum
        ? `<span class="pnum">${escapeHtml(pnum)}</span>`
        : '',
    desig ? `<span class="desig">${escapeHtml(desig)}</span>` : '',
  ].filter(Boolean);

  const facets = present([c.period, c.provenience, c.genre, c.language]);
  const chips = present([c.material, c.artifact_type, c.collection]);

  const meta: string[] = [];
  const museum = text(c.museum_no);
  const excavation = text(c.excavation_no);
  const composite = text(c.composite_no);
  if (museum) meta.push(`museum no. ${museum}`);
  if (excavation) meta.push(`excavation no. ${excavation}`);
  if (composite) meta.push(`composite ${composite}`);
  if (typeof c.publication_count === 'number' && c.publication_count > 0) {
    meta.push(`${c.publication_count} publication${c.publication_count === 1 ? '' : 's'}`);
  }
  if (typeof c.has_inscription === 'boolean') {
    meta.push(c.has_inscription ? 'inscribed' : 'no inscription');
  }

  const parts = [
    head.length > 0 ? `<div class="card-head">${head.join('')}</div>` : '',
    facets.length > 0 ? `<div class="facets">${escapeHtml(facets.join(' · '))}</div>` : '',
    chips.length > 0
      ? `<div class="chips">${chips.map((v) => `<span class="chip">${escapeHtml(v)}</span>`).join('')}</div>`
      : '',
    meta.length > 0 ? `<div class="meta">${escapeHtml(meta.join(' · '))}</div>` : '',
  ].filter(Boolean);

  return `<article class="card">${parts.join('')}</article>`;
}

export function renderCards(cardsJson: string, note?: string): string {
  const cards = parseCards(cardsJson);
  // Not the cards array (e.g. an error payload): show the raw text untouched.
  if (cards === undefined) return `<pre class="plain">${escapeHtml(cardsJson)}</pre>`;
  const header = headerHtml(note, cards.length);
  if (cards.length === 0) {
    return `${header}\n<p class="state">No artifacts matched this search.</p>`;
  }
  return `${header}\n<div class="grid">\n${cards.map(cardHtml).join('\n')}\n</div>`;
}
