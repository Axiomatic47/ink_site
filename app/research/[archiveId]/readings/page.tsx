// One collection's open readings. The segment is named archiveId by the parent
// route; here it is a readings collection id (content/readings/<id>.json).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteShell } from '../../../_components/SiteShell';
import { listReadingCollections, loadReadingsCollection } from '@/lib/open-readings.server';
import { Eyebrow, ReadingCard } from '../../_readings/ui';

export const dynamicParams = false;
export function generateStaticParams() { return listReadingCollections().map((archiveId) => ({ archiveId })); }
type Params = { params: Promise<{ archiveId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = loadReadingsCollection((await params).archiveId);
  if (!c) return {};
  return { title: `${c.title} — open readings`, description: c.description ?? `${c.items.length} disputed readings set out for qualified readers to answer.`, alternates: { canonical: `/research/${c.id}/readings` } };
}

export default async function ReadingsCollectionPage({ params }: Params) {
  const c = loadReadingsCollection((await params).archiveId);
  if (!c) notFound();
  return (
    <SiteShell>
      <Link href="/research/open-readings" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">← All open readings</Link>
      <div className="max-w-5xl">
        <Eyebrow>{c.holder ?? 'Collection'} · {c.items.length} reading{c.items.length === 1 ? '' : 's'}</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>{c.title}</h1>
        {c.description && <p className="font-serif text-lg leading-relaxed text-ink/90 mt-5 max-w-3xl">{c.description}</p>}
        {c.licence && (
          <p className="text-xs text-muted mt-3">Details reproduced from {c.licence.attribution} under {c.licence.href ? <a href={c.licence.href} className="underline" rel="license noopener">{c.licence.name}</a> : c.licence.name}.</p>
        )}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{c.items.map((item) => <ReadingCard key={item.id} collection={c} item={item} />)}</div>
      </div>
    </SiteShell>
  );
}
