import { describe, it, expect } from 'vitest';
import { compressArtifact, compressPublication, denoise } from '../src/cdliAPI/compress.js';
import type { CdliArtifactRecord, CdliPublicationEntry } from '../src/cdliAPI/types.js';

const record: CdliArtifactRecord = {
  id: 42,
  designation: 'CDLI Test 1',
  museum_no: 'VAT 01533',
  excavation_no: 'W 1234',
  period: { period: 'ur3', name: 'Ur III' },
  provenience: { provenience: 'Nippur' },
  artifact_type: { artifact_type: 'tablet' },
  genres: [{ genre: { genre: 'Administrative' } }],
  languages: [{ language: { language: 'Sumerian' } }],
  materials: [{ material: { material: 'clay' } }],
  collections: [{ collection: { collection: 'Louvre' } }],
  composites: [{ composite_no: 'Q000002' }],
  inscription: { atf: '1. lugal' },
  publications: [{ publication_type: 'primary', publication: { designation: 'MVN 3, 1' } }],
};

describe('compressArtifact', () => {
  it('flattens nested fields into a summary card', () => {
    expect(compressArtifact(record)).toEqual({
      id: 42,
      p_number: 'P000042',
      designation: 'CDLI Test 1',
      period: 'Ur III',
      provenience: 'Nippur',
      genre: 'Administrative',
      language: 'Sumerian',
      material: 'clay',
      artifact_type: 'tablet',
      collection: 'Louvre',
      museum_no: 'VAT 01533',
      excavation_no: 'W 1234',
      composite_no: 'Q000002',
      has_inscription: true,
      publication_count: 1,
      url: 'https://cdli.earth/artifacts/42',
    });
  });

  it('prefers period.name over period.period', () => {
    expect(compressArtifact({ id: 1, period: { period: 'ur3', name: 'Ur III' } }).period).toBe(
      'Ur III',
    );
    expect(compressArtifact({ id: 1, period: { period: 'ur3' } }).period).toBe('ur3');
  });

  it('reports has_inscription false and zero publications when absent', () => {
    const c = compressArtifact({ id: 1 });
    expect(c.has_inscription).toBe(false);
    expect(c.publication_count).toBe(0);
    expect(c.p_number).toBe('P000001');
  });
});

describe('compressPublication', () => {
  it('projects the publication entry and its author names', () => {
    const entry: CdliPublicationEntry = {
      exact_reference: 'p. 5',
      publication_type: 'primary',
      publication: {
        designation: 'MVN 3, 1',
        year: '1974',
        series: 'MVN',
        publisher: 'Multi',
        bibtexkey: 'owen1974',
        authors: [{ author: { author: 'Owen' } }, { author: { author: 'Smith' } }],
      },
    };
    expect(compressPublication(entry)).toEqual({
      type: 'primary',
      designation: 'MVN 3, 1',
      reference: 'p. 5',
      authors: ['Owen', 'Smith'],
      year: '1974',
      series: 'MVN',
      publisher: 'Multi',
      bibtexkey: 'owen1974',
    });
  });

  it('omits authors when none are present', () => {
    expect(compressPublication({ publication: {} }).authors).toBeUndefined();
  });
});

describe('denoise', () => {
  it('strips created_by, *_id keys (except id) and empty arrays, recursively', () => {
    const input = {
      id: 1,
      artifact_id: 9,
      created_by: 'admin',
      name: 'keep',
      tags: [],
      nested: { genre_id: 3, genre: 'Administrative', items: [] },
      list: [{ id: 2, period_id: 5, period: 'Ur III' }],
    };
    expect(denoise(input)).toEqual({
      id: 1,
      name: 'keep',
      nested: { genre: 'Administrative' },
      list: [{ id: 2, period: 'Ur III' }],
    });
  });

  it('returns primitives unchanged', () => {
    expect(denoise('x')).toBe('x');
    expect(denoise(5)).toBe(5);
  });
});
