import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const raw = require('./vocab.json') as Record<string, string[]>;

const vocab = new Map<string, string[]>(Object.entries(raw));

export function getVocab(field: string): string[] {
  return vocab.get(field) ?? [];
}
