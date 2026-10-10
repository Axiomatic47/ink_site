// app/mn-ag-candidates-open-letter/page.tsx — the open letter to the candidates for Minnesota Attorney General, its
// Enclosure A and the transcript of the MPR News debate of October 2, 2026, in the review-mode style: the letter
// beside the transcript, every debate time a link to the recording at that second (owner 2026-10-09; the letter
// prints this URL and mails October 10, 2026). The content is content/correspondence/<slug>.json, written by
// scripts/import-open-letter.mjs from the owner's case tree; the body is OpenLetterBody.tsx. No content → 404,
// never a placeholder. Not in the site's navigation until the owner's word.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ogImages } from '@/lib/og.server';
import { loadOpenLetter } from '@/lib/open-letter.server';
import { OPEN_LETTER_PATH, OPEN_LETTER_SLUG, toView } from '@/lib/open-letter';
import { OpenLetterBody } from './OpenLetterBody';

export function generateMetadata(): Metadata {
  const c = loadOpenLetter();
  if (!c) return { title: 'Open letter', robots: { index: false, follow: false } };
  const title = c.letter.title;
  const description = `An open letter of ${c.letter.date_line ?? 'October 2026'} to the candidates for Minnesota Attorney General, with its enclosure and the transcript of the ${c.recording.programme} debate of October 2, 2026 — every debate time opens the recording at that moment.`;
  const og = ogImages(OPEN_LETTER_SLUG, `${title} — ${c.letter.date_line ?? ''}`.trim());
  return {
    title,
    description,
    alternates: { canonical: OPEN_LETTER_PATH },
    openGraph: { title, description, type: 'article', url: OPEN_LETTER_PATH, ...og.openGraph },
    twitter: og.twitter,
  };
}

export default function OpenLetterPage() {
  const c = loadOpenLetter();
  if (!c) notFound();
  return <OpenLetterBody c={toView(c)} />;
}
