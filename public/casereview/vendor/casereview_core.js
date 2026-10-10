// casereview_core.js — the CASE REVIEW window's pure core (no DOM, no
// pdf.js): the link-lane contract as code, the normalisation rule both
// readers apply, the text-layer locator, the sidebar and deep-link helpers.
// Pinned by tests/js/casereview_test.harness.mjs against the SHARED fixture
// tests/fixtures/casereview_fold.json that the Python validator loads too.
//
// THE LANE (settled by the linked seats 2026-09-29 — admin 2ee3c4f8's header
// settlement, admin 69183d38's record, studio-spec 7d866ecf's blessing):
// `<case_root>/_admin/case_review/` holds docs.json (a list under `docs`,
// one row per PDF — id = the ECF-tree file stem DDC-074 / DDC-051-54, the
// ONLY key; "ECF 74" is a display label; `offset` maps STAMPED page → pdf
// page: pdf = stamped + offset, 1-based, "unstamped" for the four as-filed
// copies) and links/<DOC>_LINKS.tsv, tab-only, one row per citation
// OCCURRENCE. Columns are read BY NAME, never by position, and the reader
// accepts the two spellings the exchange produced (the settlement's
// `text | n | target_pin`, the close's `src_quote | src_occ | target_label`)
// so a file cut under either header opens; the validator should do the same
// or the README picks one. No rect column: drafters give the citation as
// printed and its 1-based occurrence on the page; the viewer locates the box
// at runtime from pdf.js's text layer after the same folding the validator
// applies to the machine_read text. A compound citation is several rows
// sharing (src_page, folded text, n) — one box, several targets, the k-th by
// row order. A row's identity is (src_doc, src_page, folded text, n, k); the
// deep link is #doc=<id>&cite=<src_page>/<n>[/<k>]. `docket` rows carry no
// target_page (open page 1). `unresolved` rows draw dead (visible,
// unclickable): show-and-mark, never a silent gap.

// THE FILE'S HEADER is the README's on disk (work_station fdc01f09, admin
// 69183d38's final line 2026-09-29 23:00 CDT): `src_doc | src_page | text | n
// | kind | target_doc | target_page | target_page_end | target_pin | status |
// by | note`. Internally the reader keeps the close's field names
// (src_quote / src_occ / target_label) and maps the README's onto them by
// name, so a file cut under either spelling opens. unit_id is optional on
// read and derived as <DOC>-<src_page>-<src_occ>-<k> when absent.
export const FIELDS = Object.freeze([
  'src_doc', 'src_page', 'src_quote', 'src_occ', 'kind',
  'target_doc', 'target_page', 'target_page_end', 'target_label',
  'status', 'by', 'note',
]);
export const SYNONYMS = Object.freeze({
  text: 'src_quote', n: 'src_occ', target_pin: 'target_label',
});
// Optional columns a file may carry: unit_id (the close's), target_quote
// (f28bb754's amendment — the words the filing takes from the target; when
// present the right pane locates and boxes them too).
export const OPTIONAL = Object.freeze(['unit_id', 'target_quote']);
/** The README's header, verbatim (13 columns since the 2026-09-29 ~23:30 CDT
 *  amendment: target_quote after target_pin) — what a cut file carries. */
export const HEADER = Object.freeze(['src_doc', 'src_page', 'text', 'n', 'kind', 'target_doc', 'target_page', 'target_page_end', 'target_pin', 'target_quote', 'status', 'by', 'note']);

// ---------------------------------------------------------------- digest
// unit_id = <src_doc>-<src_page>-<n>-<k>-<digest8> (P52, studio-spec): digest8 =
// the first eight hex of SHA-1 over the UTF-8 bytes of the FOLDED text, no
// trailing newline — derived from the row alone, the same in both readers,
// unique per citation on a page; re-derived on every fold change, shown on a
// chip, never stored in a row, never a link's address (the address is
// cite + q=<printed text>). A sync SHA-1 here because crypto.subtle is async
// and the harness runs in node; pinned against the checker's reference values.
function sha1Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const ml = bytes.length * 8;
  const withOne = bytes.length + 1;
  const total = Math.ceil((withOne + 8) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(ml / 0x100000000), false);
  dv.setUint32(total - 4, ml >>> 0, false);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Uint32Array(80);
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('');
}
export function textDigest8(folded) { return sha1Hex(String(folded)).slice(0, 8); }
export function unitIdFor(doc, page, occ, k, folded = '') {
  return `${doc}-${page}-${occ}-${k}` + (folded ? `-${textDigest8(folded)}` : '');
}
export const KINDS = Object.freeze(['ecf', 'finding', 'tac', 'case', 'statute', 'rule', 'docket', 'internal', 'exhibit-usb', 'url', 'secondary']);
export const STATUSES = Object.freeze(['mapped', 'verified', 'unresolved']);
/** docs.json rows carry these kinds; the sidebar groups by `group`. */
export const DOC_KINDS = Object.freeze(['filing', 'attachment', 'unfiled', 'caselaw', 'statute']);

// ---------------------------------------------------------------- folding
// THE NORMALISATION RULE (the lane's README; implemented twice, pinned by the
// shared fixture): NFKC first (expands ligatures ﬁ ﬂ ﬀ ﬃ ﬄ); soft hyphens
// dropped; every dash class — U+2010, U+2011 (the exhibits print "NF‑37"
// with a non-breaking hyphen), U+2012, U+2013 (en dash spans "57–58"),
// U+2014, U+2212 and "-" — folded to "-"; curly quotes straightened;
// whitespace runs collapsed to one space (a citation wraps across
// text-layer lines: "ECF" / "74 at 40–41."); case KEPT; trimmed. The
// drafters measured 8 false misses of 57 before the dash fold and the
// whitespace collapse (d735a78c, 2026-09-29). Applied to BOTH sides.
const DASHES = /[‐‑‒–—−]/g;
const HYPHEN_BREAK = /(?<=\p{L})[-\u2010\u2011\u00AD]\s+(?=\p{L})/gu;   // P62 (b): a raw hyphen-class break between letters — P74: the SOFT hyphen too (the LoC U.S. Reports layers write 're\u00AD\nquires'), tested before the table drops it
const HYPHEN_BETWEEN_LETTERS = /(?<=\p{L})-(?=\p{L})/gu;         // P62 (c): the retry drops these, all at once
// P76 (admin 69183d38, README 216ac0b0 l.50): invisible format characters —
// the Revisor's official PDFs write U+200B between words in the text layer
// (MN Chapter 8: 732); pdf.js hands them to the viewer as EMPTY items, so
// only the QUERY side carried them. P80 (README 8f0d7742 l.50, studio-spec
// 7d866ecf's measure on the two Reshumot prints, registry text_layer 'rtl'):
// EVERY Unicode format character (general category Cf — the five above, the
// bidi embeddings U+202A–202E and isolates U+2066–2069 that wrap each Hebrew
// word, the marks U+200E/200F, the tags U+E0001–E007F) is dropped FIRST,
// EXCEPT the soft hyphen U+00AD, which rule (b) reads at a line-end break
// (P74) before the table drops it. The class is PINNED as a literal at
// Unicode 16.0.0, 169 code points, the same literal the checker carries
// (tools/ourstudio_tools/casereview_text.py, CF_UNICODE_VERSION) — b0d76502's
// bound at review: `\p{Cf}` follows the ENGINE's table as `unicodedata`
// follows the interpreter's (/usr/bin/python3 at Unicode 13 lacks
// U+0890–0891 and U+13439–1343F), and two readers must mean one set on every
// engine; the harness compares the literal with `\p{Cf}` wherever the engine's
// table is 16.0, so a drift is caught.
export const CF_UNICODE_VERSION = '16.0.0';
export const CF_CLASS = '\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}';
const FORMAT_CHARS = new RegExp('[' + CF_CLASS + ']', 'gu');
const FORMAT_CHAR_ONE = new RegExp('^[' + CF_CLASS + ']$', 'u');
const isFormatChar = (cp) => FORMAT_CHAR_ONE.test(cp);   // one CODE POINT (a surrogate pair for the tags), never a lone UTF-16 unit
export function foldText(s) {
  if (s == null) return '';
  let t = String(s).replace(FORMAT_CHARS, '');   // P76/P80: every format character but the soft hyphen dropped FIRST, before every other step (U+FEFF is whitespace to JS's \s — it must never become a space)
  t = t.normalize('NFKC');
  t = t.replace(/`/g, '');                     // backticks dropped (README ~01:05 UTC: "`cachedGrowthBookFeatures` LOCAL CACHE")
  // THE HYPHEN CLAUSE as re-drawn by P62 (studio-spec 7d866ecf; both
  // admins' word, README 2c3acdc4 + 96b93da2, 2026-09-29 20:0x CDT). Three
  // things share the surface "-" between two letters: a word broken at a
  // line end ("pur-\nposes"), a hyphenated name ("Rendell-Baker"), and an
  // em/en dash between words — real or hyphen-ENCODED, as the LoC layers
  // write Lujan's "government-claiming". (a) a hyphen or any dash directly
  // between two letters folds to "-" and is KEPT (both sides alike, so a
  // quote ending at "government" keeps its token boundary); (b) a RAW
  // hyphen-class character (U+002D, U+2010, U+2011) between letters and
  // followed by whitespace is a line-end break, dropped with the whitespace
  // — tested BEFORE dash normalisation, so an em dash at a break stays a
  // dash and joins ("government—\nclaiming" → "government-claiming") while
  // "pur-\nposes" → "purposes" and the LoC "government-\nclaiming" →
  // "governmentclaiming", which the matcher's one retry (c) finds; (b) runs
  // before the dash-at-a-break join. Digits, identifier hyphens ("D-20",
  // "ECF 70-1 at 43-45"), the join ("Id. at 38–\n39" → "Id. at 38-39") and
  // the spaced dash are unchanged.
  t = t.replace(HYPHEN_BREAK, '');
  t = t.replace(/­/g, '');                     // soft hyphen: gone — AFTER (b), so a soft hyphen at a line-end break joined the word above (P74); anywhere else it simply vanishes
  t = t.replace(DASHES, '-');
  t = t.replace(/(?<=\S)-\s+(?=\S)/gu, '-');
  t = t.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

// ---------------------------------------------------------------- page chrome
// Applied to the PAGE side only, never to the query (2ee3c4f8's finding: a
// query that wraps so a bare number starts a line — "TAC ¶¶ 23(f),\n36" —
// must keep its "36"). Before COUNTING occurrences on a page both readers
// drop the page's chrome: the CM/ECF stamp line every filed page carries
// ("Case 1:25-cv-02735-ACR Document 74 Filed 09/12/26 Page 20 of 60"), a
// bare page-number footer, and a leading line-number column on pleading
// paper (a text item that is only a 1–2 digit number). Pinned by the shared
// fixture's `page_chrome` cases.
// P97 (studio-spec 7d866ecf's spec row § 7.1, the MN lane): the D. Minn. form
// of the same stamp — "CASE 0:26-cv-02594-LMP-DJF Doc. 37 Filed 10/07/26 Page
// 1 of 10" (pdf.js hands it as the DDC's four pieces on one baseline, measured
// on MN2594-037 pp. 1–2 and MN2594-001 p. 1) — so: the court's capitals under
// the i flag (the checker carried re.I already; a latent two-readers difference
// closed), up to two judge suffixes, and `Doc.` beside `Document`.
const STAMP_LINE = /^Case \d+:\d+-[a-z]{2}-\d+(?:-[A-Z0-9]+){0,2}\s+Doc(?:ument|\.) \d+(?:-\d+)?\s+Filed \d{2}\/\d{2}\/\d{2,4}\s+Page \d+ of \d+$/i;
// R3 (website-developer f28bb754, measured on ECF 74, 77 and 51-54): pdf.js
// hands the stamp as FOUR items — "Case 1:25-cv-02735-ACR" | "Document 74" |
// "Filed 08/28/26" | "Page 20 of 60" — so each fragment is chrome when it is
// a whole item; the checker strips the whole line, and the two readers'
// page text then agree.
const STAMP_FRAG = /^(?:Case \d+:\d+-[a-z]{2}-\d+(?:-[A-Z0-9]+){0,2}|Doc(?:ument|\.) \d+(?:-\d+)?|Filed \d{2}\/\d{2}\/\d{2,4}|Page \d+ of \d+)$/i;
// P97: THE EIGHTH CIRCUIT HEADER on every appeal page's layer ("Appellate Case:
// 26-1615 Page: 1 Date Filed: 05/12/2026 Entry ID: 5639443 RESTRICTED"; absent
// from the mirrors, so the readers disagreed on 26-1615). pdf.js hands it as
// THREE items on one baseline — "Appellate Case: 26-1615" | "Page: 1" | "Date
// Filed: 05/12/2026 Entry ID: 5639443 RESTRICTED" (26-1615_Brief pp. 2–3; the
// cover carries none) — which the line join rebuilds whole; pdftotext hands two
// lines with "Page: 1" apart. The whole line and each fragment as a whole line.
const APPEAL_LINE = /^Appellate Case:\s+\d+-\d+\s+Page:\s+\d+\s+Date Filed:\s+\d{2}\/\d{2}\/\d{4}\s+Entry ID:\s+\d+(?:\s+RESTRICTED)?$/;
const APPEAL_FRAG = /^(?:Appellate Case:\s+\d+-\d+(?:\s+Page:\s+\d+)?|Page:\s+\d+|Date Filed:\s+\d{2}\/\d{2}\/\d{4}(?:\s+Entry ID:\s+\d+)?(?:\s+RESTRICTED)?|Entry ID:\s+\d+(?:\s+RESTRICTED)?|RESTRICTED)$/;
const LINE_NUMBER = /^-?\s*\d{1,3}\s*-?$/;              // a bare page number, dashed or not ("- 12 -"); THREE digits since P70 (ECF 51 is 268 pages: '179' survived the fold and sat between a wrap head and the seam)
const PAGE_MARKER = /^\*\*\[Page \d+\]\*\*/;           // machine_read's page marker (the stamp follows in italics)
// a leading line-number COLUMN on pleading paper: "12  The record shows…" —
// the number and its two-plus spaces are chrome, the line's text stays
const LINE_PREFIX = /^\s{0,4}\d{1,2}\s{2,}/;
// P60 (studio-spec's checker, README 22569b51): the converter's other markdown,
// never printed — a RULE line ("---"/"***"/"___" alone; a mirror's rule glued
// to "Ex. A-" by the dash-join hid a wrap split) is page chrome; a HEADING
// MARK at a line's start ("### (D.D.C. 2012)" inside a wrapped TOA entry) is
// stripped with the emphasis ("#hashtag" is kept — the mark needs a space or
// the end after the hashes). Page side only.
const RULE_LINE = /^\s*(?:[-*_]\s*){3,}$/;
// A v2 mirror's HTML comment LINE ("<!-- low-confidence extraction (dict-ratio
// 0.25; fallback did not improve) -->" opening a page) is converter chrome
// like the rule line (P65, checker 64ff825f; b0d76502 live at cf561f42: 069's
// regenerated page 5 opened with one and the Hammond TOA tail no longer
// BEGAN the page). Whole-line only — a comment inside a text line stays
// text. pdf.js never hands one; the fixture pins the agreement.
const HTML_COMMENT_LINE = /^\s*<!--.*-->\s*$/;
const HEADING_MARK = /^\s*#{1,6}(?:\s+|$)/;
// P81 — THE U.S. REPORTS RUNNING HEADS (README 761656fd l.50: admin 69183d38
// on studio-spec 7d866ecf's census of 5,555 shelf pages and this seat's of
// 8,669 head lines as pdf.js hands them, with this seat's four bounds from a
// 1-in-6 every-line sample; 2ee3c4f8's word). Page side, both readers; the
// forms are the checker's (tools/ourstudio_tools/casereview_text.py), ported
// verbatim. (1) a WHOLE-LINE head is chrome at any position — a folio glued
// before or after it, a reporter tag before or after (one or two spaces, or
// glued), a double period allowed. pdf.js hands a head as its OWN line, never
// glued to the body below, so (2) the prefix strip is the checker's alone.
// (3) three shapes are chrome only by the PAGE, in chromeLines: the case-name
// head (period OPTIONAL — the modern slip's has none), its two-line form, the
// volume line WITH a page ('343 U. S. 579.') and the split term line as a pair
// ('OCTOBER TERM,' | '1903.'; the year alone is a section number at an OLRC
// page head) — within a page's first four kept lines only, since a body
// citation fills a line in those shapes and a filing's caption is 'JOSEPH
// KIRCHNER,'; the split separate-opinion head is the PAIR 'FRANKFURTER,' +
// 'J., dissenting.', the name line never alone ('German Empire,' is body) and
// never with a tag ('Hume, 115 U. S. 519.' is a citation). The date bracket
// 'Oct. 1876.]' is a head at any position (the old prints' item stream hands
// it at the foot). The viewer collapses whitespace runs before the head test
// (an OCR layer hands 'U.  S.'); the fixture's cases carry single spaces.
const US_MONTHS = 'OCTOBER|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|NOVEMBER|DECEMBER';
const US_JUSTICE = "[A-Z][A-Za-z']+(?: [A-Z][A-Za-z']+)?";
const US_TERM = `(?:${US_MONTHS}),? TE\\.?RI?M,? \\d{1},?\\d{3}[.']?`;   // the term line; the OCR's 'TERIM', 'TE.RM', 'OCTOBER, TERM', '1,895.', "1973'" (P81a: 5 of 41 glued heads hid behind one)
const US_HEAD = US_TERM
  + '|Opinion of the [Cc]ourt\\.?'
  + '|Syllabus\\.?|Per Curiam\\.?|Opinion in Chambers\\.?'
  + `|Opinion of ${US_JUSTICE}(?:, ${US_JUSTICE})*(?:,? and ${US_JUSTICE})?, ?(?:C\\. ?)?JJ?\\.,?`     // 'Opinion of BRENNAN, J.', 'Opinion of WARREN, C. J.', 'Opinion of STEWART, POWELL, and STEVENS, JJ.'
  + `|Opinion of ${US_JUSTICE},`                                                                    // the split form's first line 'Opinion of BRENNAN,'
  + "|[A-Za-z' ]+, ?(?:C\\. ?)?J\\.,? (?:dissenting|concurring)[A-Za-z ,]*\\.?"                      // 'Breyer, J., dissenting', 'Vins on , C. J., dissenting.'
  + '|(?:C\\. ?)?J\\., (?:dissenting|concurring)[a-z ,]*\\.?'                                        // the split head's second line
  + "|Appendix to [Oo]pinion of [A-Za-z ,.']+|APPENDIX TO OPINION OF [A-Z ,.']+"
  + `|Statement of ${US_JUSTICE}(?:, ${US_JUSTICE})*(?:,? and ${US_JUSTICE})?, ?(?:C\\. ?)?JJ?\\.,?(?: (?:from|respecting) the (?:denial|grant) of (?:certiorari|rehearing|a stay|the stay|summary reversal))?`   // P81d: the orders pages' 'Statement of SOTOMAYOR, J., respecting the denial of certiorari' head, whole line
  + '|Statement of (?:the [Cc]ase|[Ff]acts)\\.?'
  + '|Argument for (?:Appellants?|Petitioners?|Respondents?|Defendants? in Error|Plaintiffs? in Error|the United States)\\.?'
  + '|Counsel(?: for Parties)?\\.?|Page Proof Pending Publication|\\(Slip Opinion\\)'
  + '|Cite as: \\d{1,3} U\\. ?S\\. ?(?:\\d{1,4}|_+)? ?\\(\\d{4}\\)'
  + '|CASES IN THE SUPREME COURT|OF THE UNITED STATES\\.?|SUPREME COURT(?: U\\. ?S\\.)?\\.?|CASES ADJUDGED';
const US_TAG = '(?: ?\\d{1,3} ?U\\. ?S\\.)';                       // the reporter tag beside a head: '266 U. S.', '289U.S.'
const US_FOLIO_BEFORE = '(?:\\d{1,4}\\.? )?';                       // '103 ' or '103. '
const US_HEAD_LINE = new RegExp(`^${US_FOLIO_BEFORE}${US_TAG}? ?(?:${US_HEAD})\\.?${US_TAG}?(?: \\d{1,4})?$`);
const US_HEAD_MISC = /^[A-Z][a-z]{2,4}\.? \d{4}\.\]$|^\d{1,3} ?U\. ?S\.$|^\d{1,3}[Uu][Ss]\d{1,4}(?:\$\d+z)?\b.*$|^Unit: \$+U\d{1,3}\b.*$/;   // the old date bracket (at the foot too); the bare volume line; the LoC file marks
const US_VOLUME_WITH_PAGE = /^\d{1,3} ?U\. ?S\. ?\d{1,4}\.?$/;      // '343 U. S. 579.' — a citation fills a line in this shape: first four only
const US_TERM_SPLIT_HEAD = new RegExp(`^(?:${US_MONTHS})(?: TERM,)?$`);   // 'OCTOBER TERM,' | '1903.' or 'JANUARY' | 'TERM, 1844.'
const US_TERM_SPLIT_TAIL = /^(?:TERM, )?\d{4}\.?$/;                   // the year alone is chrome ONLY as that pair
const US_DATE_BRACKET = /^[A-Z][a-z]{2,4}\.? \d{4}\.\] /;
const CASE_NAME_LOWER_OK = /\bv\.|\bet al\.|\bEx parte\b|\bIn re\b|\bex rel\./g;
const CASE_NAME_MARK = /(?: v\. | V\. |^Ex parte |^In re )/;
const UPPER_LINE = /^[A-Z0-9&'\u2019.,\-() ]+$/;
const SPLIT_NAME = /^[A-Z][A-Z' ]+,$/;
const SPLIT_TAIL = /^(?:C\. ?)?J\., (?:dissenting|concurring)/;
const HEAD_LINES = 4;                                                // the page-bound shapes live in a page's first four kept lines
// P81 (2): the mirror glues a head into the body's first line ('Opinion of
// the Court. 289 U.S. troversy."'); the prefix is stripped up to the head's
// period or the tag after it, at most twice (a term line and an opinion head
// can stand together). pdf.js never hands the shape; the shared fixture's
// wrap case (Levering 105→106) is read by both readers, so the viewer
// carries the strip at every place a page line's head is built.
const US_HEAD_PREFIX_PERIOD = new RegExp(`^${US_FOLIO_BEFORE}${US_TAG}? ?(?:${US_HEAD})(?:\\.?${US_TAG}|(?<=\\.)) (?=\\S)`);   // P81's rule for any other line: up to the period or the tag
// P81a (README e54c71e1 l.50, admin 69183d38 on d735a78c's measure of the
// ten re-cuts): the mirror glues the modern prints' PERIODLESS heads onto
// the body ('Cite as: 520 U. S. 154 (1997) Opinion of the Court which…',
// '226 BOND v. UNITED STATES Ginsburg, J., concurring the federal…'), so on
// a page's FIRST kept line each form is stripped to ITS OWN END — the period
// where it has one, the tag where one follows, none where the form has none
// — up to three in a row. Bounds from 7d866ecf's exposure measure over every
// document kind: the strip runs on the first kept line only (deeper it would
// eat 'J., dissenting in Springer v. …', a footnote's 'M.L.B. v. S.L.J., 519
// U.S. 102'); a form whose words are prose ('Counsel for Petitioners:',
// 'SUPREME COURT OF THE UNITED STATES', 'Statement of Facts') only through
// its period; the separate-opinion head to its bounded phrase; the CASE-NAME
// run a prefix only when a second head form or the reporter tag FOLLOWS it
// (a page-1 title or an attachment's table row 'DOGE v. SG X X X X
// Discovery' stays). The checker's strip_running_head(line, first) verbatim.
const US_JUSTICES = `${US_JUSTICE}(?:, ${US_JUSTICE})*(?:,? and ${US_JUSTICE})?`;
// P81c (8a7e7add): the tail is a GRAMMAR — one or two clauses joined by ' and ', each dissenting/concurring, then the judgment/result group, then 'in part', each optional. P81d (6cc36e97 + f188bebe): the orders pages' heads — a clause may carry 'from | respecting the denial | grant of certiorari | rehearing | a stay | the stay | summary reversal', or be that phrase alone, or 'in chambers'; and the 'Statement of <NAMES>, J., respecting the denial of certiorari' head in both the whole-line and the prefix lists. The checker's _SEP_ORDER/_SEP_CLAUSE/_SEP_TAIL verbatim.
const US_SEP_ORDER = '(?:from|respecting) the (?:denial|grant) of (?:certiorari|rehearing|a stay|the stay|summary reversal)';
const US_SEP_CLAUSE = `(?:(?:dissenting|concurring)(?: in (?:the )?(?:judgment|result))?(?: in part)?(?: ${US_SEP_ORDER})?|${US_SEP_ORDER}|in chambers)`;
const US_SEP_TAIL = `${US_SEP_CLAUSE}(?: and ${US_SEP_CLAUSE})?\\.?`;
const US_PREFIX_FORMS = US_TERM
  + '|Cite as: \\d{1,3} U\\. ?S\\. ?(?:\\d{1,4}|_+)? ?\\(\\d{4}\\)'
  + '|Opinion of the [Cc]ourt\\.?|Syllabus\\.?|Per Curiam\\.?|Opinion in Chambers\\.?|\\(Slip Opinion\\)'
  + `|Opinion of ${US_JUSTICES}, ?(?:C\\. ?)?JJ?\\.,?`
  + `|${US_JUSTICES}, ?(?:C\\. ?)?JJ?\\.,? ${US_SEP_TAIL}`
  + `|(?:C\\. ?)?J\\., ${US_SEP_TAIL}`
  + `|Appendix to [Oo]pinion of (?:the Court|${US_JUSTICES}, ?(?:C\\. ?)?JJ?\\.)\\.?`
  + `|Statement of ${US_JUSTICES}, ?(?:C\\. ?)?JJ?\\.,?(?: ${US_SEP_ORDER})?`   // P81d: 'Statement of SOTOMAYOR, J., respecting the denial of certiorari'
  + '|(?:Statement of (?:the [Cc]ase|[Ff]acts)|Argument for [A-Za-z ]+?|Counsel(?: for Parties)?|CASES IN THE SUPREME COURT|OF THE UNITED STATES|SUPREME COURT(?: U\\. ?S\\.)?|CASES ADJUDGED)\\.';
const US_CASE_TOKEN = "[A-Z0-9&'\u2019.,\\-()]+";
const US_CASE_RUN = `(?:${US_CASE_TOKEN} )+v\\. ${US_CASE_TOKEN}(?: ${US_CASE_TOKEN})*`;
const US_HEAD_PREFIX = new RegExp(`^${US_FOLIO_BEFORE}${US_TAG}? ?(?:${US_PREFIX_FORMS})${US_TAG}?(?: \\d{1,4})? (?=\\S)`);
const US_CASE_NAME_PREFIX = new RegExp(`^${US_FOLIO_BEFORE}(?:${US_CASE_RUN}|Ex parte ${US_CASE_TOKEN}(?: ${US_CASE_TOKEN})*|In re ${US_CASE_TOKEN}(?: ${US_CASE_TOKEN})*)${US_TAG}?(?: \\d{1,4})? (?=${US_TAG.slice(3, -1)} |${US_PREFIX_FORMS})`);
/** The length of the running-head prefix a page line's head carries: on the
 *  page's FIRST kept line (first = true) each form to its own end, three at
 *  most; elsewhere P81's period-or-tag rule, twice at most. */
export function runningHeadPrefixLen(s, first = false) {
  let n = 0;
  if (!first) {
    for (let k = 0; k < 2; k++) { const m = US_HEAD_PREFIX_PERIOD.exec(s.slice(n)); if (!m) break; n += m[0].length; }
    return n;
  }
  for (let k = 0; k < 3; k++) { const m = US_CASE_NAME_PREFIX.exec(s.slice(n)) || US_HEAD_PREFIX.exec(s.slice(n)); if (!m) break; n += m[0].length; }
  return n;
}
export function stripRunningHead(s, first = false) { s = String(s == null ? '' : s); return s.slice(runningHeadPrefixLen(s, first)); }
/** A line's text as the head tests read it: the line-number column and the
 *  emphasis stripped, whitespace runs collapsed, trimmed (never folded). */
function headText(raw) {
  return stripEmphasis(String(raw == null ? '' : raw).replace(LINE_PREFIX, '')).replace(/\s+/g, ' ').trim();
}
/** P81 (3): the odd-page case-name head — under 90 characters, upper case
 *  but for 'v.', 'et al.', 'Ex parte', 'In re', 'ex rel.', carrying ' v. '
 *  or beginning 'Ex parte' / 'In re'; the period optional, a folio or the
 *  old date bracket before it allowed. A PAGE-bound test (chromeLines). */
export function isCaseNameHead(line) {
  let s = headText(line).replace(US_DATE_BRACKET, '').replace(/^\d{1,4} /, '');
  if (!s || s.length > 90 || /[a-z]/.test(s.replace(CASE_NAME_LOWER_OK, ''))) return false;
  return CASE_NAME_MARK.test(s) && UPPER_LINE.test(s.replace(CASE_NAME_LOWER_OK, ''));
}
/** P81: the indices of a page's lines that are chrome — one walk in reading
 *  order: the whole-line forms at any position (isPageChrome), the split
 *  head as its PAIR, and within the first HEAD_LINES kept lines the case-name
 *  head (one line or two), the volume line with a page and the split term
 *  pair. `kept` = not chrome by the whole-line forms and not empty after the
 *  strip; a blank line is neither kept nor reported. The checker's
 *  chrome_lines is the same walk; the fixture's `page_head` pins both. */
export function chromeLines(rawLines) {
  const lines = (rawLines || []).map(r => String(r == null ? '' : r));
  const stripped = lines.map(headText);
  const drop = new Set();
  for (let i = 0; i < lines.length; i++) if (stripped[i] && isPageChrome(lines[i])) drop.add(i);
  let keptSeen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue;
    const s = stripped[i];
    if (!s) continue;
    let nxt = null; for (let j = i + 1; j < lines.length; j++) if (stripped[j]) { nxt = j; break; }   // the next non-empty line, chrome or not (the pair's tail is chrome by itself)
    if (SPLIT_NAME.test(s) && nxt !== null && SPLIT_TAIL.test(stripped[nxt])) { drop.add(i); drop.add(nxt); continue; }
    if (keptSeen < HEAD_LINES && US_TERM_SPLIT_HEAD.test(s) && nxt !== null && US_TERM_SPLIT_TAIL.test(stripped[nxt])) { drop.add(i); drop.add(nxt); continue; }
    if (keptSeen < HEAD_LINES) {
      if (nxt !== null && (/\b[vV]\.$/.test(s) || (s.endsWith('-') && CASE_NAME_MARK.test(s))) && UPPER_LINE.test(s.replace(CASE_NAME_LOWER_OK, ''))
          && UPPER_LINE.test(stripped[nxt].replace(CASE_NAME_LOWER_OK, '')) && /[A-Z]/.test(stripped[nxt])) { drop.add(i); drop.add(nxt); continue; }   // the two-line case name FIRST: '… RESOURCES v.' | 'UNITED STATES EX REL. STEVENS'; or broken at a hyphen: 'FRIENDS OF EARTH, INC. v. LAIDLAW ENVI-' | 'RONMENTAL SERVICES (TOC), INC.' (P81a)
      if (isCaseNameHead(s) || US_VOLUME_WITH_PAGE.test(s)) { drop.add(i); continue; }
    }
    keptSeen++;
  }
  return drop;
}
export function isPageChrome(text) {
  const f = foldText(text);
  const raw = String(text == null ? '' : text);
  if (f === '' || STAMP_LINE.test(f) || STAMP_FRAG.test(f) || APPEAL_LINE.test(f) || APPEAL_FRAG.test(f) || LINE_NUMBER.test(f) || PAGE_MARKER.test(f) || RULE_LINE.test(raw) || HTML_COMMENT_LINE.test(raw)) return true;
  const head = headText(raw);                                        // P81 (1): a U.S. Reports running head, whole line
  return US_HEAD_LINE.test(head) || US_HEAD_MISC.test(head);
}
/** The page-side text of an item: chrome lines → '', a line-number prefix
 *  stripped, then folded. Never applied to a query. */
export function pageText(raw) {
  if (isPageChrome(raw)) return '';
  return itemText(raw);
}
/** A PIECE of a page line, folded (the line-number column and the emphasis
 *  markers stripped) WITHOUT the chrome test — chrome is a property of the
 *  LINE, never of a piece (measured on ECF 74, 2026-09-29: pdf.js hands
 *  "256" | "–" | "57" as three items and "57" alone looked like a bare page
 *  number, so the page read "256-(2006)"; "ECF No. 50-" | "1" lost its "1";
 *  page 14's first item "57" made the wrap-split tail unfindable). */
export function itemText(raw) {
  return foldText(stripRunningHead(stripEmphasis(String(raw == null ? '' : raw).replace(LINE_PREFIX, ''))));   // P81 (2): a glued running head off the line's head
}
// Markdown EMPHASIS in a machine_read mirror is the converter's doing, never
// printed (P54, admins' README f12069fa; 2ee3c4f8's census: 90 bold runs in
// 43 mirrors wrap a reporter cite or a year — "306 U.S. 208, 226-27
// **(1939)**"). PAGE side only, the checker's rule: "**" and "__" always; a
// single "*" or "_" only as a PAIR wrapping a run that does not begin with a
// digit, so a WL star page ("at *3") and a word's own underscores survive.
// pdf.js never hands the markers; the rule is here so ONE fixture section
// serves both readers.
const EMPHASIS_DOUBLE = /\*\*|__/g;
const EMPHASIS_SINGLE = /(?<![\p{L}\p{N}_])([*_])(?!\p{Nd})([^*_\n]+?)\1(?![\p{L}\p{N}_])/gu;
export function stripEmphasis(line) {
  return String(line == null ? '' : line).replace(HEADING_MARK, '').replace(EMPHASIS_DOUBLE, '').replace(EMPHASIS_SINGLE, '$2');
}
export function stripPageChrome(items) {
  return (items || []).filter(it => !isPageChrome(it && it.str));
}

// ---------------------------------------------------------------- the TSV
/** Parse a <DOC>_LINKS.tsv text. Returns {rows, errors, header}. Columns are
 *  matched BY NAME after synonym folding; a header missing a required field
 *  is a contract violation and yields no rows (the reader never guesses).
 *  Numeric fields parse to numbers; a blank target_page / target_page_end
 *  is null; src_occ defaults to 1. Each row gets `k` (1-based position among
 *  the rows sharing its unit), `unit` = "<src_page>/<src_occ>" and a
 *  unit_id when the file carried none. */
export function parseLinksTsv(text) {
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) return { rows: [], errors: ['empty file'], header: [] };
  const rawHeader = lines[0].split('\t');
  const header = rawHeader.map(h => SYNONYMS[h] || h);
  const missing = FIELDS.filter(f => !header.includes(f));
  if (missing.length) {
    return { rows: [], header, errors: [`header lacks ${missing.join(', ')} — got [${rawHeader.join(' | ')}]`] };
  }
  const unknown = header.filter(h => !FIELDS.includes(h) && !OPTIONAL.includes(h));
  if (unknown.length) errors.push(`header has unknown column(s) ${unknown.join(', ')} (ignored)`);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  const kOf = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const cells = line.split('\t');
    if (cells.length !== header.length) {
      errors.push(`line ${i + 1}: ${cells.length} cells, expected ${header.length}`);
      continue;
    }
    const get = (f) => (col[f] == null ? '' : cells[col[f]]);
    const r = { line: i + 1 };
    for (const f of FIELDS) r[f] = get(f);
    if (col.unit_id != null) r.unit_id_in_file = get('unit_id');   // read for the record; the id itself is derived
    r.target_quote = col.target_quote != null ? get('target_quote') : '';
    const srcPage = parseInt(r.src_page, 10);
    if (!Number.isFinite(srcPage) || srcPage < 1) { errors.push(`line ${i + 1}: src_page '${r.src_page}' is not a page`); continue; }
    r.src_page = srcPage;
    const occ = r.src_occ === '' ? 1 : parseInt(r.src_occ, 10);
    r.src_occ = Number.isFinite(occ) && occ >= 1 ? occ : 1;
    r.target_page = r.target_page === '' ? null : parseInt(r.target_page, 10);
    if (r.target_page !== null && !Number.isFinite(r.target_page)) { errors.push(`line ${i + 1}: target_page '${get('target_page')}' is not a page`); continue; }
    r.target_page_end = r.target_page_end === '' ? null : parseInt(r.target_page_end, 10);
    if (r.target_page_end !== null && !Number.isFinite(r.target_page_end)) r.target_page_end = null;
    if (!KINDS.includes(r.kind)) errors.push(`line ${i + 1}: kind '${r.kind}' is not in the contract (kept)`);
    if (!STATUSES.includes(r.status)) errors.push(`line ${i + 1}: status '${r.status}' is not in the contract (kept)`);
    r.unit = `${r.src_page}/${r.src_occ}`;
    const ukey = `${r.src_page} ${foldText(r.src_quote)} ${r.src_occ}`;
    r.k = (kOf.get(ukey) || 0) + 1;
    kOf.set(ukey, r.k);
    r.unit_id = unitIdFor(r.src_doc, r.src_page, r.src_occ, r.k, foldText(r.src_quote));   // always derived (P52), never read from a row
    rows.push(r);
  }
  return { rows, errors, header };
}

/** Group rows into UNITS: one per (src_page, folded text, n) — the printed
 *  box — each with its targets in row order. `units` in (page, line) order;
 *  `byPage` maps a page to its units; `byCite` maps "<page>/<n>" to a unit. */
export function unitsOf(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.src_page}/${r.src_occ}/${foldText(r.src_quote)}`;
    let u = map.get(key);
    if (!u) {
      u = { key, cite: r.unit, q: foldText(r.src_quote), page: r.src_page, text: r.src_quote, n: r.src_occ, targets: [], line: r.line };
      map.set(key, u);
    }
    u.targets.push(r);
  }
  const units = [...map.values()].sort((a, b) => a.page - b.page || a.line - b.line);
  const byPage = new Map();
  const byKey = new Map();
  for (const u of units) {
    if (!byPage.has(u.page)) byPage.set(u.page, []);
    byPage.get(u.page).push(u);
    byKey.set(u.key, u);
  }
  return { units, byPage, byKey };
}

/** The unit a deep link names (R2, f28bb754): cite = <page>/<n>[/<k>] plus
 *  q = the folded text — n counts occurrences of ONE text, so a page with
 *  several citations has several units at n=1. With q the unit is exact;
 *  without q the FIRST unit on that page in reading order answers and
 *  `assumed` says so. null when nothing is there. */
export function unitForCite(unitsIndex, cite) {
  if (!unitsIndex || !cite) return null;
  if (cite.q) {
    const u = unitsIndex.byKey.get(`${cite.page}/${cite.n}/${foldText(cite.q)}`);
    return u ? { unit: u, assumed: false } : null;
  }
  const onPage = unitsIndex.byPage.get(cite.page) || [];
  const u = onPage.find(x => x.n === cite.n) || onPage[0];
  return u ? { unit: u, assumed: true } : null;
}

/** The chip's colour is the WEAKEST target's status, so a unit with one
 *  unresolved target shows it. */
export function unitStatus(u) {
  const s = new Set(u.targets.map(t => t.status));
  if (s.has('unresolved')) return 'unresolved';
  if (s.has('mapped')) return 'mapped';
  return 'verified';
}

// ---------------------------------------------------------------- pages
/** pdf page (1-based) for a target page in the TARGET'S OWN numbering —
 *  stamped for an ECF document, printed (the reporter page) for a shelf
 *  opinion or statute — under the registry row's `offset` (a constant:
 *  pdf = page + offset; "unstamped" = the pdf index IS the page) or
 *  `pagemap` (printed → pdf, the lane's _pagemaps shape: an object of page
 *  → pdf page, or {pages: {...}}); null when the page is blank or the map
 *  has no entry. The registry asserts this once (the checker's pdf_page is
 *  the same rule); a drafter and the viewer never do. */
/** A map keyed by section / chapter number (admin 2ee3c4f8's _paramaps/usc/,
 *  2026-09-29) — `sections` or `chapters` present and no `pages` OBJECT. */
export function isSectionMap(pagemap) {
  if (!pagemap || typeof pagemap !== 'object') return false;
  // the checker's is_section_map: a `sections` or `chapters` OBJECT decides alone (a `pages` object beside them does not unmake it)
  return isObj(pagemap.sections) || isObj(pagemap.chapters);
}
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isPage = (v) => Number.isInteger(v) && v >= 1;   // the checker's page_map: a positive int, never a bool, a 0 or a string

/** The pdf page a PAGE map names for an own page, or undefined when the key
 *  is absent. Three shapes (P66): bare {own: pdf}, {pages: {own: pdf}},
 *  {map: {own: {pdf: N}}} (the immunity lane's, with `verified`/`run`). */
function mappedPage(pagemap, page) {
  if (!isObj(pagemap)) return undefined;
  const pm = isObj(pagemap.pages) ? pagemap.pages : isObj(pagemap.map) ? pagemap.map : pagemap;
  const val = (v) => (isObj(v) ? v.pdf : v);
  let v = val(pm[String(page)]);
  if (!isPage(v)) {   // the checker keys by int(k): a zero-padded '005' names page 5
    v = undefined;
    for (const k of Object.keys(pm)) if (/^\d+$/.test(k) && parseInt(k, 10) === page) { const w = val(pm[k]); if (isPage(w)) { v = w; break; } }
  }
  return isPage(v) ? v : undefined;   // a 0, a string number or a bool is no entry (absent → own + offset / null)
}

/** The pdf page for a page in the target's OWN numbering (stamped, or
 *  printed for caselaw/statute): P66's rule, the checker's pdf_page is the
 *  same. A SECTION map (sections/chapters; the OLRC title maps, `pages` a
 *  COUNT) is not a page map: the page is the pdf index, whatever the offset
 *  (the registry resolves a pin through it server-side → target_pdf_page).
 *  A PAGE map: key present → its value; absent → own + offset when the
 *  offset is an int, else null. No map: 'unstamped' → own; int offset →
 *  own + offset; null offset (not read yet) → null, never a guess. The
 *  registry asserts this once; a drafter and the viewer never do. */
export function pdfPageFor(page, offset, pagemap = null) {
  if (page == null) return null;
  if (isSectionMap(pagemap)) return page >= 1 ? page : null;
  const hit = mappedPage(pagemap, page);
  if (hit !== undefined) return hit >= 1 ? hit : null;
  if (offset === 'unstamped') return page >= 1 ? page : null;   // the pdf index IS the page (the blessing's words)
  if (!Number.isFinite(+offset) || offset === null || offset === '' || typeof offset === 'boolean') return null;
  const p = page + (+offset);
  return p >= 1 ? p : null;
}

// ---------------------------------------------------------------- fold with provenance
// FOLD WITH PROVENANCE (the measured boxes, frontend-developer b0d76502,
// 2026-09-29; moved here from casereview_pdf.js beside the fold it replays):
// the locator works on the FOLDED item text, so a span's character range is
// folded offsets — to measure the glyphs the text layer drew for exactly
// those characters, each folded character must know the RAW index it came
// from. foldMap replays pageText step by step (the line-number column and the
// emphasis markers on the page side, NFKC per code point, soft hyphens and
// backticks dropped, the dash classes, the hyphen clause, quotes, whitespace
// runs, trim) carrying the map, and its text is CHECKED against pageText /
// foldText before it is trusted: a difference (NFKC composing across code
// points, a rule drifting here) means the item keeps its proportional box.
// Pinned by the harness over every fixture fold, chrome and page case.
const DASH = /[‐‑‒–—−]/;
const MARK = /\p{M}/u;                                   // a combining mark rides its base through NFKC
export function foldMap(raw, { page = true, chrome = true } = {}) {
  const src = String(raw == null ? '' : raw);
  let s = src, base = 0;
  let ch = [], map = [];
  if (page) {
    // chrome is a property of the line (chromeItems); a PIECE is measured with chrome:false
    if (chrome && isPageChrome(s)) return { text: '', map: [], ok: true };
    const m = LINE_PREFIX.exec(s);
    if (m) { base = m[0].length; s = s.slice(base); }
    const r = runningHeadPrefixLen(s);                                  // P81 (2): the mirror's glued head, the map following the deletion
    if (r) { base += r; s = s.slice(r); }
  }
  // 0. the emphasis markers on the page side (stripEmphasis's two passes,
  //    each over the text as it stands, the map following the deletions)
  let units = []; for (let i = 0; i < s.length; i++) units.push({ c: s[i], i: base + i });
  if (page) {
    for (const re of [HEADING_MARK, EMPHASIS_DOUBLE, EMPHASIS_SINGLE]) {
      const text = units.map(u => u.c).join('');
      const drop = new Set();
      const ms = re === HEADING_MARK ? (HEADING_MARK.test(text) ? [text.match(HEADING_MARK)] : []) : [...text.matchAll(re)];
      for (const m of ms) {
        if (re === EMPHASIS_SINGLE) { drop.add(m.index); drop.add(m.index + m[0].length - 1); }
        else { for (let k = 0; k < m[0].length; k++) drop.add(m.index + k); }
      }
      if (drop.size) units = units.filter((_, k) => !drop.has(k));
    }
  }
  // 0b. P76/P80: every format character but the soft hyphen dropped before
  //     anything else (the map stays monotonic through the deletion) — tested
  //     per CODE POINT: a tag U+E0001–E007F is a surrogate pair in these
  //     UTF-16 units, and a lone half is never Cf
  {
    const kept = [];
    for (let k = 0; k < units.length;) {
      const hi = units[k].c.charCodeAt(0);
      const pair = hi >= 0xd800 && hi <= 0xdbff && k + 1 < units.length;
      const cp = pair ? units[k].c + units[k + 1].c : units[k].c;
      if (!isFormatChar(cp)) { kept.push(units[k]); if (pair) kept.push(units[k + 1]); }
      k += pair ? 2 : 1;
    }
    units = kept;
  }
  // 1. NFKC per GRAPHEME — a code point WITH the combining marks that follow
  //    it (studio-spec 7d866ecf's find on Egbert v. Boule's text layer: 'a' +
  //    U+0301 on the page, the composed 'á' in the row; a per-code-point
  //    normalisation never composes the pair and the passage missed) — every
  //    output UTF-16 unit mapped to the base's source index
  for (let k = 0; k < units.length;) {
    const hi = units[k].c.charCodeAt(0);
    const pair = hi >= 0xd800 && hi <= 0xdbff && k + 1 < units.length;
    let cpStr = pair ? units[k].c + units[k + 1].c : units[k].c;
    let next = k + (pair ? 2 : 1);
    while (next < units.length && MARK.test(units[next].c)) { cpStr += units[next].c; next++; }
    const n = cpStr.normalize('NFKC');
    for (let j = 0; j < n.length; j++) { ch.push(n[j]); map.push(units[k].i); }
    k = next;
  }
  const keep = (pred) => { const c = [], m = []; for (let i = 0; i < ch.length; i++) if (pred(ch[i], i)) { c.push(ch[i]); m.push(map[i]); } ch = c; map = m; };
  // 2. backticks dropped (the soft hyphen waits for step 3 — P74)
  keep((c) => c !== '`');
  // 3. P62 (b): a RAW hyphen-class break between letters, dropped with its
  //    whitespace — before the dash classes fold (the same regex as foldText)
  { const drop = new Set();
    for (const m of ch.join('').matchAll(HYPHEN_BREAK)) for (let i = m.index; i < m.index + m[0].length; i++) drop.add(i);
    if (drop.size) keep((c, i) => !drop.has(i)); }
  // 3b. P74: soft hyphens dropped AFTER (b), as foldText does
  keep((c) => c !== '­');
  // 4. every dash class → '-'
  ch = ch.map((c) => (DASH.test(c) ? '-' : c));
  // 5. the dash-at-a-break join: the whitespace after a dash between two
  //    non-spaces deleted
  { const drop = new Set();
    for (const m of ch.join('').matchAll(/(?<=\S)-\s+(?=\S)/gu)) for (let i = m.index + 1; i < m.index + m[0].length; i++) drop.add(i);
    if (drop.size) keep((c, i) => !drop.has(i)); }
  // 6. quotes straightened
  ch = ch.map((c) => (/[‘’‚‛]/.test(c) ? "'" : /[“”„‟]/.test(c) ? '"' : c));
  // 7. a whitespace run → one space (mapped to the run's first unit); 8. trim
  { const c = [], m = []; let inRun = false;
    for (let i = 0; i < ch.length; i++) {
      if (/\s/.test(ch[i])) { if (!inRun) { c.push(' '); m.push(map[i]); inRun = true; } }
      else { c.push(ch[i]); m.push(map[i]); inRun = false; }
    }
    while (c.length && c[0] === ' ') { c.shift(); m.shift(); }
    while (c.length && c[c.length - 1] === ' ') { c.pop(); m.pop(); }
    ch = c; map = m; }
  const text = ch.join('');
  const ok = text === (page ? (chrome ? pageText(src) : itemText(src)) : foldText(src));
  return { text, map, ok };
}
/** The raw UTF-16 range [start, end) behind folded offsets from..to (inclusive). */
export function rawRange(map, from, to, raw) {
  if (from < 0 || to >= map.length || from > to) return null;
  const start = map[from], last = map[to];
  const code = String(raw).charCodeAt(last);
  const end = last + (code >= 0xd800 && code <= 0xdbff ? 2 : 1);
  return start < end ? [start, end] : null;
}

// ---------------------------------------------------------------- counting
const WORDCHAR = /[\p{L}\p{N}]/u;
export function atTokenBoundary(text, from, len) {
  const before = from > 0 ? text[from - 1] : '';
  const after = from + len < text.length ? text[from + len] : '';
  return !(before && WORDCHAR.test(before)) && !(after && WORDCHAR.test(after));
}
/** How many times `quote` occurs on a page's items under the contract's
 *  counting (folded, page chrome dropped, token boundaries, non-overlapping).
 *  Pinned by the shared fixture's `count` cases. */
export function countOccurrences(items, quote) {
  let n = 0;
  while (locateInItems(items, quote, n + 1)) n++;
  return n;
}

// ---------------------------------------------------------------- locator
/** Locate the `occ`-th occurrence of `quote` in a page's text items (pdf.js
 *  TextContent.items in reading order: {str, hasEOL}). Both sides folded;
 *  page chrome dropped on the page side only. Items are joined with ONE
 *  SPACE — the checker's rule, one counting rule for both readers (R4: the
 *  former no-separator second pass was a second rule; a citation wrapped
 *  across lines "ECF" | "74 at 40-41." joins by the space, a split
 *  identifier "D-" | "20" by the hyphen clause). Returns {items:[{index,
 *  from, to, len}], sep} — for each item the box covers, the character
 *  range inside it (so a partial item is boxed proportionally) — or null. */
export function locateInItems(items, quote, occ = 1, opts = null) {
  // opts.loose (the reader's in-pane SEARCH, never the contract): case-
  // insensitive, no token boundary, page chrome kept — a phrase is found
  // wherever it is printed. The default is the lane's counting rule.
  const loose = !!(opts && opts.loose);
  const q0 = foldQuery(quote, loose);
  if (!q0) return null;
  const folded = foldItems(items, loose);
  const run = (q, retry) => { const s = side(folded, retry); return [...occurrencesIn(s.text, q, loose)].map(start => spanOn(s, start, q.length)); };
  const hits = loose ? run(q0, false) : withHyphenRetry(q0, run);
  const h = hits[occ - 1];
  return h ? { items: h.items, sep: ' ' } : null;
}

/** The query side of the fold (lower-cased for the loose search only). */
function foldQuery(quote, loose = false) {
  const q = foldText(quote);
  return loose ? q.toLowerCase() : q;
}

/** A page's items → its ONE folded text and the char → item map. The
 *  page's RAW text is rebuilt first — chrome lines dropped (chromeItems),
 *  each line's number column stripped, pieces within a line joined by
 *  geometry (itemSeparator), lines joined by "\n" as the checker sees them
 *  — and folded ONCE with provenance (foldMap), because P62's break rule
 *  reads the RAW character at a seam: "pur-" | "poses" across a line drops
 *  its hyphen, "government—" | "claiming" keeps its dash and joins, and a
 *  piece folded on its own cannot tell the two apart. `owner[c]` is null
 *  for a separator, else {index, off (the char's position among the item's
 *  folded chars), rawOff (its UTF-16 index in the item's raw string), len}.
 *  Cached per items array (one fold per page). */
const FOLD_CACHE = new WeakMap();
export function foldItems(items, loose = false) {
  const key = items || [];
  const hit = FOLD_CACHE.get(key);
  if (hit && hit.loose === loose && !hit.pages) return hit.out;
  const r = rawOfPage(key, loose, 0);
  const out = foldRaw(r.raw, r.ownerOfRaw, loose);
  FOLD_CACHE.set(key, { loose, out });
  return out;
}

/** TWO PAGES as the checker joins them (`page_occurrences`: the page, one
 *  space, the next, folded again so the dash-join sees the seam) — each
 *  page rebuilt in ITS OWN reading order, the two raws joined by "\n", one
 *  fold with provenance; `owner[c].index` indexes the JOINED items
 *  [...a, ...b] (b's indices offset by a.length). Never fold the two pages'
 *  items as one array: readingOrder would sort BOTH pages' lines by
 *  baseline and interleave them (17d9cc4c did, 2026-09-29 — caught before
 *  a live instance: "A line one B line one A line two B line two", and a
 *  phrase across the false seam counted). Cached per (a, b) pair. */
export function foldPages(a, b, loose = false) {
  const key = joinedItems(a || [], b || []);
  const hit = FOLD_CACHE.get(key);
  if (hit && hit.loose === loose && hit.pages) return hit.out;
  const ra = rawOfPage(a || [], loose, 0), rb = rawOfPage(b || [], loose, (a || []).length);
  const seam = ra.raw && rb.raw ? '\n' : '';
  const out = foldRaw(ra.raw + seam + rb.raw, [...ra.ownerOfRaw, ...(seam ? [null] : []), ...rb.ownerOfRaw], loose);
  FOLD_CACHE.set(key, { loose, pages: true, out });
  return out;
}

/** One page's RAW text rebuilt from its items — chrome lines dropped, lines
 *  in reading order, each line's number column stripped, pieces joined by
 *  geometry, lines by "\n" — with the raw index → {index (+ indexOffset),
 *  rawOff, len} | null (a separator) map the fold carries forward. */
function rawOfPage(items, loose, indexOffset = 0) {
  const chrome = loose ? new Set() : chromeItems(items);
  let raw = '';
  const ownerOfRaw = [];                // raw index → {index, rawOff, len} | null
  for (const line of readingOrder(pageLines(items, chrome))) {
    // the line-number COLUMN as pdf.js hands it (ECF 16 p5, ECF 39 p2, measured
    // 2026-09-30): the number is its OWN piece ("3" at x=66, w=6) a column's
    // gap before the text piece (x=108) — the regex form below needs the
    // layout's two spaces inside one piece and never saw it, so "3" stayed in
    // the fold and "exhibits, 3 enabling" hid the passage; pdftotext strips it
    const parts = !loose && lineNumberPiece(items, line) ? line.parts.slice(1) : line.parts;
    parts.forEach((p, i) => {
      let piece = p.str, base = 0;
      if (!loose && i === 0) { const m = LINE_PREFIX.exec(p.str); if (m) { base = m[0].length; piece = p.str.slice(base); } }
      if (!loose && i === 0) { const r = runningHeadPrefixLen(piece, raw === ''); if (r) { base += r; piece = piece.slice(r); } }   // P81 (2): the mirror's glued head — P81a: on the page's FIRST kept line (nothing contributed yet) each form to its own end
      if (raw) {
        const sep = i === 0 ? '\n' : p.sep;
        if (sep) { raw += sep; ownerOfRaw.push(null); }
      }
      for (let k = 0; k < piece.length; k++) ownerOfRaw.push({ index: p.index + indexOffset, rawOff: base + k, len: p.str.length });
      raw += piece;
    });
  }
  return { raw, ownerOfRaw };
}

/** A line whose FIRST piece is a bare one- or two-digit number standing at
 *  least a line height and a half before the next piece (the pleading
 *  paper's line-number column, 36 pt from the text; a word gap is 3) is a
 *  numbered line: the piece is chrome. "12" then "U.S.C." a word apart is
 *  a citation and stays. */
function lineNumberPiece(items, line) {
  const ps = line.parts;
  if (ps.length < 2 || !/^\s*\d{1,2}\s*$/.test(ps[0].str)) return false;
  const a = items[ps[0].index], b = items[ps[1].index];
  const ta = a && a.transform, tb = b && b.transform;
  if (!Array.isArray(ta) || !Array.isArray(tb) || ta.length < 6 || tb.length < 6) return false;
  const ha = Math.abs(ta[3]) || Math.abs(ta[0]) || 0, hb = Math.abs(tb[3]) || Math.abs(tb[0]) || 0;
  const h = Math.max(ha, hb, 1);
  if (ha < 0.8 * hb || Math.abs(ta[5] - tb[5]) > 0.3 * h) return false;   // a footnote's own marker is smaller and RAISED (h=8 on a 12-pt line, +4.5): not a line number
  const gap = tb[4] - (ta[4] + (Number.isFinite(a.width) ? a.width : 0));
  return gap >= 1.5 * h;
}

/** The fold of a rebuilt raw text with its provenance → {text, owner, ok}. */
function foldRaw(raw, ownerOfRaw, loose) {
  const fm = loose ? foldMap(raw, { page: false }) : foldMap(raw, { page: true, chrome: false });
  let text = loose ? fm.text.toLowerCase() : fm.text;
  const owner = [];
  const seen = new Map();               // item index → folded chars counted so far
  for (let i = 0; i < text.length; i++) {
    const o = ownerOfRaw[fm.map[i]];
    if (!o) { owner.push(null); continue; }
    const off = seen.get(o.index) || 0; seen.set(o.index, off + 1);
    owner.push({ index: o.index, off, rawOff: o.rawOff, len: o.len });
  }
  // the folded spaces that stand for a LINE END between two letters — the
  // raw run behind the space (its first unit to the next folded char's) held
  // a "\n" — the only spaces retry (d) may treat as a join (README l.50)
  const lineEnds = new Set();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ' || i === 0 || i + 1 >= text.length) continue;
    if (!LETTER.test(text[i - 1]) || !LETTER.test(text[i + 1])) continue;
    if (raw.slice(fm.map[i], fm.map[i + 1]).includes('\n')) lineEnds.add(i);
  }
  // the PIECE JOINS — a folded index whose char and the char before it came
  // from two different items with nothing between them (the geometry said
  // no gap): on an OCR layer whose widths overrun, two words glued —
  // "personamjurisdiction", "School,and" — the viewer's own retry (e)
  const pieceJoins = new Set();
  for (let i = 1; i < text.length; i++) {
    const a = owner[i - 1], b = owner[i];
    if (a && b && a.index !== b.index && text[i] !== ' ' && text[i - 1] !== ' ') pieceJoins.add(i);
  }
  return { text, owner, ok: fm.ok, lineEnds, pieceJoins };
}
const LETTER = /\p{L}/u;

/** The indices of the items that belong to a CHROME LINE. Items are grouped
 *  into lines the way the join sees them (a new line at hasEOL, at another
 *  baseline, or when either item has no geometry — the fixture's lines are
 *  one item each), each line's raw text rebuilt with the same separators,
 *  and the contract's chrome test (the CM/ECF stamp line, a stamp fragment
 *  alone, a bare page number, the marker line) applied to the LINE. A
 *  stamp pdf.js hands as four pieces on one baseline is one chrome line. */
export function chromeItems(items) {
  const out = new Set();
  const lines = pageLines(items, null);
  const drop = chromeLines(lines.map(l => l.raw));                    // P81: the page pass (the pair, the first-four bound) over the per-line test
  lines.forEach((line, k) => {
    if (drop.has(k) || isPageChrome(line.raw)) for (const i of line.indices) out.add(i);
  });
  return out;
}

/** The page's items grouped into LINES, in stream order: [{indices (every
 *  item of the line, blanks included), parts: [{index, str, sep}] (the text
 *  pieces with the separator before each), raw (the line's rebuilt text),
 *  y (the baseline of its first piece), h (its tallest piece)}]. Items in
 *  `skip` are left out (the chrome lines, for the fold). One grouping for
 *  the chrome test, the fold and the boxes — the join is one rule. */
export function pageLines(items, skip = null) {
  const lines = [];
  let cur = null, prev = null, pendingSpace = false, pendingEOL = false;
  (items || []).forEach((it, index) => {
    if (skip && skip.has(index)) return;
    const str = String(it && it.str != null ? it.str : '');
    if (str && !str.trim()) { if (spaceItem(it)) pendingSpace = true; if (cur) cur.indices.push(index); return; }
    // THE EMPTY END-OF-LINE ITEM (Drejza v. Vaccaro pdf 5, read against the
    // checker's served passage, 2026-09-30 23:2x CDT): pdf.js hands a line
    // break as an EMPTY item carrying hasEOL (w=0, the next line's y), which
    // this walk skipped — so the break was invisible and sameLine alone
    // decided; a 6.5-pt small-caps run ('RESTATEMENT (SECOND) OF TORTS') at a
    // footnote line's end then reached the next line 5 pt below through the
    // superscript tolerance and the two lines' pieces interleaved. The empty
    // EOL item ends the line as pdf.js says it does. Viewer's own.
    if (!str) { if (cur) cur.indices.push(index); if (it && it.hasEOL) pendingEOL = true; return; }
    const t = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : null;
    const h = t ? (Math.abs(t[3]) || Math.abs(t[0]) || 0) : 0;
    const joins = !!prev && !pendingEOL && (sameLine(prev, it) || raisedPunctuation(cur, prev, it));
    if (!joins) {
      cur = { indices: [], parts: [], raw: '', y: t ? t[5] : NaN, h, base: NaN };
      lines.push(cur); pendingSpace = false;
    }
    pendingEOL = false;
    const sep = cur.parts.length ? itemSeparator(prev, it, pendingSpace) : '';
    cur.parts.push({ index, str, sep });
    cur.raw += sep + str; cur.indices.push(index); cur.h = Math.max(cur.h, h);
    if (!Number.isFinite(cur.base) && t && !isPunctPiece(str)) cur.base = t[5];   // the line's own baseline: its first word
    prev = it; pendingSpace = false;
  });
  for (const line of lines) orderPieces(items, line);
  return splitColumns(items, lines);
}

/** PIECES OUT OF X ORDER (measured 2026-09-30 on the shelf's two-column
 *  scans — Creative Computing 386 F.3d 930 p5 hands a baseline's pieces
 *  as x = 384, 260, 334, 292, 241, 194 …; Cruz-Packer 539 F. Supp. 2d
 *  181 p7 the same): a line whose pieces are not left-to-right is put in
 *  x order and its separators re-read from the geometry alone (the
 *  stream's hasEOL and whitespace items belong to the stream's order). A
 *  line already in x order is untouched — an ordinary page folds exactly
 *  as before. */
function orderPieces(items, line) {
  const ps = line.parts;
  if (ps.length < 2) return;
  const xs = ps.map(p => { const t = items[p.index] && items[p.index].transform; return Array.isArray(t) && t.length >= 6 ? t[4] : NaN; });
  if (xs.some(x => !Number.isFinite(x))) return;
  let ordered = true;
  for (let k = 1; k < xs.length; k++) if (xs[k] < xs[k - 1]) { ordered = false; break; }
  if (ordered) return;
  const sorted = ps.map((p, k) => ({ p, x: xs[k], k })).sort((a, b) => (a.x - b.x) || (a.k - b.k)).map(o => o.p);
  // the line's WHITESPACE items are the word spaces pdf.js measured (an OCR
  // layer's widths overlap: "$5,000" w=27.5 at x=49.7, then " " at 77.2,
  // then "floor" — the gap test alone glued them); one between two pieces
  // in x order is the space between them
  const partIdx = new Set(ps.map(p => p.index));
  const spaces = line.indices.filter(i => !partIdx.has(i) && spaceItem(items[i]) && Array.isArray(items[i].transform) && items[i].transform.length >= 6).map(i => items[i].transform[4]);
  let raw = '';
  sorted.forEach((p, k) => {
    if (k === 0) p.sep = '';
    else {
      const a = items[sorted[k - 1].index], b = items[p.index];
      const x0 = a.transform[4], x1 = b.transform[4];
      p.sep = spaces.some(x => x >= x0 && x <= x1) ? ' ' : geoSeparator(a, b);
    }
    raw += p.sep + p.str;
  });
  line.parts = sorted; line.raw = raw;
}
/** A FOOTNOTE MARKER after a piece (measured on Klayman v. Rao pdf 5,
 *  2026-09-30 22:5x CDT, the checker's served `passage` against the viewer's
 *  box): a raised small piece stays glued on the same line so the ordinal
 *  '5' | 'th' reads '5th' — but the footnote marker 'claims.' | '3' (h=8 on
 *  12, raised 4.5) took the same path, the page read 'claims.3', and the
 *  contract's token boundary (no digit after a match) refused a quote ending
 *  at 'claims.' that the checker's text layer, which writes the marker as its
 *  own token, found whole. A raised small piece of DIGITS ONLY is a marker,
 *  never an ordinal: it takes a space, as pdftotext hands it. The viewer's
 *  own reconstruction, no checker half — every oracle carries the space.
 *  THE RAISE BOUND (b0d76502's census at 796b4834 over the 758 target pages
 *  of five served tables, 126 small digits-only pieces): the filing's own
 *  markers (6.48 on 12, ECF 51) sit raised 3.6 = 0.30 h EXACTLY, and the
 *  same shape came out 3.6000000000000227 on five pages and
 *  3.599999999999966 on four — a bound at 0.3 h let float noise decide;
 *  the slips at 10.98 (Wesby, RJR) raise theirs 0.27 h. Nothing digits-only
 *  and small lies between the subscripts (dy < 0) and 0.25 h, so the raise
 *  bound is 0.2 h; the 0.6 h top and the 0.8 h height stay. */
export function footnoteMarkerSeam(prev, it) {
  const ta = prev && prev.transform, tb = it && it.transform;
  if (!Array.isArray(ta) || !Array.isArray(tb) || ta.length < 6 || tb.length < 6) return false;
  const b = String(it.str == null ? '' : it.str);
  if (!/^\s*\d{1,3}\s*$/.test(b)) return false;
  const ha = Math.abs(ta[3]) || Math.abs(ta[0]) || 0, hb = Math.abs(tb[3]) || Math.abs(tb[0]) || 0;
  const h = Math.max(ha, hb, 1), dy = tb[5] - ta[5];
  return hb <= 0.8 * h && dy > 0.2 * h && dy <= 0.6 * h;
}
/** itemSeparator by geometry alone: a space at either edge, another
 *  baseline, or a real gap. */
function geoSeparator(prev, it) {
  const a = String(prev.str == null ? '' : prev.str), b = String(it && it.str != null ? it.str : '');
  if (/\s$/.test(a) || /^\s/.test(b)) return ' ';
  const ta = prev.transform, tb = it.transform;
  const ha = Math.abs(ta[3]) || Math.abs(ta[0]) || 0, hb = Math.abs(tb[3]) || Math.abs(tb[0]) || 0;
  const h = Math.max(ha, hb, 1), dy = Math.abs(ta[5] - tb[5]);
  if (footnoteMarkerSeam(prev, it)) return ' ';
  if (dy > 0.3 * h && !(Math.min(ha, hb) <= 0.8 * h && dy <= 0.6 * h)) return ' ';
  const gap = tb[4] - (ta[4] + (Number.isFinite(prev.width) ? prev.width : 0));
  return gap > 0.25 * h ? ' ' : '';
}

/** TWO COLUMNS (the same measure): a page whose lines share baselines
 *  across a GUTTER — a vertical CHANNEL of whitespace inside the middle two
 *  fifths of the page's text width that the gaps of many lines contain
 *  (at least six, and a quarter of the lines with two or more pieces; a
 *  gap counts from three quarters of the line height — measured 0.9–1.4×
 *  on the Westlaw prints, the OCR widths imprecise) and that almost no
 *  piece crosses (at most a fifth of those lines: a centred heading, a
 *  full-width paragraph). Word gaps never line up at one x across a page;
 *  a table of authorities' entries and a contents page's dot leaders cross
 *  every x; the pleading paper's line-number column sits outside the band.
 *  → {x, lines, tol} or null. Each line is then split at the gutter into a
 *  left and a right line (a piece that straddles it keeps its line whole)
 *  and marked `col`: 'L', 'R', or null for one that spans; readingOrder
 *  reads the columns. A page with no gutter comes back as it was. */
export function pageColumns(items, lines) {
  const geo = (p) => { const it = items[p.index]; const t = it && it.transform; if (!Array.isArray(t) || t.length < 6) return null; const w = Number.isFinite(it.width) ? it.width : 0; return { x0: t[4], x1: t[4] + w }; };
  const multi = lines.filter(l => l.parts.length >= 2 && l.parts.every(p => geo(p)));
  if (multi.length < 6) return null;
  let minL = Infinity, maxR = -Infinity;
  for (const l of lines) for (const p of l.parts) { const g = geo(p); if (g) { minL = Math.min(minL, g.x0); maxR = Math.max(maxR, g.x1); } }
  if (!(maxR > minL)) return null;
  const lo = minL + 0.3 * (maxR - minL), hi = minL + 0.7 * (maxR - minL);
  const rows = multi.map(l => {
    const gs = l.parts.map(geo);
    const gaps = [];
    for (let k = 1; k < gs.length; k++) if (gs[k].x0 - gs[k - 1].x1 > 0.75 * Math.max(l.h, 1)) gaps.push([gs[k - 1].x1, gs[k].x0]);
    return { h: l.h, gaps, pieces: gs };
  });
  const cands = new Set();
  for (const r of rows) for (const [a, b] of r.gaps) { const mid = Math.round((a + b) / 2); if (mid >= lo && mid <= hi) cands.add(mid); }
  let best = null;
  for (const x of cands) {
    let joined = 0, cross = 0, near = 0, h = 0, leftOnly = 0, rightOnly = 0;
    for (const r of rows) {
      const tol = 0.25 * Math.max(r.h, 1);
      const gap = r.gaps.find(([a, b]) => x >= a && x <= b);
      if (gap) { joined++; h += r.h; if (x - gap[0] <= 2 * Math.max(r.h, 1)) near++; }
      else if (r.pieces.some(g => g.x0 + tol < x && x < g.x1 - tol)) cross++;
      // P91 (studio-spec 7d866ecf, measured on the regeneration set and the lane, 2026-10-05): a multi line ENTIRELY on one side of
      // x is consistent with a gutter there — the layer joined only a fifth to a quarter of the lines across it and left the rest
      // one-sided (Butera's 17 pages; the lane's Abdurrahman 1, 28 CFR 0.114 1). It counts as OPEN evidence when six or more
      // one-sided lines stand on EACH side (B′: a caption first page — 41 left-only, 4 right-only — is not two columns); the
      // cross test still refuses single-column prose; near is judged on the joined lines alone. Constant for constant with the
      // checker's columns_page.
      else if (r.pieces.every(g => g.x1 <= x)) leftOnly++;
      else if (r.pieces.every(g => g.x0 >= x)) rightOnly++;
    }
    const sided = leftOnly >= 6 && rightOnly >= 6 ? leftOnly + rightOnly : 0;
    const open = joined + sided;
    // the best candidate by (open + side, −cross) — the checker's order
    if (!best || open > best.open || (open === best.open && cross < best.cross)) best = { x, open, joined, cross, near, h: joined ? h / joined : 0 };
  }
  // the gate: JOINED evidence still required (six lines with a gap at x), the one-sided lines counting toward the quarter floor
  if (!best || best.joined < 6 || best.open < 0.25 * multi.length || best.cross > 0.2 * multi.length) return null;
  // TEXT COLUMNS, NOT A TABLE: a column of running text fills its lines to
  // the gutter (justified; the left column's last piece ends within two
  // line heights of the channel on most lines); a two-column TABLE's left
  // cells end wherever the cell's words end (ECF 51 stamped 9, the statute
  // table: 'Cal. Civ. Code § 1798.150' | 'CCPA Private Right of Action'),
  // and a table reads row by row as the mirror reads it — judged on the
  // JOINED lines (a one-sided line has no channel to fill to)
  if (best.near < 0.5 * best.joined) return null;
  return { x: best.x, lines: best.open, tol: 0.5 * Math.max(best.h, 1) };
}
function splitColumns(items, lines) {
  const g = pageColumns(items, lines);
  if (!g) return lines;
  for (const l of lines) l.gutter = g.x;
  const geo = (p) => { const it = items[p.index]; const t = it && it.transform; if (!Array.isArray(t) || t.length < 6) return null; const w = Number.isFinite(it.width) ? it.width : 0; return { x0: t[4], x1: t[4] + w }; };
  const out = [];
  for (const line of lines) {
    const gs = line.parts.map(geo);
    if (gs.some(x => !x)) { line.col = null; out.push(line); continue; }
    const left = [], right = []; let straddle = false;
    line.parts.forEach((p, k) => { const s = gs[k]; if (s.x1 <= g.x + g.tol) left.push(p); else if (s.x0 >= g.x - g.tol) right.push(p); else straddle = true; });
    if (straddle || !left.length || !right.length) { line.col = straddle ? null : (left.length ? 'L' : 'R'); out.push(line); continue; }
    const mk = (parts, col, indices) => { let raw = ''; parts.forEach((p, k) => { if (k > 0 && !p.sep) p.sep = geoSeparator(items[parts[k - 1].index], items[p.index]); if (k === 0) p.sep = ''; raw += p.sep + p.str; }); return { indices, parts, raw, y: line.y, h: line.h, col }; };
    const partIdx = new Set(line.parts.map(p => p.index));
    const rightIdx = new Set(right.map(p => p.index));
    const blanks = line.indices.filter(i => !partIdx.has(i));
    out.push(mk(left, 'L', [...left.map(p => p.index), ...blanks]));
    out.push(mk(right, 'R', [...rightIdx]));
  }
  return out;
}

/** The lines in READING ORDER. pdf.js hands a page's items in CONTENT-
 *  STREAM order, which is not the order on the page: ECF 69 (2026-09-29)
 *  draws the roman folio first (page 4 item 0 = "iv" at y=52.4, the foot
 *  of the page), the body after it (item 2 at y=709.7) and the CM/ECF
 *  stamp last (y=769.5) — so the page's folded text BEGAN with the folio
 *  and the TOA entry wrapping from page 3 ("Bush v. Lucas," | "462 U.S.
 *  367 (1983)") had no tail beginning the next page. The mirror and
 *  pdftotext read top to bottom and carry the folio last, where the checker
 *  found both rows. A SINGLE-COLUMN page (no two lines share a baseline)
 *  is ordered top to bottom by baseline; a page with side-by-side lines
 *  (columns, a numbered margin drawn as its own block) keeps stream order,
 *  the reader's only safe reading of it. Lines without geometry keep
 *  stream order (the fixture's lines). */
export function readingOrder(lines) {
  const ls = lines || [];
  if (ls.length < 2 || !ls.every(l => Number.isFinite(l.y))) return ls;
  const sorted = ls.map((l, i) => ({ l, i })).sort((a, b) => (b.l.y - a.l.y) || (a.i - b.i));
  // TWO COLUMNS (pageColumns): top to bottom in BANDS — a line that spans
  // the gutter closes a band; inside a band the left column's lines top to
  // bottom, then the right column's (pdftotext's reading of the same page;
  // the mirror interleaves them line by line, which is why the passage
  // standard cuts these as fragments)
  if (ls.some(l => l.col === 'L' || l.col === 'R')) {
    const out = []; let L = [], R = [];
    const flush = () => { out.push(...L, ...R); L = []; R = []; };
    for (const { l } of sorted) { if (l.col === 'L') L.push(l); else if (l.col === 'R') R.push(l); else { flush(); out.push(l); } }
    flush();
    return out;
  }
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1].l, b = sorted[k].l;
    if (Math.abs(a.y - b.y) <= 0.3 * Math.max(a.h, b.h, 1)) return ls;           // a shared baseline: not one column
  }
  return sorted.map(s => s.l);
}

/** A whitespace item that IS a word space: pdf.js also sets a zero-width
 *  " " item where a run changes size with no gap (ECF 69 p32: "116" |
 *  " " (w=0.0 at the x of the next piece) | superscript "th") — that one
 *  is not a space. An item without a width (the fixture's) is a space. */
export function spaceItem(it) {
  const str = String(it && it.str != null ? it.str : '');
  if (!str || str.trim()) return false;
  if (!Number.isFinite(it.width)) return true;
  const t = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : null;
  const size = t ? Math.max(Math.abs(t[0]) || 0, Math.abs(t[3]) || 0, 1) : 1;
  return it.width >= 0.01 * size;       // measured: the seam space is 3.6e-14 wide, the real one after "th" 0.21 at size 7.98
}

/** Two consecutive pieces on the SAME LINE: no hasEOL between them, both
 *  with geometry, baselines within 0.3 of the taller piece — or a
 *  SUPERSCRIPT (a piece at most 0.8 the height of the other, its baseline
 *  within 0.6 of the taller): measured on ECF 69, 2026-09-29, "116" (h=12)
 *  | "th" (h=8, raised 4.5 = 0.375h) and the footnote marker "2" (h=8,
 *  raised 4.5) that opens the footnote line "Plaintiff refers…" — as its
 *  own line it was a bare number, chrome, dropped, and the wrap head "No.
 *  16-cv-" met "Plaintiff" with nothing between. */
export function sameLine(prev, it) {
  if (!prev || prev.hasEOL) return false;
  const ta = prev.transform, tb = it && it.transform;
  if (!Array.isArray(ta) || !Array.isArray(tb) || ta.length < 6 || tb.length < 6) return false;
  const ha = Math.abs(ta[3]) || Math.abs(ta[0]) || 0, hb = Math.abs(tb[3]) || Math.abs(tb[0]) || 0;
  const h = Math.max(ha, hb, 1), dy = Math.abs(ta[5] - tb[5]);
  if (dy <= 0.3 * h) return true;
  return Math.min(ha, hb) <= 0.8 * h && dy <= 0.6 * h;
}

/** A piece with no letter or digit and something in it: a quote mark, a
 *  footnote asterisk, a pilcrow — never a bare space. */
export function isPunctPiece(s) {
  const t = String(s == null ? '' : s).trim();
  return t !== '' && !/[\p{L}\p{N}]/u.test(t);
}

/** A RAISED PUNCTUATION PIECE joins the line it floats over (Idrogo v.
 *  United States Army pdf 3, 131dcd8f: the West print sets the closing
 *  double quote of '‘hypothetical,’ ”' 3.1 pt above its line, 0.33 h at
 *  full size, and pdf.js hands it as a piece of its own — as a line of its
 *  own between 'immi-' and 'nent,' it hid the hyphen break; pdftotext keeps
 *  it at the line's end). 131dcd8f wrote the rule into `sameLine` as "a
 *  piece with no letter or digit joins within 0.6 h" — PAIRWISE, so a mark
 *  bridged two LINES: on Prakash v. American University pdf 7 a pilcrow at
 *  the end of the left column's line sat 0.59 h above the right column's
 *  NEXT line's first word, which joined it and was seated mid-sentence
 *  ('issue of ny fact … testimo-'); Vasser pdf 10 the same; Ly v. Nystrom
 *  pdf 9 a '* * *' separator joined the sentence above it (b0d76502's fold
 *  diff of the 758 target pages of five served tables, 26 changed). The
 *  rule is LINE-level: of the two pieces one is a mark and one a word; the
 *  WORD sits on the line's own baseline (`line.base`, the first word's y,
 *  within the shared-baseline 0.3 h), and the MARK floats ABOVE the word by
 *  at most 0.6 h. A mark below (a separator line, a bullet a line down) or
 *  a word off the baseline (the next line, the other column) never joins
 *  by this rule; a second mark in a row (Firestone pdf 5, '" "' around
 *  'almost always') is judged against the line's baseline, never against
 *  the first mark, so marks cannot climb. The x-sort seats the mark. */
export function raisedPunctuation(line, prev, it) {
  if (!line || !prev || !it) return false;
  const pa = isPunctPiece(prev.str), pb = isPunctPiece(it.str);
  if (!pa && !pb) return false;
  if (pa && pb) {
    const tp = it.transform;
    if (!Number.isFinite(line.base) || !Array.isArray(tp) || tp.length < 6) return false;
    const h = Math.max(Math.abs(tp[3]) || Math.abs(tp[0]) || 0, line.h || 0, 1), dy = tp[5] - line.base;
    return dy > 0 && dy <= 0.6 * h;
  }
  const P = pa ? prev : it, W = pa ? it : prev;
  const tp = P.transform, tw = W.transform;
  if (!Array.isArray(tp) || !Array.isArray(tw) || tp.length < 6 || tw.length < 6) return false;
  const h = Math.max(Math.abs(tw[3]) || Math.abs(tw[0]) || 0, Math.abs(tp[3]) || Math.abs(tp[0]) || 0, 1);
  const base = Number.isFinite(line.base) ? line.base : tw[5];
  if (Math.abs(tw[5] - base) > 0.3 * h) return false;
  const dy = tp[5] - tw[5];
  return dy > 0 && dy <= 0.6 * h;
}

/** What goes between two consecutive text items. The checker joins LINES
 *  with one space; pdf.js hands the viewer a line in PIECES wherever the
 *  font changes (measured on ECF 74, 2026-09-29: an italic case name and
 *  its roman comma — "Erickson v. Pardus" | ", 551 U.S. 89," — and a
 *  docket cite "ECF 70" | "-" | "1"; 309 of 588 units missed with a space
 *  at every seam), and it already emits a " " item or the space character
 *  wherever the geometry has a word space. So two pieces on the SAME
 *  baseline with no gap are glued; a new line (hasEOL, another baseline),
 *  a space at either edge, a whitespace item between them, a real gap, or
 *  items without geometry (the fixture's lines) get the one space. */
export function itemSeparator(prev, it, pendingSpace = false) {
  if (!prev || pendingSpace || prev.hasEOL) return ' ';
  const a = String(prev.str == null ? '' : prev.str), b = String(it && it.str != null ? it.str : '');
  if (/\s$/.test(a) || /^\s/.test(b)) return ' ';
  if (!sameLine(prev, it)) return ' ';                                     // another line, or no geometry
  if (footnoteMarkerSeam(prev, it)) return ' ';                            // a raised footnote marker is its own token
  const ta = prev.transform, tb = it.transform;
  const h = Math.max(Math.abs(ta[3]) || 0, Math.abs(tb[3]) || 0, Math.abs(ta[0]) || 0, 1);
  const gap = tb[4] - (ta[4] + (Number.isFinite(prev.width) ? prev.width : 0));
  if (gap > 0.25 * h) return ' ';                                          // a real gap pdf.js did not name
  return '';
}

/** Start offsets of `q` in a folded text under the contract's counting:
 *  NON-OVERLAPPING in reading order (f28bb754's clause), and only at TOKEN
 *  BOUNDARIES (2ee3c4f8's clause, 5d18825b's measured defect: 'F-1' inside
 *  'NF-103', 'NF-4' inside 'NF-47', 'at 3' inside 'at 31'): after folding,
 *  the character before the match and the character after it are not
 *  letters or digits — hyphen and punctuation are boundaries. */
function* occurrencesIn(text, q, loose = false) {
  let from = -1;
  while (true) {
    from = text.indexOf(q, from + 1);
    if (from < 0) return;
    if (!loose && !atTokenBoundary(text, from, q.length)) continue;
    yield from;
    from = from + q.length - 1;         // non-overlapping: resume after this match
  }
}

/** The per-item character ranges a match at [start, start+len) covers. */
function spanOf(owner, start, len) {
  const span = new Map();
  for (let c = start; c < start + len; c++) {
    const o = owner[c];
    if (!o) continue;
    const s = span.get(o.index) || { index: o.index, from: o.off, to: o.off, len: o.len, rawFrom: o.rawOff, rawTo: o.rawOff };
    s.from = Math.min(s.from, o.off); s.to = Math.max(s.to, o.off);
    if (o.rawOff != null) { s.rawFrom = Math.min(s.rawFrom, o.rawOff); s.rawTo = Math.max(s.rawTo, o.rawOff); }
    span.set(o.index, s);
  }
  return [...span.values()].sort((a, b) => a.index - b.index);
}

/** P62 (c), the matcher's ONE fallback: a query with a hyphen between two
 *  letters that finds NOTHING under the primary fold (the page-wrap and the
 *  split included — the wrapper sits outside the page search) is retried
 *  with every such hyphen removed at once; n indexes the retry's list when
 *  the retry is what found it. A page "Rendell-\nBaker" reads
 *  "RendellBaker" and the query "Rendell-Baker" finds it. Never in the
 *  loose search.
 *  P63 — ON BOTH SIDES (README 63ba0ec3 clause (1); the checker's
 *  `hyphenless_page` + `page_spans`): the page keeps the hyphens the print
 *  kept, so "Hazel-Atlas Glass Co. v. Hartford-\nEmpire Co." reads
 *  "Hazel-Atlas … HartfordEmpire" and a retry that folded the QUERY alone
 *  ("HazelAtlas … HartfordEmpire") could never meet it (d735a78c, ECF 73
 *  stamped 56; 5d18825b's two URL anchors on ECF 70-1 stamped 39,
 *  "approach-to-\nevaluations"). The retry searches the hyphenless PAGE and
 *  maps each hit back to the page's own indices, the END from the last
 *  matched character, so a box under the retry is the page's span, not the
 *  query's length. Deleting a page hyphen can erase a token boundary the
 *  primary had ("case-law" → "caselaw": a query ending at "case" misses) —
 *  the miss both readers share (the fixture's tenth retry case). */
export function hyphenless(q) { return String(q).replace(HYPHEN_BETWEEN_LETTERS, ''); }
function withHyphenRetry(q, run) {
  const first = run(q, false);
  if (first.length) return first;
  const alt = hyphenless(q);
  return alt !== q ? run(alt, true) : first;
}
/** Rule (c)'s PAGE side: the folded text with every hyphen between two
 *  letters removed, and the index of each removed hyphen in the text as it
 *  was (the checker's `hyphenless_page`). */
export function hyphenlessPage(text) {
  const t = String(text == null ? '' : text);
  const removed = [];
  let out = '', last = 0;
  for (const m of t.matchAll(HYPHEN_BETWEEN_LETTERS)) { removed.push(m.index); out += t.slice(last, m.index); last = m.index + 1; }
  return { text: out + t.slice(last), removed };
}
/** A hyphenless index → the text's own: each removed hyphen at or before
 *  the position shifts it by one (`removed` ascending; the checker's
 *  `_back`). */
export function backIndex(removed, pos) {
  for (const r of removed) { if (r <= pos) pos++; else break; }
  return pos;
}
/** P95 — THE DROPPED-LIGATURE RETRY (g) (studio-spec 7d866ecf's ruling of 2026-10-08, both admins' word 23:05 CDT;
 *  the viewer half, a168bcf6). The Court's PDFs from about 2013/2014 map the ﬁ/ﬂ/ﬃ/ﬄ glyph to ONE letter 'f' and every
 *  reader reads the map — 'confrmed', 'offcial', 'fnding' on the text layer and the mirror alike (17 lane documents at
 *  ≥ 5 per 1,000 words; ≤ 0.5 everywhere else). The FOLD DOES NOT CHANGE: a lane-wide fi→f fold would equate 29 real
 *  pairs of the lane's own words (fed/fled, food/flood, few/flew, four/flour) across the 1,003 documents whose layers
 *  carry the distinction. The loss is a DOCUMENT FACT the checker measures and serves (docs `ligature_drop`, rows
 *  `target_ligature_drop` — the P89 shape), and on a flagged document only, after the plain fold and (c)/(d) miss,
 *  BOTH sides are re-folded through the PDF's own map (ffi→ff, ffl→ff, fi→f, fl→f) so a quote carrying the PRINT's
 *  spelling verifies; the hit carries 'g' and the words name it (N3). Without the flag the retry would make the label
 *  a lie on a normal document ('filed' for the print's 'fled' passing as "dropped ligatures"). */
/** THE MAP, the checker's `ligature_drop_fold` / `ligature_drop_page` constant for constant, at its FIXED POINT (P95a,
 *  admin 2ee3c4f8's measure of 2026-10-09 00:05 CDT, a168bcf6's harness pin the hour before): the RUN of i/l right after
 *  an f deleted — ffi→ff, ffl→ff, fi→f, fl→f applied until nothing moves. One pass a side is not enough: the layer's dropped
 *  form can itself carry a new i/l after the f — the print's 'conflict' reads 'confict', 'file' 'fle', 'filed' 'fled',
 *  'flight' 'fight' — and a second fold of the page side ('confct', 'fe', 'fed', 'fght') never met the quote folded once.
 *  At the fixed point both sides read 'confct' / 'fe' / 'fed' / 'fght' and meet; the extra eat ('fled' and 'filed' alike at
 *  'fed') sits inside the class the label already names — the image decides. The fixture's `ligature_drop` section pins
 *  both readers to it. */
const LIGATURE_FORMS = /(?<=f)[il]+/g;
/** The text through the map, with the index of each dropped letter in the text as it was (ascending; the shape of
 *  hyphenlessPage, so backIndex maps a hit back). */
export function ligatureFold(text) {
  const t = String(text == null ? '' : text);
  const removed = [];
  let out = '', last = 0;
  for (const m of t.matchAll(LIGATURE_FORMS)) { for (let i = m.index; i < m.index + m[0].length; i++) removed.push(i); out += t.slice(last, m.index); last = m.index + m[0].length; }
  return { text: out + t.slice(last), removed };
}
/** A fold {text, owner, lineEnds, pieceJoins} re-folded through the map, with fwd/back between the two index spaces. */
function ligatureFolded(folded) {
  const lf = ligatureFold(folded.text);
  const fwd = (i) => { let d = 0; for (const r of lf.removed) { if (r < i) d++; else break; } return i - d; };
  return { text: lf.text, owner: folded.owner, lineEnds: new Set([...(folded.lineEnds || [])].map(fwd)), pieceJoins: new Set([...(folded.pieceJoins || [])].map(fwd)), fwd, back: (i) => backIndex(lf.removed, i) };
}
/** The flag a row's locate runs under: the served ROW field alone — `target_ligature_drop` true, the checker's measure
 *  of the row's target (the docs payload's `ligature_drop` is informational: the sites' importer carries row keys and
 *  allow-lists doc keys, so a window keyed on the doc field would fire in the Studio and not on the sites). Never a guess. */
export function ligatureDropFor(t) {
  return !!(t && t.target_ligature_drop === true);
}
/** One SIDE of a search over a fold {text, owner}: as it is, or under the
 *  retry the hyphenless text with its map back to the fold's indices. */
function side(folded, retry) {
  if (!retry) return { text: folded.text, owner: folded.owner, back: (i) => i, fwd: (i) => i, lineEnds: folded.lineEnds || new Set(), pieceJoins: folded.pieceJoins || new Set() };
  const hp = hyphenlessPage(folded.text);
  const fwd = (i) => { let d = 0; for (const r of hp.removed) { if (r < i) d++; else break; } return i - d; };
  const lineEnds = new Set([...(folded.lineEnds || [])].map(fwd));
  const pieceJoins = new Set([...(folded.pieceJoins || [])].map(fwd));
  return { text: hp.text, owner: folded.owner, back: (i) => backIndex(hp.removed, i), fwd, lineEnds, pieceJoins };
}
/** A match [start, start+len) on a side → its span in the fold's own
 *  indices {from, len} and the items it covers; the end is mapped from
 *  the LAST matched character (+1), never as start + the query's length. */
function spanOn(s, start, len) {
  const from = s.back(start), to = len > 0 ? s.back(start + len - 1) + 1 : from;
  return { from, len: to - from, items: spanOf(s.owner, from, to - from) };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** THE WRAP-SPLIT RULE (studio-spec 7d866ecf's P52b, checker 0bb00351 —
 *  `wrapped_occurrence`): a citation that BEGINS on this page and ENDS on
 *  the next when the plain join cannot bridge them, because the page's
 *  footnote block sits between the citation's head and the page break in
 *  every reader's text (5d18825b's four ECF 74 rows: stamped 13 ends
 *  "(¶ 13, supra; ECF No." + footnotes, 14 begins "57-1). At Rule 12").
 *  Split the folded query at any character: the TAIL (≥ 1 char) must begin
 *  the next page's folded text with a token boundary after it; the HEAD
 *  (≥ 3 chars) must occur on this page word-bounded and followed by a
 *  space or the page's end — or by a footnote NUMBER the dash-join glued
 *  to it ("(Ex. A-" then a footnote "2 …" → "Ex. A-2 …"); the occurrence
 *  sits at the head's LAST position on the page (nearest the break).
 *  → {start, head:{text, items}, tail:{text, items}} with `items` the
 *  per-item ranges on THIS page and on the NEXT page, or null. */
export function locateWrapped(itemsA, itemsB, quote) { return wrappedOn(itemsA, itemsB, foldQuery(quote), false); }
/** The split rule over a folded query, on the pages as they are or (P63)
 *  on their hyphenless sides with every position mapped back. */
const PIN_MARKER_HEAD = /^(?:¶¶?|§§?)$/;                   // P70: a wrap head that is only the pin marker
function wrappedOn(itemsA, itemsB, q, retry) {
  if (!q || q.length < 4 || !itemsB || !itemsB.length) return null;
  const page = side(foldItems(itemsA), retry), next = side(foldItems(itemsB), retry);
  if (!page.text || !next.text) return null;
  for (let i = q.length - 1; i > 0; i--) {
    const head = q.slice(0, i).trimEnd(), tail = q.slice(i).trimStart();
    // P70 (admin 69183d38, README c9d889f5 l.32; d735a78c's 051 stamped 179→180 "… at ¶" | "267 — …"):
    // a head of ONE glyph is allowed when it is a pin marker (¶ or §, optionally §§)
    if (!tail || (head.length < 3 && !PIN_MARKER_HEAD.test(head))) continue;
    if (!next.text.startsWith(tail)) continue;
    const after = next.text[tail.length] || '';
    if (after && WORDCHAR.test(after)) continue;
    // A HYPHEN THAT VANISHED AT THE SEAM (P54, d735a78c's ECF 69 at 21–22:
    // "No. 16-cv-12149-ADB" breaks after "16-cv-" and every source drops the
    // hyphen at the break — the mirror reads "16-cv2 Plaintiff…"): a head
    // ending in "-" is also looked for without it, under the same rule.
    const heads = [head];
    if (head.endsWith('-') && head.length > 3) heads.push(head.slice(0, -1));
    for (const h of heads) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(h)}(?=(?:\\p{Nd}+)?(?: |$))`, 'gu');
      let last = null;
      for (const m of page.text.matchAll(re)) last = m.index;
      if (last === null) continue;
      const hs = spanOn(page, last, h.length), ts = spanOn(next, 0, tail.length);
      return { start: hs.from, head: { text: h, items: hs.items }, tail: { text: tail, items: ts.items } };
    }
  }
  return null;
}

/** Occurrences of `quote` that START on a page (the checker's
 *  `page_occurrences`, one counting rule for both readers): the page joined
 *  to the next by one space and folded again — so the dash-join sees the
 *  seam, "Ex. A-" | "6" → "Ex. A-6" — matches counted only where they begin
 *  on this page (admin 2ee3c4f8's page-wrap ruling), plus the wrapped
 *  occurrence the join cannot bridge (above), sorted in by position; `n` is
 *  1-based into this list. Each hit: {start, wrapped:false, items} with
 *  `items` indexed into the JOINED items [...itemsA, ...itemsB], or the
 *  wrapped hit {start, wrapped:true, head, tail} (see locateWrapped). */
export function pageOccurrences(itemsA, itemsB, quote) {
  const q0 = foldQuery(quote);
  if (!q0) return [];
  const a = itemsA || [], b = itemsB || [];
  const folded = foldPages(a, b);                    // each page in its own reading order, one fold across the seam
  const run = (q, retry) => {
    const s = side(folded, retry);                   // P63: under the retry the hyphenless join, positions mapped back
    const hits = [];
    for (const start of occurrencesIn(s.text, q)) {
      const sp = spanOn(s, start, q.length);
      if (!sp.items.length || sp.items[0].index >= a.length) break;   // begins on the next page: not this page's
      hits.push({ start: sp.from, wrapped: false, items: sp.items });
    }
    const w = b.length ? wrappedOn(a, b, q, retry) : null;
    if (w && !hits.some(h => h.start === w.start)) {
      hits.push({ start: w.start, wrapped: true, head: w.head, tail: w.tail });
      hits.sort((x, y) => x.start - y.start);
    }
    return hits;
  };
  return withHyphenRetry(q0, run);
}
/** The two pages' items as one array — the SAME array for the same pair, so
 *  the fold cache holds (a locate per unit must not re-fold two pages). */
const JOIN_CACHE = new WeakMap();
function joinedItems(a, b) {
  let m = JOIN_CACHE.get(a);
  if (!m) { m = new WeakMap(); JOIN_CACHE.set(a, m); }
  let j = m.get(b);
  if (!j) { j = [...a, ...b]; m.set(b, j); }
  return j;
}

/** A statute pinned through the section map is read over the SECTION's
 *  span, as the checker's quote check is (case_review.py: nxt = the first
 *  section page after this one, else this page): → the pdf page that
 *  closes the span for a section beginning on `pdf`. */
export function sectionSpanEnd(pagemap, pdf) {
  if (!isSectionMap(pagemap) || !Number.isInteger(pdf)) return pdf;
  const secs = isObj(pagemap.sections) ? pagemap.sections : {};
  let nxt = null;
  for (const v of Object.values(secs)) if (isPage(v) && v > pdf && (nxt === null || v < nxt)) nxt = v;
  return nxt === null ? pdf : nxt;
}

// ---------------------------------------------------------------- the passage
/** THE PASSAGE, WHOLE (admin 69183d38's ruling on the owner's word, README
 *  l.34, 2026-09-30 04:40 CDT): a row's `target_quote` is the ENTIRE passage
 *  the filing relies on — whole sentences at the pin, which may run onto the
 *  next page(s) (`target_page_end`) and may be cut as FRAGMENTS joined by an
 *  ellipsis where the target's text breaks the passage in the middle. The
 *  window boxes the whole run from the first fragment's first word to the
 *  last fragment's last word, on every page it crosses; the checker reads
 *  the same run (its `quote_in_span`, on this rule's fixture). One rule for
 *  quotes — the page-wrap split (P52b) is the citation's, never a quote's. */

/** The checker's `quote_fragments` on the FOLDED quote: split at an
 *  ellipsis (NFKC writes "…" as "..."; "[...]" and spaced dots too), each
 *  part stripped of space and " ,;:", a fragment is two words or more; a
 *  quote with no such part is one fragment, whole. */
const ELLIPSIS_RUN = /\[\s*\.\s*\.\s*\.\s*\]|(?:\.\s*){3,}|…/g;
/** P79 (studio-spec 7d866ecf; d735a78c's Clark pair, 073 v1.10 'U.S. … agency'):
 *  the split takes the whole RUN of dots (spaces between allowed, the
 *  bracketed form whole) and, when the run holds FOUR or more dots and
 *  follows a word character, gives the first dot back to the word — an
 *  abbreviation's or a sentence's period stays with its fragment
 *  ('U.S. … agency' → 'U.S.' | 'agency'); exactly three dots are the
 *  ellipsis alone ('alleges... that' unchanged). Before: a leftmost
 *  three-dot match ate the period and the next fragment began with '.'. */
function splitEllipsis(q) {
  const parts = []; let last = 0;
  for (const m of q.matchAll(ELLIPSIS_RUN)) {
    let start = m.index;
    const dots = (m[0].match(/\./g) || []).length;
    if (m[0][0] !== '[' && dots >= 4 && start > 0 && /[\p{L}\p{N}]/u.test(q[start - 1])) start += 1;
    parts.push(q.slice(last, start)); last = m.index + m[0].length;
  }
  parts.push(q.slice(last));
  return parts;
}
export function quoteFragments(quoteFolded) {
  const q = String(quoteFolded == null ? '' : quoteFolded);
  const parts = splitEllipsis(q).map(p => p.replace(/^[\s,;:]+|[\s,;:]+$/g, ''));
  const frags = parts.filter(p => p.split(/\s+/).filter(Boolean).length >= 2);
  if (frags.length) return frags;
  const t = q.trim();
  return t ? [t] : [];
}

/** N PAGES as the checker joins a span (`quote_in_span`: the pages stripped
 *  and joined, the page after the span appended for the wrap only): each
 *  page rebuilt in ITS OWN reading order (never the items of two pages as
 *  one array — 17d9cc4c), the raws joined by "\n", one fold with
 *  provenance. `owner[c].index` indexes the JOINED items; `pages[k]` gives
 *  page k's {first, count} item offsets and its [start, end) in the folded
 *  text (start = end = -1 for a page that folds to nothing). Not cached — a
 *  passage is located once per opening. */
export function foldPageList(pages, loose = false) {
  const list = (pages || []).map(p => p || []);
  let raw = '';
  const ownerOfRaw = [];
  const offs = [];
  let off = 0;
  for (const items of list) {
    const r = rawOfPage(items, loose, off);
    if (raw && r.raw) { raw += '\n'; ownerOfRaw.push(null); }
    raw += r.raw;
    for (const o of r.ownerOfRaw) ownerOfRaw.push(o);
    offs.push({ first: off, count: items.length });
    off += items.length;
  }
  const out = foldRaw(raw, ownerOfRaw, loose);
  const bounds = offs.map(o => ({ ...o, start: -1, end: -1 }));
  const pageOfIndex = (index) => { for (let k = 0; k < offs.length; k++) if (index < offs[k].first + offs[k].count) return k; return offs.length - 1; };
  for (let i = 0; i < out.text.length; i++) {
    const o = out.owner[i];
    if (!o) continue;
    const b = bounds[pageOfIndex(o.index)];
    if (b.start < 0) b.start = i;
    b.end = i + 1;
  }
  return { ...out, pages: bounds, pageOfIndex };
}

/** The first occurrence of `q` in `text` at or after `from` under the
 *  contract's counting (token-bounded) → [start, end) or null. */
function firstOccurrenceFrom(text, q, from) {
  let at = from;
  while (true) {
    at = text.indexOf(q, at);
    if (at < 0) return null;
    if (atTokenBoundary(text, at, q.length)) return [at, at + q.length];
    at++;
  }
}

/** RETRY (d) — a letter–letter space at a page LINE END may be a join
 *  (README l.50, the P74 bound: the LoC U.S. Reports layers break a word
 *  with a SOFT hyphen, pdf.js hands the viewer an empty item for it, and
 *  the mirror already reads "re quires"). The fragment is matched with
 *  each such space OPTIONAL — skipped where the fragment's letters run on
 *  ("requires" meets "re|quires"), consumed where the fragment has the
 *  space ("the court" meets "the|court" — a hit on the primary never
 *  reaches here). Deterministic: at a line-end space the fragment either
 *  has a space (consume) or a letter (skip) — never both. Token-bounded at
 *  both ends. → [start, end) in `text`'s own indices, or null. */
export function joinableOccurrenceFrom(text, lineEnds, q, from, pieceJoins = null) {
  const ends = lineEnds || new Set(), joins = pieceJoins || new Set();
  if (!q || (!ends.size && !joins.size)) return null;
  for (let i = Math.max(0, from); i < text.length; i++) {
    if (text[i] !== q[0]) continue;
    let p = i, k = 0, d = false, e = false;
    while (k < q.length) {
      if (p < text.length && text[p] === q[k]) { p++; k++; continue; }
      if (p < text.length && ends.has(p) && q[k] !== ' ') { p++; d = true; continue; }
      // RETRY (e), the viewer's own: two pieces the geometry glued may be two
      // words — the query's space is consumed against the join
      if (q[k] === ' ' && joins.has(p) && text[p] !== ' ') { k++; e = true; continue; }
      break;
    }
    if (k < q.length || !(d || e)) continue;
    if (!atTokenBoundary(text, i, p - i)) continue;
    const hit = [i, p]; hit.kind = (d ? 'd' : '') + (e ? 'e' : '');
    return hit;
  }
  return null;
}

/** One fragment, in order: the first hit at or after `cursor` whose start
 *  is before `limit` (inside the span) — primary, then (c) hyphenless on
 *  both sides, then (d) the line-end join, then both — every position
 *  mapped back to the fold's own indices, the END from the last matched
 *  character. → {from, to, retry: null | 'c' | 'd' | 'cd'} or null. */
function locateFragment(folded, q, cursor, limit) {
  const tries = [[false, false], [true, false], [false, true], [true, true]];
  for (const [hyph, join] of tries) {
    if (hyph && hyphenless(q) === q) continue;
    const s = side(folded, hyph);
    const qq = hyph ? hyphenless(q) : q;
    let at = s.fwd(cursor);
    while (true) {
      const hit = join ? joinableOccurrenceFrom(s.text, s.lineEnds, qq, at, s.pieceJoins) : firstOccurrenceFrom(s.text, qq, at);
      if (!hit) break;
      const from = s.back(hit[0]), to = s.back(hit[1] - 1) + 1;
      if (from >= cursor && from < limit) return { from, to, retry: (hyph ? 'c' : '') + (join ? hit.kind : '') || null };
      if (from >= limit) break;
      at = hit[0] + 1;
    }
  }
  return null;
}

/** The joined fold's index of an item's folded character (`off` among the
 *  item's folded chars, as span items count them) — a per-page wrap hit
 *  carried into the span's fold. -1 when the fold has no such char. */
function joinedIndexOf(folded, index, off) {
  for (let i = 0; i < folded.owner.length; i++) { const o = folded.owner[i]; if (o && o.index === index && o.off === off) return i; }
  return -1;
}

/** THE SEAM UNDER CHROME (studio-spec 7d866ecf's find on MN-Stat-ch-8 pp.
 *  7–8: the Revisor's footer and the next page's head sit INLINE at the
 *  seam — "…the Act Against Unfair | Official Publication of the State of
 *  Minnesota … 2025 | Discrimination and Competition (sections …" — so no
 *  fold of the joined pages carries the fragment): the fifth try, after
 *  the primary and the retries — the citation wrap's rule (locateWrapped,
 *  P52b) per consecutive page pair, the fragment's head ending page k
 *  word-bounded and its tail BEGINNING page k+1; the hit runs head → tail
 *  with the chrome inside, `wrapped: true`, and the run is boxed to the
 *  foot of the page and from the head of the next (README l.34 (2)). */
function locateFragmentWrapped(folded, list, span, q, cursor, limit) {
  for (let k = 0; k + 1 < list.length && k < span; k++) {
    const A = list[k], B = list[k + 1];
    for (const hyph of [false, true]) {
      if (hyph && hyphenless(q) === q) continue;
      const w = wrappedOn(A, B, hyph ? hyphenless(q) : q, hyph);
      if (!w || !w.head.items.length || !w.tail.items.length) continue;
      const h0 = w.head.items[0], t1 = w.tail.items[w.tail.items.length - 1];
      const from = joinedIndexOf(folded, folded.pages[k].first + h0.index, h0.from);
      const toLast = joinedIndexOf(folded, folded.pages[k + 1].first + t1.index, t1.to);
      if (from < 0 || toLast < 0) continue;
      if (from >= cursor && from < limit) return { from, to: toLast + 1, retry: hyph ? 'c' : null, wrapped: true };
    }
  }
  return null;
}

/** LOCATE THE PASSAGE: `pages` = the items of target_page … target_page_end
 *  and then, when there is one, the page after (the wrap only); `spanCount`
 *  = how many of them are the span. Every fragment must START inside the
 *  span, IN ORDER — each after the one before it ends (a passage reads
 *  forward; fragments found out of order are not this passage: MISS). The
 *  run is [first fragment's start, last fragment's end) in the joined fold;
 *  `parts` splits it per page — {k (index into `pages`), items (this page's
 *  own indices, the per-item ranges), text (the folded run on this page)} —
 *  a middle page carries its whole body. `retry` names the strongest retry
 *  any fragment needed. Pinned by the shared fixture's `passage` cases,
 *  which the checker runs too. */
export function locatePassage(pages, spanCount, quote, opts = null) {
  const list = (pages || []).map(p => p || []);
  const frags = quoteFragments(foldQuery(quote));
  if (!frags.length || !list.length) return null;
  const folded = foldPageList(list);
  const lig = !!(opts && opts.ligatureDrop);               // P95: the document's served fact arms retry (g)
  const foldedG = lig ? ligatureFolded(folded) : null;
  const span = Math.max(1, Math.min(spanCount || list.length, list.length));
  let limit = folded.text.length;
  for (let k = span; k < folded.pages.length; k++) if (folded.pages[k].start >= 0) { limit = folded.pages[k].start; break; }
  // the strongest retry any fragment needed, as a set of letters: c (hyphenless), d (a line-end join), e (a piece join — the viewer's own)
  let cursor = 0; const letters = new Set();
  const found = [];
  let wrapped = false, headToTail = false;
  for (const frag of frags) {
    let hit = locateFragment(folded, frag, cursor, limit) || locateFragmentWrapped(folded, list, span, frag, cursor, limit);
    if (!hit && lig) {
      // RETRY (g) — P95: on a FLAGGED document only, and only when the fragment carries an i or l after an f (else a
      // misquote would pass under a label naming a loss the page has); both sides through the PDF's one-letter map,
      // (c)/(d) inside (the checker's _side composes the two deletion lists; the chain here deletes letters first, and no
      // deletion can change a hyphen's letter neighbours, so the positions agree); mapped back to the fold's own indices.
      const qg = ligatureFold(frag).text;
      const g = qg !== frag ? locateFragment(foldedG, qg, foldedG.fwd(cursor), foldedG.fwd(limit)) : null;
      if (g) hit = { from: foldedG.back(g.from), to: foldedG.back(g.to - 1) + 1, retry: (g.retry || '') + 'g', wrapped: false };
    }
    if (!hit && frags.length > 1) {
      // RETRY (f) PER FRAGMENT (the viewer's own; 2026-10-05, the re-OCR'd Floyd v. Barker — admin 2ee3c4f8's read): an ELIDED
      // quote's fragment that misses whole on this layer is boxed from ITS head to ITS tail, in order after the previous
      // fragment, its run bounded by its OWN length. The whole-run retry below measured the elided matter too — Floyd 1305
      // over pdf 1–2: three fragments each located alone (f, whole, whole), the whole run 2.02× the quote, refused by eleven
      // characters. Census on six tables, 1,542 quoted rows: +2 (both Floyd), 0 lost, 0 moved. The checker reads the mirror whole.
      const ht = headAndTail([frag]);
      if (ht) {
        const head = locateFragment(folded, ht.head, cursor, limit) || locateFragmentWrapped(folded, list, span, ht.head, cursor, limit);
        const tail = head ? (locateFragment(folded, ht.tail, head.to, folded.text.length) || locateFragmentWrapped(folded, list, span, ht.tail, head.to, folded.text.length)) : null;
        if (head && tail && tail.to - head.from <= 2 * frag.length) { hit = { from: head.from, to: tail.to, retry: (head.retry || '') + (tail.retry || '') + 'f', wrapped: !!(head.wrapped || tail.wrapped) }; headToTail = true; }
      }
    }
    if (!hit) { found.length = 0; headToTail = false; break; }
    found.push(hit); cursor = hit.to;
    if (hit.wrapped) wrapped = true;
    for (const ch of hit.retry || '') letters.add(ch);
  }
  if (!found.length) {
    // RETRY (f), the viewer's own (admin 69183d38's proposal on the 29 ON PAGE
    // misses, 2026-09-30 11:49 CDT): the whole quote misses on the span but
    // its HEAD (the first six words) and its TAIL (the last six) locate IN
    // ORDER — a footnote reference or a running header interleaved on this
    // layer, a stray quote mark at a hyphen break, a glued piece in the
    // middle — so the run is boxed head → tail (README l.34 (2): the window
    // boxes the whole run from the first fragment's first word to the last's
    // last) and the pane says the middle differs. Ten words or more only, so
    // head and tail never overlap. The checker verifies the whole on the mirror.
    const ht = headAndTail(frags);
    if (!ht) return null;
    letters.clear();
    const head = locateFragment(folded, ht.head, 0, limit) || locateFragmentWrapped(folded, list, span, ht.head, 0, limit);
    if (!head) return null;
    const tail = locateFragment(folded, ht.tail, head.to, folded.text.length) || locateFragmentWrapped(folded, list, span, ht.tail, head.to, folded.text.length);
    if (!tail) return null;
    // a run longer than twice the quote is a wrong tail (a later occurrence of six common words), not this passage — measured: the 22 lane hits run 0.69–1.99× (footnotes and running heads inside the span)
    if (tail.to - head.from > 2 * frags.join(' ').length) return null;
    found.push(head, tail); headToTail = true;
    if (head.wrapped || tail.wrapped) wrapped = true;
    for (const h of [head, tail]) for (const ch of h.retry || '') letters.add(ch);
    letters.add('f');
  }
  const retry = ['c', 'd', 'e', 'f', 'g'].filter(ch => letters.has(ch)).join('') || null;   // P95: g, the dropped-ligature retry, last
  const from = found[0].from, to = found[found.length - 1].to;
  const all = spanOf(folded.owner, from, to - from);
  const parts = [];
  folded.pages.forEach((b, k) => {
    const items = all.filter(s => s.index >= b.first && s.index < b.first + b.count).map(s => ({ ...s, index: s.index - b.first }));
    if (!items.length || b.start < 0) return;
    const text = folded.text.slice(Math.max(from, b.start), Math.min(to, b.end)).trim();
    if (text) parts.push({ k, items, text });
  });
  return parts.length ? { from, to, retry, wrapped, headToTail, frags: found, parts } : null;
}

/** Retry (f)'s head and tail: the first six words of the first fragment and
 *  the last six of the last, when the fragments hold ten words or more in
 *  all; null otherwise. */
export function headAndTail(frags, n = 6) {
  const fs = (frags || []).filter(Boolean);
  if (!fs.length) return null;
  const words = fs.join(' ').split(/\s+/).filter(Boolean);
  if (words.length < 10) return null;
  const first = fs[0].split(/\s+/).filter(Boolean), last = fs[fs.length - 1].split(/\s+/).filter(Boolean);
  const head = first.slice(0, Math.min(n, first.length)).join(' '), tail = last.slice(Math.max(0, last.length - n)).join(' ');
  return head && tail ? { head, tail } : null;
}

/** How much of the quote's words the span's fold carries at all — the test
 *  behind the pane's "scrambled" words (a West print's raw layer that
 *  interleaves the columns INSIDE its lines carries every word out of order:
 *  Brown v. Chiappetta pdf 13, Butera pdf 6). → {present, total} over the
 *  quote's distinct folded words of three letters or more. */
export function passageWordsPresent(pages, quote) {
  const q = foldQuery(quote);
  const words = new Set(q.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(w => w.length >= 3));
  if (!words.size) return { present: 0, total: 0 };
  const have = new Set(foldPageList((pages || []).map(p => p || [])).text.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')));
  let present = 0; for (const w of words) if (have.has(w)) present++;
  return { present, total: words.size };
}

/** THE ORDER of the quote's words on the span, after a miss (N3, studio-spec 7d866ecf's ruling b65e1e1, 2026-10-05: a saying names
 *  only what was measured). Greedy left to right over the quote's folded words: a run is the longest stretch the span carries
 *  as one string; a run of four words or more counts, a shorter one is a break. → { covered, total, runs, longest, mean }.
 *  Measured: a single-column OCR layer with a word misread every forty words (Floyd pdf 3) reads 94 % covered in 5 runs, mean
 *  25 words; a West raw layer interleaving its two columns inside the lines (Butera pdf 6) reads 95 % covered in 20 runs,
 *  mean 6 — a half-line each; the Floyd rows that box, 3–5 runs, mean 27–55. ORDERED = mean ≥ 12 words (a line's worth). */
export const ORDERED_MEAN_RUN = 12;
export function passageOrder(pages, quote, min = 4) {
  const w = foldQuery(quote).replace(/ … /g, ' ').split(/\s+/).filter(Boolean);
  const text = foldPageList((pages || []).map(p => p || [])).text;
  let i = 0, covered = 0, runs = 0, longest = 0;
  while (i < w.length) {
    let j = i; while (j < w.length && text.includes(w.slice(i, j + 1).join(' '))) j++;
    const n = j - i;
    if (n >= min) { covered += n; runs++; longest = Math.max(longest, n); i = j; } else i++;
  }
  return { covered, total: w.length, runs, longest, mean: runs ? covered / runs : 0 };
}
/** P89 (7d866ecf 694d1680): the row's served `target_columns` — the pdf pages of its span the checker's P83 detector reads as
 *  two-column over pdftotext's word boxes — asked for the span [pdfPage, pdfEnd]: true when a span page is named, false when
 *  the field is a list naming none, null when not measured (null, or absent from a served process before the landing). The
 *  pane's own gutter read comes first; this is the fact it cannot see when a layer glues words across the gutter. */
export function servedColumns(t, pdfPage, pdfEnd = pdfPage) {
  const cols = t && t.target_columns;
  if (!Array.isArray(cols)) return null;
  const lo = Math.min(pdfPage, pdfEnd), hi = Math.max(pdfPage, pdfEnd);
  return cols.some((p) => Number.isFinite(+p) && +p >= lo && +p <= hi);
}
export function passageInOrder(order) { return !!order && order.runs > 0 && order.mean >= ORDERED_MEAN_RUN; }

// ---------------------------------------------------------------- coverage
/** P53 (studio-spec's coverage census, the rows that do NOT exist): a line
 *  of the links answer's `coverage` names the stamped page it is about —
 *  "stamped page 10: '§ 1983' printed with no row (n=3)" or "stamped page
 *  1: no rows on this page, 27 printed form(s) — …". → the page number, or
 *  null for a line in another shape. */
export function gapPage(line) {
  const m = /^stamped page (\d+):/.exec(String(line || ''));
  return m ? +m[1] : null;
}

// ---------------------------------------------------------------- the right pane's words
/** The pages a target opens on, from the row and the registry entry — the
 *  server's mapping when it made one (target_pdf_page; the registry asserts
 *  pages once), else the row's page through the document's offset/pagemap.
 *  A blank page with a server page is a statute pin resolved through the
 *  title's section map (viaMap): the quote is read over the SECTION's span
 *  (the checker's rule) and the pane opens at its head, marking the head
 *  alone — a section's span is not a citation's page range. Lifted from the
 *  Studio shell for the websites' shell (f28bb754, 2026-10-01): one logic. */
/** A row's page as the API serves it (b0d76502's census, 2026-10-01): a blank
 *  is '' on the wire and null in the Studio shell; a number may arrive as a
 *  string. Both lifts read the row through this, so a shell feeds server rows
 *  as they come and the two shells agree without a pre-step. */
export function rowPage(v) { return v == null || v === '' ? null : +v; }

/** P96 (studio-spec 7d866ecf; admins 2ee3c4f8 + 69183d38's design 2026-10-09 00:1x CDT): A PAGE MAP'S BASIS. A hand map's
 *  value is the leaf a folio is ON ('leaf' — today's maps; a constant offset is this basis) or the leaf where the folio
 *  BEGINS ('begins' — a reprint: Marbury's U.S. Reports cut carries 44 folios on 27 leaves, folio 163 beginning at leaf
 *  16's foot and running over leaf 17's head). The same numbers, two meanings, so the span rule cannot be read off the
 *  map's shape (a reprint with one star per leaf has an injective map and still straddles): the registry says the basis
 *  on the row beside the map (`pagemap_basis`), the export carries it, both readers key on it; a map without the field is
 *  'leaf', so nothing moves for the offset documents and the existing hand maps. */
export function pagemapBasis(doc) {
  return doc && doc.pagemap_basis === 'begins' && isObj(doc.pagemap) && !isSectionMap(doc.pagemap) ? 'begins' : 'leaf';
}
/** On a 'begins' map the leaf where folio f ENDS (7d866ecf's rule, both readers): the leaf where f + 1 begins when the
 *  map has f + 1 (the same leaf allowed); the document's leaf count (`pages`) ONLY when f is the map's LAST key (the last
 *  folio closes at the end); a GAP in the map (f + 1 absent, a later key present) — or no leaf count — the folio's own leaf:
 *  one leaf, no widening (the checker reads the span in the document's own numbering, [f, f+1] ∩ the store's keys, and
 *  cannot say "to the leaf count" for a gap). */
export function beginsEnd(doc, f, leaf) {
  const next = mappedPage(doc.pagemap, f + 1);
  if (next !== undefined && next >= 1) return Math.max(leaf, next);
  const keys = pagemapFolios(doc.pagemap);
  const last = keys.length ? keys[keys.length - 1] : null;
  if (last !== null && f === last) {
    const n = doc && Number.isFinite(+doc.pages) && +doc.pages >= 1 ? +doc.pages : null;
    return n !== null && n >= leaf ? n : leaf;
  }
  return leaf;
}
/** The map's folio keys as numbers, ascending (the checker keys by int(k)). */
function pagemapFolios(pagemap) {
  if (!isObj(pagemap)) return [];
  const pm = isObj(pagemap.pages) ? pagemap.pages : isObj(pagemap.map) ? pagemap.map : pagemap;
  return Object.keys(pm).filter((k) => /^\d+$/.test(k)).map((k) => parseInt(k, 10)).sort((a, b) => a - b);
}
export function targetPages(t, doc) {
  const stamped = rowPage(t.target_page);
  const viaMap = stamped == null && t.target_pdf_page >= 1;
  const pp0 = t.target_pin_page;
  const pdfPage = stamped == null ? (viaMap ? t.target_pdf_page : 1) : (t.target_pdf_page || pdfPageFor(stamped, doc.offset, doc.pagemap));
  const endStamped = rowPage(t.target_page_end);
  const begins = stamped != null && pdfPage && pagemapBasis(doc) === 'begins';   // P96: a reprint's folio spans [begins(f), begins(f+1)]
  const pdfEnd = begins
    ? beginsEnd(doc, endStamped == null ? stamped : endStamped, endStamped == null ? pdfPage : (t.target_pdf_page_end || pdfPageFor(endStamped, doc.offset, doc.pagemap) || pdfPage))
    : endStamped == null
    ? (viaMap && pp0 && (pp0.by === 'section' || pp0.by === 'range head') ? sectionSpanEnd(doc.pagemap, pdfPage) : pdfPage)
    : (t.target_pdf_page_end || pdfPageFor(endStamped, doc.offset, doc.pagemap));
  const marked = [];
  if (pdfPage && pdfEnd) for (let p = pdfPage; p <= (viaMap ? pdfPage : pdfEnd); p++) marked.push(p);
  return { pdfPage, pdfEnd, viaMap, marked };
}

// ---------------------------------------------------------------- the right pane's TAB BAR (P88)
// The owner's word 2026-10-02 (spec fbf555d9 3f7b616): up to FIVE tabs on the RIGHT pane; "lock to tab bar" holds a tab at
// its document AND page, left-aligned in lock order, stationary while the left explores; at most FOUR locked; exactly ONE
// exploring tab, rightmost, which EVERY link opens into. The model is pure and pinned; the shell prints tabsView.
// A bar: { seq, active, tabs: [{ id, doc (a registry id or null = the empty exploring slot), page, unit, locked }] }.
const TABS_MAX_LOCKED = 4;
function tabsClone(bar) { return { seq: bar.seq || 0, active: bar.active, tabs: bar.tabs.map((t) => ({ ...t })) }; }
function tabsFresh(bar) { bar.seq = (bar.seq || 0) + 1; return { id: `t${bar.seq}`, doc: null, page: null, unit: null, locked: false }; }
/** The bar before anything opened: one empty exploring slot (the invariant holds from the first moment). */
export function tabsEmpty() { const b = { seq: 0, active: null, tabs: [] }; const x = tabsFresh(b); b.tabs.push(x); b.active = x.id; return b; }
export function tabsExploring(bar) { return bar.tabs.find((t) => !t.locked) || null; }
export function tabsLocked(bar) { return bar.tabs.filter((t) => t.locked); }
export function tabsFind(bar, id) { return bar.tabs.find((t) => t.id === id) || null; }
/** The bar is shown when any tab holds a document. */
export function tabsShown(bar) { return bar.tabs.some((t) => t.doc); }
/** Every open from a link lands in the EXPLORING tab, replacing its document and page (invariant 3); it becomes active. */
export function tabsOpen(bar, { doc, page = 1, unit = null }) {
  const b = tabsClone(bar); let x = tabsExploring(b);
  if (!x) { x = tabsFresh(b); b.tabs.push(x); }
  x.doc = doc; x.page = page || 1; x.unit = unit || null; b.active = x.id; return b;
}
/** "lock to tab bar": the exploring tab is locked at its document and page and a new empty exploring slot appears at the
 *  right; refused IN WORDS at four locked, on a locked tab, or on an empty slot — nothing changes then. → { bar, refused }. */
export function tabsLock(bar, id) {
  const t = tabsFind(bar, id);
  if (!t) return { bar, refused: 'no such tab' };
  if (t.locked) return { bar, refused: 'this tab is already locked' };
  if (!t.doc) return { bar, refused: 'nothing to lock — open a citation in this tab first' };
  if (tabsLocked(bar).length >= TABS_MAX_LOCKED) return { bar, refused: 'four tabs are locked — unlock one to lock this' };
  const b = tabsClone(bar); const u = tabsFind(b, id); u.locked = true;
  b.tabs = [...b.tabs.filter((v) => v.locked), ...b.tabs.filter((v) => !v.locked)];   // the locked run left, in lock order
  b.tabs.push(tabsFresh(b)); b.active = id; return { bar: b, refused: null };
}
/** "unlock": the tab becomes the exploring tab at its document and page; the former exploring tab closes (the throwaway;
 *  the decision the owner may flip — the alternative loses the view the reviewer deliberately unlocked). */
export function tabsUnlock(bar, id) {
  const t = tabsFind(bar, id); if (!t || !t.locked) return bar;
  const b = tabsClone(bar); const x = tabsExploring(b);
  b.tabs = b.tabs.filter((v) => v.id !== id && (!x || v.id !== x.id));
  const u = { ...t, locked: false }; b.tabs.push(u); b.active = id; return b;
}
/** "close tab": a locked tab closes and the run shifts left; closing the exploring tab empties the slot (never a bar
 *  without an exploring slot). The active tab, if closed, becomes the exploring slot. */
export function tabsClose(bar, id) {
  const t = tabsFind(bar, id); if (!t) return bar;
  const b = tabsClone(bar);
  if (t.locked) { b.tabs = b.tabs.filter((v) => v.id !== id); if (b.active === id) b.active = tabsExploring(b).id; return b; }
  const x = tabsFind(b, id); x.doc = null; x.page = null; x.unit = null; b.active = id; return b;
}
/** Click a tab: show it at ITS page; nothing else moves (a locked tab activated is still not the exploring tab). */
export function tabsActivate(bar, id) { if (!tabsFind(bar, id)) return bar; const b = tabsClone(bar); b.active = id; return b; }
/** A page change inside a tab is remembered on that tab. */
export function tabsSetPage(bar, id, page) { const t = tabsFind(bar, id); if (!t || !t.doc || !(page >= 1)) return bar; const b = tabsClone(bar); tabsFind(b, id).page = page; return b; }
/** The drawn row — the shell prints this. `labelOf(docId)` names a document. */
export function tabsView(bar, labelOf = (d) => d) {
  return bar.tabs.map((t) => ({ id: t.id, doc: t.doc, label: t.doc ? labelOf(t.doc) : 'exploring', page: t.doc ? t.page : null, locked: t.locked, exploring: !t.locked, active: bar.active === t.id, empty: !t.doc }));
}
/** The invariants, as a list of breaches (empty = sound): ≤ 4 locked, ≤ 5 tabs, exactly one exploring tab and it is
 *  rightmost, the locked run left of it, the active tab present, ids unique. */
export function tabsInvariants(bar) {
  const out = [];
  const locked = tabsLocked(bar), open = bar.tabs.filter((t) => !t.locked);
  if (locked.length > TABS_MAX_LOCKED) out.push(`${locked.length} locked (at most ${TABS_MAX_LOCKED})`);
  if (bar.tabs.length > TABS_MAX_LOCKED + 1) out.push(`${bar.tabs.length} tabs (at most ${TABS_MAX_LOCKED + 1})`);
  if (open.length !== 1) out.push(`${open.length} exploring tabs (exactly one)`);
  if (open.length === 1 && bar.tabs[bar.tabs.length - 1] !== open[0]) out.push('the exploring tab is not rightmost');
  if (bar.active && !tabsFind(bar, bar.active)) out.push('the active tab is not in the bar');
  if (new Set(bar.tabs.map((t) => t.id)).size !== bar.tabs.length) out.push('tab ids repeat');
  return out;
}
/** For the tree's localStorage store (per case root): docs by id, pages, the locked flags, the active tab. */
export function tabsSerialize(bar) { return { seq: bar.seq || 0, active: bar.active, tabs: bar.tabs.map((t) => ({ id: t.id, doc: t.doc, page: t.page, locked: !!t.locked })) }; }
/** From the store: tabs whose document the registry no longer knows are dropped; the invariants re-established (one
 *  exploring slot, rightmost; an active tab). A bad or missing record is the empty bar. */
export function tabsRestore(j, known = () => true) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.tabs)) return tabsEmpty();
  const b = { seq: Number.isFinite(+j.seq) ? +j.seq : 0, active: null, tabs: [] };
  const seen = new Set();
  for (const t of j.tabs) {
    if (!t || typeof t.id !== 'string' || seen.has(t.id)) continue;
    const doc = typeof t.doc === 'string' && known(t.doc) ? t.doc : null;
    if (!doc && t.locked) continue;   // a locked tab on a document no longer served is gone
    seen.add(t.id); b.tabs.push({ id: t.id, doc, page: doc && +t.page >= 1 ? +t.page : (doc ? 1 : null), unit: null, locked: !!t.locked && !!doc });
    const n = parseInt(String(t.id).replace(/^t/, ''), 10); if (Number.isFinite(n) && n > b.seq) b.seq = n;
  }
  let locked = b.tabs.filter((t) => t.locked).slice(0, TABS_MAX_LOCKED);
  const open = b.tabs.filter((t) => !t.locked);
  const x = open.find((t) => t.doc) || open[0] || tabsFresh(b);
  b.tabs = [...locked, x];
  b.active = typeof j.active === 'string' && tabsFind(b, j.active) ? j.active : x.id;
  return b;
}

/** WHERE A ROW OPENS (P87, the owner's three words of 2026-10-01 — spec
 *  7d866ecf 22721a7/ebacd4e, ruling fbf555d9: logic, so core's; both panes
 *  and both shells print this). A TOC entry — every target kind `internal`
 *  AND target_doc == the row's own document (the whole same-document class,
 *  1,074 rows lane-wide; no `toc` kind) — navigates the pane it was clicked
 *  in. A citation or reference in the LEFT opens in the RIGHT; THE EXCEPTION,
 *  a citation in the RIGHT opens in the RIGHT, so the left pane never moves
 *  and the way back is the left's unmoved citation. `unit` = unitsOf's unit
 *  (its targets are the rows, src_doc on each); `pane` = 'left' | 'right'
 *  where the click was. → { where: 'same' | 'right', pane: the pane that
 *  changes, toc }. */
export function isTocUnit(unit) {
  const ts = unit && unit.targets || [];
  return ts.length > 0 && ts.every((t) => t.kind === 'internal' && t.target_doc && t.target_doc === (t.src_doc || unit.srcDoc));
}
export function opensWhere(unit, pane = 'left') {
  const toc = isTocUnit(unit);
  return toc ? { where: 'same', pane, toc: true } : { where: 'right', pane: 'right', toc: false };
}

/** A registry row a HOST does not serve (docs.json v0.25 `publish`, README
 *  2026-10-01 — admin 69183d38 on studio-spec fbf555d9's R3; the site export
 *  applies it: link = path null + the official URL, hold = path null, the
 *  row kept): the words instead of a fetch that 404s. The Studio ignores the
 *  field and its rows carry paths, so the test is BOTH — no path AND a
 *  publish value other than serve. → null (open it) | { kind, parts }. */
export function publishedAway(doc, side = 'right') {
  if (!doc || (doc.path != null && doc.path !== '') || !doc.publish || doc.publish === 'serve') return null;
  const pane = side === 'left' ? 'the review pane' : 'the reference pane';   // each footer names its OWN pane (f28bb754's nit, 2026-10-01)
  const label = doc.label || doc.id;
  if (doc.publish === 'link' && /^https?:\/\//i.test(doc.publish_url || '')) {
    return { kind: 'link', parts: [{ text: `${label}: not hosted on this site; at ` }, { text: doc.publish_url, href: doc.publish_url }, { text: ' (opens in the browser).' }] };
  }
  return { kind: 'dead', parts: [{ text: `${label}: not published on this site yet. Nothing opened; ${pane} is as it was.` }] };
}

/** The sentence the right pane says for a unit's k-th target — PURE: the
 *  unit, the target row, the registry entry (null when not in the registry)
 *  and what the pane has resolved so far, → { kind, opens, locate, parts }.
 *  `kind` is the line's class (dead | link | bad | docket | ok); `opens`
 *  false = nothing opens (unresolved, a web source, a url row, no registry
 *  entry) and the parts are the whole line; `locate` true = the shell should
 *  locate the quote over the span and call again with the answer. `parts`
 *  are RAW text in order — { text } | { text, href } | { text, warn: true } —
 *  each shell escapes in its own markup. `resolved` = targetPages(t, doc)
 *  plus, once known: passage (the located parts, [] of { retry, headToTail }
 *  per page, or null for a miss), hasText (false = no text layer on the
 *  span), words (passageWordsPresent on the span), order (passageOrder on the span, read only when the words are present),
 *  columns (the fold found a gutter on a span page — pageColumns). Lifted from the Studio
 *  shell for the websites' shell (f28bb754, 2026-10-01); the words are the
 *  Studio's, unchanged. */
/** Does the folded printed text already carry the folded pin — at its end, or anywhere at token bounds when the pin is more
 *  than a bare number (a bare '3' inside 'ECF 51-54 at 3' is the end case; inside '13 Cl. Ct. 486' it is not the pin)? */
export function textCarries(text, label) {
  if (!label) return true;
  if (text.endsWith(label)) return true;
  if (/^\d+$/.test(label)) return false;
  let i = text.indexOf(label);
  while (i >= 0) { if (atTokenBoundary(text, i, label.length)) return true; i = text.indexOf(label, i + 1); }
  return false;
}

export function saysFor(u, k, t, doc, resolved = null) {
  const parts = [];
  const say = (text) => { if (text) parts.push({ text }); };
  const warn = (text) => parts.push({ text, warn: true });
  // N2 (b0d76502): the printed text often ends with the pin ("ECF 51-54 at 3") — say it once
  // … and not one the printed text already CARRIES anywhere at token bounds ('Adler v. Loyd, 496 F. Supp. 3d 269 (D.D.C. 2020)'
  // pinned '496 F. Supp. 3d 269' printed the reporter twice — f28bb754's proof on the site, 2026-10-01); a bare page pin ('3') is said
  // a unit with SEVERAL targets keeps the pin — it is the chooser, naming which of the list opened ('Fed. R. Civ. P. 19(a),
  // 19(c), 20(a)(2), 21' → target 1 of 4 is '19(a)'; 'TAC ¶¶ 321, 325-326' at k = 2 → '¶ 325-326') — UNLESS the text ends
  // with it, the N2 case as it always was (the '· target k of N' suffix names the choice; 'ECF 51-54 at 3 at 3' is the repeat
  // the owner's word forbids): N2a, spec 62cab44 on b0d76502's 25-table census (552 + 294 dropped, the choosers kept)
  const fl = foldText(t.target_label || '');
  const pin = t.target_label && !(u.targets.length > 1 ? foldText(u.text).endsWith(fl) : textCarries(foldText(u.text), fl)) ? ` ${t.target_label}` : '';
  const unfound = () => { if (u.missing) warn(` (box not located on the left: ${u.missing})`); };
  const head = `${u.text}${pin}`;
  if (t.status === 'unresolved') { say(`${head} — UNRESOLVED: ${t.note || 'no file on any shelf'}. Nothing opened; the reference pane is as it was.`); unfound(); return { kind: 'dead', opens: false, locate: false, parts }; }
  if (/^https?:\/\//i.test(t.target_doc || '')) { say(`${head} — a web source: `); parts.push({ text: t.target_doc, href: t.target_doc }); say(' (opens in the browser; nothing on the shelf).'); return { kind: 'link', opens: false, locate: false, parts }; }
  // R7: only an http(s) URL is ever a live link — a javascript: or data: target is text
  if (t.kind === 'url') { say(`${head} — a url row whose target is not an http(s) address: ${t.target_doc || '(blank)'}. Nothing opened.`); return { kind: 'dead', opens: false, locate: false, parts }; }
  if (!doc) { say(`${head} — target ${t.target_doc || '(blank)'} is not in the registry. Nothing opened.`); return { kind: 'bad', opens: false, locate: false, parts }; }
  // a target this host does not serve (publish link | hold): the words, no fetch
  const away = publishedAway(doc);
  if (away) { say(`${head} — `); parts.push(...away.parts); return { kind: away.kind, opens: false, locate: false, parts }; }
  const r = resolved || targetPages(t, doc);
  const { pdfPage, pdfEnd, viaMap } = r;
  const stamped = rowPage(t.target_page), endStamped = rowPage(t.target_page_end);   // the row as served: '' is blank
  const own = doc.kind === 'caselaw' || doc.kind === 'statute';   // the target's OWN numbering (README amendment b)
  // THE LABEL IS NOT SAID (owner 2026-10-01 08:38 CDT: 'we dont need to display the filenames twice'): the pane's title chip
  // names the document that opened; the sentence says the page and how. publishedAway keeps its label — nothing opened there.
  const pp = t.target_pin_page;
  const how = !pp ? 'the pin resolved through the title\'s section map'
    : pp.by === 'section' ? `§ ${pp.key} in ${pp.file || 'the title'} by its section map`
    : pp.by === 'range head' ? `the range's head § ${pp.key} in ${pp.file || 'the title'} by its section map`
    : pp.by === 'chapter' ? `chapter ${pp.key} of ${pp.file || 'the title'} (the section is not in its map; the pin is the locator from there)`
    : `the target's own chapter ${pp.key} of ${pp.file || 'the title'} (no section or chapter in the pin resolved; the pin is the locator from there)`;
  // THE CHOOSER BY ORDINAL on EVERY opening line (b0d76502's measure over 2,227 multi-target opening lines, 2026-10-01: two
  // unpinned Elrod targets printed the same sentence for k = 1 and k = 2 — six of the eight branches returned without it);
  // 'quote boxed' only where a page was opened to box it on
  // the quote's token says what is TRUE at this call (f28bb754's read of the Floyd and Butera miss lines on the site, 2026-10-05: 'quote
  // boxed … nothing to box' on one line): before the locate — 'a quote to box'; after it — 'quote boxed' on a find, nothing on a miss
  // (the miss saying follows); never on a layer the pane cannot read (text_layer false / rtl) or a line that opened no page
  const willLocate = !!(t.target_quote && pdfPage && doc.text_layer !== false && doc.text_layer !== 'rtl');
  const quoteTok = !willLocate ? '' : r.passage === undefined ? ' · a quote to box' : r.passage ? ' · quote boxed' : '';
  const suffix = quoteTok + (u.targets.length > 1 ? ` · target ${k} of ${u.targets.length}` : '') + (t.status === 'mapped' ? ' · mapped, not yet read at the target' : '');
  let kind;
  if (viaMap) { kind = 'ok'; say(`${head} — ${how}, PDF page ${pdfPage}${suffix}`); unfound(); }
  else if (stamped == null && (t.kind === 'statute' || t.kind === 'rule') && isSectionMap(doc.pagemap)) { kind = 'bad'; say(`${head} — the pin${pin ? '' : ' (none given)'} locates nothing in ${(doc.pagemap && doc.pagemap.file) || 'the title'}'s section map (the checker warns on this row); opened at page 1 and saying so${suffix}`); }
  else if (stamped == null && (t.kind === 'statute' || t.kind === 'rule')) { kind = 'docket'; say(`${head} — opened at page 1; the pin${pin ? '' : ' (none given)'} is the locator against the pamphlet (no page in the row)${suffix}`); }
  // a target cited without a page: the words by what it is (f28bb754's read of Adler v. Loyd on the site, 2026-10-01 — a case cited whole is not a docket reference)
  else if (stamped == null && (t.kind === 'case' || own)) { kind = 'docket'; say(`${head} — cited whole, no page: opened at its first page${suffix}`); unfound(); }
  else if (stamped == null && (t.kind === 'ecf' || t.kind === 'docket' || t.kind === 'exhibit-usb')) { kind = 'docket'; say(`${head} — cited without a page: opened at page 1 (a bare docket reference)${suffix}`); unfound(); }
  else if (stamped == null) { kind = 'docket'; say(`${head} — cited without a page: opened at page 1${suffix}`); unfound(); }
  else if (!pdfPage) { kind = 'bad'; say(`${head} — the registry maps no PDF page for ${own ? 'printed' : 'stamped'} page ${stamped} (${doc.pagemap && !isSectionMap(doc.pagemap) ? 'not in its pagemap and no offset' : doc.offset == null ? 'no offset yet' : 'unstamped'}); opened at page 1 and saying so${suffix}`); }
  else { kind = 'ok'; say(`${head} — ${own ? 'printed' : 'stamped'} page ${stamped}${endStamped ? `–${endStamped}` : ''}, PDF page ${pdfPage}${pdfEnd && pdfEnd !== pdfPage ? `–${pdfEnd}` : ''}${doc.offset ? ` (offset ${doc.offset})` : ''}${suffix}`); unfound(); }
  const q = t.target_quote;
  const quoted = q ? `; the quoted matter: “${q}”` : '';
  // P57 (README 8d361802): a registry row for an image-only scan carries text_layer: false — nothing to box, said with the quote
  if (doc.text_layer === false) { say(' · '); warn(`an image-only scan: nothing to box${quoted}`); return { kind, opens: true, locate: false, parts }; }
  // P80 (README 4bae53bc l.50): a right-to-left print carries 'rtl' — pdf.js hands the VISUAL stream; the checker reads the logical layer
  if (doc.text_layer === 'rtl') { say(' · '); warn(`a right-to-left layer: nothing to box${quoted}`); return { kind, opens: true, locate: false, parts }; }
  if (!q || !pdfPage) return { kind, opens: true, locate: false, parts };
  if (r.passage === undefined) return { kind, opens: true, locate: true, parts };
  const found = r.passage;
  if (found) {
    // THE PASSAGE, WHOLE (README l.34): the whole run boxed on every page it crosses; the retries named as the checker names them
    const rt = String(found[0].retry || '');
    say((found.length > 1 ? ` · boxed across ${found.length} pages` : '') + (rt.includes('d') ? ' · a word joined at a line end' : '') + (rt.includes('e') ? ' · two glued pieces read as two words' : '') + (rt.includes('g') ? " · under the text layer's dropped ligatures (document-level)" : ''));
    if (found[0].headToTail) { say(' · '); warn('boxed from the head to the tail; the middle differs on this layer'); }
    return { kind, opens: true, locate: false, parts };
  }
  say(' · ');
  // an image-only PAGE inside a text document (the registry marks whole files only, P57)
  if (r.hasText === false) warn(`no text layer on ${pdfEnd && pdfEnd !== pdfPage ? 'these pages' : 'this page'} (a scan): nothing to box${quoted}`);
  // N3 (7d866ecf's ruling b65e1e1): a saying names only what was MEASURED. The words present (≥ 80 %) and IN ORDER (passageOrder,
  // mean run ≥ 12 words) — a single-column layer with a word misread (Floyd pdf 3, 'reasou'); present and OUT OF ORDER — a layer
  // whose order differs from the print (Butera pdf 6, Brown v. Chiappetta pdf 13: a West raw layer interleaving its columns inside
  // the lines), the two-column clause ONLY when the fold found a gutter on the span (r.columns); fewer words — not found.
  else if (r.words && r.words.total >= 5 && r.words.present >= 0.8 * r.words.total && passageInOrder(r.order)) warn(`the quote's words are on the page in order, but it does not read whole on this layer (a word misread): nothing to box${quoted}`);
  else if (r.words && r.words.total >= 5 && r.words.present >= 0.8 * r.words.total) warn(`the layer's order differs from the print${r.columns ? ' (a two-column print read across the columns)' : ''}: nothing to box${quoted}`);
  else warn('quote not found at the target');
  return { kind, opens: true, locate: false, parts };
}

// ---------------------------------------------------------------- sidebar
/** Sidebar rows from docs.json: grouped by `group` (in first-seen order),
 *  roots in docket order with their attachments nested under `parent`, each
 *  with `pane` = 'left' | 'right' | null by what the two panes hold. */
export function navRows(docs, open) {
  const left = open && open.left, right = open && open.right;
  const list = docs || [];
  const byId = new Map(list.map(d => [d.id, d]));
  const groups = new Map();
  const kids = new Map();
  const parentOf = (d) => { const p = d.parent || parentIdOf(d.id); return p && p !== d.id && byId.has(p) ? p : null; };
  for (const d of list) {
    const parent = parentOf(d);
    // TWO LEVELS ONLY: a document whose parent is itself nested (registry
    // v0.24's USB exhibits carry parent DDC-053-01, an attachment) is a ROOT
    // of its group — never a grandchild the walk below would drop (136 rows
    // vanished from the nav on 2026-09-30 before this clause).
    if (parent && !parentOf(byId.get(parent))) {
      if (!kids.has(parent)) kids.set(parent, []);
      kids.get(parent).push(d);
      continue;
    }
    const g = d.group || (d.kind === 'caselaw' ? 'Case law' : d.kind === 'statute' ? 'Statutes' : d.kind === 'unfiled' ? 'Unfiled aids' : 'Filings');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(d);
  }
  const cmp = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  // THE TREE (owner 2026-09-29 22:05 CDT: "the ECF files listed in descending
  // order with the attachments (N-NN) nested under their main document (ECF
  // N)"): within Filings the MAIN documents sort by docket number DESCENDING
  // (ECF 77, 76 … 1), a filing without a docket number (Minute Order) last;
  // each parent's attachments ASCENDING by sub-number (51-1 … 51-54, the
  // docket's own order — studio-spec's reading, the owner can flip it). The
  // other groups keep their order. The label is parsed here (docketOf), one
  // parse for the nav and any later sort — no API field.
  const mainCmp = (a, b) => {
    const da = docketOf(a.label || a.id), db = docketOf(b.label || b.id);
    if (da && db) return (db.n - da.n) || cmp(a, b);
    if (da) return -1;
    if (db) return 1;
    return cmp(a, b);
  };
  const subCmp = (a, b) => {
    const da = docketOf(a.label || a.id), db = docketOf(b.label || b.id);
    if (da && db && da.sub != null && db.sub != null) return (da.sub - db.sub) || cmp(a, b);
    return cmp(a, b);
  };
  const paneOf = (id) => (id === left ? 'left' : id === right ? 'right' : null);
  // a document open in BOTH panes carries both flags (R6: the fixture's own
  // internal row is the case); `pane` keeps the first for callers that want one.
  // A row names its group (`inGroup`), its parent (`parent`, attachments) and
  // its attachment count (`kids`, parents) so the page can fold the tree.
  const row = (d, depth, g, extra) => ({ id: d.id, label: d.label || d.id, title: d.title || '', depth,
    pane: paneOf(d.id), left: d.id === left, right: d.id === right,
    unfiled: d.kind === 'unfiled', pages: d.pages, hasLinks: !!d.has_links, kind: d.kind || '',
    counts: d.link_counts || null, inGroup: g, ...extra });
  const rows = [];
  for (const [g, roots] of groups) {
    const filings = g === 'Filings';
    rows.push({ group: g, count: roots.length });
    // SERIES FOLDERS (the USB exhibits, 2026-09-30): exhibit rows whose label
    // is <SERIES>-<n> fold under one synthetic folder per series (METR, PA …
    // in the inventory's order), the IDE idiom the owner asked for; a row
    // without a series stays a plain root after them.
    const folders = seriesFolders(g, roots);
    if (folders) {
      for (const f of folders.series) {
        rows.push({ id: f.id, label: f.label, title: `${f.docs.length} exhibit${f.docs.length === 1 ? '' : 's'}`, depth: 0, pane: null, left: false, right: false,
          unfiled: false, pages: undefined, hasLinks: false, kind: 'series', counts: null, inGroup: g, kids: f.docs.length, parent: null, series: true });
        for (const k of f.docs.sort(cmp)) rows.push(row(k, 1, g, { kids: 0, parent: f.id }));
      }
      for (const r of folders.rest.sort(cmp)) rows.push(row(r, 0, g, { kids: 0, parent: null }));
      continue;
    }
    for (const r of roots.sort(filings ? mainCmp : cmp)) {
      const ks = (kids.get(r.id) || []).sort(filings ? subCmp : cmp);
      rows.push(row(r, 0, g, { kids: ks.length, parent: null }));
      for (const k of ks) rows.push(row(k, 1, g, { kids: 0, parent: r.id }));
    }
  }
  return rows;
}
/** The series an exhibit label names: "METR-24" → "METR", "PA-5-B" → "PA",
 *  "A-12" → "A"; a label with no "-<digit>" has none (null). */
export function seriesOf(label) {
  const m = /^([A-Za-z][A-Za-z0-9 .]*?)-\d/.exec(String(label || '').trim());
  return m ? m[1] : null;
}
/** A group's exhibit rows folded by series: {series: [{id, label, docs}],
 *  rest} in the inventory's order (min `inventory_page`, then first seen);
 *  null when the group holds no exhibit with a series. The folder id is
 *  synthetic (`series:<group>:<SERIES>`) — a nav row, never a document. */
export function seriesFolders(group, roots) {
  const by = new Map(); const rest = [];
  for (const d of roots) {
    const sname = d.kind === 'exhibit' ? seriesOf(d.label || d.id) : null;
    if (!sname) { rest.push(d); continue; }
    if (!by.has(sname)) by.set(sname, { id: `series:${group}:${sname}`, label: sname, docs: [], inv: Infinity, seen: by.size });
    const f = by.get(sname); f.docs.push(d);
    const ip = +d.inventory_page; if (Number.isFinite(ip) && ip < f.inv) f.inv = ip;
  }
  if (!by.size) return null;
  const series = [...by.values()].sort((a, b) => (a.inv - b.inv) || (a.seen - b.seen));
  return { series, rest };
}
/** The docket number a filing's label carries: "ECF 51-54" → {n: 51, sub:
 *  54}; "ECF 74" → {n: 74, sub: null}; "Minute Order" → null. */
export function docketOf(label) {
  const m = /^ECF\s+(\d+)(?:-(\d+))?$/.exec(String(label || '').trim());
  return m ? { n: +m[1], sub: m[2] != null ? +m[2] : null } : null;
}
/** The IDE sidebar's filter over the nav rows: `show` = the ids to keep
 *  (a match on label or title, case-blind, folded; a matching attachment
 *  brings its parent), `expand` = the parents a matching attachment opens;
 *  `show` is null when the query is empty (nothing filtered). */
export function filterNav(rows, query) {
  const q = foldText(query).toLowerCase();
  const show = new Set(), expand = new Set();
  if (!q) return { show: null, expand };
  for (const r of rows || []) {
    if (r.group) continue;
    if (foldText(`${r.label} ${r.title || ''}`).toLowerCase().includes(q)) {
      show.add(r.id);
      if (r.parent) { show.add(r.parent); expand.add(r.parent); }
    }
  }
  return { show, expand };
}
/** THE SIDEBAR'S HIDDEN SET (the owner's word 2026-09-30 03:56 CDT, spec
 *  points 8–10): the rows one reader's sidebar does not draw — a Filings main
 *  whose docket number is below `before` (its attachments with it), every id
 *  in `ids` (a hidden main hides its attachments), never an id in `pins`
 *  (kept in the list by hand), and never a document open in a pane (`keep`:
 *  reveal beats hide — it draws, marked). Returns {hide, dim}: `hide` the ids
 *  not to draw, `dim` the ids drawn although hidden (the kept ones, and the
 *  parent a kept attachment needs). Group headings and series folders are
 *  never hidden. The set is the sidebar's only — nothing here reaches
 *  openLeft/openRight, the API or the registry. */
export function hideRows(rows, { ids = null, before = null, keep = null, pins = null } = {}) {
  const idset = ids instanceof Set ? ids : new Set(ids || []);
  const pinSet = pins instanceof Set ? pins : new Set(pins || []);
  const keepSet = new Set([...(keep instanceof Set ? keep : (keep || []))].filter(Boolean));
  let b = Number.isFinite(+before) && +before > 0 ? +before : null;
  const hide = new Set(), dim = new Set();
  const byId = new Map();
  for (const r of rows || []) if (r.id && !r.group) byId.set(r.id, r);
  const isSeries = (p) => String(p || '').startsWith('series:');
  // P97v (7d866ecf's ruling on the MN measure): a threshold that would hide EVERY docketed main of Filings is INERT —
  // nothing hides by number and the caller says so (`inert`) — so a reader never opens a case to an empty list because
  // another case's number rode in; a threshold some main clears keeps its full effect
  let inert = false;
  if (b) {
    const ns = [];
    for (const r of rows || []) if (!r.group && !r.series && r.id && r.inGroup === 'Filings' && (!r.parent || isSeries(r.parent))) { const d = docketOf(r.label); if (d) ns.push(d.n); }
    if (ns.length && ns.every((n) => n < b)) { inert = true; b = null; }
  }
  const wanted = (r) => {
    if (pinSet.has(r.id)) return false;
    if (idset.has(r.id)) return true;
    const top = r.parent && !isSeries(r.parent) ? byId.get(r.parent) : null;
    if (top && pinSet.has(top.id)) return false;
    if (top && idset.has(top.id)) return true;
    if (b && r.inGroup === 'Filings') { const d = docketOf((top || r).label); if (d && d.n < b) return true; }
    return false;
  };
  for (const r of rows || []) {
    if (r.group || r.series || !r.id) continue;
    if (!wanted(r)) continue;
    if (keepSet.has(r.id)) dim.add(r.id); else hide.add(r.id);
  }
  for (const id of [...dim]) {
    const p = byId.get(id) && byId.get(id).parent;
    if (p && !isSeries(p) && hide.has(p)) { hide.delete(p); dim.add(p); }
  }
  return { hide, dim, inert };
}
/** THE DRAWN TREE — navRows(...) + the sidebar's state → the items a shell
 *  prints, in order, with every flag decided here (lifted from the Studio
 *  shell for the websites' shell, f28bb754, 2026-10-01: one logic, two
 *  skins). `nav` = { filter, hidden (Set of ids), hideOn, hideBefore,
 *  showHidden, open (Set of unfolded parents), groups (Set of unfolded
 *  groups), pins (Set), left, right }. → { items, hiddenCount, empty }:
 *  items = [{ type: 'group', group, open, shown, hidden } | { type: 'row',
 *  row, folder, open, hiddenRow, withinLeft, withinRight, meta }] where meta
 *  = { kind: 'kids', n, counts } for a folded parent, { kind: 'counts',
 *  counts } for a row with link rows, { kind: 'pages', pages } else, null
 *  for a series folder; `empty` = 'none' (no documents) | 'filter' (nothing
 *  matches) | null. The rules: the filter's matches draw with their parents
 *  expanded (filterNav); a hidden row is not drawn unless the session shows
 *  the hidden rows, the filter names it, or a pane has it open (dimmed,
 *  marked); a folded parent carries the pane marks of the documents inside
 *  it; a group heading counts what it shows and says what it hides. */
export function navView(rows, nav) {
  if (!rows.length) return { items: [], hiddenCount: 0, empty: 'none' };
  const { show, expand } = filterNav(rows, nav.filter);
  const hiding = hideRows(rows, { ids: nav.hidden, before: nav.hideOn ? nav.hideBefore : null, keep: [nav.left, nav.right], pins: nav.pins });
  const hiddenIn = new Map();
  for (const r of rows) if (!r.group && !r.series && hiding.hide.has(r.id) && (!r.parent || String(r.parent).startsWith('series:'))) hiddenIn.set(r.inGroup, (hiddenIn.get(r.inGroup) || 0) + 1);
  const hiddenCount = hiding.hide.size + hiding.dim.size;
  const isOpen = (id) => nav.open.has(id) || expand.has(id);
  const groupsShown = new Set();
  if (show) for (const r of rows) if (!r.group && show.has(r.id)) groupsShown.add(r.inGroup);
  // a folded parent carries the pane marks of the documents hidden inside it
  const within = new Map();
  for (const r of rows) if (!r.group && r.parent && (r.left || r.right) && !isOpen(r.parent)) within.set(r.parent, { left: r.left || (within.get(r.parent) || {}).left, right: r.right || (within.get(r.parent) || {}).right });
  const items = [];
  let groupOpen = false, drawnRows = 0;
  for (const r of rows) {
    if (r.group) {
      const shown = show ? groupsShown.has(r.group) : true;
      groupOpen = show ? shown : nav.groups.has(r.group);
      if (!shown) continue;
      items.push({ type: 'group', group: r.group, open: groupOpen, shown: r.count - (hiddenIn.get(r.group) || 0), hidden: hiddenIn.get(r.group) || 0, inert: r.group === 'Filings' && !!hiding.inert });
      continue;
    }
    if (!groupOpen) continue;
    if (show && !show.has(r.id)) continue;
    const hiddenRow = hiding.hide.has(r.id) || hiding.dim.has(r.id);
    if (hiding.hide.has(r.id) && !nav.showHidden && !(show && show.has(r.id))) continue;
    if (r.parent && !isOpen(r.parent)) continue;
    const folder = r.kids > 0, open = folder && isOpen(r.id);
    const w = within.get(r.id) || {};
    const meta = r.series ? null
      : folder && !open ? { kind: 'kids', n: r.kids, counts: r.counts || null }
      : r.counts ? { kind: 'counts', counts: r.counts }
      : { kind: 'pages', pages: r.pages || null };
    items.push({ type: 'row', row: r, folder, open, hiddenRow, withinLeft: !!w.left, withinRight: !!w.right, meta });
    drawnRows++;
  }
  return { items, hiddenCount, empty: drawnRows ? null : 'filter', inert: !!hiding.inert };
}

export function parentIdOf(id) {
  const m = /^(DDC-\d{3})-\d+$/.exec(String(id || ''));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- deep link
// THE STATE STRING: doc=<id>&cite=<page>/<n>[/<k>]&q=<text>&page=<pdf page of
// the left doc>&right=<id>&rpage=<pdf page of the right doc>. The README's
// form is doc + cite; `q` carries the citation's text because n counts
// occurrences of ONE text (R2); the close's unit_id form is accepted on read.
// WHERE IT LIVES (R1, f28bb754's measurement): the shell owns location.hash —
// mode.js replaceStates "#<mode>" on every change and its hashchange
// listener calls setMode — so the state rides the QUERY as the shell's own
// window-identity convention does (?projroot=, ?docfocus=, ?agentweb=1):
// `?casereview=<state, URL-encoded>`, read at boot to pin the mode and
// rewritten by replaceState on every step. A pasted URL restores both
// panes. `parseHash`/`buildHash` keep their names for callers; they parse
// and build the state STRING (a leading '#' or '?casereview=' tolerated).
export function parseHash(hash) {
  let h = String(hash || '').replace(/^#/, '');
  const m = /(?:^|[?&])casereview=([^&]*)/.exec(h);
  if (m) h = decodeURIComponent(m[1]);
  if (!/(^|&)doc=/.test(h)) return null;
  const q = new URLSearchParams(h);
  const int = (v) => { const x = parseInt(v || '', 10); return Number.isFinite(x) && x >= 1 ? x : null; };
  const doc = q.get('doc');
  if (!doc) return null;
  let cite = null;
  const c = q.get('cite');
  if (c) {
    const mm = /^(\d+)\/(\d+)(?:\/(\d+))?$/.exec(c) || /^(?:.+)-(\d+)-(\d+)-(\d+)$/.exec(c);
    if (mm) cite = { page: +mm[1], n: +mm[2], k: mm[3] ? +mm[3] : 1, unit: `${+mm[1]}/${+mm[2]}`, q: q.get('q') || null };
  }
  return { doc, page: int(q.get('page')), cite, right: q.get('right') || null, rpage: int(q.get('rpage')) };
}
/** The state string (no prefix). */
export function buildHash(state) {
  if (!state || !state.doc) return '';
  const q = new URLSearchParams();
  q.set('doc', state.doc);
  if (state.cite) {
    q.set('cite', `${state.cite.page}/${state.cite.n}` + (state.cite.k > 1 ? `/${state.cite.k}` : ''));
    if (state.cite.q) q.set('q', state.cite.q);
  }
  if (state.page) q.set('page', String(state.page));
  if (state.right) { q.set('right', state.right); if (state.rpage) q.set('rpage', String(state.rpage)); }
  return q.toString().replace(/%2F/g, '/');
}
/** The URL for a state: this page's URL with ?casereview=<state>, every other
 *  query key and the shell's hash untouched. */
export function urlForState(base, state) {
  const u = new URL(base);
  const s = buildHash(state);
  if (s) u.searchParams.set('casereview', s); else u.searchParams.delete('casereview');
  return u.toString();
}

/** ONE RECT PER LINE (the owner's word 2026-09-30: "the entire relevant section
 *  should be highlighted"): a located run comes back as one rect per pdf.js
 *  PIECE — word-sized on an OCR layer — and a whole page of them paints as a
 *  brick wall, not a highlight (a168bcf6's frame at c58008aa). The rects of one
 *  box that sit on one LINE and run on from each other merge into one; a gap
 *  wider than `gap` (percent of the page width — a word space is under 1, a
 *  column gutter 4 and more) keeps them apart, so two columns on one baseline
 *  stay two rects. Percent rects in, percent rects out, in reading order; a
 *  rect with no width is dropped; `measured` survives when any part had it. */
export function mergeLineRects(rects, { gap = 2.5 } = {}) {
  const src = (rects || []).filter(r => r && r.width > 0 && r.height > 0).map(r => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, cy: r.top + r.height / 2 }));
  src.sort((a, b) => (a.cy - b.cy) || (a.left - b.left));
  const lines = [];
  for (const r of src) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(r.cy - L.cy) < 0.5 * Math.min(r.height, L.h)) { L.rects.push(r); L.cy = (L.cy * (L.rects.length - 1) + r.cy) / L.rects.length; L.h = Math.min(L.h, r.height); }
    else lines.push({ cy: r.cy, h: r.height, rects: [r] });
  }
  const out = [];
  for (const L of lines) {
    L.rects.sort((a, b) => a.left - b.left);
    let cur = null;
    for (const r of L.rects) {
      if (cur && r.left - cur.right <= gap) { cur.right = Math.max(cur.right, r.right); cur.top = Math.min(cur.top, r.top); cur.bottom = Math.max(cur.bottom, r.bottom); cur.measured = cur.measured || !!r.measured; }
      else { if (cur) out.push(cur); cur = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, measured: !!r.measured }; }
    }
    if (cur) out.push(cur);
  }
  return out.map(c => ({ left: c.left, top: c.top, width: c.right - c.left, height: c.bottom - c.top, ...(c.measured ? { measured: true } : {}) }));
}
