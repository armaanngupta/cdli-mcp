import { describe, it, expect } from 'vitest';
import { looksLikeConll, renderConll } from '../src/apps/conll-render.js';

// Verbatim rows from the live cdli.earth responses for artifact 100065 (2026-07-05).
const CDLI_CONLL = `#new_text=P100065
# ID\tFORM\tSEGM\tXPOSTAG\tHEAD\tDEPREL\tMISC
o.1.2\tgin2\tgig[unit]\tN\t_\t_\t_
o.1.3\tku3-babbar\tkugbabbar[silver]\tN\t_\t_\t_
o.4.1\tlugal-he2-gal2\tLugalhegal[1]\tPN\t_\t_\t_
o.5.1\tin-la2-e-a\ti-ni[-b]-la[weigh]-e-a\tFIN.L1.3-SG-NH-P.V.3-SG-A.SUB\t_\t_\t_
o.7.1\ttukum-bi\ttukumbi[if]\tCNJ\t_\t_\t_
r.3.2\tlugal\tlugal[king][-ak][-ø]\tN.GEN.ABS\t_\t_\t_`;

const CONLL_U = `#new_text=P100065
# ID\tFORM\tLEMMA\tUPOSTAG\tXPOSTAG\tFEATS\tHEAD\tDEPREL\tDEPS\tMISC
2\tgin2\tgig[unit]\tNOUN\tN\tNumber=Sing\t_\t_\t_\t_
9\tlugal-he2-gal2\tLugalhegal[1]\tPROPN\tPN\tAnimacy=Hum|Number=Sing\t_\t_\t_\t_
10\tin-la2-e-a\tb]\tVERB\tV\tVerb Form=Fin|Person=3|Number=Sing\t_\t_\t_\t_
12\ttukum-bi\ttukumbi[if]\tCCONJ\tCNJ\t_\t_\t_\t_\t_`;

describe('looksLikeConll', () => {
  it('detects both CoNLL variants but not ATF or plain notes', () => {
    expect(looksLikeConll(CDLI_CONLL)).toBe(true);
    expect(looksLikeConll(CONLL_U)).toBe(true);
    expect(looksLikeConll('&P100065 = AAS 013\n1. 1(disz) udu')).toBe(false);
    expect(looksLikeConll('No inscription available for artifact P5.')).toBe(false);
  });
});

describe('renderConll (cdli-conll)', () => {
  const html = renderConll(CDLI_CONLL);

  it('shows the P-number and the format chip', () => {
    expect(html).toContain('<span class="pnum">P100065</span>');
    expect(html).toContain('<span class="chip">CDLI morphology</span>');
  });

  it('groups words into obverse and reverse panels', () => {
    expect(html).toContain('<div class="face-tag">obverse</div>');
    expect(html).toContain('<div class="face-tag">reverse</div>');
  });

  it('extracts the English gloss as the meaning', () => {
    expect(html).toContain('>silver</span>');
    expect(html).toContain('>if</span>');
  });

  it('finds the gloss inside a verb chain', () => {
    expect(html).toContain('>weigh</span>');
  });

  it('treats bracket-indexed lemmas as names', () => {
    expect(html).toContain('<span class="name">Lugalhegal</span>');
    expect(html).toContain('>person name</span>');
  });

  it('translates POS tags into plain words with full morphology as tooltip', () => {
    expect(html).toContain('>noun</span>');
    expect(html).toContain('>conjunction</span>');
    expect(html).toContain('title="FIN.L1.3-SG-NH-P.V.3-SG-A.SUB"');
    expect(html).toContain('>verb</span>');
  });

  it('keeps the dictionary form as a tooltip on the meaning', () => {
    expect(html).toContain('title="dictionary form: kugbabbar"');
  });

  it('sign-formats the transliterated word forms', () => {
    expect(html).toContain('ku<sub>3</sub>-babbar');
  });

  it('shows the line number only when it changes', () => {
    const rows = html.split('\n').filter((l) => l.includes('class="wrow"'));
    const first = rows.find((r) => r.includes('gin<sub>2</sub>'));
    const second = rows.find((r) => r.includes('ku<sub>3</sub>-babbar'));
    expect(first).toContain('<span class="ln">1</span>');
    expect(second).toContain('<span class="ln"></span>');
  });
});

describe('renderConll (conll-u)', () => {
  const html = renderConll(CONLL_U);

  it('labels the format as Universal Dependencies', () => {
    expect(html).toContain('<span class="chip">Universal Dependencies</span>');
  });

  it('prefers the CDLI XPOS name classes over generic UPOS', () => {
    expect(html).toContain('>person name</span>');
  });

  it('shows FEATS in the grammar tooltip', () => {
    expect(html).toContain('title="V · Verb Form=Fin|Person=3|Number=Sing"');
  });

  it('degrades gracefully on a broken lemma without losing the row', () => {
    expect(html).toContain('in-la<sub>2</sub>-e-a');
    expect(html).toContain('<span class="nogloss">b</span>');
  });

  it('escapes HTML in fields', () => {
    const evil = `1\t<img src=x>\t<b>x</b>[gloss]\tNOUN\tN\t_\t_\t_\t_\t_`;
    expect(renderConll(evil)).not.toContain('<img');
  });
});
