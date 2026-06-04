import { cdliArtifactUrl } from './client.js';
import {
  ArtifactSummary,
  CdliArtifactRecord,
  CdliPublicationEntry,
  CompressedPublication,
} from './types.js';

// Discovery card: each search hit collapses to the flat fields a caller needs to
// decide which artifact to open. The ATF text, full bibliography, and relation
// arrays are deliberately dropped — those are get_inscription / get_bibliography's job.
export function compressArtifact(record: CdliArtifactRecord): ArtifactSummary {
  return {
    id: record.id,
    p_number: `P${String(record.id).padStart(6, '0')}`,
    designation: record.designation,
    period: record.period?.name ?? record.period?.period,
    provenience: record.provenience?.provenience,
    genre: record.genres?.[0]?.genre?.genre,
    language: record.languages?.[0]?.language?.language,
    material: record.materials?.[0]?.material?.material,
    artifact_type: record.artifact_type?.artifact_type,
    collection: record.collections?.[0]?.collection?.collection,
    museum_no: record.museum_no,
    excavation_no: record.excavation_no,
    composite_no: record.composites?.[0]?.composite_no,
    has_inscription: Boolean(record.inscription?.atf),
    publication_count: record.publications?.length ?? 0,
    url: cdliArtifactUrl(record.id),
  };
}

export function compressPublication(entry: CdliPublicationEntry): CompressedPublication {
  const pub = entry.publication;
  return {
    type: entry.publication_type,
    designation: pub?.designation,
    reference: entry.exact_reference,
    authors: authorNames(pub?.authors),
    year: pub?.year,
    series: pub?.series,
    publisher: pub?.publisher,
    bibtexkey: pub?.bibtexkey,
  };
}

function authorNames(list: { author?: { author?: string } }[] | undefined): string[] | undefined {
  const names = list
    ?.map((entry) => entry.author?.author)
    .filter((name): name is string => typeof name === 'string');
  return names && names.length > 0 ? names : undefined;
}

const NOISE_KEYS = new Set(['created_by']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Light de-noise for the "give me everything" by-ID view: keeps all real depth but
// strips admin fields, foreign-key *_id columns, and empty relation arrays. The
// primary `id` is preserved; only nested join keys (artifact_id, genre_id, …) go.
export function denoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(denoise);
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (NOISE_KEYS.has(key)) continue;
    if (key !== 'id' && key.endsWith('_id')) continue;
    if (Array.isArray(child) && child.length === 0) continue;
    out[key] = denoise(child);
  }
  return out;
}
