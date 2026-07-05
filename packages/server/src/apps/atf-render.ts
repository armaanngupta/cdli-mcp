// Pure ATF → HTML rendering for the inscription MCP App. No DOM access, so the
// same code runs in the browser bundle and under vitest.

export const escapeHtml = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Transliteration content only (never translations): determinatives to superscript,
// sign-damage `#` to a highlighted span, trailing sign indices to subscript, and
// `[...]` breakage to a muted span. Hash-damage runs before subscripting so its
// token regex never has to match across injected <sub> tags.
export function renderSigns(escaped: string): string {
  return escaped
    .replace(/\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/([^\s#[\]]+)#/g, '<span class="dmg">$1</span>')
    .replace(/([a-zA-Z])(\d+)/g, '$1<sub>$2</sub>')
    .replace(/\[([^\]]*)\]/g, '<span class="brk">[$1]</span>');
}

const LINE_NO = /^([0-9]+[a-z]?'*\.(?:[0-9a-z]+'*\.)*)\s+(.*)$/;

// @tablet / @envelope / @object describe the whole artifact, not a face — their
// text always sits under a nested face marker — so they become catalog chips
// instead of opening a new face plate.
const OBJECT_MARKER = /^(tablet|envelope|object\b.*)$/;

interface LineRow {
  kind: 'line';
  ln: string;
  tx: string;
  trs: string[];
}
interface NoteRow {
  kind: 'state' | 'cmt' | 'tr';
  html: string;
}
type Row = LineRow | NoteRow;

interface Face {
  label?: string;
  rows: Row[];
}

interface Doc {
  pnum?: string;
  desig?: string;
  chips: string[];
  faces: Face[];
  hasTr: boolean;
}

function parse(lines: string[]): Doc {
  const doc: Doc = { chips: [], faces: [], hasTr: false };
  let face: Face = { rows: [] };
  doc.faces.push(face);
  let lastLine: LineRow | undefined;

  for (const line of lines) {
    const header = line.match(/^&(\S+)\s*=?\s*(.*)$/);
    if (header) {
      doc.pnum = header[1];
      doc.desig = header[2] || undefined;
      continue;
    }
    const lang = line.match(/^#atf:\s*lang\s+(\S+)/);
    if (lang) {
      doc.chips.push(lang[1]);
      continue;
    }
    if (line.startsWith('@')) {
      const label = line.slice(1).trim();
      if (OBJECT_MARKER.test(label)) {
        doc.chips.push(label);
      } else {
        face = { label, rows: [] };
        doc.faces.push(face);
      }
      lastLine = undefined;
      continue;
    }
    const tr = line.match(/^#tr\.([a-z]+)\s*:\s*(.*)$/);
    if (tr) {
      doc.hasTr = true;
      const html = `<span class="trlang">${escapeHtml(tr[1])}</span>${escapeHtml(tr[2])}`;
      if (lastLine) lastLine.trs.push(html);
      else face.rows.push({ kind: 'tr', html });
      continue;
    }
    if (line.startsWith('$')) {
      face.rows.push({ kind: 'state', html: escapeHtml(line.replace(/^\$\s*/, '')) });
      lastLine = undefined;
      continue;
    }
    if (line.startsWith('#')) {
      face.rows.push({ kind: 'cmt', html: escapeHtml(line.replace(/^#\s?/, '')) });
      continue;
    }
    const numbered = line.match(LINE_NO);
    lastLine = numbered
      ? { kind: 'line', ln: numbered[1], tx: renderSigns(escapeHtml(numbered[2])), trs: [] }
      : { kind: 'line', ln: '', tx: renderSigns(escapeHtml(line)), trs: [] };
    face.rows.push(lastLine);
  }
  doc.faces = doc.faces.filter((f) => f.rows.length > 0);
  return doc;
}

function rowHtml(row: Row): string {
  if (row.kind === 'line') {
    const trs = row.trs.map((t) => `<div class="tr">${t}</div>`).join('');
    return `<div class="row"><span class="ln">${escapeHtml(row.ln)}</span><div class="cell"><span class="tx">${row.tx}</span>${trs}</div></div>`;
  }
  if (row.kind === 'tr') {
    return `<div class="row note tr-row"><span class="ln"></span><div class="cell"><div class="tr">${row.html}</div></div></div>`;
  }
  return `<div class="row note"><span class="ln"></span><div class="cell"><div class="${row.kind}">${row.html}</div></div></div>`;
}

const faceHtml = (f: Face): string =>
  `<section class="face">${f.label ? `<div class="face-tag">${escapeHtml(f.label)}</div>` : ''}\n${f.rows
    .map(rowHtml)
    .join('\n')}\n</section>`;

function catalogHtml(doc: Doc): string {
  const parts = [
    doc.pnum ? `<span class="pnum">${escapeHtml(doc.pnum)}</span>` : '',
    doc.desig ? `<span class="desig">${escapeHtml(doc.desig)}</span>` : '',
    ...doc.chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`),
    doc.hasTr
      ? '<label class="trctl"><input type="checkbox" id="trtog" checked />translations</label>'
      : '',
  ].filter(Boolean);
  return parts.length === 0 ? '' : `<header class="cat">${parts.join('')}</header>`;
}

function legendHtml(facesMarkup: string): string {
  const items = [
    facesMarkup.includes('class="dmg"')
      ? '<span><span class="dmg">sign</span> damaged on the tablet</span>'
      : '',
    facesMarkup.includes('class="brk"')
      ? '<span><span class="brk">[&hellip;]</span> broken away</span>'
      : '',
  ].filter(Boolean);
  return items.length === 0 ? '' : `<footer class="legend">${items.join('')}</footer>`;
}

const looksLikeAtf = (text: string): boolean =>
  text.split('\n').some((l) => /^(&P\d|@[a-z]|[0-9]+[a-z]?'*\.\s)/.test(l));

export function renderInscription(text: string): string {
  if (!looksLikeAtf(text)) {
    return `<pre class="plain">${escapeHtml(text)}</pre>`;
  }
  const doc = parse(text.split('\n').filter((l) => l.trim() !== ''));
  const faces = doc.faces.map(faceHtml).join('\n');
  return [catalogHtml(doc), faces, legendHtml(faces)].filter(Boolean).join('\n');
}
