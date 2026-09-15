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

## Books from the research library, and REVIEW MODE (owner 2026-09-14)
- Local manuscripts enter the Articles library by `scripts/import-local-works.mjs`
  (content/works/<slug>.md + a `local` entry in content/works.json; the
  working header comment and the H1 are stripped). Not part of the build;
  run, `git diff`, commit.
- A reviewed book (`/work/<slug>/review`) is the text beside the pages it
  cites: `scripts/import-review-links.mjs` reads the research library's
  **Pinned Citation Extracts** lane (the data seat's join: `_INDEX.tsv`,
  `_SOURCES.tsv`, `_BOOK.json`, `_FIXITY_SHA256.txt` — plain TSV, split on
  tabs only), wraps every citation unit in its note as `[unit](cite:<note>/<seq>)`,
  copies the **public-domain pages only** to `public/uploads/research/<id>/sources/`
  (sha-checked), and writes `content/review/<slug>.json`. Run it after
  import-local-works; it refuses a book whose sha256 differs from the lane's.
- Rights rule: nothing in copyright or licence-bound leaves the library; a
  citation whose page is held but not published is MARKED on the site (source,
  page, rights, holder link), never dropped. `Markdown.tsx` turns `cite:` hrefs
  into `data-cite` anchors; `ReviewBody.tsx` is the dual pane (LeafBody's
  card pattern). Deep link `#cite=<note>/<seq>`.
- **The review pane's book is the book's PDF** (owner 2026-09-14, v2), not the
  rendered text: the lane's `_WEB/overlay.json` binds a render (sha256) to
  boxes over every citation unit's lines (PDF points, origin top-left, one
  rect per line; split units carry a tail). The import copies the render to
  `public/uploads/research/<id>/book.pdf` and the annotated copy (URI links
  to the deep links) to `book_linked.pdf`, refusing either on a sha mismatch;
  `PdfViewer` lays the boxes as percent-of-page hit buttons (`hotBoxes`) and
  scrolls by `focus`. The text reader at `/work/<slug>` stays as the text
  version. Rights are judged PER PAGE (per index row), and the import asserts
  the on-disk extract set against the rows — extra 0, missing 0 — or aborts.
- The book text and the lane are never edited here; a book edit re-runs the
  lane (the drafter's seat), then both imports.
- **Search within a pane** (owner 2026-09-15): the viewer's magnifier opens a
  search row; the query is matched, case- and accent-folded, against each
  page's text layer, read once per page and cached; hits are boxed as
  fractions of the page; an image-only scan says "no text layer". Read the
  text layer with `page.streamTextContent(...).getReader()` and a plain
  `reader.read()` loop — `getTextContent()` uses `for await` on a
  ReadableStream, which WebKit (Safari, the Studio shell) does not support,
  and every page throws. Verify hit counts against `pdftotext | grep -o | wc -l`.

## Dark mode (owner 2026-09-15, as lawsofexistence.com)
Tailwind `darkMode: ['class']`; every colour token is an RGB triple variable in
`app/globals.css` (`:root` light, `.dark` dark) so `/opacity` modifiers work
and components never name a hex. Header/footer/info panel use the `chrome`
tokens (navy in both modes); `ink` is the foreground and flips, so a `bg-ink
text-on-ink` button inverts in dark. The header `ThemeToggle` cycles light /
dark / system, remembered in localStorage `jk-theme`; the inline script in
`app/layout.tsx` applies the class before first paint. Check a change in both
modes (Safari via safaridriver screenshots work on this Mac).

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
