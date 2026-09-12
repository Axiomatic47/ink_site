// Shared prose primitives for the legal pages (Terms, Privacy, Legal Notices).
import Link from 'next/link';
import { cv } from '@/lib/cv';

export const LEGAL_UPDATED = 'September 9, 2026';
export const SITE_HOST = 'kirchner.ink';

export function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="max-w-3xl">
      <p className="text-muted text-lg mb-1">{eyebrow}</p>
      <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>{title}</h1>
      <p className="text-sm text-muted mt-3 mb-8">Last updated {LEGAL_UPDATED}</p>
      <div className="space-y-4 font-serif text-lg leading-relaxed text-ink/90">{children}</div>
      <p className="mt-10 pt-6 border-t border-rule text-sm text-muted">
        Questions about these pages: <a href={`mailto:${cv.email}`} className="underline">{cv.email}</a>. See also{' '}
        <Link href="/terms" className="underline">Terms</Link>, <Link href="/privacy" className="underline">Privacy</Link>, and{' '}
        <Link href="/legal" className="underline">Legal Notices</Link>.
      </p>
    </article>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-sans text-xs uppercase tracking-[0.14em] text-muted pt-6" style={{ fontWeight: 600 }}>{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-2">{children}</ul>;
}
