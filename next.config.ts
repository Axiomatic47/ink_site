import type { NextConfig } from 'next';

// Static export: the whole site is plain HTML/CSS/JS under out/, served by
// Netlify with no framework runtime. Redirects and headers live in netlify.toml.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
