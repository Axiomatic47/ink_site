import type { Metadata } from 'next';
import { SiteShell } from './_components/SiteShell';
import { HomeLayout } from './_components/HomeLayout';
import { ArchivesShelf } from './_components/ArchivesShelf';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function About() {
  return (
    <SiteShell>
      <HomeLayout />
      <ArchivesShelf />
    </SiteShell>
  );
}
