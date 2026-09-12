import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from './_components/SiteShell';

export const metadata: Metadata = { title: 'Page Not Found', robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <SiteShell>
      <div className="py-16 text-center">
        <p className="text-xs uppercase tracking-[0.14em] text-muted" style={{ fontWeight: 600 }}>404</p>
        <h1 className="font-serif text-4xl mt-3" style={{ fontWeight: 620 }}>Page Not Found</h1>
        <p className="mt-4 text-muted">There is nothing at this address.</p>
        <Link href="/" className="mt-8 inline-block underline text-accent-ink">Back to the CV</Link>
      </div>
    </SiteShell>
  );
}
