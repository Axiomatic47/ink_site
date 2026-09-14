# REALM CHARTER — ink_site (kirchner.ink, the owner's publishing and grant-funding site)

Public site for Joseph Kirchner's publishing and grant-funding work: the
writing, the research archives, and how to fund or publish it. Cloned from
kirchner.cv (jk_website) on 2026-09-12 at the owner's word and sharing its
code; CONTENT differs. SEPARATE from lawsofexistence.com (loe_website) and
from kirchner.cv — different audience, different repo, different Netlify
project. Contact is joseph@kirchner.ink (Zoho Mail on this domain since 2026-09-14:
MX mx/mx2/mx3.zoho.com, SPF include:zohomail.com, DKIM selector zmail, DMARC
p=none, all on Netlify DNS).

## Branch law (mirrors midesk BRANCHING.md §11)
- Agents work on and push `device/<host>` (this Mac: `device/macbook`).
- `main` is the production deploy (Netlify builds it). The OWNER moves main.
- R6: no force-push, no history rewrite, no trunk deletion.

## Content law
- `content/cv.json` is the ONLY content file. Pages render from it; a section
  with no entries is not rendered. Never hand-write facts into components.
- `content/cv.json` is DERIVED from `Joseph_Kirchner_Resume.md` by
  `scripts/cv-from-resume.mjs` (`npm run cv:sync`); `npm run cv:check` fails
  the build when they drift. Site-only keys (location, email, pdf, pdf_print,
  links, availability, portrait) are preserved by the derivation.
- Every fact comes from the owner. Agents never invent roles, dates, degrees,
  works, grants, or publications; `scripts/validate-cv.mjs` refuses
  placeholder text at build time.
- The site is public. Nothing from the litigation record, evidence trees, or
  research_library working files goes here unless the owner says so.
- **References and private contact are never published** (owner
  2026-09-10). No reference names, phone numbers, street address, or any
  contact beyond `cv.email` anywhere. `validate-cv.mjs` refuses those keys and
  phone-shaped strings; `scripts/check-pdf-private.mjs` reads every served
  PDF and refuses one carrying them. The resume and references sheet are Word
  files the owner sends by hand.
- No lawsofexistence.com links or content on this site unless the owner
  says so.

## Shared code with jk_website
The app, the console (`netlify/`), the scripts and the design are the same
code as jk_website. A fix that lands in one belongs in the other until the
shared console package exists (docs/ADMIN_CONSOLE_SECURITY_PLAN.md §2.6).
Name the sibling commit in yours.

## Stack
Next.js (App Router, `output: 'export'` → `out/`), TypeScript, Tailwind,
system font stacks. No runtime server, no external scripts. Gates before
"done": `npm run build` (readings:pull → cv:check → validate-cv →
validate-readings → build:cv-pdf → check:pdf → tsc → next build),
`npm run lint`, `npm run test:console`, all on bare exit code.

## DNS / hosting (2026-09-12)
Domain at Namecheap; DNS and hosting on Netlify (team axiomatic47). The
domain was an alias of the kirchner.cv project until 2026-09-12; it now
needs its own Netlify project (repo Axiomatic47/ink_site, branch main,
publish `out`), the Auth0 callback `https://kirchner.ink/admin/callback`,
and the same environment variables as kirchner.cv.
