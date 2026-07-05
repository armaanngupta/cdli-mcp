import { describe, it, expect } from 'vitest';
import { renderInscription } from '../src/apps/atf-render.js';

const ATF = `&P100065 = AAS 013
#atf: lang sux
@tablet
@obverse
1. 1(disz) udu ba-usz2
2. ki ab-ba-sa6-ga-ta
3. {d}szul-gi-a-a-mu
$ blank space
@reverse
1. [x] i3-dab5#
#tr.en: ... took in charge.
2'. mu en-unu6-gal {d}inanna ba-hun`;

describe('renderInscription', () => {
  it('renders the &P header as P-number plus designation', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<span class="pnum">P100065</span>');
    expect(html).toContain('<span class="desig">AAS 013</span>');
  });

  it('renders @surface markers as face plates with tags', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<div class="face-tag">obverse</div>');
    expect(html).toContain('<div class="face-tag">reverse</div>');
  });

  it('separates line numbers from transliteration content', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<span class="ln">1.</span>');
    expect(html).toContain(`<span class="ln">2'.</span>`);
  });

  it('superscripts determinatives and subscripts sign indices', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<sup>d</sup>szul-gi-a-a-mu');
    expect(html).toContain('ba-usz<sub>2</sub>');
    expect(html).toContain('sa<sub>6</sub>-ga-ta');
  });

  it('does not subscript digits in quantity notation', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('1(disz) udu');
  });

  it('highlights bracket breakage and hash-damaged signs', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<span class="brk">[x]</span>');
    expect(html).toContain('<span class="dmg">i<sub>3</sub>-dab<sub>5</sub></span>');
  });

  it('styles translations with their language tag', () => {
    const html = renderInscription(ATF);
    expect(html).toContain('<span class="trlang">en</span>... took in charge.');
  });

  it('styles $ state lines as notes', () => {
    expect(renderInscription(ATF)).toContain('<div class="state">blank space</div>');
  });

  it('falls back to preformatted text for non-ATF payloads', () => {
    const html = renderInscription('No inscription available for artifact P999999.');
    expect(html).toBe('<pre class="plain">No inscription available for artifact P999999.</pre>');
  });

  it('escapes HTML in the payload', () => {
    expect(renderInscription('<script>alert(1)</script>')).not.toContain('<script>');
  });
});
