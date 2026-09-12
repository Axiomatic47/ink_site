#!/usr/bin/env node
// scripts/check-pdf-private.mjs — the no-private-contact rule, applied to the PDF
// the site actually serves (owner 2026-09-10: nothing beyond cv.email is published;
// references never). The CV PDF may be generated (public/cv/, build-cv-pdf.mjs) or
// owner-rendered from Word (public/resume/, tracked). Either way its TEXT is read
// here and the build fails on a phone-shaped string, a references section, a
// personal-mail domain, or a street-shaped address. Measured need: the owner's
// first Word export (2026-09-11) carried the phone in the header.
import { readFileSync, existsSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = new URL('../', import.meta.url);
const cv = JSON.parse(readFileSync(new URL('content/cv.json', ROOT), 'utf8'));
const targets = [cv.pdf, cv.pdf_print].filter(Boolean);
if (!targets.length) { console.log('check-pdf-private: no PDF referenced — nothing to scan'); process.exit(0); }

async function textOf(rel) {
  const file = new URL(`public${rel}`, ROOT);
  if (!existsSync(file)) { console.error(`check-pdf-private: ${rel} is not under public/`); process.exit(1); }
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), standardFontDataUrl: new URL('node_modules/pdfjs-dist/standard_fonts/', ROOT).pathname }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
  return { text, pages: doc.numPages };
}

const RULES = [
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, 'phone-shaped string'],
  [/\breferences?\b/i, 'a references section or line'],
  [/@(gmail|yahoo|hotmail|icloud|outlook|proton|protonmail)\./i, 'a personal mail address'],
  [/\b\d{2,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd)\b/, 'a street-shaped address'], // no Ct/Court: "36 Supreme Court cases" is a fact, not an address
];
for (const rel of targets) {
  const { text, pages } = await textOf(rel);
  const hits = RULES.filter(([re]) => re.test(text)).map(([, what]) => what);
  if (hits.length) {
    console.error(`check-pdf-private: REFUSED ${rel} (${pages} pages) — contains ${hits.join('; ')}. Nothing beyond cv.email is published (owner 2026-09-10).`);
    process.exit(1);
  }
  console.log(`check-pdf-private: ok — ${rel}, ${pages} page(s), no private contact.`);
}
