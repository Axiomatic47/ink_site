import type { Metadata } from 'next';
import { SiteShell } from './_components/SiteShell';
import { HomeLayout } from './_components/HomeLayout';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function About() {
  return (
    <SiteShell>
      <HomeLayout />
    </SiteShell>
  );
}
