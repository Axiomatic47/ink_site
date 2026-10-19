import type { Metadata } from 'next';
import { SiteShell } from './_components/SiteShell';
import { HomeLayout, type HomeDocument } from './_components/HomeLayout';
import { ArchivesShelf } from './_components/ArchivesShelf';
import { loadOpenLetter } from '@/lib/open-letter.server';
import { OPEN_LETTER_PATH, servedPdf } from '@/lib/open-letter';

export const metadata: Metadata = { alternates: { canonical: '/' } };

/** the home page's document (owner 2026-10-11): the open letter to the candidates for Minnesota Attorney General as
    mailed — the served PDF the letter page shows, at the same version query — with the link into its review mode.
    Absent content → no viewer, never a placeholder and never the résumé (that is under the biography now). */
function homeDocument(): HomeDocument | null {
  const c = loadOpenLetter();
  if (!c?.letter.pdf) return null;
  return {
    src: servedPdf(c.letter.pdf),
    title: c.letter.title,
    dateLine: c.letter.date_line,
    downloadName: 'open-letter-mn-ag-candidates.pdf',
    bytes: c.letter.pdf.bytes,
    reviewHref: `${OPEN_LETTER_PATH}#review`,
  };
}

export default function About() {
  return (
    <SiteShell>
      <HomeLayout doc={homeDocument()} />
      <ArchivesShelf />
    </SiteShell>
  );
}
