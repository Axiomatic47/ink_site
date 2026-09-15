import type { Metadata } from 'next';
import { Mail, Link as LinkIcon, MapPin } from 'lucide-react';
import { cv } from '@/lib/cv';
import { SiteShell } from '../_components/SiteShell';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: `How to reach ${cv.name}.`,
  alternates: { canonical: '/contact' },
};

export default function Contact() {
  return (
    <SiteShell>
      <div className="max-w-2xl">
        <p className="text-muted text-lg mb-1">Contact</p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-tight mb-6" style={{ fontWeight: 620 }}>Get in touch</h1>
        <p className="font-serif text-lg leading-relaxed text-ink/90 mb-8">
          For publishing, grant and funding enquiries, collaboration, or questions about the work, write to me here or by e-mail.
          A full CV with references is available on request.
        </p>
        <ContactForm />
        <ul className="space-y-4 text-base mt-10">
          <li className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-accent" aria-hidden />
            <a href={`mailto:${cv.email}`} className="inline-flex items-center min-h-11 lg:min-h-0 underline">{cv.email}</a>
          </li>
          {cv.location && (
            <li className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-accent" aria-hidden />
              <span>{cv.location}</span>
            </li>
          )}
          {cv.links.map((l) => (
            <li key={l.url} className="flex items-center gap-3">
              <LinkIcon className="h-5 w-5 text-accent" aria-hidden />
              <a href={l.url} rel="me noopener" className="inline-flex items-center min-h-11 lg:min-h-0 underline">{l.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
