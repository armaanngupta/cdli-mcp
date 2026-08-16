import type { ArtifactCard as Card } from '../api/chat';

const FACETS: (keyof Card)[] = ['period', 'provenience', 'genre', 'language'];

/**
 * The artifacts a turn actually retrieved, shown under the answer so a claim can be traced
 * to a real catalogue record. Built only from tool output — never from the model's prose —
 * so a hallucinated P-number can't appear here as a working link.
 */
export function ArtifactCards({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="artifact-cards">
      <div className="artifact-cards-title">
        {cards.length} artifact{cards.length === 1 ? '' : 's'} retrieved
      </div>
      <div className="artifact-card-list">
        {cards.map((card) => (
          <a
            key={card.p_number}
            className="artifact-card"
            href={card.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="artifact-card-id">{card.p_number}</div>
            {card.designation && (
              <div className="artifact-card-designation">{card.designation}</div>
            )}
            <div className="artifact-card-facets">
              {FACETS.map((facet) => card[facet])
                .filter(Boolean)
                .join(' · ')}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
