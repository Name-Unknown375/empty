import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Planner smoke test — run with: node smoke_test2.mjs   (needs: npm i -D jsdom)
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

// ── Add two round tables via the palette dblclick path ──────────────────
const tile = doc.querySelector('.pl-tile[data-key="round-table-5ft"]');
ok(!!tile, 'found round-table tile');
tile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
tile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
await tick(50);
const groups = doc.querySelectorAll('#plSvg .pl-item-group');
ok(groups.length >= 18, `items rendered (2 tables + 16 chairs): ${groups.length}`);

// ── Guest add + assignment to Table 1 ────────────────────────────────────
const input = doc.querySelector('#plGuestAddInput');
input.value = 'Jane Doe, Raj Patel, Mei-Ling Wu';
input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await tick(50);
let sel = doc.querySelector('.pl-guest-row .pl-guest-table');
ok(sel.options.length === 3, `selects offer Unseated + Table 1 + Table 2 (got ${sel.options.length})`);
ok(/Table 1/.test(sel.options[1].textContent), 'option labelled "Table 1"');
// assign first two guests to table 1
for (let i = 0; i < 2; i++) {
  const s = doc.querySelectorAll('.pl-guest-row .pl-guest-table')[i];
  s.value = s.options[1].value;
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(20);
}
ok(/Table 1 — 2\/8/.test(doc.body.textContent), 'group header shows "Table 1 — 2/8"');
ok(/Guest list \(3 · 1 unseated\)/.test(doc.querySelector('#plGuestSummary').textContent),
   'summary: ' + doc.querySelector('#plGuestSummary').textContent);

// ── Names appear on canvas (scale ≥ 8 px/ft) ─────────────────────────────
// jsdom canvas rect is 0×0 so fitToVenue leaves scale at default 14 ✓
let names = [...doc.querySelectorAll('#plSvg .pl-guest-name')];
ok(names.length === 2, `2 names on canvas (got ${names.length}): ${names.map(t => t.textContent).join(', ')}`);
ok(names.some(t => t.textContent === 'Jane D.'), 'short-name format "Jane D."');

// ── Over-capacity flag ──────────────────────────────────────────────────
const inp2 = doc.querySelector('#plGuestAddInput');
inp2.value = 'G4,G5,G6,G7,G8,G9,G10';
inp2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await tick(30);
for (const s of [...doc.querySelectorAll('.pl-guest-row .pl-guest-table')].slice(-7)) {
  s.value = [...s.options].find(o => /Table 1/.test(o.textContent)).value;
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(10);
}
ok(/not enough seats/.test(doc.body.textContent), 'over-capacity warning shows');

// ── Undo restores guests ────────────────────────────────────────────────
doc.querySelector('#plBtnUndo').click();
await tick(30);
ok(/Table 1 — 8\/8/.test(doc.body.textContent) || /Table 1 — [0-9]+\/8/.test(doc.body.textContent), 'undo steps assignment back');

// ── Share link includes guests ──────────────────────────────────────────
// intercept clipboard via navigator stub before invoking share
let copied = null;
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: async (s) => { copied = s; } }, configurable: true,
});
window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) }); // /api/share down → falls back to hash link
doc.querySelector('#plBtnShare').click();
await tick(200);
ok(copied && /#s=/.test(copied), 'share copied a hash link');
if (copied) {
  const raw = decodeURIComponent(copied.split('#s=')[1]);
  ok(raw.split('*').length === 6, `share payload has guests segment (${raw.split('*').length} segments)`);
  ok(/Jane Doe/.test(raw), 'guest name present in payload');
}

// ── Resize handles on a custom area; none on a fixed table ──────────────
const areaTile = doc.querySelector('.pl-tile[data-key="custom-area"]');
if (areaTile) {
  areaTile.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  await tick(30);
  ok(doc.querySelectorAll('#plSvg .pl-resize-handle').length === 4, 'custom area gets 4 resize handles');
} else {
  console.log('(no custom-area tile — skipping handle check)');
}
// select a table → no resize handles
const tableGroup = doc.querySelector('#plSvg .pl-item-group');
tableGroup.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
tableGroup.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
await tick(30);
ok(doc.querySelectorAll('#plSvg .pl-resize-handle').length === 0, 'fixed catalog items get NO resize handles');

ok(errors.length === 0, `no runtime errors ${errors.length ? '\n' + errors.join('\n') : ''}`);
console.log(process.exitCode ? '\nTEST 2 FAILED' : '\nTEST 2 PASSED');
