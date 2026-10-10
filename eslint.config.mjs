import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['out/**', '.next/**', 'node_modules/**', 'next-env.d.ts', 'public/pdfjs/**', '.cache/**', 'public/casereview/**', 'public/lib/**'] }, // public/pdfjs = vendored pdf.js assets (fonts, cmaps, wasm fallbacks); .cache = build output (the test:letter bundle), gitignored; public/casereview + public/lib = the Studio's Case Review window and its pdf.js, vendored byte for byte (scripts/sync-casereview.mjs governs them, never eslint)
];

export default config;
