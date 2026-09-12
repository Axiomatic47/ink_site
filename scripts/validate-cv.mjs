#!/usr/bin/env node
// validate-cv.mjs — build gate for content/cv.json.
// Hard errors (exit 1): missing name/email, malformed entries, placeholder
// text (TODO, lorem, "Your ...", "[ ]"), links that are not https URLs.
// Warnings: sections still empty — printed so the build log says what the
// site is not yet showing.
import { readFileSync, existsSync } from 'node:fs';

const cv = JSON.parse(readFileSync(new URL('../content/cv.json', import.meta.url), 'utf8'));
const { works } = JSON.parse(readFileSync(new URL('../content/works.json', import.meta.url), 'utf8'));
const errors = [];
const warnings = [];

const PLACEHOLDER = /\b(TODO|TBD|lorem|ipsum|placeholder|your (name|title|role|company))\b|\[[^\]]*\]/i;
// Never published (owner 2026-09-10): references and any contact beyond cv.email.
// People request the full CV with references by e-mail; the references sheet is a
// Word file the owner sends by hand. These keys and phone-shaped strings are refused.
const PRIVATE_KEY = /^(references?|referees?|phone|mobile|cell|tel|telephone|address|street|home_address)$/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const walk = (v, path) => {
  if (typeof v === 'string') {
    if (PLACEHOLDER.test(v)) errors.push(`${path}: placeholder text "${v.slice(0, 60)}"`);
    if (PHONE.test(v)) errors.push(`${path}: phone-shaped string — no contact beyond cv.email is published`);
  }
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    if (k === '$comment') continue;
    if (PRIVATE_KEY.test(k)) errors.push(`${path}.${k}: references and private contact are never published (owner 2026-09-10)`);
    walk(x, `${path}.${k}`);
  }
};
walk(cv, 'cv');
walk(works, 'works');

if (!cv.name?.trim()) errors.push('cv.name is required');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cv.email ?? '')) errors.push('cv.email must be an email address');

for (const [i, l] of (cv.links ?? []).entries()) {
  if (!l.label?.trim()) errors.push(`links[${i}].label missing`);
  if (!/^https:\/\//.test(l.url ?? '')) errors.push(`links[${i}].url must start with https://`);
}
for (const [i, e] of (cv.experience ?? []).entries()) {
  for (const k of ['role', 'organization', 'start']) if (!e[k]?.trim()) errors.push(`experience[${i}].${k} missing`);
}
for (const [i, e] of (cv.education ?? []).entries()) {
  if (!e.institution?.trim()) errors.push(`education[${i}].institution missing`);
}
for (const [i, g] of (cv.skills ?? []).entries()) {
  if (!g.group?.trim() || !Array.isArray(g.items) || g.items.length === 0) errors.push(`skills[${i}] needs group + items`);
}
for (const [i, w] of (cv.works ?? []).entries()) {
  if (!w.title?.trim()) errors.push(`works[${i}].title missing`);
  if (w.url && !/^https:\/\//.test(w.url)) errors.push(`works[${i}].url must start with https://`);
}
// cv.pdf is either GENERATED (/cv/<name>.pdf, build-cv-pdf.mjs, gitignored) or
// OWNER-RENDERED from Word (/resume/<name>.pdf, tracked). Its text is screened
// for private contact at build by scripts/check-pdf-private.mjs.
for (const k of ['pdf', 'pdf_print']) if (cv[k] && !/^\/(cv|resume)\/[\w.-]+\.pdf$/.test(cv[k])) errors.push(`cv.${k} must be /cv/<name>.pdf (generated) or /resume/<name>.pdf (owner-rendered, tracked)`);
if (cv.pdf_print && cv.pdf_print === cv.pdf) errors.push('cv.pdf_print must differ from cv.pdf');
for (const k of ['pdf', 'pdf_print']) if (cv[k] && cv[k].startsWith('/resume/') && !existsSync(new URL(`../public${cv[k]}`, import.meta.url))) errors.push(`cv.${k} ${cv[k]} is not under public/ (owner-rendered PDFs are tracked files)`);
if (cv.portrait && !existsSync(new URL(`../public${cv.portrait}`, import.meta.url))) errors.push(`cv.portrait ${cv.portrait} is not under public/`);
const slugs = new Set();
for (const [i, w] of works.entries()) {
  if (!/^[a-z0-9-]+$/.test(w.slug ?? '')) errors.push(`works[${i}].slug must be lowercase-hyphen`);
  if (slugs.has(w.slug)) errors.push(`works[${i}].slug duplicate: ${w.slug}`); slugs.add(w.slug);
  if (!w.title?.trim()) errors.push(`works[${i}].title missing`);
  if (!/^\/works\/[\w.-]+\.pdf$/.test(w.pdf ?? '')) errors.push(`works[${i}].pdf must be /works/<file>.pdf`);
  else if (!existsSync(new URL(`../public${w.pdf}`, import.meta.url))) errors.push(`works[${i}].pdf ${w.pdf} is missing under public/`);
  if (w.source && !/^https:\/\//.test(w.source)) errors.push(`works[${i}].source must start with https://`);
}

for (const k of ['headline', 'location', 'summary']) if (!cv[k]?.trim()) warnings.push(`${k} is empty (not rendered)`);
for (const k of ['experience', 'education', 'skills', 'works']) if (!(cv[k]?.length)) warnings.push(`${k} is empty (section not rendered)`);
if (!cv.pdf) warnings.push('pdf is empty (no CV viewer or download rendered)');
if (!cv.portrait) warnings.push('portrait is empty (monogram placeholder rendered)');
if (!works.length) warnings.push('works.json is empty (Work section not rendered)');

// research archives: every manifest-listed image and PDF must exist
for (const id of ['stac-8-203-38', 'hls-ms149-floyd']) {
  const base = new URL(`../public/uploads/research/${id}/`, import.meta.url);
  let m;
  try { m = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8')); } catch { errors.push(`research/${id}: manifest.json missing`); continue; }
  for (const l of m.leaves) for (const f of [l.image, l.thumb, l.web].filter(Boolean)) if (!existsSync(new URL(f, base))) errors.push(`research/${id}: ${f} missing`);
  for (const l of m.leaves) for (const d of l.docs) if (!existsSync(new URL(d.pdf, base))) errors.push(`research/${id}: ${d.pdf} missing`);
  for (const p of m.workingPapers) if (!existsSync(new URL(p.pdf, base))) errors.push(`research/${id}: ${p.pdf} missing`);
}

for (const w of warnings) console.warn(`validate-cv: warning: ${w}`);
if (errors.length) { for (const e of errors) console.error(`validate-cv: error: ${e}`); process.exit(1); }
console.log(`validate-cv: ok (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`);
