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
};

export default nextConfig;
