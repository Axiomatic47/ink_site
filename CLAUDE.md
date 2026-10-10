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
- **Then read the served diff before committing:** `npm run review:diff -- <slug>`
  (`scripts/review_diff.py`, read-only) prints what changed in everything the
  site serves against HEAD — review JSON (book, render, markers, works, sources,
  units with status/rights censuses, boxes), served manifest, version log and its
  byte identity with the lane's `_VERSIONS.json`, works markdown, the uploads tree
  with any file that went empty or lost cells. Every line must trace to the
  drafter's signal; otherwise refuse the state naming the cells (a sha gate is
  necessary, not sufficient: the 17th lane state passed every sha and emptied 59
  context cells).
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
  page … concise notes of change"; as lawsofexistence.com):** the log is the LANE's — the drafter's
  `_VERSIONS.json` beside the extracts (contract with 0b43895f, RL f78abdbf): one entry per published
  version, newest last, each with the FULL sha256 of the committed text (`text` = `_BOOK.json`.sha256)
  and of the owner's render (`pdf` = `overlay.json` pdf.sha256 — never the served `_linked.pdf`, whose
  hash moves with every index row), the date, a concise note, and informational `book_commit`,
  `render`, `lane_state`. The import gates the newest entry with those two equalities (a book or
  render that moved without an entry is refused, naming the cells; a row-only state carries no entry)
  and writes `content/versions/<slug>.json` — the lane's file byte for byte, never hand-edited. A lane
  without the file while the site has a copy is REFUSED (a vanished log is a mistake or a decision, and
  either arrives as a signal — never an import that un-publishes); a book that never had a log has no
  menu. `app/work/[slug]/review/VersionMenu.tsx` shows it in the review
  page's footer (an upward popover, never inside the panes' height budget) and the text page's side
  panel. Both sites carry the same log; the immunity book's version 1 is the eighteenth lane state.
- **An extract may span two or three scans** (lane state 2026-09-28: the 1797 Coke's 1644 pagination —
  a printed page begins at its bracket and runs to the next bracket's scan, so the lane cuts a pin
  from its bracket scan to the next). The importer counts each copied extract's pages (qpdf) and
  records `pages` on the page entry only when it exceeds one, so every other entry stays byte-stable;
  the footer then says the download is the cited page across N scans, the "open the page PDF" link
  names the count, and `PdfViewer` pages through the file on its own. The pane still opens the
  reading copy at the cited page. The lane's index keeps `pdf_page` = the bracket scan.
- **Completed is not published (owner 2026-09-26, "none were published until September 26, which is
  information that needs to be available to the reviewer"):** the lane's `date` is when the drafter
  completed the version; publication is the owner's integration of device/macbook → main (Netlify
  deploys main). `npm run versions:stamp` (`scripts/stamp-published.mjs`; run after EVERY integration,
  then commit) reads main's first-parent history and records, per version, the date in the owner's
  zone and the short sha of the first main commit that carried it →
  `content/versions/<slug>.published.json` — the site's record, never the lane's; a recorded date is
  never rewritten (a disagreement with main is printed, not applied). `readVersions` merges it; a
  production build (`CONTEXT=production`) dates a version the record lacks by the commit it is
  building — the deploy that publishes it — so the live site is never behind the record; any other
  build shows such a version as **not yet published**. The menu prints both per version:
  "completed … · published …". The immunity book's versions 1–4 and 6–10 were all published
  2026-09-26 (main 156fc3f).

## The immunity timeline — one module on three sites (owner 2026-10-06)

- `/research/immunity-timeline` is *Where Immunity Came From*: the actual history of immunity in all its categories, shared
  outward as the record (owner 2026-10-07: it is the timeline to share, not a comparison against anyone else's — the
  comparison block is no longer drawn); the same page on kirchnervjohnson.com and lawsofexistence.com. ONE content file, `public/research/immunity-timeline.json`, the same bytes on every site, served
  beside the page; the drafters write and review it (every fact from the book or a shelf copy), the sites render it, nobody
  here edits a fact. Absent → the route answers 404, the sitemap omits it, no menu item: never a placeholder.
- BYTE-IDENTICAL across sites (cmp at every landing): `src/lib/immunity-timeline.ts` (the shape: thirteen categories, six
  kinds), `immunity-timeline.server.ts` (the loader; `IMMUNITY_TIMELINE_JSON` overrides for a local build, ignored under
  CI/NETLIFY), `scripts/validate-timeline.mjs` (the build gate: ids, integer years, the closed sets, quote pins, http links,
  `source.book_unit` as `<note>/<seq>` beginning with the entry's `book_note`, an older file's comparison cross-references,
  no coordination vocabulary in reader-facing text), `app/research/immunity-timeline/{TimelineBody,TimelineFilter}.tsx`
  (the body: key line, record; the rail: a TYPE row and a CATEGORY row of chips that SELECT — each row begins at All, a chip
  shows only its type or category, several in a row add together, the two rows combine, the selected chips are the filled
  ones; the selection is the page's query string, `?type=<kind,…>&category=<category,…>`, read through
  `useSyncExternalStore` so the server render and the first client render agree (All) and a filtered view can be sent; print
  shows everything; owner 2026-10-07: a filter never hides what was clicked) and `timeline.css`. The page names the book once in a key line — TSUP = *The Subject's Unanswered Plea*
  — and TSUP thereafter ("TSUP § 2.3 · n. iicb5a"). A citation links to the book's review page at its cited unit
  (`bookUnitHref`: `${bookBase}/review#cite=<note>/<seq>`) when the data names `source.book_unit`; the note links to the text
  page (`bookNoteHref`: `${bookBase}/text#user-content-fn-<note>`). At a landing, every `book_unit` is checked against this
  site's review manifest (`content/review/<slug>.json` units): a lane row with no source copy (SKIP, NO_SOURCE) is not a unit
  the review page can open, and the entry keeps the note link instead. Per site: `page.tsx` (the shell) and `app/_components/Markdown.tsx`.
  The book's address is a site setting (`bookBase`: `/work/<slug>` here; the absolute kirchner.ink URL elsewhere).
- THE CHANGE RULE: a new import name, a new field, a new category or kind, a NEW PALETTE TOKEN NAME in the stylesheet, or a
  NEW UTILITY CLASS NAME in the module's markup (`bg-ink`, `text-paper`, `border-rule` and their variants — lawsofexistence.com's
  scoped sheet maps each utility by hand, so a class it has not met renders unstyled there without failing any gate; the
  filter's filled chip brought five it had not met, 2026-10-07) is said by name to the other sites before it lands; all three
  cut together.
  The HREF FORMS are part of the contract: lawsofexistence.com has no `/review` route (its review mode is `/books/<slug>`)
  and answers `bookUnitHref` by a permanent redirect that carries the fragment — a change to either href's shape (a new
  segment, a query instead of a hash) is said by name first.
- The Research menu lists the page (`app/_components/SiteHeader.tsx`) only while the content exists.
- THE TIMELINE IS OFFERED FROM THE BOOK (owner 2026-10-07): `app/_components/TimelineLink.tsx` renders the home shelf's card
  beneath the archive cards (title, span, count, the book, six entries chosen evenly across the record to their anchors — the
  same six as lawsofexistence.com's card) and the line beneath the book's review panes on `/work/<slug>` and `/review`, passed
  as the `after` slot from the page through `ReviewLoader` into `ReviewBody` and counted in the panes' height budget by its own
  constant (`AFTER_PX` beside `BELOW_PX`, so a picked citation never moves the panes' edges). Both render only while the
  timeline's content exists AND names this book (`provenance.book_slug`); every other work shows nothing. Shell, not module.

## The open letter to the candidates for Minnesota Attorney General (owner 2026-10-09)

- `/mn-ag-candidates-open-letter` — the route the letter prints in its closing paragraph (the owner mails it
  October 10, 2026): the open letter, its Enclosure A and the MPR News Politics Friday debate of October 2, 2026,
  in the review-mode pattern. LEFT, the document: the owner's own PDF of the letter or of Enclosure A (the Word
  build's rendering, read from `05_Correspondence`, never produced here — the device rule), every debate time a hit
  box over the page as the book's citations are (`PdfViewer` `hotBoxes`; the boxes come from poppler's word
  boxes, `pdftotext -bbox-layout`, one per word a time runs through, PDF points, origin top-left), and a Text tab
  (the markdown, times linked by the remark plugin). RIGHT, the source: THE RECORDING ITSELF playing in the page
  (owner 2026-10-09: "publish the actual view in the same screen, not just its transcript") above the transcript,
  one row per turn, every Time cell a link. A time anywhere — a box on the PDF, a link in the text, a Time cell —
  plays the recording from that second here and marks the turn in progress; every link keeps its YouTube href
  (`https://www.youtube.com/watch?v=pgzvG1Ky8rQ&t=<seconds>s`, a range to its start) for a reader who wants the
  page there. THE PLAYER is YouTube's privacy-enhanced embed (`www.youtube-nocookie.com`, `enablejsapi=1`, the
  page's origin) driven by the widget's postMessage protocol — no YouTube script on this site, and NOTHING from
  YouTube loads until the reader presses play or a time (a facade stands first); the one CSP in `netlify.toml`
  gained `frame-src https://www.youtube-nocookie.com` for it, and the privacy page says so. A Reading-mode toggle
  stacks the three parts. Deep links `#enclosure-a`, `#transcript`, `#turn-<n>`, `#t=<seconds>` (a second arms
  the play button; nothing autoplays on load).
- Content: `content/correspondence/mn-ag-candidates-open-letter.json`, written by `scripts/import-open-letter.mjs`
  (manual-run, like import-local-works: the owner's case tree is not on the build host) from exactly three files of
  `~/Git/work_station/2_MN-0-26-cv-02594-LMP-DJF` — the letter and the enclosure under `05_Correspondence`, the
  transcript under `0_Workspace/03_Video_Evidence/ellison_schutz_mpr_debate_20261002` — recording each file's sha and
  commit; it refuses a dirty source. THE LETTER'S TEXT comes from the drafters' PUBLISHED copy
  (`…_2026-10_PUBLISHED.md`, the mailed text with the street, the city line and the telephone dropped) whenever
  that file exists, else from the mailed letter with the same lines dropped here (`letter.text_source` says which).
  THE PDFs: the enclosure's rides by default (`--enclosure-pdf <path>` to override, `none` to drop); the letter's
  only as `--letter-pdf <the PUBLISHED copy>` (`…_PUBLISHED.pdf`, the owner's rendering of that published text) —
  and the importer refuses, before it writes anything, a letter PDF whose text carries a telephone number or any
  line the published letterhead drops. THOSE LINES ARE NEVER NAMED IN CODE: the refusal reads them from the mailed
  letter's own letterhead in the case tree at run time (admin 69183d38 2026-10-09: a literal in the source is the
  street in the repository — the first cut had one, a5db63d3, removed by the follow-up; the history keeps it).
  Without the flag the letter tab is absent and the left pane opens on the Text tab. Each served PDF is recorded with its sha, size, page count, page sizes and time boxes; `--check` hashes
  the served files and reads the letter's text again. NOTHING ELSE from that folder is published (the census beside the transcript
  relates the debate to another action; the letter and enclosure name the owner's own case only). The front matter
  and every HTML comment (drafting notes, signature blocks) are stripped; the letterhead and addressee blocks get hard
  breaks; the transcript header's source and method sentences ride onto the page with two things removed and NAMED
  under `header_omitted` — as labels, never the words, so the content file carries them no more than the page does
  (a636b3d9 2026-10-09) — the owner's local file paths and the drafter's seat (the outward-voice rule: no seat ids,
  no filesystem paths where a reader reads); every other word is the drafter's. Record cites in the enclosure are
  plain text (this site carries no docket). THE PUBLISHED LETTERHEAD is the name and the email only (owner
  2026-10-09: "redact my phone number and address from the letter that's published") — the importer drops the
  street, the city line and the telephone from the body's first paragraph, records what it dropped by label
  (`letter.redacted`), and its `--check` and `test:letter` refuse a letterhead of more than those two lines or a
  telephone number anywhere in the letter; the campaigns' addressee blocks are untouched. `src/lib/open-letter.ts` is the shape and the time rules
  (`DEBATE_TIME_RE`, `recordingUrl`, `turnAt`); `remark-debate-times.ts` the plugin; `open-letter.server.ts` the
  loader. Absent content → 404 and no sitemap entry, never a placeholder. GATE: `npm run test:letter`
  (`scripts/test-open-letter.mjs`, bundled by esbuild so it imports the TypeScript rules) — the clock forms the
  texts use (a time before a colon, a range before a colon, two times either side of a slash, a list), the
  non-times (a docket prefix, a statute, a phone number), the plugin over markdown, and, when the content is on
  disk, every time the pattern finds in the letter, the enclosure and the method becoming a link; plus
  `node scripts/import-open-letter.mjs --check`. A time the pattern misses is a quotation a reader cannot hear —
  the first cut missed every "2:49:" (a colon after the time) and the test is what caught the form.
- NOT in the site's navigation until the owner's word; the owner previews first (the Studio pane or a build on a
  private port). Because no menu reaches it, `studio-site.json`'s `ready_path` for BOTH preview modes is this
  route (owner 2026-10-09: "the site preview in ourstudio does not show any way to view this new page") — the
  SITES pane probes and frames `http://localhost:<port><ready_path>`, so the pane opens on the page and the site's
  menu is a click away; set it back to `/` when the page is in the navigation or the owner says. The letter on the page is the current text — a placeholder the owner may revise before mailing — so a
  revised letter is a re-run of the import (the same three files, committed in the case tree first), then
  `review the diff`, build, commit. The social card is a title card from `content/og-cards.json` (the data-driven
  list `build_og_images.py` reads after the works; kirchner.cv has no such file, so the script stays byte-identical).
- The transcript is a machine transcript (whisper large-v3, two machine hearings, the header says so and the page
  keeps it); the owner's own listen to the quoted clocks is theirs. Questions about the content go to its drafter,
  not to this seat; the page's build is this seat's.

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
