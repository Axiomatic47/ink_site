// netlify/lib/analytics-core.mjs — the counter's pure part, shared by the edge
// function (Deno) and the console + rollup (Node). Web-standard only: no `node:`
// imports, so both runtimes load it unchanged and `deno check` proves the edge side.
//
// What one page view becomes (a "raw" record, one blob per view):
//   { d: 'YYYY-MM-DD' (owner's zone), h: 0..23, p: '/path', r: 'referrer host' | '',
//     c: 'US' | '', v: 'phone' | 'tablet' | 'desktop' | 'unknown', u: visitor hash, t: ISO time }
// The visitor hash is sha256(daily salt · site host · ip · user agent), 16 hex chars.
// The salt is random per day and deleted when the day closes; the hash then means
// nothing to anyone. No IP, no user agent, no cookie is ever stored.

export const STORE_BASE = 'analytics';
export const DEFAULT_TZ = 'America/Chicago';
export const PATH_MAX = 200;
export const TOP_N = 500;
export const RAW_PREFIX = 'raw/';
export const DAY_PREFIX = 'day/';
export const SALT_PREFIX = 'salt/';
export const LOCK_KEY = 'lock/rollup';
export const LOCK_TTL_MS = 2 * 60 * 1000;
export const DEVICES = ['phone', 'tablet', 'desktop', 'unknown'];

/** the store's name follows the deploy context, so a branch deploy or preview
 *  records into its own store and production numbers stay production's */
export function storeNameFor(deployContext) {
  const c = String(deployContext || 'production').toLowerCase();
  return c === 'production' ? STORE_BASE : `${STORE_BASE}-${c.replace(/[^a-z0-9-]/g, '-').slice(0, 40)}`;
}

// ------------------------------------------------------------------ time
const fmtCache = new Map();
function formatter(tz) {
  if (fmtCache.has(tz)) return fmtCache.get(tz);
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' };
  let f;
  try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts }); }
  catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...opts }); }
  fmtCache.set(tz, f);
  return f;
}
/** { day: 'YYYY-MM-DD', hour: 0..23 } of an instant in the owner's zone (UTC if the zone is unknown) */
export function localParts(ts, tz = DEFAULT_TZ) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(new Date(ts))) if (p.type !== 'literal') parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}
export const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
/** 'YYYY-MM-DD' shifted by n days (calendar arithmetic, no zone involved) */
export function shiftDay(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** a day may close once the owner's clock has been in a later day for at least an hour:
 *  every view stamped with that day has long since landed */
export function closable(day, now, tz = DEFAULT_TZ) {
  return localParts(now, tz).day > day && localParts(now - 3600 * 1000, tz).day > day;
}

// ------------------------------------------------------------------ fields
/** the page path as it is counted: no query, no fragment, no trailing slash,
 *  no .html, nothing private; null when the path is not worth a record */
export function normalizePath(p) {
  if (typeof p !== 'string') return null;
  let s = p.trim();
  if (!s.startsWith('/')) return null;
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  try { s = decodeURIComponent(s); } catch { return null; }
  s = s.replace(/\/{2,}/g, '/');
  if (s.endsWith('.html')) s = s.slice(0, -5) || '/';
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  if (s === '/index') s = '/';
  if (/[\u0000-\u001f\u007f<>"'`\\]/.test(s)) return null;
  if (s.length > PATH_MAX) return null;
  if (/^\/(admin|api|\.netlify)(\/|$)/.test(s)) return null;
  return s;
}
/** hostname of a URL-ish string, lower-case, without a leading www.; '' when unusable */
export function hostOf(u) {
  if (typeof u !== 'string' || !u) return '';
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
/** the referrer's host, or '' when it is this site, empty or unusable */
export function refHost(ref, ownHost) {
  const h = hostOf(ref);
  if (!h || h.length > 100) return '';
  if (h === String(ownHost || '').toLowerCase().replace(/^www\./, '')) return '';
  if (h === 'localhost' || h === '127.0.0.1') return '';
  return h;
}
/** device class from the viewport width — the sites' own breakpoints (sm 640, lg 1024) */
export function deviceClass(w) {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  return n < 640 ? 'phone' : n < 1024 ? 'tablet' : 'desktop';
}
/** ISO 3166 alpha-2 or '' */
export function countryCode(c) {
  const s = String(c || '').toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : '';
}

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|chrome-lighthouse|preview|python-requests|python-urllib|curl\/|wget\/|httpclient|go-http-client|okhttp|java\/|libwww|axios|node-fetch|undici|scrapy|facebookexternalhit|embedly|quora link|monitor|uptime|pingdom|statuscake|site24x7|newrelic|datadog|phantomjs|selenium|puppeteer|playwright|webdriver|dataprovider|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|yandex|baidu|duckduckgo|bingpreview|google-inspectiontool|apis-google|mediapartners|feedfetcher|validator|w3c_|archive\.org|ia_archiver|heritrix|nutch|screaming frog|sitebulb|gptbot|claudebot|anthropic|ccbot|perplexity|applebot|amazonbot|meta-external|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|pinterest|skypeuripreview|mastodon|bluesky|synapse|matrix-media|readaloud|zapier|ifttt|hubspot|mailchimp|sendgrid/i;
/** a user agent that is not a person's browser (empty counts as a bot) */
export function isBot(ua) {
  const s = String(ua || '').trim();
  return s.length === 0 || s.length > 1000 || BOT_RE.test(s);
}

// ------------------------------------------------------------------ hashing and keys
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export function randomHex(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return hex(b);
}
/** sha256(salt · site · ip · ua) → 16 hex chars (64 bits: plenty for a day's set, nothing to invert) */
export async function visitorHash(salt, site, ip, ua) {
  const data = new TextEncoder().encode(`${salt}\n${site}\n${ip}\n${ua}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(digest)).slice(0, 16);
}
export const rawKey = (day, ts, rand) => `${RAW_PREFIX}${day}/${String(ts).padStart(13, '0')}-${rand}`;
export const dayKey = day => `${DAY_PREFIX}${day}.json`;
export const saltKey = day => `${SALT_PREFIX}${day}`;
export const dayOfRawKey = key => key.slice(RAW_PREFIX.length, RAW_PREFIX.length + 10);
export const dayOfDayKey = key => key.slice(DAY_PREFIX.length, DAY_PREFIX.length + 10);
