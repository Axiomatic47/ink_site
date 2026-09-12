import type { Metadata } from 'next';
import { cv } from '@/lib/cv';
import { SiteShell } from '../_components/SiteShell';
import { LegalPage, H2, P, UL, SITE_HOST } from '../_components/legal';

export const metadata: Metadata = { title: 'Legal Notices', description: `Ownership and reuse notices for ${SITE_HOST}.`, alternates: { canonical: '/legal' } };

export default function Legal() {
  return (
    <SiteShell>
      <LegalPage eyebrow="Legal" title="Legal Notices">
        <H2>Publisher</H2>
        <P>
          {SITE_HOST} is published by {cv.name}, an individual, and is not affiliated with any employer, client, or
          institution named in the CV. Views expressed in the writings are the author&rsquo;s own.
        </P>
        <H2>Copyright</H2>
        <P>
          © {new Date().getFullYear()} {cv.name}. The CV, the writings presented under Work, and the design and text of
          this site are the author&rsquo;s copyright. Quotation with attribution is welcome; republication or adaptation
          requires permission. Requests: {cv.email}.
        </P>
        <H2>Trademarks and names</H2>
        <P>
          Employer, product, and software names that appear in the CV (for example AppFolio, Yardi, OneSite) are the
          trademarks of their owners and are used only to describe the author&rsquo;s experience.
        </P>
        <H2>Software</H2>
        <UL>
          <li>The document viewer uses PDF.js, an open-source library from Mozilla, licensed under the Apache License 2.0.</li>
          <li>The site is built with Next.js and hosted on Netlify.</li>
        </UL>
        <H2>No professional relationship</H2>
        <P>
          Nothing on this site is legal, financial, or professional advice, and reading it creates no client,
          employment, or other relationship with the author.
        </P>
        <H2>Contact</H2>
        <P>
          Notices, corrections, and permission requests go to {cv.email}.
        </P>
      </LegalPage>
    </SiteShell>
  );
}
