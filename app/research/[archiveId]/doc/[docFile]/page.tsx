import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {ARCHIVE_IDS, RESEARCH_ARCHIVES, archiveBase } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { SiteShell } from '../../../../_components/SiteShell';
import { PdfViewer } from '../../../../_components/PdfViewer';

export const dynamicParams = false;
export function generateStaticParams() {
  const out: Array<{ archiveId: string; docFile: string }> = [];
  for (const archiveId of ARCHIVE_IDS) for (const p of readArchiveManifest(archiveId)?.workingPapers ?? []) out.push({ archiveId, docFile: p.pdf.replace(/^pdfs\//, '') });
  return out;
}
type Params = { params: Promise<{ archiveId: string; docFile: string }> };
const lookup = (archiveId: string, raw: string) => readArchiveManifest(archiveId)?.workingPapers.find((p) => p.pdf === `pdfs/${decodeURIComponent(raw)}`) || null;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { archiveId, docFile } = await params;
  const paper = lookup(archiveId, docFile);
  return { title: paper ? paper.title : 'Working paper', robots: { index: false, follow: false } };
}

export default async function ResearchDocPage({ params }: Params) {
  const { archiveId, docFile } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  const paper = lookup(archiveId, docFile);
  if (!c || !paper) notFound();
  const pdfUrl = `${archiveBase(archiveId)}/${paper.pdf}`;
  return (
    <SiteShell>
      <Link href={`/research/${archiveId}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6"><ArrowLeft className="h-4 w-4" /> {c.ref} — archive</Link>
      <h1 className="font-serif text-2xl sm:text-3xl leading-snug mb-6 max-w-4xl" style={{ fontWeight: 620 }}>{paper.title}</h1>
      <PdfViewer src={pdfUrl} title={paper.title} downloadName={paper.pdf.split('/').pop()} />
    </SiteShell>
  );
}
