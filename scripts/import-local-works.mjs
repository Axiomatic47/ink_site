#!/usr/bin/env node
// scripts/import-local-works.mjs — publish the owner's manuscripts that live
// OUTSIDE lawsofexistence.com (the work_station manuscript tree) into this
// site's Articles library. Owner 2026-09-12: "A Restorative Reading of
// Genesis 1–3 … also needs to be published to the site."
//
//   node scripts/import-local-works.mjs
//
// For each entry of LOCAL below it copies the markdown to
// content/works/<slug>.md (leading H1 title stripped: the reader shows the
// title from works.json) and upserts the entry — marked `"local": true` — and
// its collection into content/works.json. scripts/import-loe-articles.mjs
// preserves `local` entries and collections when it rewrites the file, so the
// two imports can run in either order. NOT part of the build (the source tree
// is not on the build host); run it, review `git diff`, commit.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT_JSON = join(ROOT, 'content', 'works.json');
const OUT_MD = join(ROOT, 'content', 'works');
mkdirSync(OUT_MD, { recursive: true });

const MANUSCRIPT = join(homedir(), 'Git', 'work_station', 'manuscript', 'Axiomatic Framework For Human Experience');

const LIBRARY = join(homedir(), 'Git', 'work_station', 'research_library');

const LOCAL_COLLECTIONS = [
  { slug: 'genesis', title: 'Genesis', date: '2026-09-12', featured: true, local: true },
  { slug: 'immunity', title: 'Immunity', date: '2026-09-14', featured: true, local: true },
];
const LOCAL = [
  {
    slug: 'a-restorative-reading-of-genesis-1-3',
    collection: 'genesis',
    title: 'A Restorative Reading of Genesis 1–3',
    subtitle: 'The Creation Narrative in the Hebrew and Its Versions',
    date: '2026-09-12',
    venue: 'Book · working draft',
    // the book's own words (its Conclusion, first paragraph)
    blurb: 'Genesis 1–3 is one narrative told twice. The first telling gives the frame, six days and a rest; the second goes back over the sixth day and gives the detail. A reading of the Hebrew and of its versions, from the Septuagint to the King James, cited at the leaf for every reading.',
    featured: true,
    src: join(MANUSCRIPT, '1. Theology', '1. Genesis', 'canonical', 'A_Restorative_Reading_of_Genesis_1-3.md'),
  },
  {
    // owner 2026-09-14: the immunity book goes up with a REVIEW MODE — the
    // text beside the cited pages (scripts/import-review-links.mjs writes the
    // linked body over this copy and content/review/<slug>.json; run it after
    // this script). The working header (an HTML comment before the title) is
    // stripped here as the academic converter strips it.
    slug: 'the-subjects-unanswered-plea',
    collection: 'immunity',
    title: "The Subject's Unanswered Plea",
    subtitle: 'A Restorative and Comparative History of Immunity',
    date: '2026-09-14',
    venue: 'Book · working draft',
    // the book's own words (its Conclusion, on Part 1)
    blurb: 'The case that founded official immunity was a documented miscarriage of justice, a death by drowning recast as murder, a conviction on examinations taken down in a language the witnesses did not speak, and a court that answered the surviving kinsman’s sworn complaint against the trial judge by defacing it. Six Parts put the question the decree reserved to every order that has answered it, cited at the page.',
    featured: true,
    src: join(LIBRARY, '2_Academic Articles', '11_Immunity and Standing Doctrine Geneology', 'BOOK', 'A_RESTORATIVE_AND_COMPARATIVE_HISTORY_OF_SOVEREIGN_ABSOLUTE_AND_QUALIFIED_IMMUNITY.md'),
  },
];

const stripLeadingTitle = (md) => {
  // a working header is one HTML comment before the title — dropped, as the
  // academic converter drops pre-title comments
  let s = md.replace(/^﻿/, '');
  if (s.startsWith('<!--')) { const m = /^-->[ \t]*$/m.exec(s); if (m) s = s.slice(m.index + m[0].length).replace(/^\s+/, ''); }
  const lines = s.split('\n');
  if (/^#\s/.test(lines[0] ?? '')) lines.shift();
  return lines.join('\n').replace(/^\s+/, '');
};

const data = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
let n = 0;
for (const w of LOCAL) {
  if (!existsSync(w.src)) { console.error(`import-local-works: source missing: ${w.src}`); process.exitCode = 1; continue; }
  const md = readFileSync(w.src, 'utf8');
  writeFileSync(join(OUT_MD, `${w.slug}.md`), stripLeadingTitle(md).trimEnd() + '\n');
  const entry = { ...w, year: w.date.slice(0, 4), body: `/content/works/${w.slug}.md`, local: true };
  delete entry.src; // the owner's filesystem path stays out of the public JSON
  const i = data.works.findIndex((x) => x.slug === w.slug);
  if (i >= 0) data.works[i] = entry; else data.works.push(entry);
  n += 1;
}
for (const c of LOCAL_COLLECTIONS) {
  const i = data.collections.findIndex((x) => x.slug === c.slug);
  if (i >= 0) data.collections[i] = c; else data.collections.splice(data.collections.filter((x) => x.featured).length, 0, c);
}
writeFileSync(OUT_JSON, JSON.stringify(data, null, 2) + '\n');
console.log(`import-local-works: ${n} manuscripts → content/works.json`);
