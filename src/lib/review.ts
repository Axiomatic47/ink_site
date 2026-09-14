// src/lib/review.ts — REVIEW MODE manifest types: a book's citation units and
// the cited pages published beside it (content/review/<slug>.json, written by
// scripts/import-review-links.mjs from the research library's Pinned Citation
// Extracts lane). Pure types + helpers so client components may import them;
// the JSON is read by review.server.ts.

export interface ReviewPage {
  /** the cited page as a label: "p. 705" · "col. 529" · "f. 81v" · "m. 8" · "sig. E4v" · "first page" */
  label: string;
  /** site path of the one-page PDF, or null when the page is held but not published */
  file: string | null;
  /** true: the page number was read on the cut page · false: placed by the
      run's offset · null: a verso with nothing to read */
  verified: boolean | null;
  sha256: string | null;
}

export interface ReviewUnit {
  /** `<note>/<seq>` — the value of the citation link's data-cite */
  id: string;
  note: string;
  seq: number;
  /** source key in `sources`, or null */
  source: string | null;
  /** the lane's status: CUT · CUT_FIRST · UNMAPPED · NO_PIN · NO_SOURCE */
  status: string;
  rights: string;
  pages: ReviewPage[];
}

export interface ReviewSource {
  title: string;
  rights: string;
  pinkind: 'page' | 'col' | 'folio' | 'memb' | 'sig' | string;
  /** the holder's catalogue record, for licence-bound reproductions */
  holderUrl?: string;
}

export interface ReviewManifest {
  slug: string;
  id: string;
  generated: string;
  feed: string;
  book: { file: string; sha256: string; bytes: number };
  rightsRule: string;
  sources: Record<string, ReviewSource>;
  /** in book order (definition line, then unit order) */
  units: ReviewUnit[];
}

export const RIGHTS_LABEL: Record<string, string> = {
  'public-domain': 'Public domain',
  'in-copyright-owner-use': 'In copyright — held for the author’s own use',
  'licence-bound': 'Licence-bound reproduction',
};

/** the units that open a published page */
export const publishedUnits = (m: ReviewManifest) => m.units.filter((u) => u.pages.some((p) => p.file));

/** `#cite=<note>/<seq>` ⇄ unit id */
export const citeFromHash = (hash: string): string | null => {
  const m = /(?:^|[#&])cite=([A-Za-z0-9_]+\/\d+)/.exec(hash);
  return m ? m[1] : null;
};
export const hashForCite = (id: string) => `#cite=${id}`;
