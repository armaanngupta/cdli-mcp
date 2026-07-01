import { describe, it, expect } from 'vitest';
import { groundTerm } from '../src/vocab/ground_term.js';

describe('groundTerm', () => {
  it('passes through non-groundable fields unchanged', () => {
    expect(groundTerm('designation', 'anything')).toEqual({
      value: 'anything',
      corrected: false,
      original: 'anything',
    });
  });

  it('leaves an exact vocab match uncorrected', () => {
    expect(groundTerm('period', 'Ur III')).toEqual({
      value: 'Ur III',
      corrected: false,
      original: 'Ur III',
    });
  });

  it('corrects a near-miss to the canonical term', () => {
    const r = groundTerm('period', 'Ur 3');
    expect(r).toEqual({ value: 'Ur III', corrected: true, original: 'Ur 3' });
  });

  it('matches case-insensitively (an exact match stays uncorrected)', () => {
    const r = groundTerm('language', 'sumerian');
    expect(r.corrected).toBe(false);
    expect(r.value).toBe('sumerian');
  });

  it('does not correct a value far from every vocab term', () => {
    const r = groundTerm('material', 'xyzzypldff');
    expect(r).toEqual({ value: 'xyzzypldff', corrected: false, original: 'xyzzypldff' });
  });
});
