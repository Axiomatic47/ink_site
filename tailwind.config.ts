import type { Config } from 'tailwindcss';

// Palette — "navy & brass": distinct from lawsofexistence.com's warm paper +
// terracotta. Deep navy chrome, stone paper surfaces, brass accent. Dark mode
// (owner 2026-09-15, as lawsofexistence.com has): class `dark` on <html>,
// chosen by the header toggle (light / dark / system), remembered in
// localStorage `jk-theme`, applied before first paint by the inline script in
// app/layout.tsx.
export default {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // every token is an RGB triple in app/globals.css (:root light, .dark dark) so the
        // `/opacity` modifiers keep working and the whole site flips with one class
        ink: 'rgb(var(--c-ink) / <alpha-value>)',          // foreground: headings, body text; also the primary button face
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',    // lifted foreground — hover of ink surfaces
        paper: 'rgb(var(--c-paper) / <alpha-value>)',      // page surface
        card: 'rgb(var(--c-card) / <alpha-value>)',        // raised surfaces
        well: 'rgb(var(--c-well) / <alpha-value>)',        // viewer well / sunken surfaces
        rule: 'rgb(var(--c-rule) / <alpha-value>)',        // hairlines
        muted: 'rgb(var(--c-muted) / <alpha-value>)',      // secondary text
        accent: 'rgb(var(--c-accent) / <alpha-value>)',    // brass
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        'on-ink': 'rgb(var(--c-on-ink) / <alpha-value>)',  // text on an ink surface
        chrome: 'rgb(var(--c-chrome) / <alpha-value>)',    // header + footer bar (navy in both modes)
        'chrome-2': 'rgb(var(--c-chrome-2) / <alpha-value>)',
        'on-chrome': 'rgb(var(--c-on-chrome) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Charter', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      maxWidth: { site: '80rem' },
      boxShadow: { card: 'var(--shadow-card)' },
    },
  },
  plugins: [],
} satisfies Config;
