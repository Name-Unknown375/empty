#!/usr/bin/env node
/**
 * LeadConnector chat widget guard — site-v3/shared.js.
 *
 *     node _build-v3/tests/leadconnector_chat_test.mjs
 *
 * Pins the skip list (carriers require this widget to be the only SMS
 * opt-in form on the page) and the cache-bust invariant for the v3 track.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const results = [];
const ok = (name, cond) => results.push([!!cond, name]);

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://www.foreverpartyrentals.com/',
  runScripts: 'outside-only',
});
const { window } = dom;
window.matchMedia = () => ({
  matches: false, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {},
});
window.clarity = () => {};
window.eval(readFileSync(`${ROOT}site-v3/shared.js`, 'utf8'));

ok('shouldLoadLeadConnectorChat is defined',
   typeof window.shouldLoadLeadConnectorChat === 'function');

const skip = [
  '/contact', '/contact/', '/contact.html',
  '/checkout', '/checkout/', '/checkout.html',
];
for (const p of skip) {
  ok(`skips ${p}`, window.shouldLoadLeadConnectorChat(p) === false);
}

const load = ['/', '/tents', '/rentals', '/vancouver-party-rentals',
              '/blog', '/thank-you', '/faq', '/pricing'];
for (const p of load) {
  ok(`loads on ${p}`, window.shouldLoadLeadConnectorChat(p) === true);
}

const src = readFileSync(`${ROOT}site-v3/shared.js`, 'utf8');
ok('loader URL is a script.src literal (CSP scanner can see it)',
   /createElement\s*\(\s*['"]script['"]\s*\)[\s\S]{0,400}\.src\s*=\s*['"]https:\/\/widgets\.leadconnectorhq\.com\/loader\.js['"]/.test(src));
ok('widget id is the one from the embed snippet',
   src.includes('6a8cb72d0916f9883876b386'));

function walkHtml(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = `${dir}/${e}`;
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (e.endsWith('.html')) out.push(full);
  }
  return out;
}
const versions = new Map();
const scanFiles = [
  ...walkHtml(`${ROOT}site-v3`),
  ...readdirSync(`${ROOT}_build-v3`).filter(f => f.endsWith('template.html'))
    .map(f => `${ROOT}_build-v3/${f}`),
];
for (const f of scanFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/shared\.js\?v=(\d+)/g)) {
    if (!versions.has(m[1])) versions.set(m[1], f.replace(ROOT, ''));
  }
}
ok(`exactly one shared.js version on the v3 track (found: ${[...versions.keys()].join(', ') || 'none'})`,
   versions.size === 1);

const cssVersions = new Map();
for (const f of scanFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/shared\.css\?v=(\d+)/g)) {
    if (!cssVersions.has(m[1])) cssVersions.set(m[1], f.replace(ROOT, ''));
  }
}
ok(`exactly one shared.css version on the v3 track (found: ${[...cssVersions.keys()].join(', ') || 'none'})`,
   cssVersions.size === 1);

for (const [pass, name] of results) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}`);
const failed = results.filter(([p]) => !p).length;
if (failed) {
  console.log(`\nFAILED — ${failed}/${results.length} assertion(s).`);
  process.exit(1);
}
console.log(`\nSUCCESS — ${results.length} assertion(s) passed.`);
