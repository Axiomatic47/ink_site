# standard_fonts — pdf.js's substitutes for the base-14 fonts

Copied 2026-09-30 from `pdfjs-dist@6.3.289/standard_fonts/` (the same files
ship unchanged across pdf.js versions; the vendored viewer is 4.10.38), for
`standardFontDataUrl: '/lib/pdfjs/standard_fonts/'` in both getDocument calls
(deck/casereview_pdf.js, editor/panes.js). Why: website-developer f28bb754's
N1 on the Case Review pane (2026-09-29) saw the base-14 fixture draw boxes
over white in an offscreen snap. MEASURED AFTERWARDS (a168bcf6 + b0d76502,
2026-09-29 evening): that white was the snapshot harness — its hidden
WebView never fires requestAnimationFrame, which pdf.js waits on for a
display render — not missing fonts. On this Mac pdf.js substitutes a system
face for base-14 Helvetica and paints every glyph with a bogus font path
(4,539 dark px at scale 1.5, print intent); the vendored files load and are
used only when system fonts are refused (useSystemFonts:false → 4,221 dark
px, the Liberation glyphs). The vendoring stays right for what a system font
cannot cover — Symbol, ZapfDingbats, a machine without the face — it just
was not the cause of what N1 saw. Licences: LICENSE_FOXIT (the Foxit Type 1
fonts), LICENSE_LIBERATION (Liberation Sans, SIL OFL). Ten .pfb + four .ttf
files.
