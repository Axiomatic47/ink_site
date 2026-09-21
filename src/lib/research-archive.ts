// src/lib/research-archive.ts — research-archive manifest types + helpers.
// Manifests and assets are the published set from lawsofexistence.com, copied
// verbatim under public/uploads/research/<id>/ (same paths, same hashes).
export interface ArchiveDoc {
  /** transcript = the site author's per-leaf working transcript; index = line index; transcription = a
      working span; edition = the professional verification transcription (Christopher Whittick, 2026) */
  kind: 'transcript' | 'index' | 'transcription' | 'edition';
  span?: string;
  title: string;
  pdf: string;
  /** the document's author when it is not the site author (an edition) */
  author?: string;
  /** the credit line as the author asked for it, rendered wherever the document is shown */
  credit?: string;
  sha256?: string;
  /** in a document spanning several leaves, the 1-based PDF page where THIS leaf's text begins — written per
      leaf by the builder (lawsofexistence.com's sync-archives) from the edition's `_PAGE_MAP.tsv` (the
      manuscript seat's table, owner's folio-link task 2026-09-21); the leaf page opens the document there.
      Absent = the document opens at page 1. */
  page?: number;
}
export interface ArchiveLeafEntry {
  id: string;
  image: string;
  thumb?: string;
  web?: string;
  imageBytes?: number;
  sha256: string | null;
  credit?: string | null;
  docs: ArchiveDoc[];
}
export interface ArchiveManifest {
  archive: { id: string; ref: string; title: string; dated: string; source: string; pieces: number };
  images?: { published: boolean; rightsHolder?: string; rightsNote?: string; reuseNote?: string; creditUrl?: string };
  leaves: ArchiveLeafEntry[];
  workingPapers: Array<{ title: string; pdf: string }>;
  crops: { count: number; index: Record<string, string> };
}

export interface ResearchArchiveConfig {
  id: string;
  ref: string;
  caseTitle: string;   // markdown (italic case name)
  leafLabel: string;   // "Membrane" | "Folio"
  source: string;
  dated: string;
  intro: string[];     // markdown paragraphs
  summary: string;     // one plain sentence for cards + metadata
  /** the home-page "From the archives" card (owner 2026-09-14, as on lawsofexistence.com) */
  shelf: { holder: string; blurb: string };
  /** the published transcription is an EDITION by another hand (owner 2026-09-18: Christopher Whittick's
      verification transcription replaces the author's transcripts on the site) */
  edition?: { author: string; credit: string; note: string; cite: string };
}

export const RESEARCH_ARCHIVES: Record<string, ResearchArchiveConfig> = {
  'stac-8-203-38': {
    id: 'stac-8-203-38',
    ref: 'STAC 8/203/38',
    caseTitle: '*Lloyd v. Barker* (Star Chamber, 1607)',
    leafLabel: 'Membrane',
    source: 'The National Archives (UK), Kew — series STAC 8 (Star Chamber Proceedings, James I)',
    dated: 'Trinity term, 5 Jac. I (1607)',
    summary:
      'Ten membranes of Star Chamber examinations, interrogatories, answer, and depositions behind Floyd v. Barker (1607), from The National Archives, with the professional verification transcription by Christopher Whittick beside each membrane.',
    shelf: {
      holder: 'The National Archives (UK), Kew',
      blurb: 'The original Star Chamber proceedings — leaf images reproduced by permission of The National Archives, beside the professional verification transcription by Christopher Whittick.',
    },
    edition: {
      author: 'Christopher Whittick',
      credit: 'Professional verification transcription by Christopher Whittick',
      note: 'Made for this project in 2026 from the record copies and checked against the originals at The National Archives; published in full with the author’s agreement of 18 September 2026. The site author’s own first-hand diplomatic transcription and line indexes, which this edition replaces here, remain in the research library as the working stratum.',
      cite: 'Credit the transcription to its author as above; cite the record as “The National Archives, ref. STAC 8/203/38.” The text is published with the author’s agreement (his licence is the basis, not the Open Government Licence, which covers the record and not his work).',
    },
    intro: [
      'This is the record of **STAC 8/203/38** — the Star Chamber examinations, interrogatories, answer, and depositions arising from the proceedings against Justice Barker and others, the factual matrix behind *Floyd v. Barker*, 12 Co. Rep. 23 (1607), the foundation of judicial immunity doctrine. The transcription beside each membrane is the professional verification transcription by Christopher Whittick. The file self-dates to Trinity term, 5 Jac. I; the TNA catalogue styles the cause *Lloyde v. Lewys*, the leaf-001 caption styles it *Lloyd v. Barker & others*, and the membrane-009 endorsement reads *ad sect[am] Barker* — the three styling strata are themselves an open research question.',
    ],
  },
  'hls-ms149-floyd': {
    id: 'hls-ms149-floyd',
    ref: 'HLS MS 149, ff. 81r–83v',
    caseTitle: '*Floyd v. Barker* — the second account (Star Chamber, 1607)',
    leafLabel: 'Folio',
    source:
      'Harvard Law School Library, Historical & Special Collections — Star Chamber Collection, 1607–1623 (HLS MS 149; digitization funded by the Ames Foundation for Legal History)',
    dated: 'Pasch. 5 Jac. I (1607) · this copy in a later seventeenth-century hand',
    summary:
      'Six folios carrying an independent manuscript report of Floyd v. Barker (1607), from Harvard Law School Library’s Star Chamber collection, with line indexes and transcriptions.',
    shelf: {
      holder: 'Harvard Law School Library',
      blurb: 'The second manuscript account of the case behind judicial immunity — folio images courtesy of Harvard Law School Library, with line indexes and working papers.',
    },
    intro: [
      'These folios carry the “second account with supplementary details” of *Floyd v. Barker* (Star Chamber, Pasch. 5 Jac. I, 1607) — a contemporaneously compiled collection of Jacobean Star Chamber reports, **independent of Coke\'s printed report** (12 Co. Rep. 23, 77 Eng. Rep. 1305), cited at K.J. Kesselring, *Conspiracy, Crime, and Conflict in the Court of Star Chamber*, 43 Law & Hist. Rev. 693, 705 n.47 (2025). The *Floyd* report runs ff. 81r–83r; f. 83v opens the next term (*Brooke v. Oldfield*), confirming the report\'s end.',
      'Images were retrieved 2026-06-10 from the Harvard Library IIIF Image API (manifest `URN-3:HLS.LIBR:29137268`), at 2400-pixel width, and are hash-recorded below. The corroborating Star Chamber file — TNA **STAC 8/203/38**, transcribed in [the companion archive](/research/stac-8-203-38) — independently confirms the parties, the sheriff, the packed grand jury, and the missing bill.',
    ],
  },
};

export const ARCHIVE_IDS = Object.keys(RESEARCH_ARCHIVES);
export const archiveBase = (id: string) => `/uploads/research/${id}`;
/** What the site PUBLISHES of a leaf's documents (owner 2026-09-18, all three sites): the EDITION only —
    Christopher Whittick's professional verification transcription, which replaced the owner's own
    per-leaf transcripts here (owner 2026-09-15 had published those until it arrived). The owner's
    transcripts, the line indexes, the working spans and the working papers stay in the library as the
    working stratum and are not served. */
export const PUBLISHED_KINDS: ReadonlySet<string> = new Set(['edition']);
export const publishedDocs = (leaf: ArchiveLeafEntry): ArchiveDoc[] => leaf.docs.filter((d) => PUBLISHED_KINDS.has(d.kind));

export const imagesPublished = (m: ArchiveManifest | null) => m?.images?.published === true;

export const leafStatus = (leaf: ArchiveLeafEntry): string =>
  publishedDocs(leaf).length ? 'Verification transcription' : 'Image — transcription to follow';

export const CONVENTIONS: Array<[string, string]> = [
  ['[?]', 'uncertain reading'],
  ['[…] / [__]', 'supplied / illegible'],
  ['^word^', 'interlineation (inserted above the line)'],
  ['~~text~~', 'scribal strike-through'],
  ['«or»', 'in-line insertion'],
  ['|', 'cut at a half-column tile edge'],
  ['⟦4B: …⟧', 'editorial fold-in note from a later verification pass'],
];
