// Chair-accurate overlap audit: expand generateLayout recipes the same way
// the planner does (placeChairsAround) and flag table/chair/dance collisions.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'site-v3/planner/catalog.json'), 'utf8'));
const gen = require(join(root, 'site-v3/planner/layout-gen.js'));
gen.init(catalog);

const byKey = {};
for (const g of catalog.groups) for (const it of g.items) byKey[it.key] = it;

const CHAIR_GAP = 0.25;
const CHAIR_SPACING = 0.35;
const outDir = join(root, '_build-v3/layout-previews');
mkdirSync(outDir, { recursive: true });

function sizeOf(key) {
  const c = byKey[key];
  return c.shape === 'circle' ? { w: c.diameterFt, d: c.diameterFt } : { w: c.widthFt, d: c.depthFt };
}

function placeChairsRound(cx, cy, tCat, cCat, N) {
  const dist = tCat.diameterFt / 2 + cCat.depthFt / 2 + CHAIR_GAP;
  const chairs = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i / N) - Math.PI / 2;
    chairs.push({
      cx: cx + dist * Math.cos(a),
      cy: cy + dist * Math.sin(a),
      w: cCat.widthFt, d: cCat.depthFt,
      rot: (a * 180 / Math.PI) + 90,
    });
  }
  return chairs;
}

function placeChairsRect(cx, cy, tCat, cCat, N, tableRot) {
  const tw = tCat.widthFt, td = tCat.depthFt, cw = cCat.widthFt, cd = cCat.depthFt;
  const maxPerSide = Math.max(1, Math.floor(((tCat.seats || 4) - 2) / 2));
  const longTotal = Math.max(0, N - Math.min(2, Math.max(0, N - 2 * maxPerSide)));
  const endsTotal = N - longTotal;
  const topCount = Math.ceil(longTotal / 2);
  const bottomCount = Math.floor(longTotal / 2);
  const chairs = [];
  const edgeStart = (count) => {
    const total = count * cw + Math.max(0, count - 1) * CHAIR_SPACING;
    if (total > tw) return null;
    return cx - total / 2 + cw / 2;
  };
  const push = (chCx, chCy, rot) => chairs.push({ cx: chCx, cy: chCy, w: cw, d: cd, rot });
  const startTop = edgeStart(topCount);
  for (let i = 0; i < topCount; i++) {
    const chCx = startTop != null ? startTop + i * (cw + CHAIR_SPACING) : cx - tw / 2 + tw * ((i + 1) / (topCount + 1));
    push(chCx, cy - (td / 2 + cd / 2 + CHAIR_GAP), 180);
  }
  const startBot = edgeStart(bottomCount);
  for (let i = 0; i < bottomCount; i++) {
    const chCx = startBot != null ? startBot + i * (cw + CHAIR_SPACING) : cx - tw / 2 + tw * ((i + 1) / (bottomCount + 1));
    push(chCx, cy + (td / 2 + cd / 2 + CHAIR_GAP), 0);
  }
  if (endsTotal >= 1) push(cx + tw / 2 + CHAIR_GAP + cw / 2, cy, 90);
  if (endsTotal >= 2) push(cx - tw / 2 - CHAIR_GAP - cw / 2, cy, 270);
  if (tableRot) {
    const rad = tableRot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    for (const ch of chairs) {
      const dx = ch.cx - cx, dy = ch.cy - cy;
      ch.cx = cx + dx * cos - dy * sin;
      ch.cy = cy + dx * sin + dy * cos;
      ch.rot = ((ch.rot || 0) + tableRot) % 360;
    }
  }
  return chairs;
}

function corners(cx, cy, w, d, rot) {
  const rad = ((rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }));
}

function quadsOverlap(qa, qb, tol) {
  const axes = [];
  for (const q of [qa, qb]) {
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      axes.push({ x: -(b.y - a.y), y: b.x - a.x });
    }
  }
  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.y) || 1;
    const nx = axis.x / len, ny = axis.y / len;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of qa) { const s = p.x * nx + p.y * ny; if (s < minA) minA = s; if (s > maxA) maxA = s; }
    for (const p of qb) { const s = p.x * nx + p.y * ny; if (s < minB) minB = s; if (s > maxB) maxB = s; }
    if (maxA < minB + tol || maxB < minA + tol) return false;
  }
  return true;
}

function overlapAmount(qa, qb) {
  // Approximate penetration as min overlap on AABB of the two quads.
  const box = (q) => ({
    x1: Math.min(...q.map(p => p.x)), y1: Math.min(...q.map(p => p.y)),
    x2: Math.max(...q.map(p => p.x)), y2: Math.max(...q.map(p => p.y)),
  });
  const a = box(qa), b = box(qb);
  const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return { ox, oy };
}

function expand(recipe) {
  const solids = [];
  let id = 0;
  for (const it of recipe.items) {
    const cat = byKey[it.key];
    if (!cat || cat.shape === 'tent') continue;
    const sz = sizeOf(it.key);
    const parent = ++id;
    solids.push({
      kind: cat.shape === 'danceFloor' ? 'dance' : (cat.shape === 'circle' ? 'table' : (it.key.includes('chair') ? 'chair' : 'table')),
      key: it.key, parent, cx: it.cx, cy: it.cy, w: sz.w, d: sz.d, rot: it.rotation || 0,
    });
    if (it.withChairs && cat.seats > 1) {
      const chairKey = it.chairKey || 'resin-garden-chair';
      const cCat = byKey[chairKey];
      const n = it.chairCount != null ? it.chairCount : cat.seats;
      const chairs = cat.shape === 'circle'
        ? placeChairsRound(it.cx, it.cy, cat, cCat, n)
        : placeChairsRect(it.cx, it.cy, cat, cCat, n, it.rotation || 0);
      for (const ch of chairs) {
        solids.push({ kind: 'chair', key: chairKey, parent, cx: ch.cx, cy: ch.cy, w: ch.w, d: ch.d, rot: ch.rot });
      }
    }
  }
  return solids;
}

function joinedRun(a, b) {
  if (a.kind !== 'table' || b.kind !== 'table') return false;
  if (a.key !== 'banquet-table-6ft' || b.key !== 'banquet-table-6ft') return false;
  const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
  // End-to-end 12ft run (rotated 90: stacked on Y) or head-table pair (unrotated, stacked on X).
  return (dx < 0.2 && Math.abs(dy - 6) < 0.2) || (dy < 0.2 && Math.abs(dx - 6) < 0.2);
}

function audit(name, opts) {
  const recipe = gen.generateLayout(opts);
  if (!recipe) return { name, ok: false, error: 'null layout', hits: [] };
  const solids = expand(recipe);
  const hits = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (a.parent === b.parent) continue; // chairs of the same table
      if (joinedRun(a, b)) continue;
      const qa = corners(a.cx, a.cy, a.w, a.d, a.rot);
      const qb = corners(b.cx, b.cy, b.w, b.d, b.rot);
      const tol = (a.kind === 'chair' || b.kind === 'chair') ? 0.12 : 0.05;
      if (!quadsOverlap(qa, qb, tol)) continue;
      const { ox, oy } = overlapAmount(qa, qb);
      if (ox < 0.15 || oy < 0.15) continue;
      hits.push({
        a: `${a.kind}:${a.key}`,
        b: `${b.kind}:${b.key}`,
        ox: Math.round(ox * 100) / 100,
        oy: Math.round(oy * 100) / 100,
      });
    }
  }
  writeSvg(name, recipe, solids, hits.length > 0);
  return { name, ok: hits.length === 0, summary: recipe.summary, hits: hits.slice(0, 8), hitCount: hits.length };
}

function writeSvg(name, recipe, solids, flagged) {
  const W = recipe.venue.widthFt, D = recipe.venue.depthFt;
  const tents = recipe.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${D}" width="${Math.round(W * 8)}" height="${Math.round(D * 8)}">`);
  parts.push(`<rect width="${W}" height="${D}" fill="#faf8f4"/>`);
  for (const t of tents) {
    const s = sizeOf(t.key);
    const rot = t.rotation || 0;
    const w = rot % 180 ? s.d : s.w, d = rot % 180 ? s.w : s.d;
    parts.push(`<rect x="${t.cx - w / 2}" y="${t.cy - d / 2}" width="${w}" height="${d}" fill="none" stroke="#2d5a3d" stroke-width="0.35" stroke-dasharray="1.4 0.8"/>`);
  }
  for (const it of solids) {
    const fill = it.kind === 'dance' ? 'rgba(200,160,60,.4)' : it.kind === 'chair' ? '#d9d3c7' : '#fff';
    const stroke = flagged && it.kind !== 'chair' ? '#8a2b2b' : '#2d5a3d';
    parts.push(`<g transform="rotate(${it.rot || 0} ${it.cx} ${it.cy})"><rect x="${it.cx - it.w / 2}" y="${it.cy - it.d / 2}" width="${it.w}" height="${it.d}" fill="${fill}" stroke="${stroke}" stroke-width="0.12" rx="0.12"/></g>`);
  }
  parts.push(`</svg>`);
  writeFileSync(join(outDir, name.replace(/\s+/g, '_') + '.svg'), parts.join(''));
}

const CASES = [
  { guests: 20, seating: 'round' },
  { guests: 50, seating: 'round', danceFloor: true },
  { guests: 50, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 60, seating: 'round' },
  { guests: 60, seating: 'banquet', buffet: true },
  { guests: 100, seating: 'round', danceFloor: true },
  { guests: 100, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 150, seating: 'round', danceFloor: true },
  { guests: 150, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 200, seating: 'round', danceFloor: true },
  { guests: 200, seating: 'banquet', danceFloor: true },
];

let failures = 0;
for (const pack of ['efficient', 'spacious']) {
  console.log('\n' + pack + ':');
  for (const base of CASES) {
    const name = `${pack}-${base.guests}-${base.seating}${base.danceFloor ? '-dance' : ''}`;
    const r = audit(name, { ...base, pack });
    if (!r.ok) {
      failures++;
      console.error(`  ✗ ${name}  ${r.error || r.summary}  (${r.hitCount} overlaps)`);
      for (const h of r.hits) console.error(`      ${h.a} × ${h.b}  ${h.ox}×${h.oy} ft`);
    } else {
      console.log(`  ✓ ${name}  ${r.summary}`);
    }
  }
}
if (failures) {
  console.error(`\n${failures} layout(s) have overlaps`);
  process.exit(1);
}
console.log('\nNO OVERLAPS');
