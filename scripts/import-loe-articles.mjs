#!/usr/bin/env node
// scripts/import-loe-articles.mjs — bring the academic articles published on
// lawsofexistence.com (its "Research" collections: content/manuscript/*.json in
// the loe_website repo) into this site's Articles library. Owner 2026-09-12:
// "publish all Articles that are on lawsofexistence.com to kirchner.ink".
//
//   node scripts/import-loe-articles.mjs [/path/to/loe_website]
//
// Writes content/works.json (collections + works), content/works/<slug>.md for
// the articles that exist as text rather than PDF, and copies each article PDF
// to public/works/. Re-runnable: it rewrites those outputs from the source and
// keeps nothing stale. NOT part of the build (the source repo is not on the
// build host); run it, review `git diff`, commit.
//
// What counts as an article: every section of every manuscript collection.
// The site's other collections (cases, evidence, copyright notices, timeline,
// map) are litigation material and are NOT articles — not imported.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SRC = resolve(process.argv[2] || join(ROOT, '..', 'loe_website'));
const MANUSCRIPT = join(SRC, 'content', 'manuscript');
if (!existsSync(MANUSCRIPT)) { console.error(`import-loe-articles: ${MANUSCRIPT} not found — pass the loe_website path`); process.exit(1); }

const OUT_JSON = join(ROOT, 'content', 'works.json');
const OUT_MD = join(ROOT, 'content', 'works');
const OUT_PDF = join(ROOT, 'public', 'works');
mkdirSync(OUT_MD, { recursive: true }); mkdirSync(OUT_PDF, { recursive: true });

// Slugs this site already publishes under a different name (kept: linked from
// cv.json and the resume).
const SLUG_ALIAS = { 'the-madisonian-separation-of-powers-objective-compliance-tes': 'madisonian-test' };

const files = readdirSync(MANUSCRIPT).filter((f) => f.endsWith('.json')).sort();
const raw = files.map((f) => JSON.parse(readFileSync(join(MANUSCRIPT, f), 'utf8')));
// featured collections first, then source order
const ordered = [...raw.filter((c) => c.featured), ...raw.filter((c) => !c.featured)];

// The card blurb: the first real paragraph of the text — never a heading, a
// byline (author / affiliation line), a rule, or a sentence that merely
// introduces what follows (ends with a colon).
const isByline = (l) => /Joseph\s+D?\.?\s*Kirchner|Independent Scholar|^\*[^*]+\*\s*$/i.test(l);
const firstParagraph = (md) => {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    if (/^#/.test(b) || /^(-{3,}|\*{3,}|_{3,})$/.test(b) || /^[-*]\s|^\d+\.\s|^>|^\|/.test(b) || isByline(b) || /\$/.test(b) || /^Where\b/.test(b)) continue;
    const text = b.replace(/\s+/g, ' ').replace(/[*_`]/g, '').trim();
    if (text.length < 80 || /:$/.test(text)) continue;
    return text;
  }
  return '';
};
const stripLeadingTitle = (md, title) => {
  const lines = md.split('\n');
  if (lines[0]?.replace(/^#\s*/, '').trim().toLowerCase() === title.trim().toLowerCase()) lines.shift();
  return lines.join('\n').replace(/^\s+/, '');
};
// Display math that spans lines must open and close on fences of their own:
// remark-math reads text after an opening `$$` on the same line as the block's
// META (dropped), and a `…$$` closing on a content line does not close, so the
// block swallows the rest of the article (measured on the Unified Mathematical
// Model: 190 unrendered `$$` and one KaTeX error blob). Single-line `$$…$$` is fine.
const normaliseMath = (md) => md.split('\n').flatMap((line) => {
  const n = (line.match(/\$\$/g) || []).length;
  if (n !== 1) return [line];
  if (/^\s*\$\$\S/.test(line)) return ['$$', line.replace(/^\s*\$\$/, '')];
  if (/\S\$\$\s*$/.test(line)) return [line.replace(/\$\$\s*$/, ''), '$$'];
  return [line];
}).join('\n');
const clip = (s, n = 320) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…');

// stale outputs go first, so a removed source article does not linger
for (const f of readdirSync(OUT_MD)) if (f.endsWith('.md')) rmSync(join(OUT_MD, f));

const collections = [], works = [], seen = new Set();
let pdfs = 0, mds = 0;
for (const c of ordered) {
  collections.push({ slug: c.slug, title: c.title, date: (c.date || '').slice(0, 10), featured: Boolean(c.featured) });
  for (const s of c.sections) {
    const slug = SLUG_ALIAS[s.slug] || s.slug;
    if (seen.has(slug)) { console.warn(`  duplicate slug skipped: ${slug}`); continue; }
    seen.add(slug);
    const date = (s.date || c.date || '').slice(0, 10);
    const body = (s.content_level_1 || '').trim();
    const w = {
      slug, collection: c.slug, title: s.title.trim(), date, year: date.slice(0, 4),
      venue: 'Independent research',
      blurb: clip((s.description || firstParagraph(body) || '').replace(/^Joseph D\. Kirchner\.\s*/, '')),
      featured: Boolean(s.featured),
    };
    if (s.pdf_file) {
      const src = join(SRC, 'public', s.pdf_file);
      if (!existsSync(src)) { console.error(`  MISSING PDF ${s.pdf_file} for ${slug}`); process.exitCode = 1; continue; }
      const name = basename(s.pdf_file);
      copyFileSync(src, join(OUT_PDF, name)); pdfs += 1;
      w.pdf = `/works/${name}`;
      if (statSync(src).size > 8 * 1024 * 1024) console.warn(`  large PDF: ${name} (${(statSync(src).size / 1048576).toFixed(1)} MB)`);
    } else if (body) {
      writeFileSync(join(OUT_MD, `${slug}.md`), normaliseMath(stripLeadingTitle(body, s.title)) + '\n'); mds += 1;
      w.body = `/content/works/${slug}.md`;
    } else { console.warn(`  no PDF and no text: ${slug} — skipped`); continue; }
    works.push(w);
  }
}

const out = {
  $comment: `Articles library — imported from lawsofexistence.com's manuscript collections by scripts/import-loe-articles.mjs (owner 2026-09-12). PDFs under public/works/, text articles under content/works/<slug>.md. Re-run the script to refresh; do not hand-edit imported entries.`,
  collections, works,
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + '\n');
console.log(`import-loe-articles: ${collections.length} collections, ${works.length} articles (${pdfs} PDF, ${mds} text) → content/works.json`);
