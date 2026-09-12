import type { Metadata } from 'next';
import { cv } from '@/lib/cv';
import { SiteShell } from '../_components/SiteShell';
import { LegalPage, H2, P, UL, SITE_HOST } from '../_components/legal';

export const metadata: Metadata = { title: 'Terms of Use', description: `Terms of use for ${SITE_HOST}.`, alternates: { canonical: '/terms' } };

export default function Terms() {
  return (
    <SiteShell>
      <LegalPage eyebrow="Terms" title="Terms of Use">
        <P>
          These terms govern your use of {SITE_HOST}, a personal website published by {cv.name}. By using the site you
          accept them. The Privacy Policy and Legal Notices are part of these terms.
        </P>
        <H2>What the site is</H2>
        <P>
          The site presents the author&rsquo;s curriculum vitae and selected writing for professional networking and
          for readers interested in the work. Reading is free. There are no accounts, subscriptions, or sales. The
          author may change, add to, or remove material at any time.
        </P>
        <H2>How you may use the material</H2>
        <UL>
          <li>Read, print, and download the CV and any document the site offers for download, for your own use.</li>
          <li>Link to any page.</li>
          <li>Quote the author&rsquo;s writings with attribution for scholarship, journalism, criticism, or teaching.</li>
          <li>Share the CV with people evaluating the author for a role or engagement.</li>
          <li>Answer an open reading on the research pages. By sending an answer you allow the author to publish it in the form you chose, or to keep it private if you asked.</li>
        </UL>
        <H2>What you may not do</H2>
        <UL>
          <li>Republish the author&rsquo;s writings in full, or adapt them, without permission.</li>
          <li>Remove or alter authorship or credit lines.</li>
          <li>Use the CV or contact details to build marketing lists, send unsolicited bulk messages, or impersonate the author.</li>
          <li>Crawl or download at a rate that burdens the site, probe or interfere with the site or its hosting, or use the site for anything unlawful.</li>
        </UL>
        <H2>Accuracy</H2>
        <P>
          The CV is maintained by the author and is offered in good faith. Employment history, dates, and
          qualifications should be confirmed with the author directly before being relied on for a hiring or
          contracting decision. The writings express the author&rsquo;s views and are not professional advice.
        </P>
        <H2>No warranty; limitation of liability</H2>
        <P>
          The site is provided as is. To the fullest extent the law allows, {cv.name} is not liable for any indirect,
          incidental, or consequential loss arising from use of the site or reliance on its contents.
        </P>
        <H2>Governing law</H2>
        <P>
          These terms are governed by the laws of the State of Minnesota, United States, without regard to its
          conflict-of-laws rules. Disputes belong in the state or federal courts sitting in Minnesota.
        </P>
        <H2>Changes</H2>
        <P>Changes take effect when posted here, with the date above updated. Continued use after a change is acceptance of it.</P>
      </LegalPage>
    </SiteShell>
  );
}
