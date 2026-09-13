// src/lib/cv.ts — typed loader for content/cv.json (the one content file).
import raw from '../../content/cv.json';

export interface Link { label: string; url: string }
export interface Experience {
  role: string;
  organization: string;
  location?: string;
  start: string;   // "2019" or "2019-03"
  end?: string;    // omit or "" for present
  summary?: string;
  highlights?: string[];
}
export interface Education {
  degree?: string;      // omit or "" when no degree is listed
  institution: string;
  location?: string;
  year?: string;
  detail?: string;
}
export interface SkillGroup { group: string; items: string[] }
export interface Work {
  title: string;
  year?: string;
  venue?: string;
  url?: string;
  note?: string;        // the short description under the title (owner 2026-09-12)
  highlights?: string[]; // bullets under a detailed entry
}
/** an entry of a resume section the fixed keys do not carry (Civil Rights and Legal Work, Research, ...) */
export interface SectionEntry {
  title: string;
  organization?: string; // the meta line's non-date, non-URL segments joined with ' · '
  url?: string;
  dates?: string;
  summary?: string;
  highlights?: string[];
}
/** every resume section in order; `kind` names the fixed key it feeds, `generic` sections carry entries */
export interface Section {
  title: string;
  kind: 'summary' | 'skills' | 'experience' | 'education' | 'works' | 'generic';
  paras?: string[];
  entries?: SectionEntry[];
}
export interface CV {
  name: string;
  headline: string;
  location: string;
  email: string;
  pdf: string;           // styled CV PDF: /resume/… owner-exported from Word (tracked) or /cv/… generated at build
  pdf_print: string;     // print-friendly CV PDF (no shading), same two forms; or ""
  portrait: string;      // site-relative image under public/, or ""
  availability: string;  // short badge text, or ""
  links: Link[];
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: SkillGroup[];
  works: Work[];
  sections?: Section[];  // derived with the rest by scripts/cv-from-resume.mjs
}

export const cv: CV = raw as unknown as CV;

export const SITE_ORIGIN = 'https://kirchner.ink';

export function dateRange(e: Experience): string {
  if (!e.end) return `${e.start} – present`;
  return e.end === e.start ? e.start : `${e.start} – ${e.end}`;
}
