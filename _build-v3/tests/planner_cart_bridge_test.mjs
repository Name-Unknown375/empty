import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = fileURLToPath(new URL('../../site-v3', import.meta.url));
const src = readFileSync(`${ROOT}/planner/planner-cart.js`, 'utf8');
const catalog = JSON.parse(readFileSync(`${ROOT}/planner/catalog.json`, 'utf8'));
const rentkitMap = JSON.parse(readFileSync(`${ROOT}/planner/rentkit-map.json`, 'utf8'));

const sandbox = { console, globalThis: {} };
vm.createContext(sandbox);
sandbox.globalThis = sandbox;
vm.runInContext(src, sandbox);
const { FPRPlannerCart } = sandbox;
if (!FPRPlannerCart) {
  console.error('FAIL: FPRPlannerCart not defined');
  process.exit(1);
}

const byKey = {};
for (const g of catalog.groups) {
  for (const it of g.items) byKey[it.key] = it;
}

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (cond, msg) => cond ? console.log('ok –', msg) : fail(msg);

const items = [
  { key: 'marquee-tent-20x40' },
  { key: 'round-table-5ft' },
  { key: 'round-table-5ft' },
  { key: 'resin-garden-chair' },
  { key: 'resin-garden-chair' },
  { key: 'resin-garden-chair' },
  { key: 'cocktail-table' },
  { key: 'cocktail-table-28' },
  { key: 'banquet-table-8ft' },
  { key: 'tent-sidewall' },
  { key: 'bistro-string-lights' },
];

const payload = FPRPlannerCart.buildAdelieCartPayload(items, byKey, rentkitMap);

ok(payload.cart['gRjUQXUVljE9KwOqHHzL'] === 1, '20×40 marquee maps to Adelie id');
ok(payload.cart['5OeLhlFSqnkRSzCOOMWJ'] === 2, 'two 5ft rounds');
ok(payload.cart['haTcu9MPklPpxZINalHh'] === 3, 'three resin chairs');
ok(payload.cart['uFSpLEibsBA8wLmpcaol'] === 2, '28" and 30" highboys merge to one Adelie id');
ok(payload.cart['LGlMH5fIJDLrZciDzPTn'] === 1, 'bistro lights mapped');
ok(!payload.cart[undefined], 'no undefined cart key');
ok(payload.skipped.some(s => s.key === 'banquet-table-8ft' && s.reason === 'unmapped'), '8ft banquet skipped as unmapped');
ok(payload.skipped.some(s => s.key === 'tent-sidewall' && s.reason === 'included'), 'sidewall skipped as included with marquee');

const popupOnly = FPRPlannerCart.buildAdelieCartPayload(
  [{ key: 'popup-tent-10x10' }, { key: 'tent-sidewall' }],
  byKey,
  rentkitMap
);
ok(popupOnly.skipped.some(s => s.key === 'tent-sidewall' && s.reason === 'unmapped'), 'sidewall unmapped when no marquee');

ok(FPRPlannerCart.adelieDateToIso('2026-09-15').startsWith('2026-09-15') ||
   FPRPlannerCart.adelieDateToIso('2026-09-15').startsWith('2026-09-16') ||
   FPRPlannerCart.adelieDateToIso('2026-09-15').startsWith('2026-09-14'),
   'date converts to ISO');
ok(FPRPlannerCart.adelieDateToIso('') === null, 'empty date rejected');
ok(FPRPlannerCart.adelieDateToIso('nope') === null, 'junk date rejected');

const mem = {
  data: {},
  setItem(k, v) { this.data[k] = String(v); },
  getItem(k) { return this.data[k] || null; },
};
const wrote = FPRPlannerCart.writeAdelieCart(payload.cart, '2026-09-15', mem);
ok(wrote.ok, 'writeAdelieCart succeeds');
const parsed = JSON.parse(mem.data.cart);
ok(parsed['gRjUQXUVljE9KwOqHHzL'] === 1, 'stored cart has tent qty');
ok(!!mem.data.startDateTime && mem.data.startDateTime === mem.data.endDateTime, 'start and end dates match');

const empty = FPRPlannerCart.writeAdelieCart({}, '2026-09-15', mem);
ok(!empty.ok && empty.error === 'empty-cart', 'empty cart refused');

if (process.exitCode) process.exit(process.exitCode);
console.log('all cart-bridge tests passed');
