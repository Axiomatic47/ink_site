// TimelineLink — the two places the immunity timeline is offered from the book it rests on (owner 2026-10-07, through the
// admin: "a section below the Subject's Unanswered Plea PDF pane in the home page and also a link below the review/reading
// mode pdf page to the timeline … the same in kirchner.ink as appropriate"). Here the book's PDF sits on its own pages, not
// the home page, so: a card on the home shelf beneath the archive cards, and a line beneath the review panes on the book's
// own pages. Both render only while the timeline's content exists and names this book; every word is the data's.
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { KIND_LABEL, TIMELINE_PAGE_PATH, yearLabel } from '@/lib/immunity-timeline';
import { loadImmunityTimeline } from '@/lib/immunity-timeline.server';

/** n entries chosen evenly across the record, first and last included */
function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
  return out;
}

function timeline() {
  const t = loadImmunityTimeline();
  if (!t || t.entries.length === 0) return null;
  const first = t.entries[0], last = t.entries[t.entries.length - 1];
  return { t, span: `${yearLabel(first)} to ${yearLabel(last)}` };
}

/** the home shelf's card: beneath the archive cards, the timeline drawn from the book */
export function TimelineShelfCard() {
  const x = timeline();
  if (!x) return null;
  const { t, span } = x;
  return (
    <Link href={TIMELINE_PAGE_PATH} className="group mt-4 flex flex-col gap-3 rounded-lg border border-rule bg-card shadow-card p-5 no-underline hover:border-accent transition-colors sm:flex-row sm:items-start sm:gap-4">
      <History className="h-5 w-5 text-accent mt-1 shrink-0" aria-hidden />
      <div className="min-w-0 flex-grow">
        <p className="text-xs uppercase tracking-[0.14em] text-muted" style={{ fontWeight: 600 }}>Research · a timeline</p>
        <h2 className="font-serif text-lg leading-snug text-ink group-hover:text-accent-ink mt-1" style={{ fontWeight: 580 }}>{t.title}</h2>
        <p className="text-sm leading-relaxed text-ink/85 mt-2">
          The history of immunity in {t.entries.length} entries, {span}, every one resting on <em>{t.provenance.book_title}</em> or on a copy
          of its source; each citation opens the book at the passage that cites it.
        </p>
        {/* six entries chosen evenly across the record (the same spread lawsofexistence.com's home card shows), each to its anchor */}
        <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm leading-snug list-none p-0 m-0">
          {spread(t.entries, 6).map((e) => (
            <li key={e.id} className="min-w-0 truncate text-ink/80">
              <span className="tabular-nums text-muted">{yearLabel(e)}</span>
              {e.kind ? <span className="text-muted"> · {KIND_LABEL[e.kind]}</span> : null}
              {' · '}
              <Link href={`${TIMELINE_PAGE_PATH}#${e.id}`} className="no-underline hover:underline text-ink/90">{e.title}</Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-accent-ink inline-flex items-center shrink-0 sm:mt-7" style={{ fontWeight: 500 }}>
        Read the timeline <ArrowRight className="ml-1.5 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden />
      </p>
    </Link>
  );
}

/** the line beneath the review panes on the book's own pages; null for any other work */
export function TimelineBelowReview({ slug }: { slug: string }) {
  const x = timeline();
  if (!x || x.t.provenance.book_slug !== slug) return null;
  const { t, span } = x;
  return (
    <p className="text-muted">
      <History className="inline h-3.5 w-3.5 text-accent mr-1.5 -mt-0.5" aria-hidden />
      <Link href={TIMELINE_PAGE_PATH} className="underline text-accent-ink hover:text-ink">{t.title}</Link>: the history of immunity in {t.entries.length} entries, {span}, drawn from this book — each citation opens the passage here that cites it.
    </p>
  );
}
