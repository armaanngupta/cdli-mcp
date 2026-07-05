import { describe, it, expect } from 'vitest';
import { renderCards } from '../src/apps/card-render.js';

// Verbatim compressArtifact output from a live probe (2026-07-05):
// /search.json?period=Ur+III&provenience=Girsu&limit=4&page=1
const CARDS = [
  {
    id: 100144,
    p_number: 'P100144',
    designation: 'AAS 164',
    period: 'Ur III',
    provenience: 'Girsu (mod. Tello)',
    genre: 'Administrative',
    language: 'Sumerian',
    material: 'clay',
    artifact_type: 'tablet',
    collection: 'College de France, Paris, France',
    museum_no: 'CFC 120',
    has_inscription: true,
    publication_count: 1,
    url: 'https://cdli.earth/artifacts/100144',
  },
  {
    id: 100145,
    p_number: 'P100145',
    designation: 'AAS 165',
    period: 'Ur III',
    provenience: 'Girsu (mod. Tello)',
    genre: 'Administrative',
    language: 'Sumerian',
    material: 'clay',
    artifact_type: 'tag',
    collection: 'College de France, Paris, France',
    museum_no: 'CFC 112',
    has_inscription: true,
    publication_count: 1,
    url: 'https://cdli.earth/artifacts/100145',
  },
];

// Mirrors the note advanced_search emits alongside the cards JSON.
const NOTE = [
  '~30,256 artifacts match (7,564 pages). Returned 2 on page 1 (limit 2).',
  'More results: call again with search_after="WzMsMTAwMTQ3XQ==".',
  'Each card is a summary — use get_inscription / get_bibliography with its id for full content.',
].join('\n');

describe('renderCards', () => {
  it('renders one linked card per artifact', () => {
    const html = renderCards(JSON.stringify(CARDS), NOTE);
    expect(html.match(/<article class="card">/g)).toHaveLength(2);
    expect(html).toContain('href="https://cdli.earth/artifacts/100144"');
    expect(html).toContain('>P100144</a>');
    expect(html).toContain('<span class="desig">AAS 164</span>');
  });

  it('shows facets, chips, and the meta line', () => {
    const html = renderCards(JSON.stringify(CARDS), NOTE);
    expect(html).toContain('Ur III · Girsu (mod. Tello) · Administrative · Sumerian');
    expect(html).toContain('<span class="chip">clay</span>');
    expect(html).toContain('<span class="chip">tag</span>');
    expect(html).toContain('museum no. CFC 120 · 1 publication · inscribed');
  });

  it('keeps only the human lines of the note', () => {
    const html = renderCards(JSON.stringify(CARDS), NOTE);
    expect(html).toContain('~30,256 artifacts match');
    expect(html).not.toContain('search_after');
    expect(html).not.toContain('get_bibliography');
  });

  it('surfaces grounding corrections in the header', () => {
    const html = renderCards(JSON.stringify(CARDS), `${NOTE}\nGrounded: "Ur 3" → "Ur III"`);
    expect(html).toContain('Grounded: "Ur 3" → "Ur III"');
  });

  it('omits absent fields instead of rendering blanks', () => {
    const html = renderCards(JSON.stringify([{ id: 1, p_number: 'P000001' }]), '1 artifact(s) match.');
    expect(html).toContain('P000001');
    expect(html).not.toContain('class="facets"');
    expect(html).not.toContain('class="chips"');
    expect(html).not.toContain('class="meta"');
  });

  it('pluralizes publications and reports missing inscriptions', () => {
    const card = { ...CARDS[0], publication_count: 3, has_inscription: false };
    const html = renderCards(JSON.stringify([card]), '1 artifact(s) match.');
    expect(html).toContain('3 publications');
    expect(html).toContain('no inscription');
  });

  it('renders an empty result as a no-match state with the header', () => {
    const html = renderCards('[]', '0 artifact(s) match.');
    expect(html).toContain('0 artifact(s) match.');
    expect(html).toContain('No artifacts matched this search.');
    expect(html).not.toContain('class="grid"');
  });

  it('falls back to plain text for non-card payloads', () => {
    const err = JSON.stringify({ code: 'NO_FILTERS', message: 'Provide at least one search field.' });
    const html = renderCards(err);
    expect(html).toContain('<pre class="plain">');
    expect(html).toContain('NO_FILTERS');
  });

  it('escapes markup in card fields', () => {
    const html = renderCards(
      JSON.stringify([{ p_number: 'P000001', designation: '<img src=x>' }]),
      '1 artifact(s) match.',
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});
