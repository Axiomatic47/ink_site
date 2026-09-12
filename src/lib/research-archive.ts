// src/lib/research-archive.ts — research-archive manifest types + helpers.
// Manifests and assets are the published set from lawsofexistence.com, copied
// verbatim under public/uploads/research/<id>/ (same paths, same hashes).
export interface ArchiveDoc {
  kind: 'transcript' | 'index' | 'transcription';
  span?: string;
  title: string;
  pdf: string;
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
      'Ten membranes of Star Chamber examinations, interrogatories, answer, and depositions behind Floyd v. Barker (1607), transcribed first-hand from The National Archives.',
    intro: [
      'This is the working record of a first-hand diplomatic transcription of **STAC 8/203/38** — the Star Chamber examinations, interrogatories, answer, and depositions arising from the proceedings against Justice Barker and others, the factual matrix behind *Floyd v. Barker*, 12 Co. Rep. 23 (1607), the foundation of judicial immunity doctrine. The file self-dates to Trinity term, 5 Jac. I; the TNA catalogue styles the cause *Lloyde v. Lewys*, the leaf-001 caption styles it *Lloyd v. Barker & others*, and the membrane-009 endorsement reads *ad sect[am] Barker* — the three styling strata are themselves an open research question.',
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
    intro: [
      'These folios carry the “second account with supplementary details” of *Floyd v. Barker* (Star Chamber, Pasch. 5 Jac. I, 1607) — a contemporaneously compiled collection of Jacobean Star Chamber reports, **independent of Coke\'s printed report** (12 Co. Rep. 23, 77 Eng. Rep. 1305), cited at K.J. Kesselring, *Conspiracy, Crime, and Conflict in the Court of Star Chamber*, 43 Law & Hist. Rev. 693, 705 n.47 (2025). The *Floyd* report runs ff. 81r–83r; f. 83v opens the next term (*Brooke v. Oldfield*), confirming the report\'s end.',
      'Images were retrieved 2026-06-10 from the Harvard Library IIIF Image API (manifest `URN-3:HLS.LIBR:29137268`), at 2400-pixel width, and are hash-recorded below. The corroborating Star Chamber file — TNA **STAC 8/203/38**, transcribed in [the companion archive](/research/stac-8-203-38) — independently confirms the parties, the sheriff, the packed grand jury, and the missing bill.',
    ],
  },
};

export const ARCHIVE_IDS = Object.keys(RESEARCH_ARCHIVES);
export const archiveBase = (id: string) => `/uploads/research/${id}`;
export const imagesPublished = (m: ArchiveManifest | null) => m?.images?.published === true;

export const leafStatus = (leaf: ArchiveLeafEntry): string => {
  const hasCanon = leaf.docs.some((d) => d.kind === 'transcript');
  const hasIndex = leaf.docs.some((d) => d.kind === 'index');
  const spans = [...new Set(leaf.docs.filter((d) => d.kind === 'transcription').map((d) => d.span))];
  const parts: string[] = [];
  if (hasCanon) parts.push('Transcript');
  parts.push(hasIndex ? (hasCanon ? 'line index' : 'Line index') : '—');
  if (!hasCanon && spans.length) parts.push(`transcribed (${spans.join(', ')})`);
  return parts.join(' · ');
};

export const CONVENTIONS: Array<[string, string]> = [
  ['[?]', 'uncertain reading'],
  ['[…] / [__]', 'supplied / illegible'],
  ['^word^', 'interlineation (inserted above the line)'],
  ['~~text~~', 'scribal strike-through'],
  ['«or»', 'in-line insertion'],
  ['|', 'cut at a half-column tile edge'],
  ['⟦4B: …⟧', 'editorial fold-in note from a later verification pass'],
];
