import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['out/**', '.next/**', 'node_modules/**', 'next-env.d.ts', 'public/pdfjs/**', '.cache/**'] }, // public/pdfjs = vendored pdf.js assets (fonts, cmaps, wasm fallbacks); .cache = build output (the test:letter bundle), gitignored
];

export default config;
