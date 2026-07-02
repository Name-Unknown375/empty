import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Planner smoke test — run with: node smoke_test.mjs   (needs: npm i -D jsdom)
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('../../site', import.meta.url));
const html = readFileSync(`${ROOT}/event-layout-planner-embed.html`, 'utf8');

const dom = new JSDOM(html, {
  url: 'https://www.foreverpartyrentals.com/event-layout-planner-embed.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

// ── Stubs jsdom lacks ────────────────────────────────────────────────────
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
window.SVGElement.prototype.releasePointerCapture = () => {};
window.HTMLElement.prototype.setPointerCapture = () => {};

const errors = [];
window.addEventListener('error', e => errors.push(e.error || e.message));

// ── Boot: layout-gen then planner, like the script tags would ───────────
window.eval(readFileSync(`${ROOT}/planner/layout-gen.js`, 'utf8'));
window.eval(readFileSync(`${ROOT}/planner/planner.js`, 'utf8'));

const tick = (ms) => new Promise(r => setTimeout(r, ms));
await tick(300);  // let async init (fetch catalog/templates) settle

const doc = window.document;
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (cond, msg) => cond ? console.log('ok –', msg) : fail(msg);

ok(errors.length === 0, `boot without errors ${errors.length ? JSON.stringify(errors.map(String)) : ''}`);
ok(doc.querySelectorAll('#plPaletteGroups .pl-tile, #plPaletteGroups [draggable]').length > 0 || doc.querySelector('#plPaletteGroups').children.length > 0, 'palette rendered');

// Guest panel boots empty
const input = doc.querySelector('#plGuestAddInput');
ok(!!input, 'guest add input present');
ok(/Guest list/.test(doc.querySelector('#plGuestSummary').textContent), 'summary reads "Guest list"');

// Add two guests via Enter
input.value = 'Jane Doe, Raj Patel';
input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await tick(50);
ok(doc.querySelectorAll('.pl-guest-row').length === 2, 'two guest rows after comma-add');
ok(/Guest list \(2/.test(doc.querySelector('#plGuestSummary').textContent), 'summary count updated: ' + doc.querySelector('#plGuestSummary').textContent);

// Add a third via button path
const inp2 = doc.querySelector('#plGuestAddInput');
inp2.value = 'Mei-Ling Wu';
doc.querySelector('#plGuestAddBtn').click();
await tick(50);
ok(doc.querySelectorAll('.pl-guest-row').length === 3, 'three guest rows after button add');

// Remove one
doc.querySelector('.pl-guest-row .pl-guest-del').click();
await tick(50);
ok(doc.querySelectorAll('.pl-guest-row').length === 2, 'row removed via ×');

// Show-names toggle present and persists pref
const toggle = doc.querySelector('#plGuestShowNames');
ok(!!toggle && toggle.checked, 'show-names toggle present + default on');
toggle.checked = false;
toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick(50);
ok(window.localStorage.getItem('fpr-planner-guest-names') === '0', 'pref persisted to localStorage');

// Autosave round-trips guests (debounced 500ms after the commit)
await tick(700);
const saved = JSON.parse(window.localStorage.getItem('fpr-planner-state-v2'));
ok(Array.isArray(saved.guests) && saved.guests.length === 2, 'autosave payload includes guests');
ok(saved.guests.every(g => g.name && 'tableId' in g), 'guest shape { name, tableId } intact');

// Table select options: no tables yet → only "Unseated"
const sel = doc.querySelector('.pl-guest-table');
ok(sel && sel.options.length === 1 && /Unseated/.test(sel.options[0].textContent), 'select shows only Unseated with no tables');

console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
