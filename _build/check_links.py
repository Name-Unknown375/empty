#!/usr/bin/env python3
"""
Forever Party Rentals — internal broken-link scanner.

Parses every HTML file under site/ and verifies that each internal `href`/`src`
resolves to an actual file (or a known served route). Ignores external links
(http://, https://), mail/tel/anchor-only links, and JavaScript template
literals (e.g. `${p.slug}.html`).

Exits 0 when clean, 1 on any broken links.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"

HREF_RE = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
JS_TEMPLATE_RE = re.compile(r'\$\{[^}]*\}')

# Skip link targets whose resolution is out of scope:
#  - external schemes
#  - mail/tel
#  - bare anchors (same-page)
#  - data URIs
SKIP_PREFIXES = ("http://", "https://", "mailto:", "tel:", "javascript:", "data:", "#")


def norm_target(href: str, page: Path) -> Path | None:
    """Map an href to a filesystem path under site/, or None if not resolvable.

    Accepts both extension-style URLs (e.g. /foo.html) and the pretty-URL
    convention enforced by netlify.toml's `pretty_urls = true` (e.g. /foo →
    /foo.html). Falls back to appending '.html' when the bare path doesn't
    exist as-is — matching what Netlify serves at request time.
    """
    # Strip query and fragment
    parsed = urlparse(href)
    path = unquote(parsed.path)
    if not path:
        return None

    if path.startswith("/"):
        # Root-relative — resolve against site/
        target = SITE_DIR / path.lstrip("/")
    else:
        # Page-relative
        target = (page.parent / path).resolve()

    # Directory URL → index.html
    if target.is_dir() or path.endswith("/"):
        return target / "index.html"

    # Pretty URL: /foo → site/foo.html (Netlify pretty_urls).
    # Only try the .html fallback when the path has no extension.
    if not target.exists() and not target.suffix:
        with_html = target.with_suffix(".html")
        if with_html.exists():
            return with_html

    return target


def scan_page(page: Path) -> list[tuple[str, str]]:
    """Return [(href, reason), ...] for each broken link on this page."""
    html = page.read_text(encoding="utf-8")
    broken: list[tuple[str, str]] = []
    seen: set[str] = set()

    for href in HREF_RE.findall(html):
        if href in seen:
            continue
        seen.add(href)

        # Skip JS template literals, SKIP_PREFIXES, empty, anchor-only
        if JS_TEMPLATE_RE.search(href):
            continue
        if href.startswith(SKIP_PREFIXES):
            continue
        if not href.strip():
            continue

        target = norm_target(href, page)
        if target is None:
            continue
        if not target.exists():
            try:
                rel = target.relative_to(SITE_DIR)
            except ValueError:
                rel = target
            broken.append((href, f"not found: site/{rel}"))

    return broken


def main() -> int:
    pages = sorted(SITE_DIR.rglob("*.html"))
    print(f"Scanning {len(pages)} HTML file(s)...\n")

    total_broken = 0
    failing_pages = 0
    for page in pages:
        broken = scan_page(page)
        if broken:
            failing_pages += 1
            total_broken += len(broken)
            rel = page.relative_to(SITE_DIR)
            print(f"[FAIL] site/{rel}")
            for href, reason in broken:
                print(f"       → {href}  ({reason})")

    print()
    if total_broken == 0:
        print(f"SUCCESS — {len(pages)} page(s) scanned, 0 broken internal links.")
        return 0
    print(f"FAILED — {total_broken} broken link(s) across {failing_pages} page(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
