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
  /** the page's own source key and rights — a unit cut from two sources
      (the 1611 facsimile and the Bodleian leaves) has pages of each */
  source: string | null;
  rights: string;
  /** the case's first page — the note cited the case without a pin, so the whole case is served (owner 2026-09-15) */
  begins?: boolean;
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
  /** where the unit stands in the book's PDF (absent for the two units the overlay could not place) */
  box?: ReviewBox;
}

/** a box over one line of a citation unit in the book's PDF — PDF points, origin top-left */
export type Rect = [number, number, number, number];
export interface ReviewBox {
  /** the unit's lines; a unit split across a page break has two parts */
  parts: { page: number; rects: Rect[] }[];
  approx?: boolean;
}
export interface ReviewPdf {
  file: string;
  sha256: string;
  bytes: number;
  pages: number;
  producer: string;
  origin: string;
  /** the render's date (from the lane's file name, else its mtime) — the PDF can lag the text */
  rendered: string;
  renderName: string;
  /** a copy with the citation links written in as PDF annotations, for download */
  linked: { file: string; sha256: string } | null;
}
export interface ReviewMarker { note: string; page: number; rect: Rect }

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
  book: { file: string; sha256: string; bytes: number; commit?: string; parsed?: string };
  rightsRule: string;
  sources: Record<string, ReviewSource>;
  /** the book as a PDF, bound to the boxes by sha256; null until the lane emits _WEB/overlay.json */
  pdf: ReviewPdf | null;
  /** in-text superscripts that were matched to their note */
  markers: ReviewMarker[];
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

/** `#cite=<note>/<seq>[/<page index>]` ⇄ unit id + which of its cited pages (0-based) */
export const citeFromHash = (hash: string): { id: string; page: number } | null => {
  const m = /(?:^|[#&])cite=([A-Za-z0-9_]+\/\d+)(?:\/(\d+))?/.exec(hash);
  return m ? { id: m[1], page: m[2] ? Number(m[2]) : 0 } : null;
};
export const hashForCite = (id: string, page = 0) => (page > 0 ? `#cite=${id}/${page}` : `#cite=${id}`);
