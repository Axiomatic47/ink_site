// netlify/functions/admin.mjs — the owner's console at /admin (owner word
// 2026-09-09). Sign-in is OpenID Connect against Auth0 (netlify/lib/admin-auth.mjs);
// only e-mails in ADMIN_EMAILS get a session. Pages: home, /admin/readings
// (Open Readings queue), /admin/rebuild (build hook), /admin/logout.
// The emergency passphrase (MODERATION_KEY) signs in ONLY while Auth0 is not
// configured — it bypasses the identity provider, the allow-list and MFA, so the
// moment AUTH0_* + ADMIN_EMAILS are set the route answers 404 and the console
// asks for the variable to be deleted (docs/ADMIN_CONSOLE_SECURITY_PLAN.md §2.2).
import { timingSafeEqual } from 'node:crypto';
import { authConfig, session, csrfToken, csrfOk, beginLogin, completeLogin, logoutLocation, logoutCookies, sessionCookie } from '../lib/admin-auth.mjs';
import { page, redirect, flashFrom } from '../lib/admin-ui.mjs';
import { handleReadings, readingsCounts, recentActivity } from '../lib/readings-moderation.mjs';
import { escapeHtml as h } from '../lib/readings-format.mjs';

const passphraseActive = cfg => Boolean(process.env.MODERATION_KEY) && cfg.missing.length > 0;

const origin = url => `https://${process.env.ADMIN_HOST || url.host}`;

function passphraseOk(given) {
  const key = process.env.MODERATION_KEY;
  if (!key || key.length < 16 || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signInPage(cfg, url) {
  const configured = cfg.missing.length === 0;
  const body = `<h1>Kirchner.ink — console</h1><p class="sub">Sign in to moderate Open Readings answers.</p>
${configured ? '<p><a class="btn pub" href="/admin/login">Sign in</a></p>' : `<div class="card"><b class="warn">Auth0 sign-in is not configured.</b><br><small>Missing: ${h(cfg.missing.join(', '))}. Set them as environment variables in the Netlify dashboard and redeploy.</small></div>`}
${configured && process.env.MODERATION_KEY ? '<p><small class="warn">MODERATION_KEY is still set. It no longer signs anyone in; delete the variable in the Netlify dashboard.</small></p>' : ''}
${passphraseActive(cfg) ? `<details style="margin-top:2rem"><summary><small>Emergency passphrase (Auth0 not configured)</small></summary><form method="post" action="/admin/passphrase" class="card" style="display:grid;gap:.75rem;max-width:28rem;margin-top:.75rem"><label>Passphrase<br><input type="password" name="passphrase" autocomplete="current-password" required></label><div><button type="submit">Sign in</button></div></form></details>` : ''}`;
  return page({ title: 'Console — sign in', body, ...flashFrom(url) });
}

async function home(url, sess, csrf, cfg) {
  const c = await readingsCounts();
  const audit = await recentActivity(20);
  const body = `<h1>Console</h1><p class="sub">Signed in as ${h(sess.email)}. Sessions last eight hours. Queue store: <code>${h(c.kind)}</code>${c.kind.startsWith('blobs') ? '' : ' <b class="warn">— not Netlify Blobs; submissions cannot be queued</b>'}. Netlify Forms sync: ${process.env.NETLIFY_AUTH_TOKEN && process.env.SITE_ID ? 'on (diagnostic — the token is account-wide; revoke it once the queue is proven)' : 'off'}. Build hook: ${process.env.BUILD_HOOK_URL ? 'set' : 'not set'}.</p>
${cfg.missing.length === 0 && process.env.MODERATION_KEY ? '<div class="flash bad">MODERATION_KEY is still set. Auth0 is configured, so the passphrase no longer signs anyone in — delete the variable in the Netlify dashboard.</div>' : ''}
${passphraseActive(cfg) ? '<div class="flash bad">Signed in by emergency passphrase because Auth0 is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET and ADMIN_EMAILS, redeploy, then delete MODERATION_KEY.</div>' : ''}
<div class="grid">
<div class="card"><div class="n">${c.pending}</div>Open Readings answers waiting<br><a class="btn" style="margin-top:.6rem" href="/admin/readings">Open the queue</a></div>
<div class="card"><div class="n">${c.approved}</div>Approved, publishing at the next build${process.env.BUILD_HOOK_URL ? `<form method="post" action="/admin/rebuild" style="margin-top:.6rem"><input type="hidden" name="csrf" value="${h(csrf)}"><button name="action" value="rebuild">Rebuild now</button></form>` : '<br><small>Publishes with the next integrate.</small>'}</div>
</div>
<h2>Recent activity</h2>
${audit.length ? `<div class="card" style="padding:.5rem 1rem"><table style="width:100%;border-collapse:collapse;font-size:.9rem">${audit.map(a => `<tr><td style="padding:.3rem .5rem .3rem 0;white-space:nowrap;color:var(--muted)">${h(a.at.replace('T', ' ').slice(0, 16))}</td><td style="padding:.3rem .5rem">${h(a.actor)}</td><td style="padding:.3rem .5rem"><b>${h(a.action)}</b></td><td style="padding:.3rem .5rem">${h(a.collection)}${a.collection && a.item_id ? '/' : ''}${h(a.item_id)} <small>${h(a.id)}</small></td></tr>`).join('')}</table></div>` : '<p class="empty">No actions recorded yet.</p>'}`;
  return page({ title: 'Console', body, sess, ...flashFrom(url) });
}

const handler = async req => {
  const url = new URL(req.url);
  const cfg = authConfig();
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const callbackUri = `${origin(url)}/admin/callback`;

  // --- sign-in flow (no session needed)
  if (path === '/admin/login') {
    if (cfg.missing.length) return redirect('/admin', { flash: `Not configured: ${cfg.missing.join(', ')}`, bad: true });
    const { location, cookie } = beginLogin(cfg, callbackUri);
    return new Response(null, { status: 302, headers: { location, 'set-cookie': cookie, 'cache-control': 'no-store' } });
  }
  if (path === '/admin/callback') {
    if (cfg.missing.length) return redirect('/admin', { flash: 'Not configured.', bad: true });
    const r = await completeLogin(cfg, req, callbackUri);
    if (r.error) return page({ title: 'Sign-in failed', body: `<h1>Sign-in failed</h1><p class="sub">${h(r.error)}</p><p><a class="btn" href="/admin">Back</a></p>`, status: r.status || 401 });
    // Same-site continuation: the Strict session cookie would stay home on a 303
    // that follows the cross-site arrival from Auth0, so hand the browser a page
    // that navigates itself (meta refresh) — that navigation is same-site.
    const dest = `/admin?m=${encodeURIComponent(`Signed in as ${r.session.email}.`)}`;
    return page({ title: 'Signed in', body: `<h1>Signed in</h1><p class="sub">Continuing to the console…</p><p><a class="btn" href="${h(dest)}">Continue</a></p><meta http-equiv="refresh" content="0;url=${h(dest)}">`, headers: { 'set-cookie': r.cookies } });
  }
  if (path === '/admin/passphrase' && req.method === 'POST') {
    if (!passphraseActive(cfg)) return page({ title: 'Not found', body: '<h1>Not found</h1><p class="sub">The emergency passphrase is disabled because Auth0 is configured. Delete MODERATION_KEY.</p><p><a class="btn" href="/admin">Console</a></p>', status: 404 });
    const form = await req.formData();
    if (!passphraseOk(form.get('passphrase'))) { await new Promise(r => setTimeout(r, 800)); return redirect('/admin', { flash: 'That passphrase did not match.', bad: true }); }
    const iat = Math.floor(Date.now() / 1000);
    const sess = { email: 'passphrase', name: 'emergency passphrase', iat, exp: iat + 4 * 3600 };
    const secretCfg = cfg.clientSecret ? cfg : { clientSecret: process.env.MODERATION_KEY };
    return redirect('/admin', { cookies: [sessionCookie(secretCfg, sess, 4 * 3600)], flash: 'Signed in with the emergency passphrase.' });
  }
  if (path === '/admin/logout') {
    const hs = new Headers({ location: cfg.missing.length ? '/admin' : logoutLocation(cfg, `${origin(url)}/admin`), 'cache-control': 'no-store' });
    for (const c of logoutCookies()) hs.append('set-cookie', c);
    return new Response(null, { status: 303, headers: hs });
  }

  // --- everything else needs a session
  const sess = session(req, cfg) || (passphraseActive(cfg) && !cfg.clientSecret ? session(req, { clientSecret: process.env.MODERATION_KEY }) : null);
  if (!sess) return path === '/admin' ? signInPage(cfg, url) : redirect('/admin', { flash: 'Please sign in.', bad: true });
  const keyCfg = cfg.clientSecret ? cfg : { clientSecret: process.env.MODERATION_KEY };
  const ctx = { sess, csrf: csrfToken(keyCfg, sess), csrfOk: given => csrfOk(keyCfg, sess, given) };

  if (path === '/admin') return home(url, sess, ctx.csrf, cfg);
  if (path === '/admin/readings') return handleReadings(req, url, ctx);
  if (path === '/admin/rebuild' && req.method === 'POST') {
    const form = await req.formData();
    if (!ctx.csrfOk(form.get('csrf'))) return page({ title: 'Refused', body: '<h1>Refused</h1>', status: 403, sess });
    if (!process.env.BUILD_HOOK_URL) return redirect('/admin', { flash: 'No BUILD_HOOK_URL configured.', bad: true });
    const r = await fetch(process.env.BUILD_HOOK_URL, { method: 'POST' });
    return redirect('/admin', { flash: r.ok ? 'Rebuild requested — approved answers publish when it finishes (a few minutes).' : `Build hook answered ${r.status}.`, bad: !r.ok });
  }
  return page({ title: 'Not found', body: '<h1>Not found</h1><p><a class="btn" href="/admin">Console</a></p>', status: 404, sess });
};

export default handler;
export const config = { path: ['/admin', '/admin/*'] };
