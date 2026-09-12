// One open reading: the disputed detail enlarged, our reading beside the
// comparison edition, the question, published answers, and the answer form.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cv } from '@/lib/cv';
import { SiteShell } from '../../../../_components/SiteShell';
import { findReading, listReadingCollections, loadReadingsCollection } from '@/lib/open-readings.server';
import { Eyebrow, LegibilityBadge, LicenceLine, StatusBadge, itemHref } from '../../../_readings/ui';
import { ReadingText, renderBidi } from '../../../_readings/bidi';
import { ReadingAnswerForm } from '../../../_readings/ReadingAnswerForm';

export const dynamicParams = false;
export function generateStaticParams() {
  const out: { archiveId: string; id: string }[] = [];
  for (const archiveId of listReadingCollections()) for (const item of loadReadingsCollection(archiveId)?.items ?? []) out.push({ archiveId, id: item.id });
  return out;
}
type Params = { params: Promise<{ archiveId: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { archiveId, id } = await params;
  const found = findReading(archiveId, id);
  if (!found) return {};
  return { title: `${found.item.shelfmark}, ${found.item.leaf}, line ${found.item.line} — open reading`, description: found.item.question, alternates: { canonical: itemHref(archiveId, id) } };
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`bg-card border border-rule rounded-lg shadow-card ${className}`}>{children}</div>;

export default async function ReadingItemPage({ params }: Params) {
  const { archiveId, id } = await params;
  const found = findReading(archiveId, id);
  if (!found) notFound();
  const { collection, item, index } = found;
  const prev = index > 0 ? collection.items[index - 1] : null;
  const next = index < collection.items.length - 1 ? collection.items[index + 1] : null;
  const holderLabel = item.source.kind === 'archive' ? 'View on the leaf' : `View at ${item.source.holder ?? 'the holder'}`;
  const holderHref = item.source.kind === 'archive' ? `/research/${item.source.archiveId}/leaf/${item.source.leafId}` : item.source.href;

  return (
    <SiteShell>
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <Link href={`/research/${collection.id}/readings`} className="hover:text-ink no-underline">← {collection.title}</Link>
          <span>{index + 1} of {collection.items.length}</span>
        </div>
        <div className="mt-6">
          <Eyebrow>{item.shelfmark} · {item.leaf} · line {item.line} · {item.language === 'he' ? 'Hebrew' : item.language}</Eyebrow>
          <h1 className="font-serif tracking-tight leading-[1.18]" style={{ fontSize: 'clamp(24px, 3.4vw, 36px)', fontWeight: 620 }}>{renderBidi(item.question)}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5"><LegibilityBadge legibility={item.legibility} /><StatusBadge status={item.status} /></div>
        </div>

        <figure className="mt-8 m-0 rounded-lg overflow-hidden border border-rule shadow-card bg-ink">
          <div className="p-5 sm:p-8 flex items-center justify-center">
            {item.crop ? (
              // eslint-disable-next-line @next/next/no-img-element -- static export
              <img src={item.crop} alt={`${item.shelfmark}, ${item.leaf}, line ${item.line}: the disputed detail enlarged ${item.zoom}×`} className="w-full h-auto rounded-sm" />
            ) : (
              <p className="text-sm text-on-ink/70 m-0 text-center py-10">This holder does not permit the image to be reproduced here. Open the folio at the holder to see the disputed detail.</p>
            )}
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-white/10 text-xs text-on-ink/70">
            <span>Detail enlarged {item.zoom}× from the {item.image.url.includes('!2000,2000') ? '2000-pixel ' : ''}image · region {item.region.w}×{item.region.h} px</span>
            {holderHref && <a href={holderHref} className="text-on-ink underline" rel="noopener">{holderLabel} →</a>}
          </figcaption>
        </figure>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="p-6 grid gap-3"><Eyebrow>Our reading</Eyebrow><ReadingText text={item.transcription.text} />{item.transcription.ref && <p className="text-xs text-muted m-0">{item.transcription.ref}</p>}</Card>
          <Card className="p-6 grid gap-3"><Eyebrow>Comparison</Eyebrow><ReadingText text={item.comparison.text} /><p className="text-xs text-muted m-0">{item.comparison.edition}{item.comparison.page ? `, p. ${item.comparison.page}` : ''}</p></Card>
        </div>

        {item.context && <p className="mt-6 font-serif text-lg leading-relaxed text-ink/90">{renderBidi(item.context)}</p>}

        {item.resolution && (
          <div className="mt-6 bg-well border border-rule border-l-4 border-l-accent rounded-md px-5 py-4 text-sm leading-relaxed">
            <strong>Resolved {item.resolution.date}.</strong> {item.resolution.decision}{item.resolution.rests_on?.length ? <> Rests on the readings of {item.resolution.rests_on.join(', ')}.</> : null}
          </div>
        )}

        {item.answers.length > 0 && (
          <section className="mt-10">
            <Eyebrow>Published answers · {item.answers.length}</Eyebrow>
            <ol className="grid gap-3 list-none p-0 m-0">
              {item.answers.map((a, i) => (
                <li key={a.id ?? i} className="bg-card border border-rule rounded-lg shadow-card p-5 grid gap-2">
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-serif text-accent-ink text-xl" style={{ fontWeight: 600 }}>{a.letter}</span>
                    <span style={{ fontWeight: 500 }}>{a.reader.display}</span>
                    {a.reader.credentials_summary && <span className="text-muted">· {a.reader.credentials_summary}</span>}
                    <span className="text-muted ml-auto">{a.published}</span>
                  </div>
                  {a.reading && <ReadingText text={a.reading} size="md" />}
                  {a.note && <p className="font-serif text-ink/90 m-0 leading-relaxed">{renderBidi(a.note)}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section id="answer" className="mt-10 bg-card border border-rule rounded-lg shadow-card p-6 sm:p-8">
          <Eyebrow>Answer this reading</Eyebrow>
          <p className="font-serif text-lg leading-relaxed text-ink/90 mt-1 mb-6">
            If you read this hand, say which reading the detail supports. Give your credentials so the author can weigh the answer and, if you agree, acknowledge you. Nothing is published until the author has read it.
          </p>
          <ReadingAnswerForm collection={collection.id} itemId={item.id} ourReading={item.transcription.text} comparisonReading={item.comparison.text} language={item.language} resolved={!!item.resolution} contactEmail={cv.email} />
        </section>

        <div className="mt-10 pt-6 border-t border-rule grid gap-4">
          <LicenceLine item={item} />
          <div className="flex justify-between gap-4 text-sm">
            {prev ? <Link href={itemHref(collection.id, prev.id)} className="text-accent-ink no-underline hover:underline">← Previous reading</Link> : <span />}
            {next ? <Link href={itemHref(collection.id, next.id)} className="text-accent-ink no-underline hover:underline">Next reading →</Link> : <span />}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
