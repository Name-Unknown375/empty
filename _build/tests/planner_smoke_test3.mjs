import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Planner smoke test — run with: node smoke_test3.mjs   (needs: npm i -D jsdom)
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('../../site', import.meta.url));
const html = readFileSync(`${ROOT}/event-layout-planner-embed.html`, 'utf8');
const dom = new JSDOM(html, {
  url: 'https://www.foreverpartyrentals.com/event-layout-planner-embed.html',
  runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
window.fetch = async (url) => {
  const m = String(url).match(/planner\/(catalog|templates|partners|rentkit-map)\.json/);
  if (m) {
    const body = readFileSync(`${ROOT}/planner/${m[1]}.json`, 'utf8');
    return { ok: true, json: async () => JSON.parse(body), text: async () => body };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
window.SVGElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.setPointerCapture = () => {};
const errors = [];
window.addEventListener('error', e => errors.push(e.error ? String(e.error.stack || e.error) : e.message));
window.eval(readFileSync(`${ROOT}/planner/layout-gen.js`, 'utf8'));
window.eval(readFileSync(`${ROOT}/planner/planner.js`, 'utf8'));
const tick = (ms) => new Promise(r => setTimeout(r, ms));
await tick(300);
const doc = window.document;
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (c, m) => c ? console.log('ok –', m) : fail(m);

// State access: read the autosave payload (fires 500ms after each commit).
const getState = async () => {
  await tick(700);
  return JSON.parse(window.localStorage.getItem('fpr-planner-state-v2'));
};

// Add 3 tables (shift-dblclick = no chairs → simpler geometry).
const tile = doc.querySelector('.pl-tile[data-key="round-table-5ft"]');
for (let i = 0; i < 3; i++) {
  tile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, shiftKey: true }));
}
await tick(30);
// Scatter them via arrow-nudge equivalent: select-all then move each apart.
// Easier: select all and use keyboard? Each lands at venue center — give them
// distinct positions by nudging selected one at a time isn't trivial here, so
// drag each via pointer events on the SVG.
const svgEl = doc.querySelector('#plSvg');
const itemGroups = () => [...doc.querySelectorAll('#plSvg .pl-item-group')];
// pointer drag helper — planner converts client→world via canvas rect (0,0 in
// jsdom) + pan/scale; with scale 14, pan 0 (fitToVenue no-ops on 0×0 rect,
// then view stays default {scale:14,panX:0,panY:0}? render reads state.view).
const drag = async (target, fromX, fromY, toX, toY) => {
  target.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: fromX, clientY: fromY }));
  svgEl.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: toX, clientY: toY }));
  svgEl.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: toX, clientY: toY }));
  await tick(20);
};
// Move table 2 and 3 to distinct spots (world ft ≈ clientPx/scale … scale=14).
// Dragging lifts items to the top of z-order (DOM reorders), so target by id.
const ids = itemGroups().map(g => g.dataset.id);
const byId = (id) => itemGroups().find(g => g.dataset.id === id);
await drag(byId(ids[1]), 0, 0, 14 * 6, 14 * 3);    // +6ft x, +3ft y
await drag(byId(ids[2]), 0, 0, 14 * 12, 14 * 7);   // +12ft x, +7ft y

let st = await getState();
const xs = st.items.map(i => +i.x.toFixed(2));
const ys = st.items.map(i => +i.y.toFixed(2));
ok(new Set(xs).size === 3, `3 distinct x positions: ${xs}`);

// Select all → right-click → "Align left"
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
await tick(20);
itemGroups()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
await tick(20);
const menuBtns = [...doc.querySelectorAll('.pl-context-item')];
ok(menuBtns.some(b => b.textContent === 'Align left'), 'context menu offers Align left on multi-select');
ok(menuBtns.some(b => b.textContent === 'Distribute vertically'), 'context menu offers distribute (3+ units)');
menuBtns.find(b => b.textContent === 'Align left').click();
st = await getState();
const xs2 = st.items.map(i => +i.x.toFixed(2));
ok(new Set(xs2).size === 1, `align left → all x equal: ${xs2}`);
const ys2 = st.items.map(i => +i.y.toFixed(2));
ok(JSON.stringify(ys2) === JSON.stringify(ys), 'align left leaves y untouched');

// Distribute vertically → equal gaps
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
await tick(20);
itemGroups()[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
await tick(20);
[...doc.querySelectorAll('.pl-context-item')].find(b => b.textContent === 'Distribute vertically').click();
st = await getState();
const sy = st.items.map(i => i.y).sort((a, b) => a - b);
const gap1 = +(sy[1] - sy[0]).toFixed(3), gap2 = +(sy[2] - sy[1]).toFixed(3);
ok(gap1 === gap2, `distribute vertically → equal gaps (${gap1} vs ${gap2})`);

ok(errors.length === 0, `no runtime errors ${errors.length ? '\n' + errors.join('\n') : ''}`);
console.log(process.exitCode ? '\nTEST 3 FAILED' : '\nTEST 3 PASSED');
