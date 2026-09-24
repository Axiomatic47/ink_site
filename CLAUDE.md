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
- **A held page may carry a `url`** (lane contract 2026-09-16): the index row's
  `url` rides onto the page chip — a STAC membrane / HLS folio opens its own
  leaf page on this site (site-relative, same tab); a row with status
  `EXTERNAL` and rights `external-link` (a catalogue record the book cites, no
  extract, pinkind `item`) makes a chip whose label is the pin as written and
  whose link opens the holder's record in a new tab. One rule: any row with a
  `url` yields a chip with it; nothing with `external-link` is ever served.
- **The register of cited works** (lane contract 2026-09-16, drafter 8a96daa3's
  `_REGISTER.tsv` in the lane dir): an index row's `work` is a register id; the
  importer copies it onto the page (and the unit's first row's onto the unit),
  refuses an id that is not an `is_work` Y row, and writes the referenced rows'
  public fields to the manifest's `works` map (empty fields dropped; never
  shelf_path / sha256 / notes). `ReviewBody`'s `WorkRecord` shows a work in a
  DROPDOWN, closed by default (owner 2026-09-16: "the pdf view panes shouldn't
  be affected by the data fields — present them in drop downs; the pdf panes
  MUST REMAIN the same size"): a `<details>` under the held card's actions,
  and a toggle on the record line under the panes whose body renders OUTSIDE
  the measured record block, so the panes' height budget (viewport minus the
  two-line record) never changes. The record itself: the full citation, "Full
  text" by kind (`WORK_URL_KIND`), "Cite as", the rights statement and
  licence, the holder when it differs from the source's. Split the register
  on tabs only.
- **Search within a pane** (owner 2026-09-15): the viewer's magnifier opens a
  search row; the query is matched, case- and accent-folded, against each
  page's text layer, read once per page and cached; hits are boxed as
  fractions of the page; an image-only scan says "no text layer". Read the
  text layer with `page.streamTextContent(...).getReader()` and a plain
  `reader.read()` loop — `getTextContent()` uses `for await` on a
  ReadableStream, which WebKit (Safari, the Studio shell) does not support,
  and every page throws. Verify hit counts against `pdftotext | grep -o | wc -l`.
- **A book's VERSION log (owner 2026-09-24, "a versioning drop down at the footer of the article
  page … concise notes of change"; as lawsofexistence.com):** `content/versions/<slug>.json` — one
  entry per uploaded version (number, ISO date, the text and PDF sha prefixes the import printed, a
  concise note of what changed), newest last in the file; `app/work/[slug]/review/VersionMenu.tsx`
  shows it as a drop-down in the review page's footer (opens upward as a popover, never inside the
  panes' height budget) and in the text page's side panel. On a new render or text landing, add the
  entry in the same commit as the import — the same entry as lawsofexistence.com's, since both sites
  publish the same book at the same lane state; the immunity book's version 1 is the eighteenth lane
  state of 2026-09-22. A book with no log shows no menu.

## Research archives — the published set, and Whittick's edition (owner 2026-09-18)
`public/uploads/research/<id>/` (manifest + leaf images + `pdfs/`) is the published set
built by lawsofexistence.com's `scripts/sync-archives.mjs` from the research library and
copied here verbatim; this repo has no builder. Types and the publish gate:
`src/lib/research-archive.ts` (`PUBLISHED_KINDS`). Since 2026-09-18 the STAC 8/203/38
pages serve **Christopher Whittick's professional verification transcription** (doc kind
`edition`: the depositions on mm. 1–7, the interrogatories on mm. 8–9, the answer on
m. 10 — his latest texts, the 4 Aug 2026 set, by hash; the answer's PDF is the owner's
export of his docx) in place of the owner's per-leaf transcripts, on his written agreement
of 18 Sep 2026 (research_library 6f70fa6e) and the owner's word. Rules: credit reads
exactly "Professional verification transcription by Christopher Whittick" wherever his
text shows (leaf page, archive page, shelf, metadata); his licence is the basis for his
text — never print the Open Government Licence over it (that covers the record; cite the
record as "The National Archives, ref. STAC 8/203/38"); the owner's transcripts, line
indexes and working spans stay in the library, unserved. A change to what is served is a
change to the archive page's words in the same commit.

## Social cards — one per page (owner 2026-09-21)

A Facebook post preview of `/research/stac-8-203-38` showed the site portrait; the owner asked for
"unique thumbnails for each particular page": the STAC page its first membrane, the HLS page its first
folio, an article its first page. `npm run og:build` (manual-run: Pillow, poppler's `pdftoppm`, the Mac's
fonts) writes `public/og/<key>.jpg`, 1200×630 — `research-<archiveId>` and `research-<archiveId>-<leafId>`
are a band of the leaf's own published image (the holder's licence covers the page; the card is a crop of it);
`work-<slug>` is the work's first page (a book's review render, else the work's PDF) letterboxed on the
site's paper, or a rendered title page in the site's serif when a work has no PDF. `src/lib/og.server.ts`
`ogImages(key, alt)` puts the card into `openGraph.images` + `twitter` in each page's `generateMetadata`
(research archive + leaf pages; `/work/<slug>`, `/text`, `/review` share the work's card); a page whose card
is missing keeps its tags without an image and the build warns by key. Re-run after a new leaf, render,
work PDF or work; commit `public/og/`. The palette is read from `app/globals.css` (light theme) so the script
is byte-identical on kirchner.cv, which carries the archive cards only. Facebook caches a URL's card: after a
deploy the owner re-scrapes at developers.facebook.com/tools/debug/ (or posts a fresh URL).

## Analytics — first-party, no third party (owner 2026-09-16)
The site counts its own page views: `app/_components/Analytics.tsx` posts
`{p, r, w}` to the site's own `/api/hit` (edge function `netlify/edge-functions/hit.js`
→ `netlify/lib/analytics-hit.mjs`), one Blobs record per view; the hourly
scheduled function `netlify/functions/analytics-rollup.mjs` folds them into
`day/<day>.json`; the console reads them at `/admin/analytics`. Design, data
model and gates: `docs/ANALYTICS.md`. Rules:
- **Recorded per view**: normalized path, referrer HOST (first load only),
  country, device class, hour (owner's zone, `ANALYTICS_TZ`), and a visitor
  hash of `sha256(daily salt · host · ip · ua)` that dies with the day's salt at
  day close. **Never**: IP, user agent, query strings, fragments, anything under
  `/admin`. **Never counted**: bots, prefetches, `Sec-GPC: 1`, the Privacy
  page's off switch (`localStorage jk-analytics`), localhost.
- The store name follows the deploy context (`analytics`,
  `analytics-branch-deploy`, `analytics-deploy-preview`): test on a branch deploy
  freely, production numbers are production's.
- The roll-up is the only writer of `day/*.json` (lock + etag + `pending_delete`
  guard); the edge function writes raws and the salt only. Do not add a second
  writer.
- The Privacy page states exactly this; a change to what is recorded is a change
  to that page in the same commit.
- Gates: `npm run test:analytics`, `npm run test:edge` (Deno), `npm run test:console`,
  lint, build. The edge and core modules are Web-standard (no `node:` imports) so
  Deno and Node run the same files — keep them that way.

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
`npm run lint`, `npm run test:console`, `npm run test:analytics`, all on bare
exit code.

## DNS / hosting (2026-09-12)
Domain at Namecheap; DNS and hosting on Netlify (team axiomatic47). The
domain was an alias of the kirchner.cv project until 2026-09-12; it now
needs its own Netlify project (repo Axiomatic47/ink_site, branch main,
publish `out`), the Auth0 callback `https://kirchner.ink/admin/callback`,
and the same environment variables as kirchner.cv.
