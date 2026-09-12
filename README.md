# kirchner.ink

Joseph Kirchner's CV and professional site. Static Next.js export deployed by
Netlify from `main`.

- Content: edit `content/cv.json` (the only content file). Empty sections are
  not rendered; the build refuses placeholder text.
- PDF: drop the CV PDF under `public/` and set `"pdf": "/Joseph_Kirchner_CV.pdf"`
  in cv.json to render the download link. The page also prints cleanly
  (File → Print → Save as PDF).
- Develop: `npm install`, `npm run dev`. Gates: `npm run build`, `npm run lint`.
- Resume: `Joseph_Kirchner_Resume.md` (repo root) is the SOURCE — a Studio
  filing doc rendered by the Studio's `resume` converter (Word is the
  renderer; `*.docx` is gitignored). `npm run cv:sync` derives cv.json from
  it (`cv:check` fails if cv.json is stale). Private contact data lives
  outside the repo (`~/.config/kirchner-cv/private.json`); the build gate
  refuses it in cv.json. `Joseph_Kirchner_References.md` is the references
  sheet's header; the references themselves are private and hand-sent.
- Realm rules: `CLAUDE.md`.
