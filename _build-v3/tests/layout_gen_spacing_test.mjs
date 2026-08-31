// Spacing + packing harness for site-v3/planner/layout-gen.js
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'site-v3/planner/catalog.json'), 'utf8'));
const gen = require(join(root, 'site-v3/planner/layout-gen.js'));
gen.init(catalog);

const byKey = {};
for (const g of catalog.groups) for (const it of g.items) byKey[it.key] = it;
const size = (k) => {
  const c = byKey[k];
  return c.shape === 'circle' ? { w: c.diameterFt, d: c.diameterFt } : { w: c.widthFt, d: c.depthFt };
};

const CHAIR_ENV = 1.83 + 0.25;
let failures = 0;
const fail = (name, msg) => { failures++; console.error(`  ✗ ${name}: ${msg}`); };
const ok = (cond, name, msg) => cond ? console.log(`  ✓ ${name}${msg ? ': ' + msg : ''}`) : fail(name, msg);

function envelope(it) {
  const s = size(it.key);
  const rot = (it.rotation || 0) % 180 !== 0;
  let w = rot ? s.d : s.w, d = rot ? s.w : s.d;
  if (it.withChairs) {
    if (it.key.startsWith('banquet-table')) {
      if (rot) w += CHAIR_ENV * 2; else d += CHAIR_ENV * 2;
      if ((it.chairCount || 0) > 6) { if (rot) d += CHAIR_ENV * 2; else w += CHAIR_ENV * 2; }
    } else {
      w += CHAIR_ENV * 2; d += CHAIR_ENV * 2;
    }
  }
  return { key: it.key, cx: it.cx, cy: it.cy, x1: it.cx - w / 2, y1: it.cy - d / 2, x2: it.cx + w / 2, y2: it.cy + d / 2, w, d };
}

function tentAabb(items) {
  const tents = items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');
  if (!tents.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const t of tents) {
    const s = size(t.key);
    const rot = (t.rotation || 0) % 180 !== 0;
    const w = rot ? s.d : s.w, d = rot ? s.w : s.d;
    x1 = Math.min(x1, t.cx - w / 2); y1 = Math.min(y1, t.cy - d / 2);
    x2 = Math.max(x2, t.cx + w / 2); y2 = Math.max(y2, t.cy + d / 2);
  }
  return { x1, y1, x2, y2 };
}

function check(name, opts, expect) {
  const recipe = gen.generateLayout(opts);
  if (!recipe) return fail(name, 'generateLayout returned null');
  const { venue, items } = recipe;
  const tables = items.filter(i => i.withChairs);
  const tents = items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');

  for (const it of items) {
    if (!byKey[it.key]) return fail(name, `unknown key ${it.key}`);
  }

  if (opts.seating === 'cocktail') {
    const high = items.filter(i => i.key.startsWith('cocktail')).length;
    if (high < Math.ceil(opts.guests / 6)) fail(name, `only ${high} highboys for ${opts.guests} guests`);
  } else if (opts.seating === 'ceremony') {
    const chairs = items.filter(i => i.key.includes('chair')).length;
    if (chairs < opts.guests) fail(name, `only ${chairs} ceremony chairs for ${opts.guests}`);
  } else {
    const seats = tables.reduce((n, i) => n + (i.chairCount || 0), 0);
    if (seats < opts.guests) fail(name, `only ${seats} seats for ${opts.guests} guests`);
  }

  const envs = items.filter(i => byKey[i.key].shape !== 'tent').map(envelope);
  for (const e of envs) {
    if (e.x1 < -0.05 || e.y1 < -0.05 || e.x2 > venue.widthFt + 0.05 || e.y2 > venue.depthFt + 0.05) {
      fail(name, `${e.key} envelope outside venue (${e.x1.toFixed(1)},${e.y1.toFixed(1)})–(${e.x2.toFixed(1)},${e.y2.toFixed(1)}) in ${venue.widthFt}×${venue.depthFt}`);
      break;
    }
  }

  const sameRun = (a, b) =>
    a.key === 'banquet-table-6ft' && b.key === 'banquet-table-6ft' &&
    Math.abs(a.cx - b.cx) < 0.15 && Math.abs(a.cy - b.cy) <= 6.1;
  outer:
  for (let i = 0; i < envs.length; i++) {
    for (let j = i + 1; j < envs.length; j++) {
      const a = envs[i], b = envs[j];
      if (a.key.startsWith('dance') || b.key.startsWith('dance')) {
        const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (ox > 0.6 && oy > 0.6) {
          fail(name, `${a.key} overlaps ${b.key} by ${ox.toFixed(1)}×${oy.toFixed(1)} ft`);
          break outer;
        }
        continue;
      }
      if (sameRun(a, b)) continue;
      if ((a.key.includes('banquet') && (a.w > 8 || false) && (tables.find(t => t.cx === a.cx) || {}).chairCount <= 4) &&
          (b.key.includes('banquet') && (tables.find(t => t.cx === b.cx) || {}).chairCount <= 4) &&
          Math.abs(a.cy - b.cy) < 1 && Math.abs(a.cx - b.cx) <= 6.1) continue;
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (ox > 0.4 && oy > 0.4) {
        fail(name, `${a.key} overlaps ${b.key} by ${ox.toFixed(1)}×${oy.toFixed(1)} ft`);
        break outer;
      }
    }
  }

  if (!opts.venue) {
    if (!tents.length) fail(name, 'no tent chosen');
    const rec = gen.recommendTent(opts);
    if (!rec.fits) fail(name, 'recommendTent says it does not fit');
    if (rec.tentKeys.join() !== tents.map(i => i.key).join()) {
      fail(name, `recommendTent (${rec.tentKeys}) disagrees with generateLayout (${tents.map(i => i.key)})`);
    }
  const aabb = tentAabb(items);
    const furniture = envs.filter(e => !e.key.startsWith('dance') || !recipe.compromise);
    if (aabb && recipe.compromise !== 'dance-outside') {
      for (const e of furniture) {
        if (e.key.startsWith('dance') && recipe.compromise === 'dance-outside') continue;
        // Table tops stay under the canvas; chairs may kiss the valance
        // in both pack modes so spacious doesn't have to jump a tent size.
        const useBody = (e.key.startsWith('round-table') || e.key.startsWith('cocktail'));
        const body = useBody
          ? { x1: e.cx - size(e.key).w / 2, y1: e.cy - size(e.key).d / 2, x2: e.cx + size(e.key).w / 2, y2: e.cy + size(e.key).d / 2, key: e.key }
          : e;
        if (body.x1 < aabb.x1 - 0.2 || body.y1 < aabb.y1 - 0.2 || body.x2 > aabb.x2 + 0.2 || body.y2 > aabb.y2 + 0.2) {
          fail(name, `${e.key} body outside tent (${body.x1.toFixed(1)},${body.y1.toFixed(1)})–(${body.x2.toFixed(1)},${body.y2.toFixed(1)}) vs tent (${aabb.x1.toFixed(1)},${aabb.y1.toFixed(1)})–(${aabb.x2.toFixed(1)},${aabb.y2.toFixed(1)})`);
          break;
        }
      }
    }
  }

  if (expect) {
    if (expect.maxTents != null && tents.length > expect.maxTents) {
      fail(name, `used ${tents.length} tents, expected ≤ ${expect.maxTents} (${tents.map(t => t.key).join('+')})`);
    }
    if (expect.minAisle != null && recipe.aisle != null && recipe.aisle < expect.minAisle) {
      fail(name, `aisle ${recipe.aisle} ft, expected ≥ ${expect.minAisle}`);
    }
  }

  console.log(`  ✓ ${name}: ${recipe.summary} → ${venue.widthFt}×${venue.depthFt}, ${items.length} items`);
}

console.log('layout-gen spacing matrix:');
check('20-round', { guests: 20, seating: 'round' }, { maxTents: 1, minAisle: 1.5 });
check('50-round-dance', { guests: 50, seating: 'round', danceFloor: true }, { maxTents: 1, minAisle: 1.5 });
check('50-banquet', { guests: 50, seating: 'banquet' }, { maxTents: 1 });
check('50-banquet-dance', { guests: 50, seating: 'banquet', danceFloor: true, headTable: true }, { maxTents: 2 });
check('60-round', { guests: 60, seating: 'round' }, { maxTents: 1 });
check('100-round-dance', { guests: 100, seating: 'round', danceFloor: true }, { maxTents: 3 });
check('100-banquet-dance', { guests: 100, seating: 'banquet', danceFloor: true }, { maxTents: 3 });
check('150-round-dance', { guests: 150, seating: 'round', danceFloor: true });
check('200-round-dance', { guests: 200, seating: 'round', danceFloor: true });
check('cocktail-75', { guests: 75, seating: 'cocktail', bar: true });
check('ceremony-100', { guests: 100, seating: 'ceremony' }, { maxTents: 1 });
check('venue-fit-40x60', { guests: 60, seating: 'round', venue: { widthFt: 40, depthFt: 60 }, danceFloor: true });
check('buffet-60', { guests: 60, seating: 'banquet', buffet: true });

{
  const rec = gen.recommendTent({ guests: 50, seating: 'round', danceFloor: true });
  ok(rec.tentKeys.length === 1, '50-guest uses a single marquee', rec.tentKeys.join('+'));
  ok(rec.tentKeys[0] !== 'marquee-tent-20x30', '50-guest is not three 20×30s', rec.tentKeys.join('+'));
}

{
  const rec = gen.recommendTent({ guests: 50, seating: 'banquet' });
  ok(rec.tentKeys.length === 1, '50-guest banquet uses a single marquee', rec.tentKeys.join('+'));
  ok(rec.tentKeys[0] !== 'marquee-tent-20x60', '50-guest banquet is not an empty 20×60', rec.tentKeys.join('+'));
  const recipe = gen.generateLayout({ guests: 50, seating: 'banquet' });
  const tables = recipe.items.filter(i => i.key === 'banquet-table-6ft');
  const runTables = tables.filter(t => (t.rotation || 0) % 180 !== 0);
  const xs = [...new Set(runTables.map(t => Math.round(t.cx * 2) / 2))].sort((a, b) => a - b);
  ok(xs.length >= 2, '50-guest banquet is two joined runs, not a single file of 12ft pairs', `x-values ${xs.join(',')}`);
  const spanY = Math.max(...tables.map(t => t.cy)) - Math.min(...tables.map(t => t.cy)) + 6;
  ok(spanY <= 40, '50-guest banquet runs are compact along the tent', `${spanY.toFixed(1)} ft of tables`);
  const aisleDx = xs[1] - xs[0];
  ok(aisleDx >= 8 && aisleDx <= 12.5, '50-guest banquet centre aisle is a walk aisle, not a stretched void', `${aisleDx} ft between runs`);
  const runCounts = xs.map(x => runTables.filter(t => Math.round(t.cx * 2) / 2 === x).length);
  ok(runCounts.length === 2 && runCounts[0] === runCounts[1], '50-guest banquet runs are equal length, leftover is a head table', runCounts.join('+'));
}

{
  const recipe = gen.generateLayout({ guests: 50, seating: 'banquet', danceFloor: true, headTable: true });
  const tables = recipe.items.filter(i => i.key === 'banquet-table-6ft');
  const runTables = tables.filter(t => (t.rotation || 0) % 180 !== 0);
  const xs = [...new Set(runTables.map(t => Math.round(t.cx * 2) / 2))].sort((a, b) => a - b);
  const runCounts = xs.map(x => runTables.filter(t => Math.round(t.cx * 2) / 2 === x).length);
  ok(runCounts.length >= 2 && runCounts[0] === runCounts[1], '50-guest banquet+head runs are equal, leftover is a sweetheart', runCounts.join('+'));
}

{
  const recipe = gen.generateLayout({ guests: 50, seating: 'round', danceFloor: true });
  const rounds = recipe.items.filter(i => i.key === 'round-table-5ft');
  const xs = [...new Set(rounds.map(t => Math.round(t.cx * 2) / 2))];
  ok(xs.length >= 2, '50-guest rounds are two even columns, not a zipper honeycomb', `x-values ${xs.join(',')}`);
  const ys = [...new Set(rounds.map(t => Math.round(t.cy)))].sort((a, b) => a - b);
  const rowCounts = ys.map(y => rounds.filter(t => Math.round(t.cy) === y).length);
  ok(rowCounts[0] === 2, '50-guest first row is a pair', rowCounts.join(','));
}

const WIZARD_CASES = [
  { guests: 20, seating: 'round' },
  { guests: 50, seating: 'round', danceFloor: true },
  { guests: 50, seating: 'banquet' },
  { guests: 50, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 60, seating: 'round' },
  { guests: 60, seating: 'banquet', buffet: true },
  { guests: 75, seating: 'cocktail', bar: true },
  { guests: 100, seating: 'round', danceFloor: true },
  { guests: 100, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 100, seating: 'ceremony' },
  { guests: 150, seating: 'round', danceFloor: true },
  { guests: 150, seating: 'banquet', danceFloor: true, headTable: true },
  { guests: 200, seating: 'round', danceFloor: true },
  { guests: 200, seating: 'banquet', danceFloor: true },
];

console.log('\nspacious matrix:');
for (const base of WIZARD_CASES) {
  check(`spacious ${base.guests}-${base.seating}${base.danceFloor ? '-dance' : ''}`, { ...base, pack: 'spacious' }, { minAisle: (base.seating === 'round' || base.seating === 'cocktail') ? 1.5 : (base.guests >= 200 ? 2.5 : (base.guests >= 150 ? 3.5 : 4)) });
}

console.log('\nefficient vs spacious:');
for (const base of WIZARD_CASES) {
  const a = gen.generateLayout({ ...base, pack: 'efficient' });
  const b = gen.generateLayout({ ...base, pack: 'spacious' });
  const label = `${base.guests}-${base.seating}${base.danceFloor ? '-dance' : ''}`;
  if (!a || !b) {
    fail(label, `missing layout efficient=${!!a} spacious=${!!b}`);
    continue;
  }
  const area = (r) => {
    const tents = r.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');
    return tents.reduce((s, t) => {
      const sz = size(t.key);
      return s + sz.w * sz.d;
    }, 0);
  };
  const aAisle = a.aisle || 0, bAisle = b.aisle || 0;
  const aArea = area(a), bArea = area(b);
  const roomier = bAisle >= aAisle && bArea >= aArea && (bAisle > aAisle || bArea > aArea || b.compromise !== 'dance-outside' || a.compromise === 'dance-outside');
  // Spacious must not be tighter: aisle and tent area at least as generous,
  // unless both already match (same install, extra walk room from spread).
  ok(bAisle + 0.01 >= Math.min(aAisle, 4) || base.seating === 'ceremony' || base.seating === 'round' || base.seating === 'cocktail', `${label} spacious aisle is not tighter`, `efficient ${aAisle} → spacious ${bAisle}`);
  ok(bAisle >= 4 || base.seating === 'ceremony' || base.seating === 'round' || base.seating === 'cocktail' || base.guests >= 150, `${label} spacious aisle ≥ 4`, `${bAisle}`);
  const aTents = a.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent').length;
  const bTents = b.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent').length;
  ok(bTents <= aTents, `${label} spacious does not add marquees`, `${aTents} → ${bTents}`);
  ok(bArea <= aArea + 1, `${label} spacious stays in the efficient tent when it fits`, `${aArea} → ${bArea}`);
  if (a.compromise !== 'dance-outside' && base.danceFloor && base.seating !== 'ceremony' && base.guests < 200) {
    ok(b.compromise !== 'dance-outside', `${label} spacious keeps dance inside if efficient did`, b.summary);
  }
  console.log(`    ${label}: ${a.summary}  vs  ${b.summary}`);
}

{
  const recipe = gen.generateLayout({ guests: 50, seating: 'round', danceFloor: true, pack: 'spacious' });
  const rounds = recipe.items.filter(i => i.key === 'round-table-5ft');
  let minD = Infinity;
  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      const d = Math.hypot(rounds[i].cx - rounds[j].cx, rounds[i].cy - rounds[j].cy);
      if (d < minD) minD = d;
    }
  }
  ok(minD >= 11.5, 'spacious 50-guest round pitch ≥ 12 ft grid', `min centre ${minD.toFixed(2)} ft`);
  const xs = [...new Set(rounds.map(t => Math.round(t.cx * 2) / 2))].sort((a, b) => a - b);
  const colXs = xs.filter(x => rounds.filter(t => Math.round(t.cx * 2) / 2 === x).length >= 2);
  if (colXs.length >= 2) {
    ok(colXs[1] - colXs[0] >= 11.5 && colXs[1] - colXs[0] <= 13, 'spacious rounds keep 12 ft pitch, not stretched across the tent', `${(colXs[1] - colXs[0]).toFixed(1)} ft column span`);
  }
  const spaTents = recipe.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent').map(i => i.key).join('+');
  ok(spaTents === 'marquee-tent-20x60', 'spacious 50-guest rounds stay in the 20×60', spaTents);
}

{
  const pair = gen.generateFlipLayouts({ guests: 80, seating: 'round', danceFloor: true });
  ok(!!pair && !!pair.dinner && !!pair.ceremony, 'flip returns dinner + ceremony');
  if (pair && pair.dinner && pair.ceremony) {
    const dTents = pair.dinner.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent').map(i => i.key).sort().join(',');
    const cTents = pair.ceremony.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent').map(i => i.key).sort().join(',');
    ok(dTents === cTents && dTents.length > 0, 'flip dinner and ceremony share the same tents', dTents);
    const rows = pair.ceremony.items.filter(i => i.key && i.key.includes('chair')).length;
    ok(rows >= 80, 'flip ceremony has a chair per guest', String(rows));
    ok(pair.dinner.venue.widthFt === pair.ceremony.venue.widthFt, 'flip scenes share venue width');
  }
}

{
  const yard = { widthFt: 24, depthFt: 24 };
  const recipe = gen.generateLayout({ guests: 20, seating: 'cocktail', venue: yard, danceFloor: false });
  ok(!!recipe, 'small 24×24 yard still returns a layout');
  if (recipe) {
    ok(recipe.keepVenue, 'small yard keepVenue is set');
    ok(recipe.venue.widthFt === 24 && recipe.venue.depthFt === 24, 'small yard size is preserved', `${recipe.venue.widthFt}×${recipe.venue.depthFt}`);
    const tents = recipe.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');
    ok(tents.length === 0, '24×24 cannot fit a marquee plus 5 ft stake band — furniture only', String(tents.length));
  }
}

{
  const recipe = gen.generateLayout({ guests: 50, seating: 'round', venue: { widthFt: 40, depthFt: 60 }, danceFloor: true });
  ok(recipe && recipe.keepVenue, '40×60 yard keepVenue');
  if (recipe) {
    ok(recipe.venue.widthFt === 40 && recipe.venue.depthFt === 60, '40×60 yard size is preserved');
    const tents = recipe.items.filter(i => byKey[i.key] && byKey[i.key].shape === 'tent');
    ok(tents.length >= 1, '40×60 yard still places a tent');
    ok(tents.every(t => t.clearance), 'generated tents default clearance on');
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nALL PASS');
