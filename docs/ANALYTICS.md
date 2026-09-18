# First-party analytics

kirchner.ink counts its own page views (owner 2026-09-16: analytics for the sites,
"free, no subscriptions", "the best way the first time"). Nothing leaves the site's
own host, no cookie is set, no third party is involved, and the running cost is a
few Netlify credits a month. The same code runs on kirchner.cv; lawsofexistence.com
carries its port.

## How a view is counted

```
browser ── sendBeacon POST /api/hit {p, r, w} ──▶ edge function (Deno)     ──▶ Blobs store `analytics`
                                                  drops bots, GPC, prefetch,      raw/<day>/<ts>-<rand>   one view
                                                  foreign origins, private paths  salt/<day>              the day's random salt
                                                  hashes the visitor for the day
scheduled function @hourly (Node) ── folds raw/ → day/<day>.json, deletes the raws, closes finished days
/admin/analytics (Node, the owner's console) ── reads day/*.json: totals, daily bars, pages, referrers, countries, devices, hours; CSV/JSON
```

| piece | file |
|---|---|
| pure helpers (Deno + Node) | `netlify/lib/analytics-core.mjs` |
| the beacon handler, as a factory | `netlify/lib/analytics-hit.mjs` |
| the edge entry `/api/hit` | `netlify/edge-functions/hit.js` |
| the store (Blobs / memory) | `netlify/lib/analytics-store.mjs` (+ `analytics-memstore.mjs`) |
| roll-up, report, console page | `netlify/lib/analytics-report.mjs` |
| the hourly schedule | `netlify/functions/analytics-rollup.mjs` |
| the beacon in the page | `app/_components/Analytics.tsx` (mounted once in `app/layout.tsx`) |
| the visitor's switch | `app/_components/AnalyticsOptOut.tsx` on `/privacy` |
| proof | `scripts/test-analytics.mjs` (Node), `scripts/analytics-hit_test.mjs` (Deno) |

## What is recorded, and what never is

Per view (a `raw/` record, then folded into the day): the page path with query and
fragment removed, the referring site's **host** (first load only; this site's own
host becomes "direct"), the country code from the edge context, the device class
from the viewport width (phone < 640, tablet < 1024, desktop: the site's own
breakpoints), the hour in the owner's zone, and the **visitor hash**.

The visitor hash is `sha256(daily salt · site host · ip · user agent)`, 16 hex
characters. The salt is 32 random bytes created by the first view of the day
(`onlyIfNew`) and **deleted when the day closes**. Until then the hash lets one
visitor count once a day; afterwards it means nothing to anyone, the owner
included. The IP and the user agent are inputs to the hash and are not stored,
not logged, not sent anywhere.

Never recorded: IP address, user agent string, query strings, fragments, referrer
paths, anything under `/admin`, `/api` or `/.netlify`.

Not counted at all: bots and empty user agents (`isBot`), prefetch/prerender
requests, browsers sending `Sec-GPC: 1` (Global Privacy Control), browsers that
turned counting off on the Privacy page (`localStorage['jk-analytics'] = 'off'`),
requests whose Origin/Referer host is not this site, the dev server (localhost).

## The store

One Netlify Blobs store per deploy context — `analytics` in production,
`analytics-branch-deploy` on a branch deploy, `analytics-deploy-preview` on a
preview — because site-wide stores are shared across contexts and a test deploy
must not write into the production book.

```
raw/<day>/<ts13>-<rand6>   {d, h, p, r, c, v, u, t}       written by the edge function, deleted by the roll-up
salt/<day>                 hex                              created onlyIfNew, deleted at day close
day/<day>.json             {day, tz, views, uniques, visitors[], paths{}, refs{}, countries{}, devices{}, hours[24], pending_delete[], closed, updated}
lock/rollup                {at}                             onlyIfNew; a lock older than two minutes is taken over
meta/last-rollup           the last run's summary            shown on the console
```

`paths`, `refs`, `countries` keep their 500 largest entries; the rest fold into
`(other)`.

## The roll-up

`rollup(store, now)` in `analytics-report.mjs`, run hourly by the scheduled
function and by the console's **Roll up now** button:

1. take `lock/rollup` (`onlyIfNew`; a stale lock is taken over);
2. list `raw/`, group by day; for each day read `day/<day>.json` with its etag,
   fold the raws, write back with `onlyIfMatch` (three attempts), then delete the
   folded raws. The record's `pending_delete` names the keys just folded: if the
   process dies before the deletes finish, the next run removes those keys
   **without counting them again**;
3. close every day of the last week that can close — the owner's clock has been
   in a later day for at least an hour (`closable`): `uniques` becomes the size of
   the visitor set, the set is dropped, `salt/<day>` is deleted;
4. release the lock; write `meta/last-rollup`.

Views arriving for a closed day still count as views, never as visitors. The
roll-up is idempotent; two runs an hour apart, or one interrupted and one
complete, give the same numbers.

Scheduled functions run on the **published deploy only**. On a branch deploy the
raws accumulate until the console's button folds them.

## The console

`/admin/analytics?range=7|30|90|365` (default 30): page views, visitors ("daily
counts, summed": a visitor seen on two days is two), views a day, a bar per day
(inline SVG, the open day lighter), pages (linked), referrers, countries, devices,
hour of day; **Download CSV** (`day,views,visitors,closed`) and **JSON** (the full
report); **Roll up now** (CSRF-protected POST). The console home shows the last
seven days. The page shell's CSP (`default-src 'none'; style-src 'unsafe-inline'`)
is unchanged: the chart is markup, not a resource.

## Cost

Free plan: 300 credits a month. Web requests cost 2 credits per 10k, compute 10
per GB-hour, blob reads and writes ride on the same credits. The beacon is one
request and one small write per view; the roll-up is 24 short runs a day. At
these sites' traffic the counter costs single-digit credits a month; the usage
page in the Netlify dashboard shows the number.

## Gates

`npm run test:analytics` (the Node proof), `npm run test:edge` (Deno, the edge
runtime: same handler, same memory store), `npm run test:console` (unchanged
after the store refactor), `npm run lint`, `npm run build`. Netlify bundles the
edge function at deploy; a bundling error fails the deploy, not the site.

## Checking a deploy

1. Open three pages on the deploy; each fires one `POST /api/hit` (Network tab:
   204, no body). Nothing appears on the console until a roll-up.
2. `/admin/analytics` → **Roll up now** → 3 views, 1 visitor, the three paths.
3. On the Privacy page turn counting off; a fourth page adds nothing.
4. A browser with Global Privacy Control on (Brave, Firefox with the setting)
   records nothing and the Privacy page says so.
5. Netlify → Logs → Edge functions `hit`: no lines about a visitor; only
   `hit: …` notes when the store misbehaved.

## Not built, by decision

A `<noscript>` pixel (a static export cannot name the page in server markup, and
the script-less share is bots), event or click tracking, UTM campaigns, a cross-
site dashboard, owner exclusion by IP (the per-browser switch covers it), a
real-time view.
