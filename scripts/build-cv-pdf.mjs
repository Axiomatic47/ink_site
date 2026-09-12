#!/usr/bin/env node
// build-cv-pdf.mjs — render content/cv.json to the site's two CV PDFs.
//
//   cv.pdf        STYLED   — the Word resume's design: a full-bleed navy band
//                            header, brass dates and bullets, navy section caps
//   cv.pdf_print  PRINT    — the same page with no shading anywhere (owner
//                            2026-09-11: "a printer friendly one, without the
//                            navy background, available for download")
//
// Both come from the same cv.json at every `npm run build`, so the viewer, the
// downloads and the page can never drift — and neither can carry anything
// cv.json does not (no phone, no references, no memberships: owner rules).
// Design values mirror the Studio's resume converter
// (midesk tools/ourstudio_tools/converters/resume.py); fonts are PDF standard
// Times/Helvetica because the build host has no Georgia/Calibri.
import { readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import PDFDocument from 'pdfkit';

const cv = JSON.parse(readFileSync(new URL('../content/cv.json', import.meta.url), 'utf8'));
const outDir = new URL('../public/cv/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const IN = 72;
const NAVY = '#1b2540', PAPER = '#f4f1ea', BRASS = '#b08d57', BRASS_INK = '#8a6b3a', MUTED = '#5f6673', RULE = '#d8d2c4', INK = '#1b2540';
const MARGIN = { top: 0.6 * IN, bottom: 0.7 * IN, left: 0.75 * IN, right: 0.75 * IN };

const range = (e) => (!e.end ? `${e.start} – present` : e.end === e.start ? e.start : `${e.start} – ${e.end}`);
const contactParts = () => [cv.location, cv.email, ...cv.links.map((l) => l.url.replace(/^https?:\/\//, ''))].filter(Boolean);

function render(variant, outPath) {
  const doc = new PDFDocument({ size: 'LETTER', margins: MARGIN, autoFirstPage: true, info: { Title: `${cv.name} — CV`, Author: cv.name, Subject: cv.headline || '' } });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);
  const PW = doc.page.width, PH = doc.page.height;
  const L = MARGIN.left, W = PW - MARGIN.left - MARGIN.right, BOTTOM = PH - MARGIN.bottom;

  // footer from page two: "Name · Page N"
  let page = 1;
  doc.on('pageAdded', () => {
    page += 1;
    // The footer sits inside the bottom margin. pdfkit opens a new page for any
    // text that ends below the margin — which would fire this handler again and
    // recurse without end — so the margin is lifted for the one line and restored.
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`${cv.name} · Page ${page}`, L, PH - MARGIN.bottom + 22, { width: W, align: 'center', lineBreak: false });
    doc.page.margins.bottom = saved;
    doc.y = MARGIN.top;
  });

  // ---------------------------------------------------------------- header
  const name = cv.name.toUpperCase();
  const headline = (cv.headline || '').toUpperCase();
  const parts = contactParts();
  const styled = variant === 'styled';
  const padTop = styled ? 0.36 * IN : 0.55 * IN, padBottom = 0.30 * IN;
  const nameH = 30, headH = headline ? 16 : 0, contactH = parts.length ? 15 : 0;
  const bandH = padTop + nameH + headH + contactH + padBottom;
  if (styled) doc.rect(0, 0, PW, bandH).fill(NAVY);

  let y = padTop;
  doc.font('Times-Bold').fontSize(26).fillColor(styled ? PAPER : NAVY).text(name, L, y, { width: W, align: 'center', characterSpacing: 3, lineBreak: false });
  y += nameH;
  if (headline) {
    doc.font('Helvetica').fontSize(9.5).fillColor(styled ? BRASS : BRASS_INK).text(headline, L, y + 2, { width: W, align: 'center', characterSpacing: 0.9, lineBreak: false });
    y += headH;
  }
  if (parts.length) {
    // centred line with brass dot separators: measure, then draw segment by segment
    doc.font('Helvetica').fontSize(10);
    const sep = '   ·   ';
    const total = parts.reduce((n, p) => n + doc.widthOfString(p), 0) + doc.widthOfString(sep) * (parts.length - 1);
    let x = (PW - total) / 2;
    parts.forEach((p, i) => {
      doc.fillColor(styled ? PAPER : INK).text(p, x, y + 3, { lineBreak: false });
      x += doc.widthOfString(p);
      if (i < parts.length - 1) { doc.fillColor(styled ? BRASS : BRASS_INK).text(sep, x, y + 3, { lineBreak: false }); x += doc.widthOfString(sep); }
    });
    y += contactH;
  }
  if (!styled) { doc.moveTo(L, y + padBottom - 8).lineTo(L + W, y + padBottom - 8).lineWidth(1.5).strokeColor(BRASS_INK).stroke(); }
  doc.y = bandH + 12;

  // ---------------------------------------------------------------- body
  const need = (h) => { if (doc.y + h > BOTTOM) doc.addPage(); };
  const section = (title) => {
    need(60);
    doc.y += 14;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(title.toUpperCase(), L, doc.y, { width: W, characterSpacing: 2 });
    const ry = doc.y + 2;
    doc.moveTo(L, ry).lineTo(L + W, ry).lineWidth(1).strokeColor(BRASS_INK).stroke();
    doc.y = ry + 7;
  };
  const bullets = (items, x, w) => {
    for (const h of items) {
      const by = doc.y;
      doc.font('Times-Roman').fontSize(10.5).fillColor(BRASS_INK).text('•', x + 6, by, { lineBreak: false });
      doc.fillColor(INK).text(h, x + 0.24 * IN, by, { width: w - 0.24 * IN, lineGap: 1 });
      doc.y += 1.5;
    }
  };
  // entry heading: role (bold navy) with the dates right-aligned in brass small
  // caps — on the org line when they fit beside it, otherwise on the role line so
  // a long organisation name never runs into them.
  const dateWidth = (s) => { doc.font('Helvetica').fontSize(9.5); return doc.widthOfString(s.toUpperCase(), { characterSpacing: 0.5 }) + 14; };
  const dates = (s, y) => doc.font('Helvetica').fontSize(9.5).fillColor(BRASS_INK).text(s.toUpperCase(), L, y, { width: W, align: 'right', characterSpacing: 0.5, lineBreak: false });
  const heading = (title, left, muted, right, titleSize = 12) => {
    doc.font('Helvetica').fontSize(10);
    const orgW = doc.widthOfString(left || '') + (muted ? doc.widthOfString(` · ${muted}`) : 0);
    const dW = right ? dateWidth(right) : 0;
    const datesOnOrg = Boolean(right) && orgW + dW <= W;
    const ty = doc.y;
    doc.font('Times-Bold').fontSize(titleSize).fillColor(NAVY).text(title, L, ty, { width: datesOnOrg || !right ? W : W - dW });
    if (right && !datesOnOrg) dates(right, ty + (titleSize - 9.5));
    if (left || muted) {
      const ly = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(left, L, ly, { width: datesOnOrg ? W - dW : W, continued: Boolean(muted), lineBreak: false });
      if (muted) doc.fillColor(MUTED).text(` · ${muted}`, { lineBreak: false });
      if (datesOnOrg) dates(right, ly + 0.5);
      doc.y = ly + 14;
    } else if (right && datesOnOrg) { const ly = doc.y; dates(right, ly + 0.5); doc.y = ly + 14; }
  };

  if (cv.summary) {
    section('Summary');
    doc.font('Times-Roman').fontSize(10.5).fillColor(INK).text(cv.summary, L, doc.y, { width: W, lineGap: 2.2 });
  }

  if (cv.experience?.length) {
    section('Experience');
    cv.experience.forEach((e, i) => {
      need(110);
      if (i) doc.y += 9;
      heading(e.role, e.organization, e.location, range(e));
      if (e.summary) { doc.font('Times-Italic').fontSize(10.5).fillColor(MUTED).text(e.summary, L, doc.y, { width: W, lineGap: 1 }); doc.y += 2; }
      if (e.highlights?.length) bullets(e.highlights, L, W);
    });
  }

  if (cv.education?.length) {
    section('Education');
    cv.education.forEach((e, i) => {
      need(70);
      if (i) doc.y += 7;
      heading(e.degree || e.institution, e.degree ? e.institution : '', e.location, e.year);
      if (e.detail) doc.font('Times-Italic').fontSize(10.5).fillColor(MUTED).text(e.detail, L, doc.y, { width: W, lineGap: 1 });
    });
  }

  if (cv.works?.length) {
    section('Selected Work');
    cv.works.forEach((w0, i) => {
      need(50);
      if (i) doc.y += 6;
      heading(w0.title, w0.venue || '', '', w0.year, 11);
    });
  }

  if (cv.skills?.length) {
    section('Skills');
    for (const g of cv.skills) {
      need(30);
      const sy = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(g.group.toUpperCase(), L, sy + 1, { width: 1.6 * IN - 8, characterSpacing: 0.6 });
      const labelBottom = doc.y;
      doc.font('Times-Roman').fontSize(10.5).fillColor(INK).text(g.items.join(' · '), L + 1.6 * IN, sy, { width: W - 1.6 * IN, lineGap: 1 });
      doc.y = Math.max(doc.y, labelBottom) + 4;
    }
  }

  doc.end();
  return new Promise((resolve) => stream.on('finish', () => resolve(page)));
}

// Only GENERATED targets (/cv/…) are rendered here; a key under /resume/ names an
// owner-exported Word PDF that is tracked in public/resume/ and screened by check:pdf.
const jobs = [['styled', cv.pdf], ['print', cv.pdf_print]].filter(([, p]) => p && p.startsWith('/cv/'));
if (!jobs.length) console.log('build-cv-pdf: no generated targets (both PDFs are owner-rendered under /resume/)');
for (const [variant, rel] of jobs) {
  const outPath = new URL(rel.replace(/^\/cv\//, ''), outDir);
  const pages = await render(variant, outPath);
  console.log(`build-cv-pdf: ${variant.padEnd(6)} → ${rel} (${pages} page${pages === 1 ? '' : 's'})`);
}
