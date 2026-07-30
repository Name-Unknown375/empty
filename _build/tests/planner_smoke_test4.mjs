import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

// Planner smoke test 4 — magnetic snapping, planning items, tent
// annotations, and share-encoding compatibility (v1/v2 legacy + the
// v2-compatible tent/planning extension). Run: node planner_smoke_test4.mjs
const ROOT = fileURLToPath(new URL('../../site', import.meta.url));
const html = readFileSync(`${ROOT}/event-layout-planner-embed.html`, 'utf8');

const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (c, m) => c ? console.log('ok –', m) : fail(m);
const tick = (ms) => new Promise(r => setTimeout(r, ms));

async function boot(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
  window.fetch = async (u) => {
    const m = String(u).match(/planner\/(catalog|templates|partners|rentkit-map)\.json/);
    if (m) {
      const body = readFileSync(`${ROOT}/planner/${m[1]}.json`, 'utf8');
      return { ok: true, json: async () => JSON.parse(body), text: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  window.SVGElement.prototype.setPointerCapture = () => {};
  window.SVGElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.setPointerCapture = () => {};
  const errors = [];
  window.addEventListener('error', e => errors.push(e.error ? String(e.error.stack || e.error) : e.message));
  window.eval(readFileSync(`${ROOT}/planner/layout-gen.js`, 'utf8'));
  window.eval(readFileSync(`${ROOT}/planner/planner.js`, 'utf8'));
  await tick(300);
  return { window, doc: window.document, errors };
}

const BASE = 'https://www.foreverpartyrentals.com/event-layout-planner-embed.html';
const { window, doc, errors } = await boot(BASE);

// Pointer-event helper — jsdom has no PointerEvent; the handlers only read
// MouseEvent-compatible fields, so a typed MouseEvent works.
const ptr = (el, type, opts = {}) => el.dispatchEvent(new window.MouseEvent(type, {
  bubbles: true, button: 0, clientX: 0, clientY: 0, ...opts,
}));
const svgEl = doc.querySelector('#plSvg');
const itemGroups = () => [...doc.querySelectorAll('#plSvg .pl-item-group')];
const centerOf = (g) => {
  const m = (g.getAttribute('transform') || '').match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
};

// ── 1. Magnetic snap on drag ─────────────────────────────────────────────
// Two banquet tables (Shift-dblclick suppresses auto-chairs), both at the
// venue centre (17,13.75 for a 6×2.5 on a 40×30 venue). Drag table B right
// by ~6.2 ft — 0.2 ft (2.8 px at scale 14) from abutting table A — and the
// magnet should close the gap to exactly 0.
const banquetTile = doc.querySelector('.pl-tile[data-key="banquet-table-6ft"]');
ok(!!banquetTile, 'found 6ft banquet tile');
banquetTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, shiftKey: true }));
banquetTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, shiftKey: true }));
await tick(50);
ok(itemGroups().length === 2, `2 chairless tables placed (got ${itemGroups().length})`);

// scale=14 px/ft in jsdom (0×0 canvas rect leaves the default view).
// 6.2 ft → 86.8 px. Snap threshold 8 px = 0.571 ft.
const tableB = itemGroups()[1];
ptr(tableB, 'pointerdown');
ptr(svgEl, 'pointermove', { clientX: 86.8, clientY: 0 });
const guidesDuring = doc.querySelectorAll('#plSvg .pl-snap-guide').length;
ptr(svgEl, 'pointerup');
await tick(30);
ok(guidesDuring > 0, `alignment guides visible during drag (${guidesDuring})`);
ok(doc.querySelectorAll('#plSvg .pl-snap-guide').length === 0, 'guides cleared on pointerup');
let cB = centerOf(itemGroups().find(g => g !== itemGroups()[0]) || itemGroups()[1]);
// After snap: B.x = A.maxX = 23 → center x = 26. Unsnapped would be 26.2.
const snappedX = itemGroups().map(g => centerOf(g).x).sort((a, b) => a - b)[1];
ok(Math.abs(snappedX - 26) < 1e-6, `table B snapped flush to table A (center x = ${snappedX}, want 26)`);

// ── 2. Snap toggle off → no snap ────────────────────────────────────────
const btnSnap = doc.querySelector('#plBtnSnap');
ok(!!btnSnap, 'snap toggle button present');
ok(btnSnap.classList.contains('pl-btn-active'), 'snap defaults to ON');
btnSnap.click();
await tick(20);
ok(window.localStorage.getItem('fpr-planner-snap-v1') === '0', 'snap-off persisted');
// Drag B further right by 6.2 ft again — no magnet now, so the fractional
// offset must survive.
const bNow = itemGroups().map(g => ({ g, c: centerOf(g) })).sort((a, b) => a.c.x - b.c.x)[1];
ptr(bNow.g, 'pointerdown');
ptr(svgEl, 'pointermove', { clientX: 86.8, clientY: 0 });
ptr(svgEl, 'pointerup');
await tick(30);
const unsnappedX = itemGroups().map(g => centerOf(g).x).sort((a, b) => a - b)[1];
ok(Math.abs(unsnappedX - (26 + 6.2)) < 1e-6, `no snap while disabled (center x = ${unsnappedX}, want 32.2)`);
btnSnap.click();  // back on
await tick(20);

// ── 3. Planning item: placement, resize handles, $0 estimate ────────────
const stageTile = doc.querySelector('.pl-tile[data-key="stage"]');
ok(!!stageTile, 'stage planning tile present');
stageTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
await tick(30);
ok(doc.querySelectorAll('#plSvg .pl-resize-handle').length === 4, 'stage gets 4 resize handles');
ok(!/Stage/.test(doc.querySelector('#plQuoteLines')?.textContent || ''), 'stage absent from cost estimate');

// Heater is a real priced SKU — it must appear in the estimate.
const heaterTile = doc.querySelector('.pl-tile[data-key="tent-heater"]');
ok(!!heaterTile, 'tent-heater tile present');
heaterTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
await tick(30);
ok(/Propane Tent Heater/.test(doc.querySelector('#plQuoteLines')?.textContent || ''), 'heater priced into estimate');

// ── 4. Tent annotations via context menu + share round-trip ─────────────
const tentTile = doc.querySelector('.pl-tile[data-key="marquee-tent-20x20"]');
tentTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
await tick(30);
const tentGroup = itemGroups().find(g => g.querySelector('rect[stroke-dasharray="4 3"]'));
ok(!!tentGroup, 'tent placed (dashed canopy found)');
ok(tentGroup.querySelectorAll('rect[fill="#1E3A2F"]').length === 8, 'free-span 20×20 draws 8 perimeter legs, no centre pole');

const clickMenuItem = async (re) => {
  const btn = [...doc.querySelectorAll('.pl-context-item')].find(b => re.test(b.textContent));
  if (!btn) return false;
  btn.click();
  await tick(30);
  return true;
};
tentGroup.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
await tick(30);
ok(await clickMenuItem(/Top side: open → sidewall/), 'context menu offers sidewall cycle');
tentGroup.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
await tick(30);
ok(await clickMenuItem(/Show stake\/ballast zone/), 'context menu offers stake zone toggle');
ok(!!tentGroup.querySelector('line[stroke-width="2.5"]') ||
   !!doc.querySelector('#plSvg line[stroke-width="2.5"]'), 'sidewall line rendered');
ok(!!doc.querySelector('#plSvg rect[stroke-dasharray="3 4"]'), 'clearance band rendered');

// Share → the encoded payload carries walls + clearance + stage dims.
let copied = null;
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: async (s) => { copied = s; } }, configurable: true,
});
window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
doc.querySelector('#plBtnShare').click();
await tick(200);
ok(copied && /#s=/.test(copied), 'share copied a hash link');
const raw = copied ? decodeURIComponent(copied.split('#s=')[1]) : '';
ok(/~wooo~1/.test(raw), `tent walls+clearance encoded (${raw.slice(0, 80)}…)`);
ok(/stage/.test(raw) && /~12~8/.test(raw), 'stage key + per-item dims encoded');

// ── 5. Round-trip: open the new link in a fresh planner ─────────────────
if (copied) {
  const rt = await boot(BASE + copied.slice(copied.indexOf('#')));
  const rtTent = [...rt.doc.querySelectorAll('#plSvg .pl-item-group')]
    .find(g => g.querySelector('rect[stroke-dasharray="4 3"]'));
  ok(!!rtTent, 'round-trip: tent restored');
  ok(!!rt.doc.querySelector('#plSvg rect[stroke-dasharray="3 4"]'), 'round-trip: clearance band survives');
  ok(!!rt.doc.querySelector('#plSvg line[stroke-width="2.5"]'), 'round-trip: sidewall survives');
  ok(rt.errors.length === 0, 'round-trip boot clean');
}

// ── 6. Legacy links still load ──────────────────────────────────────────
// v1 (raw JSON) — the original share format.
const v1 = encodeURIComponent(JSON.stringify({
  v: [40, 30], n: 'Legacy v1', i: [{ k: 'round-table-5ft', x: 10, y: 10, r: 0 }],
}));
const l1 = await boot(BASE + '#s=' + v1);
ok([...l1.doc.querySelectorAll('#plSvg .pl-item-group')].length === 1, 'legacy v1 link loads (1 table)');
ok(l1.errors.length === 0, 'v1 boot clean');

// v2 pre-extension — exactly what an old planner emitted (no tent slots).
const v2 = encodeURIComponent('2*marquee-tent-20x20.round-table-5ft*40~30*Legacy v2*0~5~5~0_1~12~12~0');
const l2 = await boot(BASE + '#s=' + v2);
ok([...l2.doc.querySelectorAll('#plSvg .pl-item-group')].length === 2, 'legacy v2 link loads (tent + table)');
ok(l2.errors.length === 0, 'v2 boot clean');

ok(errors.length === 0, `no runtime errors ${errors.length ? '\n' + errors.join('\n') : ''}`);
console.log(process.exitCode ? '\nTEST 4 FAILED' : '\nTEST 4 PASSED');
