// netlify/lib/analytics-report.mjs — the counter's Node side: the hourly ROLLUP
// (raw views → the day's aggregate, then the day's close), the RANGE report the
// console reads, its HTML, CSV and JSON, and the /admin/analytics handler.
//
// The rollup is the ONLY writer of day/<day>.json. It runs under lock/rollup
// (onlyIfNew; a lock older than LOCK_TTL_MS is taken over), folds every raw view
// it lists into its day with an etag-conditional write, and deletes the folded
// raws afterwards. If it dies between the write and the deletes, the day record's
// `pending_delete` names the folded keys, and the next run removes them without
// counting them again — no view is ever counted twice, none is lost.
//
// A day CLOSES once the owner's clock has been in a later day for an hour
// (analytics-core.mjs closable): the visitor-hash set becomes a count, the day's
// salt is deleted. From then on the record holds numbers and nothing else.
import { DAY_PREFIX, DEFAULT_TZ, DEVICES, LOCK_KEY, LOCK_TTL_MS, RAW_PREFIX, TOP_N, closable, dayKey, dayOfDayKey, dayOfRawKey, isDay, localParts, saltKey, shiftDay } from './analytics-core.mjs';
import { openAnalyticsStore } from './analytics-store.mjs';
import { page, redirect, flashFrom } from './admin-ui.mjs';
import { escapeHtml as h } from './readings-format.mjs';

export const RANGES = [7, 30, 90, 365];
export const DEFAULT_RANGE = 30;
export const LAST_ROLLUP_KEY = 'meta/last-rollup';
const CLOSE_WINDOW_DAYS = 7; // only days this recent are examined for closing (older ones closed long ago)

// ------------------------------------------------------------------ the day record
export function emptyDay(day, tz = DEFAULT_TZ) {
  return { day, tz, views: 0, uniques: 0, visitors: [], paths: {}, refs: {}, countries: {}, devices: {}, hours: Array(24).fill(0), pending_delete: [], closed: false, updated: null };
}
function normalizeDay(v, day, tz) {
  const e = emptyDay(day, tz);
  const o = v && typeof v === 'object' ? v : {};
  return {
    ...e, ...o, day,
    hours: Array.isArray(o.hours) && o.hours.length === 24 ? o.hours.map(n => Number(n) || 0) : e.hours,
    paths: o.paths || {}, refs: o.refs || {}, countries: o.countries || {}, devices: o.devices || {},
    visitors: Array.isArray(o.visitors) ? o.visitors : [],
    pending_delete: Array.isArray(o.pending_delete) ? o.pending_delete : [],
    views: Number(o.views) || 0, uniques: Number(o.uniques) || 0, closed: Boolean(o.closed),
  };
}
const bump = (map, k, n = 1) => { map[k] = (map[k] || 0) + n; };

/** keep the TOP_N largest entries; the rest fold into '(other)' */
export function trimMap(map, n = TOP_N) {
  const keys = Object.keys(map).filter(k => k !== '(other)');
  if (keys.length <= n) return map;
  keys.sort((a, b) => map[b] - map[a]);
  const out = {};
  for (const k of keys.slice(0, n)) out[k] = map[k];
  let other = map['(other)'] || 0;
  for (const k of keys.slice(n)) other += map[k];
  if (other) out['(other)'] = other;
  return out;
}

/** one raw view into the day record; `visitors` is the open day's hash set (null once closed) */
export function foldRaw(rec, raw, visitors) {
  rec.views += 1;
  if (visitors && raw.u) visitors.add(String(raw.u));
  bump(rec.paths, typeof raw.p === 'string' && raw.p ? raw.p : '(unknown)');
  bump(rec.refs, typeof raw.r === 'string' && raw.r ? raw.r : '(direct)');
  bump(rec.countries, typeof raw.c === 'string' && raw.c ? raw.c : '(unknown)');
  bump(rec.devices, DEVICES.includes(raw.v) ? raw.v : 'unknown');
  const hr = Number(raw.h);
  if (Number.isInteger(hr) && hr >= 0 && hr < 24) rec.hours[hr] += 1;
}

async function batched(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

// ------------------------------------------------------------------ the rollup
async function acquireLock(store, now) {
  if ((await store.set(LOCK_KEY, { at: now }, { onlyIfNew: true })).modified) return true;
  const cur = await store.getWithEtag(LOCK_KEY);
  if (!cur) return (await store.set(LOCK_KEY, { at: now }, { onlyIfNew: true })).modified;
  if (now - (Number(cur.value?.at) || 0) < LOCK_TTL_MS) return false;
  return (await store.set(LOCK_KEY, { at: now }, { onlyIfMatch: cur.etag })).modified; // a stale lock is taken over
}

/**
 * rollup(store, now, { tz, log }) → { at, locked, days: [...], folded, skipped, closed: [...] }
 *   locked: another rollup holds the lock; nothing was done
 */
export async function rollup(store, now = Date.now(), { tz = DEFAULT_TZ, log = () => {} } = {}) {
  const summary = { at: new Date(now).toISOString(), tz, locked: false, days: [], folded: 0, skipped: 0, closed: [], contended: [] };
  if (!(await acquireLock(store, now))) { summary.locked = true; return summary; }
  try {
    // 1. fold every raw view into its day
    const rawKeys = (await store.list(RAW_PREFIX)).filter(k => isDay(dayOfRawKey(k)));
    const byDay = new Map();
    for (const k of rawKeys) { const d = dayOfRawKey(k); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(k); }
    for (const [day, keys] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (let attempt = 1; ; attempt++) {
        const cur = await store.getWithEtag(dayKey(day));
        const rec = normalizeDay(cur?.value, day, tz);
        const already = new Set(rec.pending_delete);
        const stale = keys.filter(k => already.has(k)); // folded by the last run, whose deletes did not finish
        const fresh = keys.filter(k => !already.has(k));
        const raws = await batched(fresh, 25, k => store.get(k));
        const visitors = rec.closed ? null : new Set(rec.visitors);
        let folded = 0;
        for (const v of raws) if (v && typeof v === 'object') { foldRaw(rec, v, visitors); folded += 1; }
        if (visitors) { rec.visitors = [...visitors]; rec.uniques = visitors.size; }
        rec.paths = trimMap(rec.paths); rec.refs = trimMap(rec.refs); rec.countries = trimMap(rec.countries);
        rec.pending_delete = fresh;
        rec.updated = new Date(now).toISOString();
        const r = await store.set(dayKey(day), rec, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        if (r.modified) {
          await batched([...stale, ...fresh], 25, k => store.del(k));
          summary.days.push(day); summary.folded += folded; summary.skipped += stale.length;
          break;
        }
        if (attempt >= 3) { summary.contended.push(day); log(`rollup: ${day} contended three times; left for the next run`); break; }
      }
    }
    // 2. close the days that can close
    const today = localParts(now, tz).day;
    const floor = shiftDay(today, -CLOSE_WINDOW_DAYS);
    for (const k of await store.list(DAY_PREFIX)) {
      const day = dayOfDayKey(k);
      if (!isDay(day) || day < floor || !closable(day, now, tz)) continue;
      const cur = await store.getWithEtag(k);
      if (!cur || cur.value?.closed) continue;
      const rec = normalizeDay(cur.value, day, tz);
      rec.uniques = rec.visitors.length; rec.visitors = []; rec.closed = true; rec.closed_at = new Date(now).toISOString();
      if ((await store.set(k, rec, { onlyIfMatch: cur.etag })).modified) { await store.del(saltKey(day)); summary.closed.push(day); }
    }
  } finally {
    await store.del(LOCK_KEY);
  }
  await store.set(LAST_ROLLUP_KEY, summary);
  return summary;
}

// ------------------------------------------------------------------ the report
/** the last `days` days ending today (owner's zone): a per-day series and merged totals */
export async function range(store, days = DEFAULT_RANGE, now = Date.now(), tz = DEFAULT_TZ) {
  const today = localParts(now, tz).day;
  const list = Array.from({ length: days }, (_, i) => shiftDay(today, -(days - 1 - i)));
  const recs = await batched(list, 50, d => store.get(dayKey(d)));
  const totals = { views: 0, uniques: 0, paths: {}, refs: {}, countries: {}, devices: {}, hours: Array(24).fill(0) };
  const series = list.map((day, i) => {
    const r = recs[i];
    if (!r) return { day, views: 0, uniques: 0, closed: false };
    totals.views += Number(r.views) || 0; totals.uniques += Number(r.uniques) || 0;
    for (const f of ['paths', 'refs', 'countries', 'devices']) for (const [k, v] of Object.entries(r[f] || {})) bump(totals[f], k, Number(v) || 0);
    if (Array.isArray(r.hours)) r.hours.forEach((n, hr) => { if (hr < 24) totals.hours[hr] += Number(n) || 0; });
    return { day, views: Number(r.views) || 0, uniques: Number(r.uniques) || 0, closed: Boolean(r.closed) };
  });
  for (const f of ['paths', 'refs', 'countries']) totals[f] = trimMap(totals[f]);
  return { from: list[0], to: today, days, tz, generated: new Date(now).toISOString(), series, totals };
}
export const top = (map, n = 20) => Object.entries(map || {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);

export function toCsv(report) {
  const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['day,views,visitors,closed', ...report.series.map(d => [d.day, d.views, d.uniques, d.closed ? 'yes' : 'no'].map(esc).join(','))];
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ the console page
const num = n => Number(n || 0).toLocaleString('en-US');
const pct = (n, total) => (total ? `${Math.round((1000 * n) / total) / 10}%` : '');

function svgBars(series, { height = 120, barW = 10, gap = 3, label = d => d.day } = {}) {
  const n = series.length;
  if (!n) return '<p class="empty">Nothing yet.</p>';
  const max = Math.max(1, ...series.map(s => s.views));
  const w = n * (barW + gap) - gap;
  const rects = series.map((s, i) => {
    const bh = Math.max(s.views ? 1 : 0, Math.round((s.views / max) * height));
    return `<rect x="${i * (barW + gap)}" y="${height - bh}" width="${barW}" height="${bh}" fill="currentColor" opacity="${s.closed === false && i === n - 1 ? 0.45 : 0.85}"><title>${h(label(s))}: ${num(s.views)} views · ${num(s.uniques)} visitors</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="views by day" style="display:block;color:var(--fg)">${rects}</svg>
<div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.8rem;margin-top:.35rem"><span>${h(label(series[0]))}</span><span>peak ${num(max)}</span><span>${h(label(series[n - 1]))}</span></div>`;
}
function hourBars(hours, tz) {
  const max = Math.max(1, ...hours);
  const cells = hours.map((n, hr) => `<div title="${String(hr).padStart(2, '0')}:00 — ${num(n)} views" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:60px"><div style="background:currentColor;opacity:.8;height:${Math.max(n ? 2 : 0, Math.round((n / max) * 60))}px"></div></div>`).join('');
  return `<div style="display:flex;gap:2px;color:var(--fg)">${cells}</div><div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.8rem;margin-top:.35rem"><span>00:00</span><span>${h(tz)}</span><span>23:00</span></div>`;
}
function table(title, map, total, n = 20, fmt = k => h(k)) {
  const rows = top(map, n);
  const body = rows.length
    ? `<div class="card" style="padding:.5rem 1rem"><table style="width:100%;border-collapse:collapse;font-size:.9rem">${rows.map(([k, v]) => `<tr><td style="padding:.3rem .5rem .3rem 0;word-break:break-all">${fmt(k)}</td><td style="padding:.3rem 0;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${num(v)}</td><td style="padding:.3rem 0 .3rem .75rem;text-align:right;color:var(--muted);width:4rem;font-variant-numeric:tabular-nums">${pct(v, total)}</td></tr>`).join('')}</table></div>`
    : '<p class="empty">Nothing yet.</p>';
  return `<h2>${h(title)}</h2>${body}`;
}

export function renderAnalyticsPage({ report, csrf, storeKind, last, tz }) {
  const t = report.totals;
  const perDay = report.days ? Math.round((t.views / report.days) * 10) / 10 : 0;
  const rangeNav = RANGES.map(n => (n === report.days ? `<b>${n} days</b>` : `<a href="/admin/analytics?range=${n}">${n} days</a>`)).join(' · ');
  const lastLine = last?.at ? `${h(last.at.replace('T', ' ').slice(0, 16))} UTC${last.locked ? ' (found another run holding the lock)' : ` — ${num(last.folded)} views folded${last.closed?.length ? `, closed ${h(last.closed.join(', '))}` : ''}`}` : 'never';
  const pageLink = k => (k.startsWith('/') ? `<a href="${h(k)}" target="_blank" rel="noopener">${h(k)}</a>` : h(k));
  return `<h1>Analytics</h1>
<p class="sub">First-party page counts, ${h(report.from)} to ${h(report.to)} (${h(tz)}). ${rangeNav}.<br><small>Store <code>${h(storeKind)}</code> · last roll-up ${lastLine} · views are folded hourly, so the last hour is not in yet.</small></p>
<div class="grid">
<div class="card"><div class="n">${num(t.views)}</div>page views</div>
<div class="card"><div class="n">${num(t.uniques)}</div>visitors <small>(daily counts, summed)</small></div>
<div class="card"><div class="n">${num(perDay)}</div>views a day</div>
</div>
<h2>Views by day</h2>
<div class="card">${svgBars(report.series)}</div>
${table('Pages', t.paths, t.views, 25, pageLink)}
${table('Referrers', t.refs, t.views, 20)}
${table('Countries', t.countries, t.views, 20)}
${table('Devices', t.devices, t.views, DEVICES.length)}
<h2>Hour of day</h2>
<div class="card">${hourBars(t.hours, tz)}</div>
<div class="actions" style="margin-top:1.5rem">
<form method="post" action="/admin/analytics/rollup"><input type="hidden" name="csrf" value="${h(csrf)}"><button type="submit">Roll up now</button></form>
<a class="btn" href="/admin/analytics.csv?range=${report.days}">Download CSV</a>
<a class="btn" href="/admin/analytics.json?range=${report.days}">JSON</a>
</div>
<p style="margin-top:1.5rem"><small>Counted per view: the page path, the referring site's host, the country, the screen size class, the hour, and — until the day closes — a hash of a random daily value with the visitor's address and browser, so one visitor counts once a day. Never recorded: the address itself, the browser string, query strings, anything under /admin. Not counted at all: bots, prefetches, browsers sending Global Privacy Control, browsers that turned counting off on the Privacy page. A visitor seen on two days is two "visitors".</small></p>`;
}

// ------------------------------------------------------------------ the handler
/** GET /admin/analytics[?range=N] · GET /admin/analytics.csv · GET /admin/analytics.json · POST /admin/analytics/rollup */
export async function handleAnalytics(req, url, ctx, { deployContext, now = Date.now(), store: given } = {}) {
  const path = url.pathname.replace(/\/+$/, '');
  const tz = process.env.ANALYTICS_TZ || DEFAULT_TZ;
  const store = given || (await openAnalyticsStore({ deployContext }));
  if (req.method === 'POST') {
    if (path !== '/admin/analytics/rollup') return page({ title: 'Not found', body: '<h1>Not found</h1>', status: 404, sess: ctx.sess });
    const form = await req.formData();
    if (!ctx.csrfOk(form.get('csrf'))) return page({ title: 'Refused', body: '<h1>Refused</h1>', status: 403, sess: ctx.sess });
    const s = await rollup(store, now, { tz });
    const flash = s.locked
      ? 'A roll-up is already running; try again in a minute.'
      : `Rolled up ${num(s.folded)} view${s.folded === 1 ? '' : 's'} into ${s.days.length} day${s.days.length === 1 ? '' : 's'}${s.closed.length ? `; closed ${s.closed.join(', ')}` : ''}.`;
    return redirect('/admin/analytics', { flash });
  }
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  const asked = Number(url.searchParams.get('range'));
  const days = RANGES.includes(asked) ? asked : DEFAULT_RANGE;
  if (path === '/admin/analytics.csv' || path === '/admin/analytics.json') {
    const report = await range(store, days, now, tz);
    const csv = path.endsWith('.csv');
    return new Response(csv ? toCsv(report) : JSON.stringify(report, null, 2) + '\n', {
      headers: {
        'content-type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="analytics-${report.from}-${report.to}.${csv ? 'csv' : 'json'}"`,
        'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
      },
    });
  }
  if (path !== '/admin/analytics') return page({ title: 'Not found', body: '<h1>Not found</h1><p><a class="btn" href="/admin/analytics">Analytics</a></p>', status: 404, sess: ctx.sess });
  const [report, last] = await Promise.all([range(store, days, now, tz), store.get(LAST_ROLLUP_KEY)]);
  return page({ title: 'Analytics', body: renderAnalyticsPage({ report, csrf: ctx.csrf, storeKind: store.kind, last, tz }), sess: ctx.sess, ...flashFrom(url) });
}

/** the console home's card: the last seven days, never throwing */
export async function analyticsSummary({ deployContext, now = Date.now(), store: given } = {}) {
  try {
    const store = given || (await openAnalyticsStore({ deployContext }));
    const r = await range(store, 7, now, process.env.ANALYTICS_TZ || DEFAULT_TZ);
    return { views: r.totals.views, uniques: r.totals.uniques, kind: store.kind };
  } catch (e) {
    return { error: e.message };
  }
}
