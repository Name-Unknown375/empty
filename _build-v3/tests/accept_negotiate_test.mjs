#!/usr/bin/env node
/**
 * Accept negotiation + HTML→Markdown unit tests.
 *
 *     node _build-v3/tests/accept_negotiate_test.mjs
 *
 * Vectors from https://acceptmarkdown.com/guides/accept-parsing
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HTML_TYPE,
  MARKDOWN_TYPE,
  htmlToMarkdown,
  mergeVary,
  negotiate,
  notAcceptableBody,
  shouldSkipPath,
  siblingMdPath,
} from '../../netlify/lib/accept.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const ok = (name, cond, detail = '') => {
  results.push([!!cond, name, detail]);
};

const VECTORS = [
  ['text/markdown', MARKDOWN_TYPE],
  ['text/markdown, text/html;q=0.8', MARKDOWN_TYPE],
  ['text/html', HTML_TYPE],
  ['text/markdown;q=0, text/html', HTML_TYPE],
  ['text/markdown;q=0', HTML_TYPE], // server produces html+md; markdown rejected → default html
  [null, HTML_TYPE],
  ['*/*', HTML_TYPE],
  ['text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', HTML_TYPE],
  ['application/pdf', null],
  ['text/markdown;q=0', HTML_TYPE],
];

for (const [header, expected] of VECTORS) {
  const got = negotiate(header);
  ok(`negotiate(${JSON.stringify(header)}) → ${expected}`, got === expected, `got ${got}`);
}

ok('406 body lists both types', /text\/html/.test(notAcceptableBody('application/pdf'))
  && /text\/markdown/.test(notAcceptableBody('application/pdf')));
ok('406 body echoes the request', notAcceptableBody('application/pdf').includes('application/pdf'));

ok('mergeVary includes Accept', /accept/i.test(mergeVary(null)));
ok('mergeVary keeps Accept-Encoding', /accept-encoding/i.test(mergeVary('accept-encoding')));
ok('mergeVary does not duplicate', mergeVary('Accept, Accept-Encoding') === 'Accept, Accept-Encoding');

ok('sibling / → /index.md', siblingMdPath('/') === '/index.md');
ok('sibling /tents → /tents.md', siblingMdPath('/tents') === '/tents.md');
ok('sibling /tents.html → /tents.md', siblingMdPath('/tents.html') === '/tents.md');
ok('sibling /blog/foo/ → /blog/foo/index.md', siblingMdPath('/blog/foo/') === '/blog/foo/index.md');

ok('skip /images/hero.webp', shouldSkipPath('/images/hero.webp'));
ok('skip /api/share', shouldSkipPath('/api/share/abc'));
ok('do not skip /', !shouldSkipPath('/'));
ok('do not skip /tents', !shouldSkipPath('/tents'));
ok('do not skip /llms.txt', !shouldSkipPath('/llms.txt'));

const fixture = `<!doctype html><html><body>
<nav>skip me</nav>
<main id="main">
  <h1>Hello tents</h1>
  <p>We rent <a href="/tents">tents</a> and <strong>chairs</strong>.</p>
  <ul><li>One</li><li>Two</li></ul>
</main>
<footer>skip footer</footer>
</body></html>`;
const md = htmlToMarkdown(fixture, 'https://www.foreverpartyrentals.com');
ok('htmlToMarkdown uses main only', md.includes('Hello tents') && !md.includes('skip me') && !md.includes('skip footer'));
ok('htmlToMarkdown heading', /^# Hello tents$/m.test(md));
ok('htmlToMarkdown link is absolute', md.includes('[tents](https://www.foreverpartyrentals.com/tents)'));
ok('htmlToMarkdown strong', md.includes('**chairs**'));
ok('htmlToMarkdown list', /- One/.test(md) && /- Two/.test(md));

const sentinel = `<nav>NAV</nav>
<!-- NAV:END -->
<h1>Tents body</h1>
<p>Only this.</p>
<!-- FOOTER:START -->
<footer>FOOT</footer>`;
const sentMd = htmlToMarkdown(sentinel);
ok('htmlToMarkdown uses NAV:END sentinels', sentMd.includes('Tents body') && !sentMd.includes('NAV') && !sentMd.includes('FOOT'));

const nfHtml = readFileSync(join(ROOT, 'site-v3/404.html'), 'utf8');
const nfMd = readFileSync(join(ROOT, 'site-v3/404.md'), 'utf8');
ok('404.html still pins data-page-class=404', /<body[^>]*data-page-class="404"/.test(nfHtml));
ok('404.html recovery links llms.txt', nfHtml.includes('href="/llms.txt"'));
ok('404.html recovery links sitemap.xml', nfHtml.includes('href="/sitemap.xml"'));
ok('404.md recovery links llms.txt', nfMd.includes('/llms.txt'));
ok('404.md recovery links sitemap.xml', nfMd.includes('/sitemap.xml'));

const failed = results.filter((r) => !r[0]);
for (const [pass, name, detail] of results) {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail && !pass ? ' — ' + detail : ''}`);
}
if (failed.length) {
  console.log(`\nFAILED — ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log(`\nSUCCESS — ${results.length} checks`);
