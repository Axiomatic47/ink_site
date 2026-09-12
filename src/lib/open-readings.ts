// src/lib/open-readings.ts — Open Readings TYPES + pure helpers (safe for client
// components). The fs loader lives in open-readings.server.ts.
export type Legibility = 'readable' | 'uncertain' | 'illegible-at-this-resolution';
export type ReadingStatus = 'open' | 'answered' | 'resolved';

export interface ReadingSource { kind: 'archive' | 'external'; archiveId?: string; leafId?: string; href?: string; holder?: string }
export interface ReadingLicence { name: string; attribution: string; href?: string; republish: boolean }
export interface ReadingText { text: string; lang: string; ref?: string; edition?: string; page?: string | number | null }
export interface ReadingResolution { decision: string; date: string; rests_on?: string[] }
export interface OpenReading {
  id: string; collection: string; shelfmark: string; leaf: string; line: string | number;
  source: ReadingSource; image: { url: string; sha256: string; note?: string };
  region: { x: number; y: number; w: number; h: number }; zoom: number;
  transcription: ReadingText; comparison: ReadingText; question: string; context?: string;
  legibility: Legibility; language: string; licence: ReadingLicence; created: string; resolution?: ReadingResolution;
}
export interface PublishedAnswer {
  id?: string; item_id: string; letter: 'A' | 'B' | 'C' | 'D'; reading?: string; note?: string;
  reader: { display: string; credentials_summary?: string }; published: string; ack?: boolean;
}
export interface ReadingWithState extends OpenReading { status: ReadingStatus; answers: PublishedAnswer[]; crop: string | null }
export interface ReadingsCollection { id: string; title: string; description?: string; holder?: string; licence?: ReadingLicence; items: ReadingWithState[] }

export const itemHref = (collection: string, id: string) => `/research/${collection}/readings/${id}`;
