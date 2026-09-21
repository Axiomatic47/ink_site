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
  /** where the page can be SEEN when it is not served here (lane contract 2026-09-16): a held membrane or
      folio's own leaf page on this site (site-relative, /research/<archive>/leaf/<id>), or the holder's
      catalogue record for an EXTERNAL row (https) — one rule: any index row with a url yields a chip with it */
  url?: string;
  /** the register id of the WORK this page cites (second consumer contract, 2026-09-16) — see ReviewManifest.works */
  work?: string;
  /** the READING COPY (owner rule 2026-09-15): a multi-page PDF of the work — whole when ≤10 pages or a
      whole case, else the cited page with the neighbours its quotation needs — and the cited page's
      1-based position inside it. The pane opens this, scrolled to `page`; `file` above stays the
      hash-verified single-page audit copy. */
  context?: { file: string; page: number; sha256: string | null; served?: string | null; bytes?: number };
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
  /** the register id of the work the unit's first row cites — what a unit with no page still cites */
  work?: string;
  /** the distinct register ids of ALL the unit's live rows, in row order (a pinless row carries no page chip
      to hold its work; the card lists these) */
  works?: string[];
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
  /** the lane's render (what the overlay is bound to) */
  sha256: string;
  /** the served copy — linearized at import for progressive loading */
  served?: string;
  bytes: number;
  pages: number;
  producer: string;
  origin: string;
  /** the render's date (from the lane's file name, else its mtime) — the PDF can lag the text */
  rendered: string;
  renderName: string;
  /** a copy with the citation links written in as PDF annotations, for download */
  linked: { file: string; sha256: string; served?: string } | null;
}
export interface ReviewMarker { note: string; page: number; rect: Rect }

export interface ReviewSource {
  title: string;
  rights: string;
  pinkind: 'page' | 'col' | 'folio' | 'memb' | 'sig' | 'item' | string;
  /** the holder's catalogue record, for licence-bound reproductions */
  holderUrl?: string;
}

/** one row of the lane's register of cited works (drafter 8a96daa3): the full citation, where the whole work
    can be read, how the holder asks to be cited, and the rights statement — shown under the source title */
export interface ReviewWork {
  full_citation?: string;
  short_form?: string;
  type?: string;
  author?: string;
  title?: string;
  container?: string;
  publisher?: string;
  place?: string;
  year?: string;
  edition?: string;
  isbn?: string;
  issn?: string;
  doi?: string;
  full_work_url?: string;
  full_work_url_kind?: string;
  volume_url?: string;
  holder?: string;
  holder_url?: string;
  preferred_citation?: string;
  preferred_citation_source?: string;
  rights?: string;
  rights_statement?: string;
  rights_source_url?: string;
  licence?: string;
}

/** a reader's label for the register's full_work_url_kind */
export const WORK_URL_KIND: Record<string, string> = {
  'loc-usrep-pdf': 'Library of Congress, U.S. Reports',
  'internet-archive': 'Internet Archive',
  'cap-static': 'Caselaw Access Project',
  'google-books': 'Google Books',
  govinfo: 'GovInfo',
  doi: 'DOI',
  'legislation-gov-uk': 'legislation.gov.uk',
  'uscode-house-gov': 'U.S. Code',
  'supremecourt-gov-slip': 'Supreme Court slip opinion',
  'catalogue-record': 'catalogue record',
  'acquisition-source': 'acquisition source',
  'site-archive': 'this site’s archive',
};

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
  /** the cited WORKS the units point at (the lane's _REGISTER.tsv, public fields only; empty fields dropped) */
  works?: Record<string, ReviewWork>;
  /** in book order (definition line, then unit order) */
  units: ReviewUnit[];
  /** the same manifest as a hashed static JSON the browser fetches (set in content/review/<slug>.json only) */
  publicUrl?: string;
  publicBytes?: number;
}

/** what the page ships inline: enough to start the book pane and show the counts while the manifest fetches */
export interface ReviewMeta {
  slug: string;
  publicUrl: string;
  unitCount: number;
  published: number;
  sourceCount: number;
  pdf: ReviewPdf | null;
  book: ReviewManifest['book'];
  generated: string;
  rightsRule: string;
}
export const reviewMeta = (m: ReviewManifest): ReviewMeta => ({
  slug: m.slug, publicUrl: m.publicUrl ?? '', unitCount: m.units.length, published: publishedUnits(m).length,
  sourceCount: Object.keys(m.sources).length, pdf: m.pdf, book: m.book, generated: m.generated, rightsRule: m.rightsRule,
});
/** an empty manifest carrying the pdf, so the book pane starts before the units arrive */
export const stubManifest = (meta: ReviewMeta): ReviewManifest => ({
  slug: meta.slug, id: '', generated: meta.generated, feed: '', book: meta.book, rightsRule: meta.rightsRule,
  sources: {}, pdf: meta.pdf, markers: [], units: [],
});

export const RIGHTS_LABEL: Record<string, string> = {
  'public-domain': 'Public domain',
  'in-copyright-owner-use': 'In copyright — held for the author’s own use',
  'licence-bound': 'Licence-bound reproduction',
  'external-link': 'Catalogue record at the holder — nothing held in the library',
};

/** the units that open a published page */
export const publishedUnits = (m: ReviewManifest) => m.units.filter((u) => u.pages.some((p) => p.file));

/** an EDITION served for a membrane / folio of one of this site's archives (Christopher Whittick's verification
    transcription of STAC 8/203/38, 2026-09-18): a held page whose chip links to that leaf opens the transcription
    in the review pane at the leaf's page — not the held card — with the folio image a click away and the leaf page
    (image beside transcription) in a new tab (owner 2026-09-21). Built at build time from the archive manifests
    (review.server.ts editionLeaves) and passed through ReviewLoader; the same contract as lawsofexistence.com. */
export interface EditionLeaf {
  archiveId: string;
  leafId: string;
  leafLabel: string;
  /** this site's leaf page — the image beside the transcription */
  leafUrl: string;
  /** the transcription PDF and the 1-based page where THIS leaf's text begins */
  pdf: string;
  sha256: string | null;
  page: number;
  title: string;
  credit: string;
  author?: string;
  /** the leaf image (the web rendition when the original is oversized) and the holder's credit for it */
  image: string;
  imageCredit?: string | null;
}
/** keyed `${archiveId}/${leafId}` */
export type EditionMap = Record<string, EditionLeaf>;
/** a chip url of this site's leaf-page form, with an optional `#page=N` (the citation's exact page in the edition) */
export const leafFromUrl = (url: string | null | undefined): { key: string; page: number | null } | null => {
  if (!url) return null;
  const m = url.match(/^\/research\/([^/]+)\/leaf\/([^/#?]+)(?:[#?].*?\bpage=(\d+))?/);
  return m ? { key: `${m[1]}/${m[2]}`, page: m[3] ? Number(m[3]) : null } : null;
};

/** `#cite=<note>/<seq>[/<page index>]` ⇄ unit id + which of its cited pages (0-based) */
export const citeFromHash = (hash: string): { id: string; page: number } | null => {
  const m = /(?:^|[#&])cite=([A-Za-z0-9_]+\/\d+)(?:\/(\d+))?/.exec(hash);
  return m ? { id: m[1], page: m[2] ? Number(m[2]) : 0 } : null;
};
export const hashForCite = (id: string, page = 0) => (page > 0 ? `#cite=${id}/${page}` : `#cite=${id}`);
