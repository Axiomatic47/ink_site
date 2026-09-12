import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/cv';
import { works } from '@/lib/works';
import {ARCHIVE_IDS } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { loadAllReadings } from '@/lib/open-readings.server';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_ORIGIN}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_ORIGIN}/work`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    ...works.map((w) => ({ url: `${SITE_ORIGIN}/work/${w.slug}`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.6 })),
    { url: `${SITE_ORIGIN}/research`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    ...ARCHIVE_IDS.flatMap((id) => [
      { url: `${SITE_ORIGIN}/research/${id}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
      ...(readArchiveManifest(id)?.leaves ?? []).map((l) => ({ url: `${SITE_ORIGIN}/research/${id}/leaf/${l.id}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ]),
    { url: `${SITE_ORIGIN}/research/open-readings`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_ORIGIN}/research/acknowledgements`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    ...loadAllReadings().flatMap((c) => [
      { url: `${SITE_ORIGIN}/research/${c.id}/readings`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6 },
      ...c.items.map((it) => ({ url: `${SITE_ORIGIN}/research/${c.id}/readings/${it.id}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ]),
    { url: `${SITE_ORIGIN}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    ...['legal', 'terms', 'privacy'].map((p) => ({ url: `${SITE_ORIGIN}/${p}`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
}
