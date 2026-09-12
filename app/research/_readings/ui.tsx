// Shared server-rendered pieces for the Open Readings pages.
import React from 'react';
import Link from 'next/link';
import type { ReadingWithState, ReadingsCollection, Legibility, ReadingStatus } from '@/lib/open-readings';
import { itemHref } from '@/lib/open-readings';
import { renderBidi } from './bidi';

export { itemHref };

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>{children}</div>
);

const LEGIBILITY_LABEL: Record<Legibility, string> = { readable: 'readable', uncertain: 'uncertain', 'illegible-at-this-resolution': 'illegible at this resolution' };
const STATUS_CLASS: Record<ReadingStatus, string> = {
  open: 'bg-well text-ink/80 border-rule',
  answered: 'bg-accent/15 text-accent-ink border-accent/40',
  resolved: 'bg-ink text-on-ink border-ink',
};

export const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] ${className}`} style={{ fontWeight: 600 }}>{children}</span>
);
export const StatusBadge = ({ status }: { status: ReadingStatus }) => <Badge className={STATUS_CLASS[status]}>{status}</Badge>;
export const LegibilityBadge = ({ legibility }: { legibility: Legibility }) => <Badge className="bg-card text-muted border-rule">{LEGIBILITY_LABEL[legibility]}</Badge>;

export const LicenceLine = ({ item }: { item: ReadingWithState }) => (
  <p className="text-xs text-muted leading-relaxed m-0">
    {item.crop ? 'Detail reproduced from ' : 'Image held by '}
    {item.source.href ? <a href={item.source.href} className="underline" rel="noopener">{item.licence.attribution}</a> : item.licence.attribution}
    {item.licence.href ? <> · <a href={item.licence.href} className="underline" rel="license noopener">{item.licence.name}</a></> : <> · {item.licence.name}</>}
    {!item.crop && ' · all rights reserved — no detail is reproduced here; view the folio at the holder.'}
  </p>
);

export const ReadingCard = ({ collection, item }: { collection: ReadingsCollection; item: ReadingWithState }) => (
  <Link href={itemHref(collection.id, item.id)} className="group block bg-card border border-rule rounded-lg shadow-card hover:border-accent transition-colors overflow-hidden no-underline">
    <div className="bg-ink h-28 flex items-center justify-center overflow-hidden">
      {item.crop ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export
        <img src={item.crop.replace(/\.jpg$/, '.thumb.jpg')} alt={`${item.shelfmark}, ${item.leaf}, line ${item.line}: detail of the disputed reading`} className="max-h-full w-auto max-w-full object-contain" loading="lazy" />
      ) : (
        <span className="text-xs uppercase tracking-[0.08em] text-on-ink/60">link only — view at the holder</span>
      )}
    </div>
    <div className="p-4 grid gap-2">
      <div className="text-xs text-muted">{item.shelfmark} · {item.leaf} · line {item.line}</div>
      <p className="font-serif text-ink m-0 leading-snug text-[1.0625rem]">{renderBidi(item.question)}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <LegibilityBadge legibility={item.legibility} />
        <StatusBadge status={item.status} />
        {item.answers.length > 0 && <Badge className="bg-card text-muted border-rule">{item.answers.length} answer{item.answers.length === 1 ? '' : 's'}</Badge>}
      </div>
    </div>
  </Link>
);
