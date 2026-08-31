#!/usr/bin/env python3
"""CSP-vs-tag consistency guard.

    python3 _build/check_csp.py

Every external resource the site loads must be permitted by the
Content-Security-Policy served for that path in `site/_headers`. When it
isn't, the browser refuses the request and the feature dies SILENTLY — the
markup is present on every page, greps come back clean, and nothing in the
other four pre-deploy checks notices.

That is not hypothetical. Microsoft Clarity shipped sitewide in 196d1d6 with
a correct snippet in the <head> of all 300 pages, but `script-src` never
listed clarity.ms. Every browser refused the injected tag, the inline stub
queued calls that never drained, and Clarity recorded ZERO sessions until the
CSP was fixed in 942c079. This check exists so the next tag fails loudly here
instead of quietly in production.

What it does
------------
1. Parses `site/_headers` into path-pattern → header blocks (later matching
   block wins for a repeated header name, which is how the file is authored).
2. Parses each Content-Security-Policy into directives → source lists.
3. Extracts the external hosts each page actually loads, per resource type:
     script-src  <script src>, plus https:// literals inside inline scripts
                 that build a <script> element (the GTM/Pixel/Clarity
                 deferred-loader shape), plus `.src = 'https://…'` assignments
                 after `createElement('script')` in site-v3/shared.js (the
                 LeadConnector chat widget is injected there, not in HTML)
     style-src   <link rel=stylesheet>, @import url() in inline <style>
     font-src    <link rel=preload as=font>
     frame-src   <iframe src>
4. Matches each host against the applicable directive using real CSP source
   semantics ('self', scheme-source `https:`, `*`, host wildcards, exact
   hosts) with default-src fallback.
5. Applies RUNTIME_CHAINS — hosts that load *further* hosts at runtime, which
   no static scan can see. See that table's comment; it is the difference
   between catching the Clarity bug and only half-catching it.

Sources scanned: every page under site-v3/, every _build-v3/*template.html
(so a template regression fails before pages are regenerated),
site-v3/shared.js (runtime script injectors), and
netlify/functions/blog-article.mjs (dynamic /blog/* HTML that never exists on
disk).

Known limits: url() references *inside* external stylesheets are not
traversed, and a host reached only through a runtime chain we have not
recorded in RUNTIME_CHAINS is invisible. Both are documented rather than
silently pretended away.

Exit code 0 = clean, 1 = violations (one line each).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SITE_DIR = ROOT / "site-v3"
HEADERS_FILE = SITE_DIR / "_headers"

# ---------------------------------------------------------------------------
# Runtime chains: host → hosts it pulls in that a static scan cannot see.
#
# Add an entry whenever you discover a tag whose advertised URL is only a
# loader. Verify with:  curl -s <loader-url> | grep -oE 'https://[a-z.]+'
#
#   www.clarity.ms — /tag/<id> is a 707-byte shim; the real 74KB payload comes
#   from scripts.clarity.ms. Allowlisting only www.clarity.ms fetches the shim
#   and then dies one hop later, which looks identical to the original bug.
#   (Verified 2026-07-30 against tag qu3zf92dem.)
#
#   widgets.leadconnectorhq.com — loader.js injects chat-widget.js /
#   chat-widget.esm.js from the same host, then fetches config from
#   services.leadconnectorhq.com (connect-src, already covered by https:).
#   No extra script host. (Verified 2026-08-24 against loader.js.)
# ---------------------------------------------------------------------------
RUNTIME_CHAINS: dict[str, tuple[str, ...]] = {
    "www.clarity.ms": ("scripts.clarity.ms",),
}

# Inline <script> types that are data, not code — never a source of loads.
NON_JS_SCRIPT_TYPES = ("application/ld+json", "application/json", "text/template")

TAG_SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.I | re.S)
TAG_LINK_RE = re.compile(r"<link\b([^>]*?)/?>", re.I)
TAG_IFRAME_RE = re.compile(r"<iframe\b([^>]*?)>", re.I)
TAG_STYLE_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.I | re.S)
ATTR_RE = re.compile(r"""([a-zA-Z-]+)\s*=\s*["']([^"']*)["']""")
URL_RE = re.compile(r"https?://([A-Za-z0-9.-]+)")
IMPORT_RE = re.compile(r"@import\s+url\(\s*['\"]?(https?://[^)'\"]+)", re.I)

# An inline script counts as a script *injector* when it builds an element and
# names "script" as the tag — the shape every deferred analytics loader uses.
INJECTOR_RE = re.compile(r"createElement\s*\(")
SCRIPT_LITERAL_RE = re.compile(r"""['"]script['"]""", re.I)


def attrs(blob: str) -> dict[str, str]:
    return {k.lower(): v for k, v in ATTR_RE.findall(blob)}


def host_of(url: str) -> str | None:
    """Host for an absolute http(s) URL; None for relative/data/mailto URLs."""
    if not url.lower().startswith(("http://", "https://")):
        return None
    return (urlparse(url).hostname or "").lower() or None


# ---------------------------------------------------------------------------
# _headers parsing
# ---------------------------------------------------------------------------

def parse_headers_file(text: str) -> list[tuple[str, dict[str, str]]]:
    """[(path_pattern, {header_name_lower: value}), …] in file order."""
    blocks: list[tuple[str, dict[str, str]]] = []
    current: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            current = line.strip()
            blocks.append((current, {}))
        elif blocks and ":" in line:
            name, _, value = line.strip().partition(":")
            blocks[-1][1][name.strip().lower()] = value.strip()
    return blocks


def pattern_matches(pattern: str, path: str) -> bool:
    regex = "^" + ".*".join(re.escape(p) for p in pattern.split("*")) + "$"
    return re.match(regex, path) is not None


def headers_for(blocks, path: str) -> dict[str, str]:
    """Merge every matching block; later matches win per header name.

    Netlify resolves duplicate header names by path specificity. This file
    places its one specific override (/event-layout-planner-embed) after the
    /* block, so file order and specificity agree.
    """
    merged: dict[str, str] = {}
    for pattern, hdrs in blocks:
        if pattern_matches(pattern, path):
            merged.update(hdrs)
    return merged


def parse_csp(value: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for part in value.split(";"):
        tokens = part.split()
        if tokens:
            out[tokens[0].lower()] = tokens[1:]
    return out


# ---------------------------------------------------------------------------
# CSP source matching
# ---------------------------------------------------------------------------

def source_allows(source: str, host: str, self_hosts: set[str]) -> bool:
    source = source.strip()
    if source in ("*", "https:", "http:"):
        return True
    if source in ("'self'",):
        return host in self_hosts
    if source.startswith("'"):  # 'unsafe-inline', 'none', nonces, hashes
        return False
    src_host = source.split("://", 1)[1] if "://" in source else source
    src_host = src_host.split("/", 1)[0].split(":", 1)[0].lower()
    if src_host.startswith("*."):
        suffix = src_host[1:]  # ".clarity.ms"
        return host.endswith(suffix) and len(host) > len(suffix)
    return host == src_host


def csp_allows(csp: dict[str, list[str]], directive: str, host: str,
               self_hosts: set[str]) -> bool:
    sources = csp.get(directive)
    if sources is None:
        sources = csp.get("default-src")
    if sources is None:
        return True  # nothing constrains this resource type
    return any(source_allows(s, host, self_hosts) for s in sources)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract(html: str) -> dict[str, set[str]]:
    """{directive: {host, …}} for every external load the markup performs."""
    found: dict[str, set[str]] = {
        "script-src": set(), "style-src": set(),
        "font-src": set(), "frame-src": set(),
    }

    for attr_blob, body in TAG_SCRIPT_RE.findall(html):
        a = attrs(attr_blob)
        if (a.get("type") or "").lower() in NON_JS_SCRIPT_TYPES:
            continue
        if a.get("src"):
            if (h := host_of(a["src"])):
                found["script-src"].add(h)
            continue
        if INJECTOR_RE.search(body) and SCRIPT_LITERAL_RE.search(body):
            found["script-src"].update(m.lower() for m in URL_RE.findall(body))

    for attr_blob in TAG_LINK_RE.findall(html):
        a = attrs(attr_blob)
        rel = (a.get("rel") or "").lower()
        h = host_of(a.get("href", ""))
        if not h:
            continue
        if "stylesheet" in rel:
            found["style-src"].add(h)
        elif "preload" in rel:
            as_ = (a.get("as") or "").lower()
            if as_ == "font":
                found["font-src"].add(h)
            elif as_ == "style":
                found["style-src"].add(h)
            elif as_ == "script":
                found["script-src"].add(h)

    for attr_blob in TAG_IFRAME_RE.findall(html):
        if (h := host_of(attrs(attr_blob).get("src", ""))):
            found["frame-src"].add(h)

    for body in TAG_STYLE_RE.findall(html):
        for url in IMPORT_RE.findall(body):
            if (h := host_of(url)):
                found["style-src"].add(h)

    # Expand runtime chains: a host that only loads another host.
    for directive, hosts in found.items():
        for host in list(hosts):
            hosts.update(RUNTIME_CHAINS.get(host, ()))

    return found


CREATE_SCRIPT_RE = re.compile(r"createElement\s*\(\s*['\"]script['\"]\s*\)", re.I)
SRC_ASSIGN_RE = re.compile(r"""\.src\s*=\s*['\"](https://[^'\"]+)['\"]""")


def extract_script_src_assigns(js: str) -> set[str]:
    """Hosts assigned to a created <script>.src in classic JS (shared.js).

    Narrower than treating the whole file as an inline injector: share-button
    URLs (facebook.com, twitter.com) live in the same file and are not scripts.
    Only the window after createElement('script') is scanned.
    """
    hosts: set[str] = set()
    for m in CREATE_SCRIPT_RE.finditer(js):
        window = js[m.end(): m.end() + 800]
        for url in SRC_ASSIGN_RE.findall(window):
            if (h := host_of(url)):
                hosts.add(h)
    return hosts


def url_path_for(page: Path) -> str:
    """site/foo.html → /foo   (pretty_urls=true);   site/index.html → /"""
    rel = page.relative_to(SITE_DIR).as_posix()
    if rel == "index.html":
        return "/"
    return "/" + (rel[:-5] if rel.endswith(".html") else rel)


def main() -> int:
    if not HEADERS_FILE.exists():
        print(f"FAILED — {HEADERS_FILE} not found.")
        return 1

    blocks = parse_headers_file(HEADERS_FILE.read_text(encoding="utf-8"))

    constants = json.loads((HERE / "site_constants.json").read_text(encoding="utf-8"))
    canonical = (urlparse(constants["siteUrl"]).hostname or "").lower()
    self_hosts = {canonical, canonical.removeprefix("www."), "localhost", "127.0.0.1"}

    # (label, url_path_used_for_CSP_lookup, html_text)
    targets: list[tuple[str, str, str]] = []
    for page in sorted(SITE_DIR.rglob("*.html")):
        targets.append((f"site-v3/{page.relative_to(SITE_DIR).as_posix()}",
                        url_path_for(page), page.read_text(encoding="utf-8", errors="replace")))
    for tpl in sorted(HERE.glob("*template.html")):
        targets.append((f"_build-v3/{tpl.name}", "/__generated__",
                        tpl.read_text(encoding="utf-8", errors="replace")))
    fn = ROOT / "netlify" / "functions" / "blog-article.mjs"
    if fn.exists():
        targets.append(("netlify/functions/blog-article.mjs", "/blog/__dynamic__",
                        fn.read_text(encoding="utf-8", errors="replace")))
    shared_js = SITE_DIR / "shared.js"
    if shared_js.exists():
        hosts = extract_script_src_assigns(
            shared_js.read_text(encoding="utf-8", errors="replace"))
        synthetic = "".join(
            f'<script src="https://{h}/loader.js"></script>' for h in sorted(hosts))
        targets.append(("site-v3/shared.js", "/", synthetic))

    # A blocked host is almost always blocked on all 300 pages at once, so
    # group by (host, directive) and report each violation ONCE with an
    # example page and a count — otherwise one missing tag prints 600 lines.
    violations: dict[tuple[str, str], dict] = {}
    checked_hosts = 0
    for label, path, html in targets:
        csp_raw = headers_for(blocks, path).get("content-security-policy")
        if not csp_raw:
            continue
        csp = parse_csp(csp_raw)
        for directive, hosts in extract(html).items():
            for host in sorted(hosts):
                checked_hosts += 1
                if csp_allows(csp, directive, host, self_hosts):
                    continue
                v = violations.setdefault(
                    (host, directive),
                    {"example": label, "count": 0,
                     "allowed": " ".join(csp.get(directive)
                                         or csp.get("default-src") or [])})
                v["count"] += 1

    if violations:
        for (host, directive), v in sorted(violations.items()):
            chained = [h for h, kids in RUNTIME_CHAINS.items() if host in kids]
            via = f"  [loaded at runtime by {', '.join(chained)}]" if chained else ""
            print(f"  FAIL  {host} blocked by {directive} on {v['count']} source(s), "
                  f"e.g. {v['example']}{via}")
            print(f"        {directive} currently allows: {v['allowed'] or '(nothing)'}")
        print(f"\nFAILED — {len(violations)} CSP violation(s). Add each host to the "
              f"matching directive in site/_headers.")
        return 1

    print(f"SUCCESS — {len(targets)} source(s) scanned, {checked_hosts} external "
          f"host reference(s) all permitted by CSP.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
