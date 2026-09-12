import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {ARCHIVE_IDS, RESEARCH_ARCHIVES } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { LeafBody } from './LeafBody';
import { loadAllReadings } from '@/lib/open-readings.server';

export const dynamicParams = false;
export function generateStaticParams() {
  const out: Array<{ archiveId: string; leafId: string }> = [];
  for (const archiveId of ARCHIVE_IDS) for (const leaf of readArchiveManifest(archiveId)?.leaves ?? []) out.push({ archiveId, leafId: leaf.id });
  return out;
}
type Params = { params: Promise<{ archiveId: string; leafId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { archiveId, leafId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  if (!c) return {};
  return {
    title: `${c.leafLabel} ${leafId} — ${c.ref}`,
    description: 'Working diplomatic transcription — leaf image, line index, and transcription (PDF).',
    alternates: { canonical: `/research/${archiveId}/leaf/${leafId}` },
  };
}

export default async function ResearchLeafPage({ params }: Params) {
  const { archiveId, leafId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  const manifest = readArchiveManifest(archiveId);
  const leaf = manifest?.leaves.find((l) => l.id === leafId);
  if (!c || !manifest || !leaf) notFound();
  const ids = manifest.leaves.map((l) => l.id);
  const idx = ids.indexOf(leafId);
  const openReadings = loadAllReadings().flatMap((col) => col.items.filter((it) => it.source.kind === 'archive' && it.source.archiveId === archiveId && it.source.leafId === leafId).map((it) => ({ collection: col.id, id: it.id })));
  return (
    <LeafBody archiveId={archiveId} refLabel={c.ref} leafLabel={c.leafLabel} manifest={manifest} leaf={leaf} openReadings={openReadings}
      prev={idx > 0 ? ids[idx - 1] : null} next={idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null} />
  );
}
