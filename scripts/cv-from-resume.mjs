#!/usr/bin/env node
// cv-from-resume.mjs — derive content/cv.json from the resume markdown.
//
// Since 2026-09-11 the resume is a Studio filing doc: Joseph_Kirchner_Resume.md
// in the repo root is the document the owner edits (in the Studio or in Word
// through Word-sync) and the `resume` converter renders. The site's single
// content file, cv.json, is DERIVED from it here so the page, the site PDF and
// the Word resume share one text. Site-only presentation keys (location,
// email, pdf, links, availability, portrait, $comment) are preserved as they
// are; the derived keys are name, headline, summary, skills, experience,
// education, works.
//
// Grammar (blank-line-separated blocks, every bullet its own block):
//   # Name / headline paragraph / ## Section / ### Entry title /
//   org · location · dates (the segment that reads as a date range; URLs are
//   links) / paragraphs / - bullets; under ## Skills: - **Label:** a · b · c
//
// Sections the site does not carry (Professional Memberships, ...) are parsed
// and IGNORED — the derived keys are fixed; a resume-only section never
// changes cv.json (owner 2026-09-11: memberships on the resume, not the site).
// Private data (phone, references) is never in the markdown; the build gate
// (validate-cv.mjs) refuses it in cv.json regardless.
//
// Usage: node scripts/cv-from-resume.mjs [--check]   (--check: exit 1 if cv.json would change)
import { readFileSync, writeFileSync } from 'node:fs';

const MD_PATH = new URL('../Joseph_Kirchner_Resume.md', import.meta.url);
const CV_PATH = new URL('../content/cv.json', import.meta.url);
const check = process.argv.includes('--check');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?\\d{4}`;
const RANGE_RE = new RegExp(`^(?:${DATE}(?:\\s*[–—-]\\s*(?:${DATE}|[Pp]resent))?|[Ss]ince\\s+${DATE})$`);
const URL_RE = /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i;
const SKILL_RE = /^\*\*([^*]+?)(:)?\*\*:?\s*(.*)$/;
const BULLET_RE = /^[ \t]*[-*+][ \t]+(.*)$/;
const HEADING_RE = /^(#{1,3})\s+(.*?)\s*#*\s*$/;

function stripFrontMatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  const after = text.indexOf('\n', end + 4);
  return after < 0 ? '' : text.slice(after + 1);
}

function splitMeta(line) {
  const segs = line.split(/\s·\s|\t/).map((s) => s.trim()).filter(Boolean);
  let dates = '';
  const links = [];
  const rest = [];
  for (const s of segs) {
    if (!dates && RANGE_RE.test(s)) dates = s;
    else if (URL_RE.test(s)) links.push(s);
    else rest.push(s);
  }
  if (!dates && rest.length) {
    const m = rest[rest.length - 1].match(new RegExp(`^(.*?)[\\s·]+(${DATE}(?:\\s*[–—-]\\s*(?:${DATE}|[Pp]resent))?)$`));
    if (m) { rest[rest.length - 1] = m[1].replace(/[\s·]+$/, ''); dates = m[2]; }
  }
  return { rest: rest.filter(Boolean), dates, links };
}

function parse(body) {
  const r = { name: '', headline: '', sections: [] };
  let section = null;
  let entry = null;
  for (const block of body.trim().split(/\n\s*\n/)) {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const hm = line.match(HEADING_RE);
      if (hm) {
        const level = hm[1].length;
        const text = hm[2].trim();
        if (level === 1 && !r.name) r.name = text;
        else if (level <= 2) { section = { title: text, paras: [], skills: [], entries: [] }; r.sections.push(section); entry = null; }
        else {
          if (!section) { section = { title: '', paras: [], skills: [], entries: [] }; r.sections.push(section); }
          entry = { title: text, meta: null, paras: [], bullets: [] };
          section.entries.push(entry);
        }
        continue;
      }
      const bm = line.match(BULLET_RE);
      if (bm) {
        const item = bm[1].trim();
        if (entry) entry.bullets.push(item);
        else if (section) {
          const sm = item.match(SKILL_RE);
          if (sm) section.skills.push({ group: sm[1].trim(), items: sm[3].split(/\s·\s/).map((x) => x.trim()).filter(Boolean) });
        }
        continue;
      }
      if (entry) {
        if (!entry.meta && (line.includes(' · ') || RANGE_RE.test(line) || URL_RE.test(line))) entry.meta = splitMeta(line);
        else entry.paras.push(line);
      } else if (section) section.paras.push(line);
      else if (r.name && !r.headline) r.headline = line;
    }
  }
  return r;
}

const range = (dates) => {
  const m = dates.match(/^(.*?)\s*[–—-]\s*(.*)$/);
  if (!m) return { start: dates, end: dates };
  return { start: m[1].trim(), end: /^present$/i.test(m[2].trim()) ? '' : m[2].trim() };
};
const sectionNamed = (r, ...names) => r.sections.find((s) => names.includes(s.title.toLowerCase()));

const text = readFileSync(MD_PATH, 'utf8');
const r = parse(stripFrontMatter(text));
if (!r.name) { console.error('cv-from-resume: no `# Name` heading in the resume markdown'); process.exit(1); }

const cv = JSON.parse(readFileSync(CV_PATH, 'utf8'));
const out = { ...cv };
out.name = r.name;
out.headline = r.headline;
const summary = sectionNamed(r, 'summary');
out.summary = summary ? summary.paras.join('\n\n') : '';
const skills = sectionNamed(r, 'skills');
out.skills = skills ? skills.skills : [];
const exp = sectionNamed(r, 'experience');
out.experience = (exp ? exp.entries : []).map((e) => {
  const m = e.meta ?? { rest: [], dates: '', links: [] };
  const { start, end } = range(m.dates);
  const o = { role: e.title, organization: m.rest[0] ?? '', location: m.rest[1] ?? '', start, end };
  if (e.paras.length) o.summary = e.paras.join(' ');
  o.highlights = e.bullets;
  return o;
});
const edu = sectionNamed(r, 'education');
out.education = (edu ? edu.entries : []).map((e) => {
  const m = e.meta ?? { rest: [], dates: '', links: [] };
  // two non-date segments (institution · location): the title is the degree;
  // one or none: the title is the institution
  const o = m.rest.length >= 2
    ? { degree: e.title, institution: m.rest[0], location: m.rest[1] }
    : { degree: '', institution: e.title, ...(m.rest[0] ? { location: m.rest[0] } : {}) };
  o.year = m.dates.replace(/\bPresent\b/, 'present');
  if (e.paras.length) o.detail = e.paras.join(' ');
  return o;
});
const works = sectionNamed(r, 'selected work', 'works', 'publications');
out.works = (works ? works.entries : []).map((e) => {
  const m = e.meta ?? { rest: [], dates: '', links: [] };
  const o = { title: e.title, year: m.dates };
  if (m.links[0]) o.url = /^https?:\/\//i.test(m.links[0]) ? m.links[0] : `https://${m.links[0]}`;
  return o;
});

const next = JSON.stringify(out, null, 2) + '\n';
const current = readFileSync(CV_PATH, 'utf8');
if (next === current) { console.log('cv-from-resume: cv.json already matches the resume markdown'); process.exit(0); }
if (check) { console.error('cv-from-resume: cv.json is out of date with the resume markdown (run npm run cv:sync)'); process.exit(1); }
writeFileSync(CV_PATH, next);
console.log('cv-from-resume: wrote content/cv.json from Joseph_Kirchner_Resume.md');
