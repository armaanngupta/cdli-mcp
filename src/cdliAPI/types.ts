export interface CdliArtifact {
  id: number;
  cdli_no?: string;
  period?: string;
  genre?: string;
  provenience?: string;
  material?: string;
  language?: string;
  collection?: string;
  publication?: string;
  [key: string]: unknown;
}

export interface CdliAuthor {
  id: number;
  author: string;
  last?: string;
  first?: string;
}

export interface CdliPeriod {
  id: number;
  sequence?: number;
  period: string;
  name?: string;
  time_range?: string;
}

export interface CdliEntity {
  id: number;
  [key: string]: unknown;
}

// --- Nested shapes the compression layer projects from ---
// CDLI artifact records nest descriptive fields as objects/arrays-of-wrappers
// (e.g. genres[0].genre.genre), not flat strings. These types describe only the
// paths compressArtifact/compressPublication read; everything else is ignored.

interface CdliAuthorRef {
  author?: string;
}

export interface CdliPublicationEntry {
  exact_reference?: string;
  publication_type?: string;
  publication?: {
    designation?: string;
    bibtexkey?: string;
    year?: string;
    series?: string;
    publisher?: string;
    authors?: { author?: CdliAuthorRef }[];
  };
}

export interface CdliArtifactRecord {
  id: number;
  designation?: string;
  museum_no?: string;
  excavation_no?: string;
  period?: { period?: string; name?: string };
  provenience?: { provenience?: string };
  artifact_type?: { artifact_type?: string };
  genres?: { genre?: { genre?: string } }[];
  languages?: { language?: { language?: string } }[];
  materials?: { material?: { material?: string } }[];
  collections?: { collection?: { collection?: string } }[];
  composites?: { composite_no?: string }[];
  inscription?: { atf?: string } | null;
  publications?: CdliPublicationEntry[];
}

// --- Projected (compressed) shapes returned at tool boundaries ---

export interface ArtifactSummary {
  id: number;
  p_number: string;
  designation?: string;
  period?: string;
  provenience?: string;
  genre?: string;
  language?: string;
  material?: string;
  artifact_type?: string;
  collection?: string;
  museum_no?: string;
  excavation_no?: string;
  composite_no?: string;
  has_inscription: boolean;
  publication_count: number;
  url: string;
}

export interface CompressedPublication {
  type?: string;
  designation?: string;
  reference?: string;
  authors?: string[];
  year?: string;
  series?: string;
  publisher?: string;
  bibtexkey?: string;
}
