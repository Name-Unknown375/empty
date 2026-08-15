// Regenerates site-v3/planner/templates.json from layout-gen.js so the
// Templates menu matches Plan-for-me packing (aisles, tent choice, L-pack).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(repo, 'site-v3/planner/catalog.json'), 'utf8'));
const templatesPath = join(repo, 'site-v3/planner/templates.json');
const gen = require(join(repo, 'site-v3/planner/layout-gen.js'));
gen.init(catalog);

const PRESETS = {
  'wedding-50': { guests: 50, seating: 'banquet', danceFloor: true, headTable: true },
  'wedding-50-no-dance': { guests: 50, seating: 'banquet', headTable: true },
  'wedding-100': { guests: 100, seating: 'round', danceFloor: true },
  'wedding-100-rect': { guests: 100, seating: 'banquet', danceFloor: true, headTable: true },
  'wedding-100-no-dance': { guests: 100, seating: 'round' },
  'wedding-100-rect-no-dance': { guests: 100, seating: 'banquet', headTable: true },
  'wedding-150': { guests: 150, seating: 'round', danceFloor: true },
  'wedding-150-rect': { guests: 150, seating: 'banquet', danceFloor: true, headTable: true },
  'wedding-150-no-dance': { guests: 150, seating: 'round' },
  'wedding-150-rect-no-dance': { guests: 150, seating: 'banquet', headTable: true },
  'wedding-200': { guests: 200, seating: 'round', danceFloor: true },
  'wedding-200-rect': { guests: 200, seating: 'banquet', danceFloor: true, headTable: true },
  'ceremony-100': { guests: 100, seating: 'ceremony' },
  'corporate-cocktail-75': { guests: 75, seating: 'cocktail', bar: true },
  'corporate-seated-60': { guests: 60, seating: 'round' },
  'corporate-seated-60-rect': { guests: 60, seating: 'banquet' },
  'buffet-banquet-60': { guests: 60, seating: 'banquet', buffet: true },
};

const round = (n) => Math.round(n * 100) / 100;
const roundItem = (it) => {
  const out = { ...it, cx: round(it.cx), cy: round(it.cy) };
  if (out.rotation) out.rotation = round(out.rotation);
  return out;
};

const data = JSON.parse(readFileSync(templatesPath, 'utf8'));
data._comment = 'Forever Party Rentals — Event Layout Planner starter templates. Generated from planner/layout-gen.js so Templates and Plan-for-me share the same packing (grid rounds at catering pitch, two banquet runs, dance as an end zone). intimate-wedding-20 and birthday-30 stay hand-built (joined head-table runs). Coordinates are item centers in feet; withChairs:true tables get auto-chairs via placeChairsAround().';

let updated = 0;
for (const t of data.templates) {
  const opts = PRESETS[t.id];
  if (!opts) continue;
  const recipe = gen.generateLayout(opts);
  if (!recipe) {
    console.error('skip', t.id, '— generator returned null');
    continue;
  }
  t.summary = recipe.summary;
  t.venue = { widthFt: round(recipe.venue.widthFt), depthFt: round(recipe.venue.depthFt) };
  t.items = recipe.items.map(roundItem);
  updated++;
  console.log(t.id, '→', t.summary);
}

writeFileSync(templatesPath, JSON.stringify(data, null, 2) + '\n');
console.log(`updated ${updated} templates`);
