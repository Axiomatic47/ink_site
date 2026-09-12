import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '../../_components/SiteShell';
import { loadAllReadings } from '@/lib/open-readings.server';
import { Eyebrow, ReadingCard, StatusBadge } from '../_readings/ui';

export const metadata: Metadata = {
  title: 'Open Readings',
  description: 'Disputed manuscript readings set out for qualified readers: the detail enlarged, our transcription beside the comparison edition, one question, and an answer form.',
  alternates: { canonical: '/research/open-readings' },
};

export default function OpenReadingsIndex() {
  const collections = loadAllReadings();
  const items = collections.flatMap((c) => c.items.map((item) => ({ c, item })));
  const count = (s: 'open' | 'answered' | 'resolved') => items.filter((x) => x.item.status === s).length;
  return (
    <SiteShell>
      <Link href="/research" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">← Research</Link>
      <div className="max-w-5xl">
        <Eyebrow>Primary-source research · readings for review</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>Open Readings</h1>
        <p className="font-serif text-lg leading-relaxed text-ink/90 mt-5 max-w-3xl">
          Places where a manuscript&rsquo;s letters are in dispute: where our transcription differs from a published edition, or where the
          image leaves a letter open. Each item shows the disputed detail enlarged, our reading beside the comparison, and one question.
          Readers with the palaeography to judge are invited to answer, with their credentials, published on the page or sent to the author alone.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{items.length} reading{items.length === 1 ? '' : 's'} in {collections.length} collection{collections.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5"><StatusBadge status="open" /> {count('open')}</span>
          <span className="flex items-center gap-1.5"><StatusBadge status="answered" /> {count('answered')}</span>
          <span className="flex items-center gap-1.5"><StatusBadge status="resolved" /> {count('resolved')}</span>
          <Link href="/research/acknowledgements" className="underline hover:text-ink">Acknowledgements</Link>
        </div>
        {collections.map((c) => (
          <section key={c.id} className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
              <div>
                <Eyebrow>{c.holder ?? 'Collection'}</Eyebrow>
                <h2 className="font-serif text-2xl leading-tight" style={{ fontWeight: 560 }}><Link href={`/research/${c.id}/readings`} className="no-underline hover:text-accent-ink">{c.title}</Link></h2>
              </div>
              <span className="text-sm text-muted">{c.items.length} reading{c.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{c.items.map((item) => <ReadingCard key={item.id} collection={c} item={item} />)}</div>
          </section>
        ))}
      </div>
    </SiteShell>
  );
}
