import { getStore } from '@netlify/blobs';

// Anonymous usage beacon for the event-layout planner.
//
// The planner sends events here via navigator.sendBeacon() whenever it runs
// OUTSIDE our own hub page (external partner embeds, direct opens of the
// embed URL) — those contexts have no GTM, so this is the only signal we
// get. No cookies, no PII: event name, coarse params, and the embedding
// page's hostname (how partner embeds in the wild get counted).
//
// Records land in the "planner-analytics" Netlify Blobs store, one tiny
// JSON blob per event under <YYYY-MM-DD>/<id>, so adoption can be
// aggregated later (Phase 3 partner-embed report).
// Courtesy per-IP cap (mirrors share.mjs): generous for real sessions —
// a heavy planner session fires a few dozen events — but stops runaway
// scripts from minting unlimited blobs. Read-then-write races are fine.
const RATE_LIMIT_PER_HOUR = 300;
async function underRateLimit(store, ip) {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `rate/${ip}/${hour}`;
  const count = parseInt((await store.get(key)) || '0', 10) || 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await store.set(key, String(count + 1));
  return true;
}

export default async (req, context) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const name = typeof body?.name === 'string' ? body.name.slice(0, 64) : '';
  // Only accept the planner's own taxonomy — this is not a generic logger.
  if (!/^planner_[a-z_]+$/.test(name)) return new Response('Bad request', { status: 400 });

  const params = body?.params && typeof body.params === 'object' ? body.params : {};
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const record = {
    name,
    host: str(body?.host, 128) || 'unknown',
    mode: str(params.mode, 32),
    partner: str(params.partner, 64),
    viewport: str(params.viewport, 16),
    format: str(params.format, 16),
    t: new Date().toISOString(),
  };

  try {
    const store = getStore('planner-analytics');
    const ip = (context && context.ip) ||
               req.headers.get('x-nf-client-connection-ip') || 'unknown';
    if (!(await underRateLimit(store, ip))) return new Response(null, { status: 204 });
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(`${record.t.slice(0, 10)}/${id}`, record);
  } catch (err) {
    // Blob hiccups shouldn't 500 a fire-and-forget beacon; the function log
    // still captures the record for debugging.
    console.log('planner-beacon blob write failed:', err.message, JSON.stringify(record));
  }

  return new Response(null, { status: 204 });
};

export const config = { path: '/api/planner-beacon' };
