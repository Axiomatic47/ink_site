// src/lib/immunity-timeline.ts — the contract for /research/immunity-timeline: a timeline of the actual history of
// immunity in all its categories, every entry resting on the book (The Subject's Unanswered Plea, TSUP on the page) or a
// shelf copy, shared outward as the record. The data is the drafters' work, reviewed before it lands, and is served as it is read: public/research/immunity-timeline.json is the one file, read at
// build by the page and published as the copy a reader can take. This module is the shape the page, the loader and the
// build gate (scripts/validate-timeline.mjs) share; nothing here renders.

export const TIMELINE_PUBLIC_PATH = '/research/immunity-timeline.json';
export const TIMELINE_PAGE_PATH = '/research/immunity-timeline';
/** how the page names the book after the key has said it once: "TSUP § 2.3 · n. iicb5a" */
export const BOOK_SHORT = 'TSUP';

/** the closed set of categories (owner: "in all its categories"); the page colours and filters by them */
export const CATEGORIES = [
  'older-record', 'english-origin', 'sovereign', 'state-sovereign', 'foreign-sovereign', 'judicial', 'legislative',
  'executive-absolute', 'qualified', 'prosecutorial', 'municipal', 'statute', 'repudiation',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  'older-record': 'Older record',
  'english-origin': 'English origin',
  sovereign: 'Sovereign immunity',
  'state-sovereign': 'State sovereign immunity',
  'foreign-sovereign': 'Foreign sovereign immunity',
  judicial: 'Judicial immunity',
  legislative: 'Legislative immunity',
  'executive-absolute': 'Executive (absolute)',
  qualified: 'Qualified immunity',
  prosecutorial: 'Prosecutorial immunity',
  municipal: 'Municipal liability',
  statute: 'Statute',
  repudiation: 'Repudiation',
};

/** what instrument an entry is — the correction the timeline exists to carry: a judicial decision never sits under a
    "legislation" label. Category says which immunity; kind says what the thing is. */
export const KINDS = ['decision', 'statute', 'constitutional-text', 'report', 'treatise', 'event'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = {
  decision: 'Judicial decision',
  statute: 'Statute',
  'constitutional-text': 'Constitutional text',
  report: 'Report',
  treatise: 'Treatise',
  event: 'Event',
};
export function isKind(x: unknown): x is Kind {
  return typeof x === 'string' && (KINDS as readonly string[]).includes(x);
}

export interface TimelineSource {
  /** the citation as the book gives it */
  cite: string;
  /** where the fact was read: the page, folio or line */
  pin?: string | null;
  /** the book's section the entry rests on, e.g. "2.3" */
  book_section?: string | null;
  /** the book's note id the entry rests on, e.g. "ii7nc" — the page deep-links to it */
  book_note?: string | null;
  /** the unit of that note the citation rests on most, "<note>/<seq>" (e.g. "iicb4/2"): the id the book's review page
      answers at #cite=<note>/<seq>, the book open at the citing sentence with the cited page beside it. Begins with book_note. */
  book_unit?: string | null;
  /** where a shelf-only source was read, when the book carries no note for it */
  read_at?: string | null;
}

export interface TimelineEntry {
  /** stable slug; the anchor (#id) and the comparison's cross-reference */
  id: string;
  year: number;
  /** the end of a span (an Act in force, a line of cases); absent for a point */
  year_end?: number | null;
  /** the date as printed ("Easter term 1607", "27 June 1982") */
  date_text: string;
  title: string;
  category: Category;
  /** the instrument: decision · statute · constitutional-text · report · treatise · event */
  kind?: Kind | null;
  /** 2–4 sentences, markdown inline (italic case names) */
  summary: string;
  /** verbatim, read at quote_pin */
  quote?: string | null;
  quote_pin?: string | null;
  source: TimelineSource;
  /** a public copy of the source when the register has one */
  link?: string | null;
}

/** a comparison step, as an earlier draft carried it — kept in the shape so an older file still parses; the page no
    longer draws a comparison */
export interface ComparisonStep {
  step: number;
  /** the site's own step label: Incident · Legislation · Take away */
  label: string;
  their_date_text?: string | null;
  their_title: string;
  /** the claim as the site prints it (short, verbatim) */
  their_claim: string;
  /** the correction, in the author's voice, each fact with its page */
  correction: string;
  entry_ids: string[];
}

export interface ImmunityTimeline {
  title: string;
  standfirst: string;
  /** an earlier draft's one-line framing; not drawn */
  comparison_line?: string | null;
  provenance: {
    book_title: string;
    book_slug: string;
    book_commit?: string | null;
    book_sha256?: string | null;
    /** the date the entries were read */
    date: string;
  };
  endqi?: {
    url: string;
    read_on: string;
    heading?: string | null;
    standfirst?: string | null;
  } | null;
  comparison?: ComparisonStep[] | null;
  entries: TimelineEntry[];
}

/** where an entry's evidence sits in the book: the note's anchor on the plain-text page. `bookBase` is the site's
    address for the book's pages — a path on the site that carries the book, an absolute URL on one that does not. */
export function bookNoteHref(bookBase: string, note: string): string {
  return `${bookBase}/text#user-content-fn-${note}`;
}

/** where a citation sits in the book: the review page at the unit (#cite=<note>/<seq>), the same contract on every site
    that carries the book. `bookBase` as for bookNoteHref. */
export function bookUnitHref(bookBase: string, unit: string): string {
  return `${bookBase}/review#cite=${unit}`;
}

export function isCategory(x: unknown): x is Category {
  return typeof x === 'string' && (CATEGORIES as readonly string[]).includes(x);
}

/** the era headings the rail is grouped under — centuries, named by their numbers so the grouping adds no claim */
export function eraOf(year: number): string {
  if (year < 1000) return 'Before 1000';
  if (year < 1600) return '1000–1599';
  if (year >= 2000) return 'Since 2000';
  const c = Math.floor(year / 100) * 100;
  return `${c}–${c + 99}`;
}

export function sortEntries<T extends { year: number; year_end?: number | null; title: string }>(entries: T[]): T[] {
  return entries.slice().sort((a, b) => a.year - b.year || (a.year_end ?? a.year) - (b.year_end ?? b.year) || a.title.localeCompare(b.title));
}

export function yearLabel(e: { year: number; year_end?: number | null }): string {
  const y = (n: number) => (n < 0 ? `${-n} BC` : String(n));
  return e.year_end && e.year_end !== e.year ? `${y(e.year)}–${y(e.year_end)}` : y(e.year);
}
