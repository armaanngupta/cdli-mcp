import { Fragment } from 'react';

/**
 * Render ATF transliteration with its display conventions.
 *
 * Two conventions carry meaning and are lost in monospace plain text:
 *  - `{d}` marks a determinative (a semantic classifier, not read aloud) — shown raised.
 *  - A trailing digit disambiguates homophones (`ku3` is a different sign from `ku`) —
 *    shown as a subscript index, which is how it appears in every printed edition.
 *
 * Deliberately NOT attempted: converting transliteration into cuneiform signs. That needs a
 * sign-name to codepoint mapping this repo does not carry (`vocab.json` is search vocabulary,
 * not a sign list). Cuneiform codepoints already present in the text render as-is.
 */

// A determinative in braces, or a token ending in an index digit. Indices only ever follow a
// letter, so this cannot match a plain number like a line count or a quantity.
const TOKEN = /(\{[^}]+\})|([A-Za-zŠšṢṣṬṭĝĜ']+)([0-9]+)(?![0-9A-Za-z])/g;

export function renderAtf(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));

    if (match[1] !== undefined) {
      parts.push(
        <sup className="atf-determinative" key={`${match.index}-d`}>
          {match[1].slice(1, -1)}
        </sup>,
      );
    } else {
      parts.push(
        <Fragment key={`${match.index}-i`}>
          {match[2]}
          <sub className="atf-index">{match[3]}</sub>
        </Fragment>,
      );
    }
    last = match.index + match[0].length;
  }

  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

/** Heuristic: does this code block look like ATF? Used when no language tag is given. */
export function looksLikeAtf(text: string): boolean {
  // Surface/column headers and numbered lines are the structural giveaways of an ATF block.
  return /^\s*(@(obverse|reverse|tablet|column|seal)|\d+\.\s)/m.test(text);
}

export function AtfBlock({ text }: { text: string }) {
  return (
    <code className="atf">
      {text.split('\n').map((line, i) => (
        <span className="atf-line" key={i}>
          {renderAtf(line)}
          {'\n'}
        </span>
      ))}
    </code>
  );
}
