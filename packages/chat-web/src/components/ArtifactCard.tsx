import { useState } from 'react';
import type { ArtifactCard as Card } from '../api/chat';

const FACETS: (keyof Card)[] = ['period', 'provenience', 'genre', 'language'];

// A broad search returns a whole result page — 25 or 50 cards — which buries the answer it
// is meant to support. Show a readable handful and let the reader ask for the rest.
const VISIBLE = 8;

/**
 * The artifacts a turn actually retrieved, shown under the answer so a claim can be traced
 * to a real catalogue record. Built only from tool output — never from the model's prose —
 * so a hallucinated P-number can't appear here as a working link.
 */
export function ArtifactCards({ cards }: { cards: Card[] }) {
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0) return null;

  const shown = expanded ? cards : cards.slice(0, VISIBLE);
  const hidden = cards.length - shown.length;

  return (
    <div className="artifact-cards">
      <div className="artifact-cards-title">
        {cards.length} artifact{cards.length === 1 ? '' : 's'} retrieved
      </div>
      <div className="artifact-card-list">
        {shown.map((card) => (
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
      {/* A control rather than a dead "+38 more" label: the cards are already in hand, so
          there is nothing to fetch and no reason to make them unreachable. */}
      {hidden > 0 && (
        <button className="artifact-cards-more" onClick={() => setExpanded(true)}>
          + {hidden} more
        </button>
      )}
      {expanded && cards.length > VISIBLE && (
        <button className="artifact-cards-more" onClick={() => setExpanded(false)}>
          Show fewer
        </button>
      )}
    </div>
  );
}
