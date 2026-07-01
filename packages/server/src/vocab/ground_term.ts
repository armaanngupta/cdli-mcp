import { distance } from 'fastest-levenshtein';
import { getVocab } from './load.js';

const THRESHOLD = 3;

const GROUNDABLE = new Set([
  'period',
  'genre',
  'language',
  'material',
  'artifact_type',
  'provenience',
]);

export function groundTerm(
  field: string,
  value: string,
): { value: string; corrected: boolean; original: string } {
  if (!GROUNDABLE.has(field)) return { value, corrected: false, original: value };

  const candidates = getVocab(field);
  const lower = value.toLowerCase();

  let bestMatch = '';
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const d = distance(lower, candidate.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      bestMatch = candidate;
    }
  }

  if (bestDist === 0 || bestDist > THRESHOLD) return { value, corrected: false, original: value };
  return { value: bestMatch, corrected: true, original: value };
}
