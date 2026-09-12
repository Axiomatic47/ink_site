import type { Metadata } from 'next';
import { cv } from '@/lib/cv';
import { SiteShell } from '../_components/SiteShell';
import { LegalPage, H2, P, UL, SITE_HOST } from '../_components/legal';

export const metadata: Metadata = { title: 'Privacy Policy', description: `What information ${SITE_HOST} handles.`, alternates: { canonical: '/privacy' } };

export default function Privacy() {
  return (
    <SiteShell>
      <LegalPage eyebrow="Privacy" title="Privacy Policy">
        <P>This policy describes what information {SITE_HOST} handles. The short version: almost none.</P>
        <H2>What the site collects</H2>
        <UL>
          <li>
            <strong>Almost nothing you type.</strong> The site has no accounts, comments, or sign-ups. Its one form is the
            Open Readings answer form on the research pages, described below. Otherwise the only way to reach the author
            is email, and what you send by email is handled like any other correspondence.
          </li>
          <li>
            <strong>No analytics, no trackers, no cookies.</strong> The site loads no third-party scripts, fonts, or
            pixels. Everything it serves comes from its own address.
          </li>
          <li>
            <strong>Hosting logs.</strong> The site is hosted on Netlify. Like any web host, Netlify may record
            technical details of requests (IP address, browser, pages requested, time) in short-lived server logs for
            security and operations. The author does not receive or analyse per-visitor logs.
          </li>
          <li>
            <strong>Your browser.</strong> The document viewer runs entirely in your browser; PDFs are fetched from
            this site and rendered locally. Nothing about what you read is sent anywhere.
          </li>
        </UL>
        <H2>Answering an open reading</H2>
        <P>
          The research pages invite qualified readers to answer disputed manuscript readings. The answer form collects
          your answer, an optional note, your name and credentials, and an email address unless you tick that you would
          rather not be contacted. Submissions are stored by Netlify, the site&rsquo;s host, in its form service in the
          United States, and queued privately for the author&rsquo;s review. Your email address is never published. If you
          chose to have your answer published, the author reviews it first and then publishes the answer with the name
          and credentials summary you consented to, or as &ldquo;anonymous reader&rdquo; if you asked. Answers sent to the
          author only stay in the private record. Write to {cv.email} to withdraw a published answer or to have your
          submission deleted.
        </P>
        <H2>Email</H2>
        <P>
          Messages sent to {cv.email} are delivered to the author&rsquo;s mailbox, hosted by Zoho Mail, and kept as
          long as the correspondence is useful. They are not shared except as needed to respond, or where the law
          requires.
        </P>
        <H2>Children</H2>
        <P>The site is not directed at children and knowingly collects nothing from them.</P>
        <H2>Your choices and rights</H2>
        <P>
          Because the site stores nothing about you, there is nothing to access, correct, or delete beyond email you
          have sent, which the author will delete on request. Residents of jurisdictions with data-protection laws may
          exercise any rights they hold by emailing {cv.email}.
        </P>
        <H2>Changes</H2>
        <P>Changes to this policy are posted here with the date above updated.</P>
      </LegalPage>
    </SiteShell>
  );
}
