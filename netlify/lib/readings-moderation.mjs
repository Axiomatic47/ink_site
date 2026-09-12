// netlify/lib/readings-moderation.mjs — the Open Readings queue page of the
// console (/admin/readings). Publish → approved/<id> in the private store →
// folded into the answers file at the NEXT BUILD of main. Author only → kept
// privately. Reject → gone. The caller has already authenticated; every POST
// must carry the session's CSRF token.
import { openStore } from './readings-store.mjs';
import { FORM_NAME, toPending, toPublished, problems, today, escapeHtml as h } from './readings-format.mjs';
import { page, redirect, flashFrom } from './admin-ui.mjs';
import { writeAudit, recentAudit } from './audit.mjs';

function renderPending(p, csrf) {
  const probs = problems(p);
  const pub = toPublished(p);
  const authorOnly = p.publish_choice === 'author_only';
  const preview = `<div class="preview"><span class="when">${h(pub.published)}</span><span class="who">${h(pub.reader.display)}</span>${pub.reader.credentials_summary ? ` <small>· ${h(pub.reader.credentials_summary)}</small>` : ''}<br>Reading <b>${h(pub.letter)}</b>${pub.reading ? ` — <span class="he">${h(pub.reading)}</span>` : ''}${pub.note ? `<div>${h(pub.note)}</div>` : ''}${pub.ack ? '' : '<div><small>Not to be acknowledged by name.</small></div>'}</div>`;
  return `<div class="card">
<div class="row"><span class="k">Item</span><span><a href="/research/${h(p.collection)}/readings/${h(p.item_id)}" target="_blank" rel="noopener">${h(p.collection)} / ${h(p.item_id)}</a></span></div>
<div class="row"><span class="k">Received</span><span>${h(p.created.replace('T', ' ').slice(0, 16))} UTC</span></div>
<div class="row"><span class="k">Wishes</span><span>${authorOnly ? '<b class="warn">Author only</b> — must not be published' : 'May be published'} · acknowledgement ${p.ack_consent ? 'yes' : 'no'}${p.anonymous ? ' · asked for anonymity' : ''}</span></div>
${probs.filter(x => !x.startsWith('the reader asked')).map(x => `<div class="row"><span class="k bad">Problem</span><span class="bad">${h(x)}</span></div>`).join('')}
<div class="row"><span class="k">As it publishes</span><span>${preview}</span></div>
<div class="priv">Private, never published — name as written: ${h(p.name) || '<i>none</i>'} · credentials: ${h(p.credentials) || '<i>none</i>'}${p.credentials && !p.credentials_public ? ' (not for publication)' : ''} · contact: ${h(p.contact) || (p.no_contact ? '<i>asked not to be contacted</i>' : '<i>none</i>')}</div>
<form method="post" class="actions"><input type="hidden" name="csrf" value="${h(csrf)}"><input type="hidden" name="id" value="${h(p.id)}">
${probs.length ? '' : '<button class="pub" name="decision" value="publish">Publish at next build</button>'}
<button name="decision" value="author_only">Author only</button>
<button class="rej" name="decision" value="reject">Reject</button></form></div>`;
}

function renderApproved(a, csrf) {
  return `<div class="card"><div class="preview"><span class="when">${h(a.published)}</span><span class="who">${h(a.reader.display)}</span>${a.reader.credentials_summary ? ` <small>· ${h(a.reader.credentials_summary)}</small>` : ''}<br><a href="/research/${h(a.collection)}/readings/${h(a.item_id)}" target="_blank" rel="noopener">${h(a.item_id)}</a> · Reading <b>${h(a.letter)}</b>${a.reading ? ` — <span class="he">${h(a.reading)}</span>` : ''}${a.note ? `<div>${h(a.note)}</div>` : ''}</div>
<form method="post" class="actions"><input type="hidden" name="csrf" value="${h(csrf)}"><input type="hidden" name="id" value="${h(a.id)}"><button class="rej" name="decision" value="withdraw">Withdraw</button> <small>Withdrawing before the build keeps it off the site; after the build the page keeps the answer until the next build.</small></form></div>`;
}

export async function importFromForms(store, actor = 'console', req = null) {
  const token = process.env.NETLIFY_AUTH_TOKEN, siteId = process.env.SITE_ID;
  if (!token || !siteId) return 'Import is not configured (NETLIFY_AUTH_TOKEN + SITE_ID).';
  const api = async p => { const r = await fetch(`https://api.netlify.com/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
  const forms = await api(`/sites/${siteId}/forms`);
  const form = forms.find(f => f.name === FORM_NAME);
  if (!form) return `No form named ${FORM_NAME} on this site.`;
  const subs = await api(`/forms/${form.id}/submissions?per_page=100`);
  let n = 0;
  for (const s of subs) {
    const id = String(s.id);
    if (await store.get(`pending/${id}`) || await store.get(`decided/${id}`)) continue;
    const rec = toPending(s);
    await store.set(`pending/${id}`, rec);
    await writeAudit(store, { actor, action: 'imported', id, item_id: rec.item_id, collection: rec.collection, from: 'netlify-forms', to: 'pending', req, content: rec });
    n += 1;
  }
  return `Imported ${n} submission(s) from Netlify Forms.`;
}

/** counts for the console home */
export async function readingsCounts() {
  try {
    const store = await openStore();
    return { kind: store.kind, pending: (await store.list('pending/')).length, approved: (await store.list('approved/')).length };
  } catch (e) { return { kind: `ERROR: ${e.message}`, pending: '?', approved: '?' }; }
}

/** newest audit records for the console home (empty on a store error) */
export async function recentActivity(n = 20) {
  try { return await recentAudit(await openStore(), n); } catch { return []; }
}

/** GET/POST /admin/readings — `ctx` = { sess, csrf, csrfOk(given) } */
export async function handleReadings(req, url, ctx) {
  const store = await openStore();
  if (req.method === 'POST') {
    const form = await req.formData();
    if (!ctx.csrfOk(form.get('csrf'))) return page({ title: 'Refused', body: '<h1>Refused</h1><p class="sub">This form was not issued by your session. Go back and try again.</p>', status: 403, sess: ctx.sess });
    let flash = '', bad = false;
    const action = form.get('action');
    const actor = ctx.sess.email;
    if (action === 'import') { try { flash = await importFromForms(store, actor, req); } catch (e) { flash = `Import failed: ${e.message}`; bad = true; } }
    else {
      const id = String(form.get('id') ?? '').replace(/[^A-Za-z0-9_-]/g, '');
      const decision = String(form.get('decision') ?? '');
      if (decision === 'withdraw') {
        const a = await store.get(`approved/${id}`);
        if (a) {
          await writeAudit(store, { actor, action: 'withdrawn', id, item_id: a.item_id, collection: a.collection, from: 'approved', to: 'decided', req, content: a });
          await store.del(`approved/${id}`); await store.set(`decided/${id}`, { decision: 'withdrawn', date: today(), at: new Date().toISOString(), actor, item_id: a.item_id }); flash = `Withdrawn: ${a.item_id}.`;
        }
      } else {
        const p = await store.get(`pending/${id}`);
        if (!p) { flash = 'That submission is no longer pending.'; bad = true; }
        else if (decision === 'publish') {
          const probs = problems(p);
          if (probs.length) { flash = `Not published: ${probs.join('; ')}.`; bad = true; }
          else {
            await writeAudit(store, { actor, action: 'published', id, item_id: p.item_id, collection: p.collection, from: 'pending', to: 'approved', req, content: p });
            await store.set(`approved/${id}`, { ...toPublished(p), collection: p.collection });
            await store.set(`decided/${id}`, { decision: 'published', date: today(), at: new Date().toISOString(), actor, item_id: p.item_id });
            await store.del(`pending/${id}`);
            flash = `Approved: ${p.item_id}, reading ${p.letter}. It publishes at the next build of main.`;
          }
        } else if (decision === 'author_only' || decision === 'reject') {
          await writeAudit(store, { actor, action: decision === 'reject' ? 'rejected' : 'author_only', id, item_id: p.item_id, collection: p.collection, from: 'pending', to: decision === 'reject' ? 'decided' : 'author-only', req, content: p });
          if (decision === 'author_only') await store.set(`author-only/${id}`, p);
          await store.set(`decided/${id}`, { decision: decision === 'reject' ? 'rejected' : 'author_only', date: today(), at: new Date().toISOString(), actor, item_id: p.item_id });
          await store.del(`pending/${id}`);
          flash = decision === 'reject' ? `Rejected: ${p.item_id}.` : `Kept for the author only: ${p.item_id}.`;
        }
      }
    }
    return redirect(url.pathname, { flash, bad });
  }

  // Belt and braces: when the owner's token is present, pull anything the event
  // function missed straight from Netlify Forms on every load (idempotent).
  let synced = '';
  if (process.env.NETLIFY_AUTH_TOKEN && process.env.SITE_ID) { try { synced = await importFromForms(store, ctx.sess.email, req); } catch (e) { synced = `Forms sync failed: ${e.message}`; } }
  const pending = (await Promise.all((await store.list('pending/')).map(k => store.get(k)))).filter(Boolean).sort((a, b) => a.created.localeCompare(b.created));
  const approved = (await Promise.all((await store.list('approved/')).map(k => store.get(k)))).filter(Boolean).sort((a, b) => a.published.localeCompare(b.published));
  const authorOnly = await store.list('author-only/');
  const body = `<h1>Open Readings</h1><p class="sub">Publish queues an answer for the next build of main; nothing goes live until that build finishes. The reader's contact stays on this page and in the Netlify dashboard.</p>
<p><small>Queue store: <code>${h(store.kind)}</code> · Netlify Forms sync: ${synced ? h(synced) : 'off (set NETLIFY_AUTH_TOKEN + SITE_ID in the Functions scope to read the dashboard directly on every load)'}</small></p>
<h2>Waiting for a decision (${pending.length})</h2>
${pending.length ? pending.map(p => renderPending(p, ctx.csrf)).join('') : '<p class="empty">Nothing waiting.</p>'}
<h2>Approved, publishing at the next build (${approved.length})</h2>
${approved.length ? approved.map(a => renderApproved(a, ctx.csrf)).join('') : '<p class="empty">Nothing queued.</p>'}
<form method="post" class="actions"><input type="hidden" name="csrf" value="${h(ctx.csrf)}">
${process.env.BUILD_HOOK_URL ? '<button formaction="/admin/rebuild" name="action" value="rebuild">Rebuild now</button>' : '<small>Set BUILD_HOOK_URL to add a “Rebuild now” button; otherwise the next integrate publishes.</small>'}
${process.env.NETLIFY_AUTH_TOKEN ? '<button name="action" value="import">Import from Netlify Forms</button>' : ''}</form>
${authorOnly.length ? `<h2>Kept for the author only (${authorOnly.length})</h2><p class="empty">${authorOnly.length} answer(s) held privately; read them in the Netlify dashboard.</p>` : ''}`;
  return page({ title: 'Open Readings — console', body, sess: ctx.sess, ...flashFrom(url) });
}
