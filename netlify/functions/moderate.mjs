// netlify/functions/moderate.mjs — the moderation page moved into the console
// (/admin/readings, Auth0 sign-in) on 2026-09-09. Old bookmarks land there.
const handler = async () => new Response(null, { status: 301, headers: { location: '/admin/readings', 'cache-control': 'no-store' } });
export default handler;
export const config = { path: '/.netlify/functions/moderate' };
