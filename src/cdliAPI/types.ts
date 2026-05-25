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
