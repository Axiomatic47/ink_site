// netlify/functions/analytics-rollup.mjs — the counter's hourly roll-up (a
// scheduled function; Netlify runs it on the published deploy only). Folds the
// raw page views the edge function wrote into the day records and closes the
// days that can close. Idempotent and locked: a second run finds the lock and
// leaves. The console's "Roll up now" button runs the same code by hand — the
// way to exercise it on a branch deploy, where schedules do not fire.
import { DEFAULT_TZ } from '../lib/analytics-core.mjs';
import { openAnalyticsStore } from '../lib/analytics-store.mjs';
import { rollup } from '../lib/analytics-report.mjs';

const handler = async (req, context) => {
  const store = await openAnalyticsStore({ deployContext: context?.deploy?.context ?? process.env.CONTEXT });
  const s = await rollup(store, Date.now(), { tz: process.env.ANALYTICS_TZ || DEFAULT_TZ, log: text => console.log(text) });
  console.log(`analytics-rollup: ${s.locked ? 'locked, nothing done' : `${s.folded} views folded into ${s.days.length} day(s)${s.closed.length ? `, closed ${s.closed.join(', ')}` : ''}${s.contended.length ? `, contended ${s.contended.join(', ')}` : ''}`} (store ${store.kind})`);
};

export default handler;
export const config = { schedule: '@hourly' };
