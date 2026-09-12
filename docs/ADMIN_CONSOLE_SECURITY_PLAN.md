> Sibling copy: this document was written for kirchner.cv; kirchner.ink (ink_site) runs the same console code and every item applies to it as well.

# Owner console: security design for kirchner.cv and lawsofexistence.com

Written 2026-09-09 (website-developer seat 5824a100) at the owner's request after
the Open Readings queue incident. Scope: the `/admin` console that both sites
run as a Netlify function, its store, its identity, and how it should grow as
the sites are built out. Both sites carry the same console code today
(`netlify/functions/admin.mjs`, `netlify/lib/*.mjs`); this document names the
shared design and the per-site steps.

## 1. Where the design already stands

The console was built on the right shape. These properties exist on both sites
and must be preserved by every later change:

| Property | How it is met today |
| --- | --- |
| Identity from a real provider | Auth0 authorization-code flow with PKCE; ID token verified in the function (RS256 against the tenant JWKS, issuer, audience, expiry, nonce) |
| Allowlist, not "anyone who can log in" | e-mail must be verified and listed in `ADMIN_EMAILS` |
| Short sessions | signed session cookie, 8 h; sign-in flow cookie, 10 min |
| Cookies hardened | `HttpOnly; Secure; Path=/admin`, `SameSite=Lax` |
| Every action is a POST with a CSRF token | `ctx.csrfOk()` on the moderation form |
| Console pages never cached or indexed | `cache-control: no-store`, `x-robots-tag: noindex` |
| Private store, private data | Netlify Blobs store `open-readings`; a reader's contact never leaves `pending/` and the Netlify Forms dashboard |
| The console never writes to the repository | approval only queues; publication is a build of `main`, which only the owner triggers (Studio integrate or build hook) |
| Static public site | `output: 'export'`; no server renders public pages, so the public attack surface is files plus three functions |

## 2. The gaps, in priority order

Each item names the site file, what is wrong, and the change. "Both" means the
same edit lands on jk_website and loe_website.

### 2.1 No account-wide credential at runtime (both)

**Now.** The console offers a Forms import and a Blobs fallback that read
`NETLIFY_AUTH_TOKEN`. A Netlify personal access token is account-wide (all
sites, DNS, deploys) and cannot be scoped. In the Functions and Builds scopes it
is readable by every function, the build, and every npm package they load.

**Change.**
- Do not set `NETLIFY_AUTH_TOKEN` on either site. The event function reaches
  Blobs through the credentials Netlify injects; the build reaches Blobs through
  `NETLIFY_BLOBS_CONTEXT`. Confirm from the deploy log line
  `pull-reading-answers: store=blobs`; if the build ever prints `local-empty`,
  that is a Netlify build-environment question to fix, not a reason to add the
  token.
- Keep `importFromForms` as a diagnostic that only runs when the variable is
  present, and document it as "temporary token, expiring, Production only,
  revoke after use". Remove the Blobs token fallback from `readings-store.mjs`
  in functions once the event path is proven live (one more submission after
  the 2026-09-09 fix).
- Rule for future features: a feature that needs an API token is a feature to
  redesign (event function, Blobs, build step) rather than a variable to add.

### 2.2 Remove the emergency passphrase login (both)

**Now.** `admin.mjs` accepts `POST /admin/passphrase` with `MODERATION_KEY`
and issues a 4 h session as user "passphrase". This bypasses Auth0, the
allowlist, and any MFA. It exists because the console shipped before Auth0 was
configured.

**Change.** Once Auth0 sign-in is confirmed working on each site, delete the
passphrase route and form, delete `MODERATION_KEY` from the site's variables,
and keep an "administrator locked out" runbook instead: reset the Auth0
password; if Auth0 itself is down, the queue waits (nothing publishes without a
build anyway). Until deletion: rotate `MODERATION_KEY` to a 32+ character random
value and treat it like a root password.

### 2.3 Multi-factor authentication on the identity (owner, Auth0 tenant)

**Now.** Auth0 tenant default: password only.

**Change.** Auth0 Dashboard, Security, Multi-factor Auth: enable WebAuthn with
device biometrics (passkeys) and set the policy to "Always". Enroll the
owner's Mac and phone. Optionally enable Auth0 Attack Protection: brute-force
protection and breached-password detection (both free tier). One tenant can
serve both sites (one application per site, or one application with both
callback URLs), so MFA is set once.

### 2.4 Audit trail (both)

**Now.** `decided/<id>` holds `{decision, date, item_id}`. It does not record
who decided, the time, the request origin, or the content that was approved.
Withdrawals overwrite nothing but leave no trace of the prior approval.

**Change.**
- Add an `audit/<ISO-time>-<id>` record on every state change:
  `{at, actor (session e-mail), action, id, item_id, collection, from, to,
  ip (x-nf-client-connection-ip), ua, content_sha256}`. Append-only: the code
  path never deletes or overwrites under `audit/`.
- `scripts/pull-reading-answers.mjs` already folds `approved/` into the repo
  at build; extend it to export `audit/` and `decided/` to
  `content/readings/_audit.jsonl` so the history survives the store and is
  versioned in git.
- Show the last 20 audit lines on the console home so the owner sees any
  action they did not take.

### 2.5 Console response headers (both)

**Now.** Public pages get the strict headers from `netlify.toml`. Those apply
to static files only; function responses carry `cache-control` and
`x-robots-tag` and nothing else. The console has no Content Security Policy
and can be framed.

**Change** in `admin-ui.mjs` `page()`: add
`content-security-policy: default-src 'none'; style-src 'unsafe-inline';
form-action 'self' https://<auth0-domain>; frame-ancestors 'none';
base-uri 'none'` (the console is server-rendered HTML with one inline style
block and no scripts; keep it that way), `x-frame-options: DENY`,
`referrer-policy: no-referrer`, `x-content-type-options: nosniff`. Change the
session cookie to `SameSite=Strict`; the flow cookie stays `Lax` because the
Auth0 callback is a cross-site navigation.

### 2.6 One console codebase for both sites (both)

**Now.** Five library files and three functions are duplicated across the two
repositories with the brand string changed. They diverged within hours on
2026-09-09 (one seat fixed the store one way, the other seat another way).
Divergence is the largest long-term risk in this list: a fix that lands on one
site and not the other.

**Change.** Move `netlify/lib/*.mjs` and the three functions into a small
private package (suggested: repository `site-console`, published to the
GitHub npm registry for the Axiomatic47 organisation, or consumed as a git
dependency by commit sha). Each site keeps only a three-line function file that
imports the handler and passes its configuration (brand, form name, store
name, allowlist variable names). One version bump per site is then the whole
upgrade, and the package carries its own tests (the handler paths proven by
hand on 2026-09-09 become the test suite).

### 2.7 Dependency discipline (both)

**Now.** `package-lock.json` is committed on jk_website. Neither repository
has automated update alerts; `pdfkit`, `pdfjs-dist`, `react-markdown` and
`@netlify/blobs` are the runtime and build packages, and the functions load
only `@netlify/blobs`.

**Change.** Add `.github/dependabot.yml` (npm, weekly, grouped minor/patch) to
both repositories; enable GitHub Dependabot alerts on the organisation. Keep
the functions' dependency set at `@netlify/blobs` only: any package added to a
function runs with access to the private store. Pin Node in `netlify.toml`
(already `22`).

### 2.8 Store backup and recovery (both)

**Now.** `approved/` is folded into the repository at each build. `pending/`,
`decided/`, `author-only/` exist only in Blobs.

**Change.** The build step exports every prefix except `pending/` contact
fields to `content/readings/_store-export.json` (contact stays private and
out of git; the Netlify Forms dashboard remains its system of record). A
recovery is then: re-create the store from the export with a one-off script.
Document the runbook in the package README.

### 2.9 Abuse controls on the public form (both)

**Now.** Netlify Forms spam filtering (Akismet) plus the honeypot field; the
event function ignores anything not named `open-reading`.

**Change (later).** If spam volume grows: enable Netlify's reCAPTCHA on the
form, cap `reading` length in `toPending`, and rate-limit by
`x-nf-client-connection-ip` in the event function (a `ratelimit/<ip>/<hour>`
counter in the store). Not needed at current volume.

## 3. The fork: moderation console or content management

The console should stay a **moderation and queue** tool. Editing site content
through a browser is a different product with a much larger surface (write
access to the repository or to a content database). If browser editing is ever
wanted:

- Prefer a git-backed CMS whose authentication is a GitHub App rather than a
  service the sites host (Keystatic fits the JSON-in-repo model of both sites
  and edits by pull request, which preserves the owner-integrates-main law).
- Never give the console repository write credentials. The publication path
  stays: content in git, build of `main`, owner-triggered.

## 4. Order of work

| Step | Who | Sites | Effort |
| --- | --- | --- | --- |
| Prove the event path live (one submission, function log, queue) | owner + seat | both | minutes |
| 2.3 MFA + attack protection in Auth0 | owner | one tenant | 15 min |
| 2.5 console headers + Strict session cookie | seat | both | small |
| 2.2 delete passphrase login, delete `MODERATION_KEY` | seat + owner | both | small |
| 2.1 remove token fallback from the function store; document diagnostic import | seat | both | small |
| 2.4 audit trail + export | seat | both | medium |
| 2.7 Dependabot | seat | both | small |
| 2.6 shared console package | seat | both | medium; do before the next console feature |
| 2.8 store export + recovery runbook | seat | both | small, rides on 2.6 |
| 2.9 abuse controls | seat | both | when needed |

Steps in 2.x that touch `loe_website` are the LOE website-developer lane's to
land; the same commit should be prepared once in the shared package (2.6) so
neither site drifts again.

## 5. Status

| Item | kirchner.cv | lawsofexistence.com |
| --- | --- | --- |
| 2.1 no token fallback in functions; import kept as diagnostic | done 2026-09-09 (`readings-store.mjs`) | ported 30e27ac |
| 2.2 passphrase login | gated: signs in only while Auth0 is unconfigured; 404 + "delete MODERATION_KEY" once configured | ported 30e27ac |
| 2.3 MFA + attack protection | owner, Auth0 tenant | same tenant |
| 2.4 audit trail | done: `netlify/lib/audit.mjs`, every decision + arrival + import; console home shows the newest 20 | ported 30e27ac |
| 2.5 console headers + Strict session cookie | done (`admin-ui.mjs`, `admin-auth.mjs`; callback continues by same-site meta refresh) | ported 30e27ac |
| 2.6 shared console package | not started — needs the owner to create the package repository | — |
| 2.7 Dependabot | done (`.github/dependabot.yml`); owner enables alerts on the organisation | ported 30e27ac |
| 2.8 store export | done: `content/readings/_store-export.json` at build (no contact, no ip/ua; actor e-mail exported as a hash — the repository may be public; the validator and the page loader skip underscore-prefixed files) | ported 30e27ac + ff43ac5 |
| 2.9 abuse controls | not needed yet | — |
| tests | `npm run test:console` — 25 checks | same, 25 checks |

## 6. What does not need to change

- Netlify plan: none of the above requires Pro. Pro adds per-variable secret
  scoping and longer function-log retention, useful but not prerequisite.
- Static export, Netlify Forms, Netlify Blobs, Auth0: all remain.
- The owner-integrates-main rule: it is the publication gate and the reason
  the console can be small.
