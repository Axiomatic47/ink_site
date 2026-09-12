// netlify/lib/admin-ui.mjs — the console's page shell (server-rendered HTML,
// no client script; inline styles are allowed by the site CSP).
import { escapeHtml as h } from './readings-format.mjs';

const CSS = `
:root{color-scheme:light dark;--fg:#1d1a16;--muted:#6b6459;--bg:#faf8f4;--card:#fff;--line:#e2ddd3;--ok:#2f6b3a;--warn:#8a5a12;--bad:#8a2a2a}
@media(prefers-color-scheme:dark){:root{--fg:#ebe6dc;--muted:#a39b8e;--bg:#17150f;--card:#1f1c16;--line:#3a352c;--ok:#7fc48a;--warn:#e0a94a;--bad:#e07a7a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Georgia,'Times New Roman',serif}
main{max-width:52rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
nav{display:flex;gap:1.25rem;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:.75rem;margin-bottom:1.5rem;flex-wrap:wrap}
nav .brand{font-weight:600;letter-spacing:.02em}nav a{color:var(--fg);text-decoration:none}nav a:hover{text-decoration:underline}nav .who{margin-left:auto;color:var(--muted);font-size:.85rem}
h1{font-size:1.5rem;margin:0 0 .25rem}h2{margin:2rem 0 .75rem;color:var(--muted);font-weight:normal;letter-spacing:.04em;text-transform:uppercase;font-size:.8rem}
.sub{color:var(--muted);margin:0 0 1.5rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem}.grid .card{margin:0}.card .n{font-size:2rem;line-height:1;font-variant-numeric:tabular-nums}
.row{display:grid;grid-template-columns:8rem 1fr;gap:.25rem 1rem;margin:.15rem 0}.k{color:var(--muted);font-size:.85rem;padding-top:.15rem}
.he{font-family:'Noto Serif Hebrew','SBL Hebrew','Times New Roman',serif;font-size:1.15rem;direction:rtl;unicode-bidi:isolate}
.priv{border-top:1px dashed var(--line);margin-top:.75rem;padding-top:.6rem;font-size:.9rem;color:var(--muted)}
.preview{border-left:3px solid var(--line);padding:.5rem .9rem;margin:.75rem 0;background:var(--bg);border-radius:0 8px 8px 0}
.preview .who{font-weight:600}.preview .when{color:var(--muted);float:right;font-size:.85rem}
.actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.9rem;align-items:center}
button,.btn{font:inherit;padding:.45rem .95rem;border-radius:7px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;text-decoration:none;display:inline-block}
button.pub,.btn.pub{border-color:var(--ok);color:var(--ok);font-weight:600}button.rej{border-color:var(--bad);color:var(--bad)}button:focus-visible,.btn:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
input[type=password]{font:inherit;width:100%;padding:.5rem .6rem;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--fg)}
.warn{color:var(--warn)}.bad{color:var(--bad)}.ok{color:var(--ok)}.empty{color:var(--muted);font-style:italic}
.flash{background:var(--card);border:1px solid var(--ok);color:var(--ok);border-radius:8px;padding:.6rem 1rem;margin-bottom:1rem}
.flash.bad{border-color:var(--bad);color:var(--bad)}
small{color:var(--muted)}
`;

/** full page; `sess` (optional) adds the console nav */
export function page({ title, body, status = 200, headers = {}, sess = null, flash = '', flashBad = false }) {
  const nav = sess ? `<nav><span class="brand"><a href="/admin">Console</a></span><a href="/admin/readings">Open Readings</a><a href="/" target="_blank" rel="noopener">Site</a><span class="who">${h(sess.name || sess.email)} · <a href="/admin/logout">Sign out</a></span></nav>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${h(title)}</title><style>${CSS}</style></head><body><main>${nav}${flash ? `<div class="flash${flashBad ? ' bad' : ''}">${h(flash)}</div>` : ''}${body}</main></body></html>`;
  // The console is server-rendered HTML with one inline style block and no
  // script, image or frame — the policy says exactly that. netlify.toml headers
  // apply to static files only, so function responses carry their own.
  const hs = new Headers({
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  });
  for (const [k, v] of Object.entries(headers)) for (const vv of (Array.isArray(v) ? v : [v])) hs.append(k, vv);
  return new Response(html, { status, headers: hs });
}

/** 303 with optional cookies and a flash message carried in ?m= (or ?e= for errors) */
export function redirect(location, { cookies = [], flash = '', bad = false } = {}) {
  const hs = new Headers({ location: flash ? `${location}${location.includes('?') ? '&' : '?'}${bad ? 'e' : 'm'}=${encodeURIComponent(flash)}` : location });
  for (const c of cookies) hs.append('set-cookie', c);
  return new Response(null, { status: 303, headers: hs });
}

export function flashFrom(url) {
  return { flash: url.searchParams.get('m') || url.searchParams.get('e') || '', flashBad: Boolean(url.searchParams.get('e')) };
}
