import { getStore } from '@netlify/blobs';

// Satellite yard photo for the event-layout planner.
//
// GET /api/site-imagery?q=<address>
//   1. Nominatim geocode (OpenStreetMap)
//   2. ESRI World Imagery snapshot around the point
//   3. JSON { src: data-URL, lat, lon, widthFt, depthFt, label }
//
// No API key. Imagery stays on this response — the planner never puts it
// in a share blob. Courtesy rate limit matches share.mjs.

const RATE_LIMIT_PER_HOUR = 20;
const UA = 'ForeverPartyRentals-LayoutPlanner/1.0 (welcome@foreverpartyrentals.com)';
const SPAN_M = 40; // half-extent; full image ~262 ft square

async function underRateLimit(store, ip) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `rate/${ip}/${hour}`;
  const count = parseInt((await store.get(key)) || '0', 10) || 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await store.set(key, String(count + 1));
  return true;
}

function metersToFt(m) { return m * 3.28084; }

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
  if (q.length < 5) return new Response(JSON.stringify({ error: 'address-too-short' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  try {
    const ip = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '0').split(',')[0].trim();
    const store = getStore('planner-imagery-rate');
    if (!(await underRateLimit(store, ip))) {
      return new Response(JSON.stringify({ error: 'rate-limit' }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (_) { /* blobs optional in local `netlify dev` without identity */ }

  const geoRes = await fetch(
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q),
    { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }
  );
  if (!geoRes.ok) return new Response(JSON.stringify({ error: 'geocode-failed' }), {
    status: 502, headers: { 'Content-Type': 'application/json' },
  });
  const geo = await geoRes.json();
  if (!Array.isArray(geo) || !geo[0]) {
    return new Response(JSON.stringify({ error: 'not-found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }
  const lat = parseFloat(geo[0].lat);
  const lon = parseFloat(geo[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'not-found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const dLat = SPAN_M / 111320;
  const dLon = SPAN_M / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].join(',');
  const imgUrl = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
    + '?bbox=' + encodeURIComponent(bbox)
    + '&bboxSR=4326&imageSR=3857&size=1280,1280&format=jpg&f=image';
  const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': UA } });
  if (!imgRes.ok) return new Response(JSON.stringify({ error: 'imagery-failed' }), {
    status: 502, headers: { 'Content-Type': 'application/json' },
  });
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length > 2.5 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'too-large' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
  const src = 'data:image/jpeg;base64,' + buf.toString('base64');
  const widthFt = Math.round(metersToFt(SPAN_M * 2));
  const depthFt = widthFt;
  return new Response(JSON.stringify({
    src,
    lat,
    lon,
    widthFt,
    depthFt,
    label: geo[0].display_name || q,
    attribution: 'Esri, Maxar, Earthstar Geographics, OpenStreetMap',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=3600',
    },
  });
};

export const config = { path: '/api/site-imagery' };
