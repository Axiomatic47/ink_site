import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '../../_components/SiteShell';
import { loadAcknowledgements } from '@/lib/open-readings.server';
import { Eyebrow, itemHref } from '../_readings/ui';

export const metadata: Metadata = { title: 'Acknowledgements — Open Readings', description: 'Readers who answered a disputed manuscript reading and consented to be named.', alternates: { canonical: '/research/acknowledgements' } };

export default function AcknowledgementsPage() {
  const readers = loadAcknowledgements();
  return (
    <SiteShell>
      <Link href="/research/open-readings" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">← Open readings</Link>
      <div className="max-w-3xl">
        <Eyebrow>Open readings</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>Acknowledgements</h1>
        <p className="font-serif text-lg leading-relaxed text-ink/90 mt-5">
          The readers named here answered one or more open readings and agreed to be acknowledged. Credentials appear as each reader wrote them.
          Readers who answered anonymously, or asked that their answer reach the author alone, are not listed.
        </p>
        {readers.length === 0 ? (
          <p className="mt-10 text-sm text-muted border border-rule rounded-md bg-well px-5 py-4">No answers have been published yet. The first readers to answer will be acknowledged here.</p>
        ) : (
          <ul className="mt-10 grid gap-4 list-none p-0 m-0">
            {readers.map((r) => (
              <li key={r.display + (r.credentials_summary ?? '')} className="bg-card border border-rule rounded-lg shadow-card p-5 grid gap-1.5">
                <div className="font-serif text-lg" style={{ fontWeight: 580 }}>{r.display}</div>
                {r.credentials_summary && <div className="text-sm text-muted">{r.credentials_summary}</div>}
                <div className="text-sm flex flex-wrap gap-x-3 gap-y-1 pt-1">{r.items.map((it) => <Link key={it.collection + it.id} href={itemHref(it.collection, it.id)} className="text-accent-ink no-underline hover:underline">{it.shelfmark} · {it.id}</Link>)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
