// Sanitization tests for the Outrank article renderer (stored-XSS guard).
// Run: node _build/tests/blog_article_sanitize_test.mjs
import { render } from '../../netlify/functions/blog-article.mjs';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const article = (content_html, extra = {}) => ({
  title: 'Test <script>alert(1)</script> Title',
  meta_description: 'desc "quoted" & <tagged>',
  content_html,
  created_at: '2026-07-01T00:00:00Z',
  ...extra,
});

// 1. Script tags in body are removed entirely.
let html = render(article('<p>hi</p><script>alert(document.cookie)</script><p>bye</p>'), 't1');
check('script tag stripped', !/<script>alert/.test(html) && !/document\.cookie/.test(html));
check('legit paragraphs survive', html.includes('<p>hi</p>') && html.includes('<p>bye</p>'));

// 2. Event handlers are removed.
html = render(article('<img src="https://x.example/a.jpg" onerror="alert(1)" alt="a"><p onclick="evil()">t</p>'), 't2');
check('onerror stripped', !/onerror/.test(html));
check('onclick stripped', !/onclick/.test(html));
check('img src kept', html.includes('src="https://x.example/a.jpg"'));

// 3. javascript: and data: URLs are removed.
html = render(article('<a href="javascript:alert(1)">x</a><a href="data:text/html,evil">y</a><a href="https://ok.example/">z</a>'), 't3');
check('javascript: href stripped', !/href="javascript:/.test(html));
check('data: href stripped', !/href="data:/.test(html));
check('https href kept', html.includes('href="https://ok.example/"'));

// 4. iframe/style/form are discarded.
html = render(article('<iframe src="https://evil.example"></iframe><style>*{display:none}</style><form action="/steal"><input name="cc"></form><p>ok</p>'), 't4');
check('iframe stripped', !/<iframe/.test(html));
check('style tag stripped', !/<style/.test(html));
check('form stripped', !/<form|<input/.test(html));

// 5. Title/desc are entity-escaped in head and hero.
html = render(article('<p>x</p>'), 't5');
check('title escaped', !html.includes('<script>alert(1)</script> Title') && html.includes('&lt;script&gt;'));
check('desc escaped', html.includes('desc &quot;quoted&quot; &amp; &lt;tagged&gt;'));

// 6. Leading h1 dropped; later h1 unwrapped to text (h1 not allowlisted).
html = render(article('<h1>Dupe Title</h1><p>body</p><h1>mid h1</h1>'), 't6');
check('leading h1 gone', !html.includes('Dupe Title'));
check('no h1 tags in body output', !/<h1[^>]*>mid h1/.test(html));

// 7. target=_blank links get rel noopener.
html = render(article('<a href="https://x.example" target="_blank">x</a>'), 't7');
check('noopener added on _blank', /rel="noopener noreferrer"/.test(html));

// 8. Markdown fallback stays escaped.
html = render(article('', { content_markdown: 'para one <script>bad</script>\n\npara two' }), 't8');
check('markdown fallback escapes html', html.includes('&lt;script&gt;bad&lt;/script&gt;') && !/<script>bad/.test(html));

// 9. Table + heading structure survives sanitization.
html = render(article('<h2 id="sec">Section</h2><table><tr><th scope="col">A</th></tr><tr><td>1</td></tr></table>'), 't9');
check('h2 with id kept', html.includes('<h2 id="sec">Section</h2>'));
check('table kept', /<table>[\s\S]*<th scope="col">A<\/th>/.test(html));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll sanitization checks passed.');
