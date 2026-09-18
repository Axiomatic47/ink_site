// netlify/edge-functions/hit.js — POST /api/hit, the page-view beacon (first-party
// analytics, owner 2026-09-16: "free, no subscriptions, done the best way the first
// time"). Runs at the edge (Deno): no cold start on a visitor's path, and the
// request context carries the country and the deploy context. The handler itself
// is netlify/lib/analytics-hit.mjs, tested in Node and Deno with a memory store;
// this file only hands it the real Blobs store. (`.js`, not `.mjs`: the edge
// bundler's entry discovery is by extension and .js is the documented one.)
import { getStore } from '@netlify/blobs';
import { createHandler } from '../lib/analytics-hit.mjs';

const env = { get: name => (typeof Netlify !== 'undefined' && Netlify.env ? Netlify.env.get(name) : undefined) };

export default createHandler({ getStore: name => getStore(name), env, log: text => console.log(`hit: ${text}`) });

export const config = { path: '/api/hit' };
