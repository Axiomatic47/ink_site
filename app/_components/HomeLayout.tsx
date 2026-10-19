'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cv } from '@/lib/cv';
import { InfoCard } from './InfoCard';
import { PdfViewer } from './PdfViewer';

/** the document the home page shows: the open letter to the candidates for Minnesota Attorney General as mailed
 *  (owner 2026-10-11; the résumé moved under the biography), with the way into its review mode beneath */
export interface HomeDocument { src: string; title: string; dateLine: string | null; downloadName: string; bytes?: number; reviewHref: string }

/** Home page body: the information card beside the document viewer. The viewer's
 *  corner grip asks for a width; while it fits its column the card stays
 *  beside it, and once it asks for more the row is handed to the viewer and
 *  the card drops below (owner 2026-09-14: enlarge in place, within the
 *  page). Double-clicking the grip restores the default. */
export function HomeLayout({ doc }: { doc: HomeDocument | null }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [colWidth, setColWidth] = useState(0);
  const [siteWidth, setSiteWidth] = useState(0);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const total = el.clientWidth;
      setSiteWidth(total);
      // the default right column: total minus the 19rem/21rem card and the 2rem gap
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const card = total >= 1280 * (rem / 16) ? 21 * rem : 19 * rem;
      setColWidth(Math.max(0, total - card - 2 * rem));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamped = width == null ? null : Math.min(width, siteWidth || width);
  const expanded = clamped != null && colWidth > 0 && clamped > colWidth + 8;

  return (
    <div ref={gridRef} className={expanded ? 'flex flex-col gap-8 items-start' : 'grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start'}>
      <section className={expanded ? 'w-full min-w-0 order-1' : 'min-w-0 lg:order-2'}>
        <h1 className="sr-only">{cv.name}</h1>
        {doc ? (
          <>
            <PdfViewer src={doc.src} title={doc.dateLine ? `${doc.title} — ${doc.dateLine}` : doc.title} bytes={doc.bytes} downloadName={doc.downloadName} resizable scaleWidth={clamped} onScale={setWidth} toolbar="bottom" />
            <p className="mt-4 text-sm text-muted leading-relaxed">
              <span className="text-ink/90" style={{ fontWeight: 600 }}>{doc.title}</span>{doc.dateLine ? `, ${doc.dateLine}` : ''}.{' '}
              <Link href={doc.reviewHref} className="text-accent-ink underline underline-offset-4 hover:text-ink">Open it in review mode</Link>
              {' '}— the letter beside the debate it cites, every time in the text a link that plays the recording from that moment.
            </p>
          </>
        ) : null}
      </section>
      <div className={expanded ? 'order-2 w-full max-w-[21rem]' : 'lg:order-1'}>
        <InfoCard link={{ href: '/bio', label: 'Read the biography' }} />
      </div>
    </div>
  );
}
