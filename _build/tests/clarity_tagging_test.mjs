#!/usr/bin/env node
/**
 * Clarity tagging guard — site/shared.js.
 *
 *     node _build/tests/clarity_tagging_test.mjs
 *
 * `classifyPage()` in site/shared.js is a JS PORT of `classify()` in
 * _build/page_class.py. Two implementations of one taxonomy in two languages
 * is a standing drift risk, so this pins them by BEHAVIOUR over every real
 * page rather than by inspection.
 *
 * It also covers the things that would let the feature ship and silently do
 * nothing:
 *   - the tag being computable but never actually set (wiring),
 *   - a payload field leaking into a tag a human reads (privacy),
 *   - a stale `shared.js?v=` on any page, which serves the OLD script from a
 *     1-year immutable cache (site/_headers) with no tags, forever, and which
 *     NONE of the five pre-deploy checks can see — they all glob HTML only.
 *
 * Exit code 0 = clean, 1 = failures.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { render } from '../../netlify/functions/blog-article.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const results = [];
const ok = (name, cond) => results.push([!!cond, name]);

// ── Canonical taxonomy, straight from Python ────────────────────────────────
const expected = JSON.parse(
  execFileSync('python3', [`${ROOT}_build/page_class.py`], { encoding: 'utf8' })
);

// ── Load shared.js into a DOM ───────────────────────────────────────────────
// shared.js is a CLASSIC browser script, not a module. Top-level `function`
// declarations from an eval land on `window`; top-level `const` does not, so
// the tag allowlist is tested through behaviour — which is the right level.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://www.foreverpartyrentals.com/',
  runScripts: 'outside-only',
});
const { window } = dom;
// REQUIRED: jsdom implements no matchMedia, and shared.js calls it at parse
// time. Without this the eval throws and NOTHING is defined.
window.matchMedia = () => ({
  matches: false, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {},
});
let calls = [];
window.clarity = (...args) => { calls.push(args); };
window.eval(readFileSync(`${ROOT}site/shared.js`, 'utf8'));

const has = (pred) => calls.some(pred);

// ── 1. Existence ────────────────────────────────────────────────────────────
ok('classifyPage is defined', typeof window.classifyPage === 'function');
ok('initClarityTags is defined', typeof window.initClarityTags === 'function');
ok('trackEvent is defined', typeof window.trackEvent === 'function');

// ── 2. Anti-vacuity — a parity loop over an empty dump passes trivially ─────
const CLASSES = ['homepage', 'city', 'product-city', 'sku', 'package', 'hub',
                 'christmas', 'blog-post', 'blog-hub', 'other'];
ok(`python dump is populated (${Object.keys(expected).length} pages)`,
   Object.keys(expected).length >= 295);
const seenClasses = new Set(Object.values(expected));
ok('all 10 classes appear in the dump (classifier did not collapse)',
   CLASSES.every(c => seenClasses.has(c)));

// ── 3. Full parity over every real page ─────────────────────────────────────
const mismatches = Object.entries(expected)
  .filter(([p, cls]) => window.classifyPage(p) !== cls)
  .map(([p, cls]) => `${p}  py=${cls}  js=${window.classifyPage(p)}`);
ok(`JS/Python parity over ${Object.keys(expected).length} pages`, mismatches.length === 0);
if (mismatches.length) {
  console.log('\n  mismatches (first 10):');
  mismatches.slice(0, 10).forEach(m => console.log(`    ${m}`));
  console.log('');
}

// ── 4. Hand-written cases: ordering traps + URL forms no file produces ──────
const CASES = [
  ['/',                                  'homepage',     ''],
  ['/blog/',                             'blog-hub',     'trailing slash form'],
  ['/blog',                              'blog-hub',     'no trailing slash'],
  ['/blog/index',                        'blog-hub',     'explicit index'],
  ['/blog/an-outrank-slug-no-file',      'blog-post',    'dynamic article, no static file'],
  ['/birthday-party-rentals',            'city',         '-party-rentals beats HUB_SLUGS'],
  ['/christmas-lights',                  'hub',          'no trailing hyphen'],
  ['/christmas-lights-surrey',           'christmas',    ''],
  ['/product-marquee-tent-20x30',        'sku',          'product- beats tent- prefixes'],
  ['/tent-rentals-surrey',               'product-city', ''],
  ['/tent-size-calculator',              'other',        'near-miss on tent-rental-'],
  ['/wedding-package-50-guests',         'package',      ''],
  ['/p/Ab3xY9Qk',                        'other',        '_redirects 200-rewrite'],
  ['/tent-rentals-surrey/',              'product-city', 'trailing slash'],
  ['/tent-rentals-surrey.html',          'product-city', 'legacy .html'],
  ['/Tent-Rentals-Surrey',               'other',        'case-sensitive host → 404'],
];
for (const [path, want, note] of CASES) {
  ok(`classify ${path} → ${want}${note ? '  (' + note + ')' : ''}`,
     window.classifyPage(path) === want);
}

// ── 5. Wiring — the tag is actually SET, not merely computable ──────────────
calls = [];
window.initClarityTags();
ok('page_class is set on init',
   has(c => c[0] === 'set' && c[1] === 'page_class' && c[2] === 'homepage'));
ok('entry_page_class is set', has(c => c[1] === 'entry_page_class'));
const beforeSecond = calls.length;
window.initClarityTags();
ok('entry_page_class is set ONCE per session (not re-set)',
   calls.slice(beforeSecond).every(c => c[1] !== 'entry_page_class'));

// ── 6. The 404 pin, both halves ─────────────────────────────────────────────
calls = [];
window.document.body.setAttribute('data-page-class', '404');
window.initClarityTags();
ok('data-page-class overrides the pathname',
   has(c => c[1] === 'page_class' && c[2] === '404'));
window.document.body.removeAttribute('data-page-class');
ok('site/404.html actually carries the pin',
   /<body[^>]*data-page-class="404"/.test(readFileSync(`${ROOT}site/404.html`, 'utf8')));

// ── 7. trackEvent mirror, including the allowlist as a privacy property ─────
calls = [];
window.trackEvent({ event: 'quote_form_submit', fulfilment: 'Delivery',
                    rental_type: 'Wedding', guest_bucket: '100_149' });
ok('conversion fires a Clarity event', has(c => c[0] === 'event' && c[1] === 'quote_form_submit'));
ok('conversion tag is set', has(c => c[0] === 'set' && c[1] === 'conversion' && c[2] === 'quote_form_submit'));
ok('allowlisted dimension is tagged, event-prefixed',
   has(c => c[1] === 'quote_form_submit_fulfilment' && c[2] === 'Delivery'));
ok('all three dimensions tagged',
   ['fulfilment', 'rental_type', 'guest_bucket']
     .every(k => has(c => c[1] === 'quote_form_submit_' + k)));

calls = [];
const dlBefore = window.dataLayer.length;
window.trackEvent({ event: 'phone_click', link_location: 'topbar',
                    page_path: '/somewhere', email: 'leak@example.com' });
const dump = JSON.stringify(calls);
ok('fields outside CLARITY_TAG_KEYS are NEVER tagged', !dump.includes('leak@example.com'));
ok('page_path is deliberately not tagged', !dump.includes('page_path'));
ok('link_location IS tagged for phone_click',
   has(c => c[1] === 'phone_click_link_location' && c[2] === 'topbar'));
ok('dataLayer behaviour is unchanged by the mirror', window.dataLayer.length === dlBefore + 1);

// ── 8. Third implementation: the dynamic blog renderer ──────────────────────
const dyn = render({ title: 'T', content_html: '<p>x</p>',
                     created_at: '2026-07-01T00:00:00Z' }, 'some-slug');
ok('dynamic renderer tags page_class', dyn.includes("clarity('set','page_class','blog-post')"));
ok('dynamic renderer tags article_source', dyn.includes("clarity('set','article_source','outrank')"));
ok('...and the classifier agrees with it', window.classifyPage('/blog/some-slug') === 'blog-post');

// ── 9. Cache-bust invariant ─────────────────────────────────────────────────
// A stale ?v= means that page keeps serving the OLD shared.js from a 1-year
// immutable browser cache — silently untagged, forever. Nothing else checks it.
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
  ...walkHtml(`${ROOT}site`),
  // NOT _build/_pilot — dead pilot output, permanently stuck at v=13.
  ...readdirSync(`${ROOT}_build`).filter(f => f.endsWith('template.html')).map(f => `${ROOT}_build/${f}`),
];
for (const f of scanFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/shared\.js\?v=(\d+)/g)) {
    if (!versions.has(m[1])) versions.set(m[1], f.replace(ROOT, ''));
  }
}
ok(`exactly one shared.js version sitewide (found: ${[...versions.keys()].join(', ') || 'none'})`,
   versions.size === 1);
if (versions.size > 1) {
  console.log('\n  version → first file seen:');
  for (const [v, f] of versions) console.log(`    v=${v}  ${f}`);
  console.log('');
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const [pass, name] of results) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}`);
const failed = results.filter(([p]) => !p).length;
if (failed) {
  console.log(`\nFAILED — ${failed}/${results.length} assertion(s).`);
  process.exit(1);
}
console.log(`\nSUCCESS — ${results.length} assertion(s) passed.`);
