import { Mail, MapPin, Link as LinkIcon } from 'lucide-react';
import { cv } from '@/lib/cv';
import { Portrait } from './Portrait';
import { DownloadCvMenu } from './DownloadCvMenu';

/** The portrait + "General information" card. One component, used by the
 *  home page and the biography page so the two sidebars stay identical
 *  (owner 2026-09-14: "make the biography info field under the headshot
 *  match the homepage"). */
export function InfoCard() {
  return (
    <aside className="lg:sticky lg:top-8 space-y-0 rounded-lg overflow-hidden shadow-card border border-rule">
      <Portrait />
      <div className="bg-ink text-on-ink p-6">
        <h2 className="font-serif text-2xl mb-4" style={{ fontWeight: 560 }}>General information</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="sr-only">Name</dt>
            <span className="w-4 text-accent font-serif">·</span>
            <dd><span className="text-on-ink/60">Name: </span>{cv.name}</dd>
          </div>
          {cv.location && (
            <div className="flex gap-3">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
              <dd><span className="text-on-ink/60">Location: </span>{cv.location}</dd>
            </div>
          )}
          <div className="flex gap-3">
            <Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
            <dd><span className="text-on-ink/60">Email: </span><a href={`mailto:${cv.email}`} className="hover:text-white">{cv.email}</a></dd>
          </div>
          {cv.links.map((l) => (
            <div key={l.url} className="flex gap-3">
              <LinkIcon className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
              <dd><a href={l.url} rel="me noopener" className="hover:text-white">{l.label}</a></dd>
            </div>
          ))}
        </dl>
        {cv.pdf && <DownloadCvMenu styled={cv.pdf} print={cv.pdf_print || undefined} className="mt-6" />}
      </div>
    </aside>
  );
}
