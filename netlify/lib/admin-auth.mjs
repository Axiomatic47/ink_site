// netlify/lib/admin-auth.mjs — sign-in for the owner's console (/admin).
//
// OpenID Connect Authorization Code flow with PKCE against Auth0; the ID token
// is verified HERE (RS256 against the tenant's JWKS, iss/aud/exp/nonce), the
// e-mail must be verified and listed in ADMIN_EMAILS, and the result is a signed
// session cookie. No library: node:crypto only, so the function bundle stays
// small and every check is readable in this file.
//
// Env: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, ADMIN_EMAILS.
// The session/CSRF key is derived from the client secret — nothing extra to manage.
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

export const SESSION_COOKIE = 'ink_admin';
const FLOW_COOKIE = 'ink_admin_flow';
const SESSION_TTL_S = 8 * 3600;
const FLOW_TTL_S = 600;

export function authConfig(env = process.env) {
  const domain = (env.AUTH0_DOMAIN || env.AUTH0_ISSUER_BASE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const clientId = env.AUTH0_CLIENT_ID || '';
  const clientSecret = env.AUTH0_CLIENT_SECRET || '';
  const admins = (env.ADMIN_EMAILS || '').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const missing = [!domain && 'AUTH0_DOMAIN', !clientId && 'AUTH0_CLIENT_ID', !clientSecret && 'AUTH0_CLIENT_SECRET', !admins.length && 'ADMIN_EMAILS'].filter(Boolean);
  return { domain, clientId, clientSecret, admins, missing, issuer: `https://${domain}/` };
}

// ---------------------------------------------------------------- encoding
const b64u = buf => Buffer.from(buf).toString('base64url');
const fromB64u = s => Buffer.from(s, 'base64url');
const sessionKey = cfg => createHash('sha256').update(cfg.clientSecret + ':session').digest();
const hmac = (cfg, data) => createHmac('sha256', sessionKey(cfg)).update(data).digest();

/** sign an object into "payload.sig" (base64url) */
export function sign(cfg, obj) {
  const payload = b64u(JSON.stringify(obj));
  return `${payload}.${b64u(hmac(cfg, payload))}`;
}
/** verify "payload.sig" → object, or null (bad signature or expired) */
export function unsign(cfg, token) {
  if (!token || !cfg.clientSecret) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = hmac(cfg, payload), given = fromB64u(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const obj = JSON.parse(fromB64u(payload).toString('utf8'));
    if (typeof obj.exp !== 'number' || obj.exp * 1000 < Date.now()) return null;
    return obj;
  } catch { return null; }
}

export function readCookie(req, name) {
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : null;
}
// The SESSION cookie is SameSite=Strict: no cross-site request ever carries it.
// The FLOW cookie must be Lax — the Auth0 callback is a cross-site navigation and
// has to read the state/nonce/verifier. Because Strict cookies also stay home on
// the redirect that follows a cross-site navigation, the callback answers with a
// same-site meta refresh (see admin.mjs) instead of a 303.
const setCookie = (name, value, maxAge, sameSite = 'Strict', path = '/admin') => `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
const clearCookie = (name, path = '/admin') => `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export const sessionCookie = (cfg, sess, ttl = SESSION_TTL_S) => setCookie(SESSION_COOKIE, sign(cfg, sess), ttl);

// ---------------------------------------------------------------- session
export function session(req, cfg) {
  const s = unsign(cfg, readCookie(req, SESSION_COOKIE));
  return s && s.email ? s : null;
}
export function csrfToken(cfg, sess) {
  return b64u(hmac(cfg, `csrf:${sess.email}:${sess.iat}`)).slice(0, 32);
}
export function csrfOk(cfg, sess, given) {
  const a = Buffer.from(csrfToken(cfg, sess)), b = Buffer.from(String(given ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
export const logoutCookies = () => [clearCookie(SESSION_COOKIE), clearCookie(FLOW_COOKIE)];

// ---------------------------------------------------------------- OIDC
/** step 1: redirect to Auth0 */
export function beginLogin(cfg, redirectUri) {
  const state = b64u(randomBytes(24)), nonce = b64u(randomBytes(24)), verifier = b64u(randomBytes(48));
  const challenge = b64u(createHash('sha256').update(verifier).digest());
  const flow = sign(cfg, { state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + FLOW_TTL_S });
  const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: redirectUri, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' });
  return { location: `https://${cfg.domain}/authorize?${q}`, cookie: setCookie(FLOW_COOKIE, flow, FLOW_TTL_S, 'Lax') };
}

/** step 2: callback → verified identity or {error} */
export async function completeLogin(cfg, req, redirectUri, fetchImpl = fetch) {
  const url = new URL(req.url);
  const flow = unsign(cfg, readCookie(req, FLOW_COOKIE));
  if (!flow) return { error: 'The sign-in took too long or the browser lost its cookie. Start again.' };
  if (url.searchParams.get('error')) return { error: `Auth0: ${url.searchParams.get('error_description') || url.searchParams.get('error')}` };
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!code || !state || state !== flow.state) return { error: 'The sign-in response did not match the request (state).', status: 400 };
  const res = await fetchImpl(`https://${cfg.domain}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: cfg.clientId, client_secret: cfg.clientSecret, code, code_verifier: flow.verifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) return { error: `Auth0 refused the code exchange (${res.status}).`, status: 502 };
  const tokens = await res.json();
  const claims = await verifyIdToken(cfg, tokens.id_token, flow.nonce, fetchImpl);
  if (claims.error) return claims;
  const email = String(claims.email || '').toLowerCase();
  if (!claims.email_verified) return { error: `The e-mail on this account (${email}) is not verified.`, status: 403 };
  if (!cfg.admins.includes(email)) return { error: `${email} is not on the console's allow-list.`, status: 403 };
  const iat = Math.floor(Date.now() / 1000);
  const sess = { email, name: claims.name || email, iat, exp: iat + SESSION_TTL_S };
  return { session: sess, cookies: [sessionCookie(cfg, sess), clearCookie(FLOW_COOKIE)] };
}

export function logoutLocation(cfg, returnTo) {
  return `https://${cfg.domain}/v2/logout?${new URLSearchParams({ client_id: cfg.clientId, returnTo })}`;
}

/** RS256 ID token → claims, checking signature (JWKS), iss, aud, exp, nonce */
export async function verifyIdToken(cfg, idToken, nonce, fetchImpl = fetch) {
  if (!idToken) return { error: 'No ID token returned.', status: 502 };
  const parts = idToken.split('.');
  if (parts.length !== 3) return { error: 'Malformed ID token.', status: 502 };
  let header, claims;
  try { header = JSON.parse(fromB64u(parts[0]).toString('utf8')); claims = JSON.parse(fromB64u(parts[1]).toString('utf8')); } catch { return { error: 'Unreadable ID token.', status: 502 }; }
  if (header.alg !== 'RS256') return { error: `Unexpected token algorithm ${header.alg}.`, status: 502 };
  const jw = await fetchImpl(`https://${cfg.domain}/.well-known/jwks.json`);
  if (!jw.ok) return { error: 'Could not fetch the tenant signing keys.', status: 502 };
  const { keys } = await jw.json();
  const jwk = (keys || []).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) return { error: 'ID token signed by an unknown key.', status: 502 };
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, fromB64u(parts[2]));
  if (!ok) return { error: 'ID token signature is invalid.', status: 502 };
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== cfg.issuer) return { error: `ID token issuer ${claims.iss} is not ${cfg.issuer}.`, status: 502 };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) return { error: 'ID token audience is not this console.', status: 502 };
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) return { error: 'ID token has expired.', status: 502 };
  if (claims.nonce !== nonce) return { error: 'ID token nonce mismatch.', status: 502 };
  return claims;
}
