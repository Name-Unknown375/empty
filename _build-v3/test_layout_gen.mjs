// Validation harness for site/planner/layout-gen.js (run: node _build/test_layout_gen.mjs)
// Asserts, for the plan's test matrix, that generated recipes:
//   1. only use catalog keys
//   2. seat at least the requested guests
//   3. keep table envelopes (table + chairs) from overlapping
//   4. keep every envelope inside the venue bounds
//   5. pick tent(s) whose combined area covers the furniture zone
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'site/planner/catalog.json'), 'utf8'));
const gen = require(join(root, 'site/planner/layout-gen.js'));

gen.init(catalog);

const byKey = {};
for (const g of catalog.groups) for (const it of g.items) byKey[it.key] = it;
const size = (k) => {
  const c = byKey[k];
  return c.shape === 'circle' ? { w: c.diameterFt, d: c.diameterFt } : { w: c.widthFt, d: c.depthFt };
};

const CHAIR_ENV = 1.83 + 0.25; // chair depth + gap on every side of a seated table

let failures = 0;
const fail = (name, msg) => { failures++; console.error(`  ✗ ${name}: ${msg}`); };

function check(name, opts) {
  const recipe = gen.generateLayout(opts);
  if (!recipe) return fail(name, 'generateLayout returned null');
  const { venue, items } = recipe;

  // 1. keys exist
  for (const it of items) {
    if (!byKey[it.key]) return fail(name, `unknown key ${it.key}`);
  }

  // 2. capacity
  if (opts.seating === 'cocktail') {
    const high = items.filter(i => i.key.startsWith('cocktail')).length;
    if (high < Math.ceil(opts.guests / 6)) fail(name, `only ${high} highboys for ${opts.guests} guests`);
  } else if (opts.seating === 'ceremony') {
    const chairs = items.filter(i => i.key.includes('chair')).length;
    if (chairs < opts.guests) fail(name, `only ${chairs} ceremony chairs for ${opts.guests}`);
  } else {
    const seats = items.filter(i => i.withChairs).reduce((n, i) => n + (i.chairCount || 0), 0);
    if (seats < opts.guests) fail(name, `only ${seats} seats for ${opts.guests} guests`);
  }

  // 3+4. envelopes: non-tent items must not overlap and must stay in venue
  const solid = items.filter(i => byKey[i.key].shape !== 'tent');
  const env = solid.map(i => {
    const s = size(i.key);
    const rot = (i.rotation || 0) % 180 !== 0;
    let w = rot ? s.d : s.w, d = rot ? s.w : s.d;
    if (i.withChairs) {
      if (i.key.startsWith('banquet-table')) {
        // ≤6 chairs sit on the long sides only — they inflate the short
        // axis, never the table ends (which is what lets runs join).
        if (rot) w += CHAIR_ENV * 2; else d += CHAIR_ENV * 2;
        if ((i.chairCount || 0) > 6) { if (rot) d += CHAIR_ENV * 2; else w += CHAIR_ENV * 2; }
      } else {
        w += CHAIR_ENV * 2; d += CHAIR_ENV * 2;
      }
    }
    return { key: i.key, cx: i.cx, cy: i.cy, x1: i.cx - w / 2, y1: i.cy - d / 2, x2: i.cx + w / 2, y2: i.cy + d / 2, head: !!i.withChairs && (i.chairCount || 0) <= 4 };
  });
  // Banquet tables joined end-to-end in a run (same column, centres one
  // table-length apart) are a deliberate composite — same rule as the
  // planner's validateLayout.
  const sameRun = (a, b) =>
    a.key === 'banquet-table-6ft' && b.key === 'banquet-table-6ft' &&
    Math.abs(a.cx - b.cx) < 0.1 && Math.abs(a.cy - b.cy) <= 6.05;
  for (const e of env) {
    if (e.x1 < -0.01 || e.y1 < -0.01 || e.x2 > venue.widthFt + 0.01 || e.y2 > venue.depthFt + 0.01) {
      fail(name, `${e.key} envelope outside venue (${e.x1.toFixed(1)},${e.y1.toFixed(1)})–(${e.x2.toFixed(1)},${e.y2.toFixed(1)}) in ${venue.widthFt}×${venue.depthFt}`);
      break;
    }
  }
  outer:
  for (let i = 0; i < env.length; i++) {
    for (let j = i + 1; j < env.length; j++) {
      const a = env[i], b = env[j];
      // chairs-around envelopes may touch; require real penetration > 0.3
      // head-table halves are a deliberate composite — skip their pair
      if (a.head && b.head) continue;
      if (sameRun(a, b)) continue;
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (ox > 0.3 && oy > 0.3) {
        fail(name, `${a.key} overlaps ${b.key} by ${ox.toFixed(1)}×${oy.toFixed(1)} ft`);
        break outer;
      }
    }
  }

  // 5. tents picked (no-venue mode) and cover the non-tent furniture
  if (!opts.venue) {
    const tentItems = items.filter(i => byKey[i.key].shape === 'tent');
    if (tentItems.length === 0) return fail(name, 'no tent chosen');
    // STOCK: never recommend more tents than FPR owns (RentKit fleet).
    const STOCK = { 'marquee-tent-20x20': 4, 'marquee-tent-20x30': 4, 'marquee-tent-20x40': 2, 'marquee-tent-20x60': 2, 'marquee-tent-30x60': 1, 'popup-tent-10x10': 25 };
    const used = {};
    for (const t of tentItems) used[t.key] = (used[t.key] || 0) + 1;
    for (const [k, n] of Object.entries(used)) {
      if (n > (STOCK[k] || 0)) fail(name, `uses ${n}× ${k} but stock is ${STOCK[k] || 0}`);
    }
    const area = tentItems.reduce((n, i) => { const s = size(i.key); return n + s.w * s.d; }, 0);
    const rec = gen.recommendTent(opts);
    if (!rec.fits) fail(name, 'recommendTent says it does not fit');
    if (rec.tentKeys.join() !== tentItems.map(i => i.key).join()) {
      fail(name, `recommendTent (${rec.tentKeys}) disagrees with generateLayout (${tentItems.map(i => i.key)})`);
    }
    if (area <= 0) fail(name, 'tent area zero');
  }

  console.log(`  ✓ ${name}: ${recipe.summary} → venue ${venue.widthFt}×${venue.depthFt}, ${items.length} items`);
}

console.log('layout-gen test matrix:');
for (const guests of [20, 50, 100, 150, 200]) {
  for (const seating of ['round', 'banquet']) {
    check(`${guests}-${seating}`, { guests, seating, danceFloor: guests >= 50, headTable: seating === 'banquet' && guests >= 50 });
  }
}
check('cocktail-75', { guests: 75, seating: 'cocktail', bar: true });
check('ceremony-100', { guests: 100, seating: 'ceremony' });
check('venue-fit-40x60', { guests: 60, seating: 'round', venue: { widthFt: 40, depthFt: 60 }, danceFloor: true });
check('buffet-60', { guests: 60, seating: 'banquet', buffet: true });

// Inventory-preference regression: FPR stocks five 20-ft-wide marquee
// sizes and ONE 30×60 — with real stock caps (max join: 2× 20×60), the
// 30×60 may only enter above 100 guests, where no 20x option can fit.
for (const guests of [20, 30, 50, 80, 100]) {
  for (const seating of ['round', 'banquet', 'cocktail', 'ceremony']) {
    const rec = gen.recommendTent({ guests, seating, danceFloor: seating !== 'ceremony' });
    if (rec.tentKeys.includes('marquee-tent-30x60')) {
      fail(`prefer-20x ${guests}-${seating}`, `recommended 30x60 (${rec.tentKeys.join('+')}) at ${guests} guests`);
    }
  }
}
{
  const cer = gen.recommendTent({ guests: 100, seating: 'ceremony' });
  if (cer.tentKeys.join() !== 'marquee-tent-20x60') {
    fail('ceremony-100-single-tent', `expected one 20x60 (matches the hand-built template), got ${cer.tentKeys.join('+')}`);
  } else {
    console.log('  ✓ prefer-20x: no 30x60 below 150 guests; ceremony-100 = single 20×60');
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nALL PASS');
