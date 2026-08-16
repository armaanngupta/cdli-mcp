/**
 * Inline SVG icons for the message actions.
 *
 * Inline rather than an icon package: the SPA is served under a strict same-origin setup
 * and this avoids both a dependency and a network fetch for four glyphs. They inherit
 * `currentColor`, so hover and disabled states come from the button's own colour.
 */

const BASE = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function CopyIcon() {
  return (
    <svg {...BASE}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...BASE}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...BASE}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function RegenerateIcon() {
  return (
    <svg {...BASE}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
