import type { NextConfig } from 'next';

// Static export: the whole site is plain HTML/CSS/JS under out/, served by
// Netlify with no framework runtime. Redirects and headers live in netlify.toml.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  // The Studio's SITES preview (and anyone opening the dev server by address rather than by
  // name) reaches it as 127.0.0.1: Next blocks its own dev resources cross-origin unless the
  // host is listed, and the PDF viewer then never gets its worker (studio-spec finding,
  // 2026-09-15). Dev only; the static export has no dev origin.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // `next dev` otherwise appends a vendor 'agent rules' block to CLAUDE.md on every start — the
  // realm charter is the owner's document, not a build artefact (2026-09-15)
  agentRules: false,
  // dev only: forwarded '[browser]' console lines carry file:line, for the Studio's issue capture
  // (studio-spec ask, 2026-09-15). In Next 16.3 the key lives under `experimental` (16.2 had it at
  // the top level); the successor `logging.browserToTerminal` has no source-location option yet.
  experimental: { browserDebugInfoInTerminal: { showSourceLocation: true } },
};

export default nextConfig;
