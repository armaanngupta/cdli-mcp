/**
 * A corpus tool's compressed artifact card, as the SPA needs it for a citation card.
 * A projection of the server's ArtifactSummary — only the fields worth showing.
 */
export interface ArtifactCard {
  p_number: string;
  url: string;
  designation?: string;
  period?: string;
  provenience?: string;
  genre?: string;
  language?: string;
}

const FIELDS = ['designation', 'period', 'provenience', 'genre', 'language'] as const;

function toCard(value: unknown): ArtifactCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  // p_number and url together are what make a card citable; anything without both is some
  // other tool's payload (a publication, an entity listing) and is skipped.
  if (typeof record.p_number !== 'string' || typeof record.url !== 'string') return null;

  const card: ArtifactCard = { p_number: record.p_number, url: record.url };
  for (const field of FIELDS) {
    if (typeof record[field] === 'string') card[field] = record[field];
  }
  return card;
}

function fromJson(value: unknown): ArtifactCard[] {
  if (Array.isArray(value)) {
    return value.map(toCard).filter((card): card is ArtifactCard => card !== null);
  }
  const single = toCard(value);
  return single ? [single] : [];
}

/**
 * Pull artifact cards out of a tool's text result.
 *
 * A tool's content items are joined with newlines, so the payload is a human-readable note
 * *and* a line of minified JSON rather than one parseable document — hence the per-line
 * scan. Parsing is opportunistic throughout: text that isn't JSON, or is JSON of another
 * shape, simply yields nothing. A tool changing its output format must never break a turn.
 */
export function extractCards(text: string): ArtifactCard[] {
  const cards: ArtifactCard[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || (trimmed[0] !== '[' && trimmed[0] !== '{')) continue;
    try {
      cards.push(...fromJson(JSON.parse(trimmed)));
    } catch {
      continue;
    }
  }
  return cards;
}
