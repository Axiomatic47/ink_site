import type { Config } from 'tailwindcss';

// Palette — "navy & brass": distinct from lawsofexistence.com's warm paper +
// terracotta. Deep navy chrome, stone paper surfaces, brass accent.
export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1b2540',        // navy — header, footer, headings
        'ink-2': '#263352',    // lifted navy — hover / active chrome
        paper: '#f4f1ea',      // page surface
        card: '#fbfaf6',       // raised surfaces
        well: '#e9e4d8',       // viewer well / sunken surfaces
        rule: '#d8d2c4',       // hairlines
        muted: '#5f6673',      // secondary text
        accent: '#b08d57',     // brass
        'accent-ink': '#8a6b3a',
        'on-ink': '#f4f1ea',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Charter', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      maxWidth: { site: '80rem' },
      boxShadow: { card: '0 1px 2px rgba(27,37,64,0.06), 0 8px 24px -12px rgba(27,37,64,0.18)' },
    },
  },
  plugins: [],
} satisfies Config;
