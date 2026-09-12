// netlify/lib/readings-format.mjs — the ONE place that turns a reader's form
// submission into (a) the private pending record and (b) the published entry
// in the standard format that content/readings/<collection>.answers.json
// carries and scripts/validate-readings.mjs enforces:
//   { id, item_id, letter, reading?, note?, reader{display, credentials_summary?}, published, ack }
// Nothing else ever leaves here for publication. Contact stays on the pending record.

export const FORM_NAME = 'open-reading';
export const LETTERS = ['A', 'B', 'C', 'D'];

const on = v => v === 'on' || v === true || v === 'true';
const clean = v => (typeof v === 'string' ? v.trim() : '');

/** local calendar date, what the owner's clock reads */
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Netlify form submission ({id, created_at, data}) → pending record */
export function toPending(s) {
  const d = s.data ?? {};
  const anonymous = on(d.anonymous);
  const name = clean(d.name);
  const credentials = clean(d.credentials);
  return {
    id: String(s.id),
    created: s.created_at ?? new Date().toISOString(),
    item_id: clean(d.item_id),
    collection: clean(d.collection),
    letter: clean(d.letter).toUpperCase(),
    reading: clean(d.reading),
    note: clean(d.note).slice(0, 1000),
    name,
    credentials,
    contact: on(d.no_contact) ? '' : clean(d.contact),
    no_contact: on(d.no_contact),
    publish_choice: clean(d.publish_choice) === 'author_only' ? 'author_only' : 'publish',
    anonymous,
    credentials_public: on(d.credentials_public),
    ack_consent: on(d.ack_consent),
    page: clean(d.page),
  };
}

/** what stops a pending record from being published (empty = publishable) */
export function problems(p) {
  const out = [];
  if (!p.item_id || !p.collection) out.push('no item id / collection on the submission');
  if (!LETTERS.includes(p.letter)) out.push(`letter "${p.letter}" is not A–D`);
  if (p.letter === 'C' && !p.reading) out.push('letter C without a reading');
  if (p.publish_choice === 'author_only') out.push('the reader asked that this reach the author only');
  return out;
}

/** pending record → the published entry (standard format; NO contact, NO ip, NO page) */
export function toPublished(p, date = today()) {
  const display = p.anonymous || !p.name ? 'anonymous reader' : p.name;
  const credentials_summary = !p.anonymous && p.credentials_public && p.credentials ? p.credentials : undefined;
  return {
    id: p.id,
    item_id: p.item_id,
    letter: p.letter,
    ...(p.letter === 'C' ? { reading: p.reading } : {}),
    ...(p.note ? { note: p.note } : {}),
    reader: { display, ...(credentials_summary ? { credentials_summary } : {}) },
    published: date,
    ack: Boolean(p.ack_consent),
  };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
