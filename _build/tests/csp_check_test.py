#!/usr/bin/env python3
"""Regression tests for _build/check_csp.py.

    python3 _build/tests/csp_check_test.py

Locks in the behaviour that matters: the Clarity outage of 2026-07-30 must be
detectable, INCLUDING the near-miss where you allowlist the advertised tag
host and forget that it loads its real payload from somewhere else.

Uses in-memory fixtures — never touches site/_headers.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import check_csp as C  # noqa: E402

SELF = {"www.foreverpartyrentals.com", "foreverpartyrentals.com"}

# The real deferred-loader snippet shape: the host only ever appears as a
# string literal that gets concatenated, never as a <script src> attribute.
CLARITY_HTML = """
<script>(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
var loadClarity=function(){t=l.createElement(r);t.async=1;
t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);};
})(window,document,"clarity","script","qu3zf92dem");</script>
"""

BASE = ("default-src 'self'; script-src 'self' 'unsafe-inline' "
        "https://www.googletagmanager.com{extra}; img-src 'self' data: https:; "
        "connect-src 'self' https:")

results: list[tuple[bool, str]] = []


def check(name: str, cond: bool) -> None:
    results.append((cond, name))


# --- source matching semantics ---------------------------------------------
check("exact host matches",
      C.source_allows("https://www.clarity.ms", "www.clarity.ms", SELF))
check("exact host rejects different host",
      not C.source_allows("https://www.clarity.ms", "scripts.clarity.ms", SELF))
check("wildcard matches subdomain",
      C.source_allows("https://*.clarity.ms", "scripts.clarity.ms", SELF))
check("wildcard does not match the bare apex",
      not C.source_allows("https://*.clarity.ms", "clarity.ms", SELF))
check("'self' matches canonical host",
      C.source_allows("'self'", "www.foreverpartyrentals.com", SELF))
check("'self' rejects third party",
      not C.source_allows("'self'", "www.clarity.ms", SELF))
check("scheme-source https: allows anything",
      C.source_allows("https:", "anything.example", SELF))
check("'unsafe-inline' is not a host source",
      not C.source_allows("'unsafe-inline'", "www.clarity.ms", SELF))
check("missing directive falls back to default-src",
      not C.csp_allows(C.parse_csp("default-src 'self'"), "script-src",
                       "www.clarity.ms", SELF))

# --- extraction -------------------------------------------------------------
got = C.extract(CLARITY_HTML)["script-src"]
check("injector-pattern host is extracted from an inline script",
      "www.clarity.ms" in got)
check("runtime chain expands to the payload host",
      "scripts.clarity.ms" in got)

check("ld+json URLs are not treated as script loads",
      C.extract('<script type="application/ld+json">'
                '{"url":"https://schema.org/Thing"}</script>')["script-src"] == set())
check("plain <script src> host is extracted",
      "cdn.jsdelivr.net" in
      C.extract('<script src="https://cdn.jsdelivr.net/x.js"></script>')["script-src"])
check("relative script src yields no host",
      C.extract('<script src="/shared.js?v=30"></script>')["script-src"] == set())
check("inline script without an injector is ignored",
      C.extract('<script>var api="https://api.example.com/v1";</script>'
                )["script-src"] == set())
check("stylesheet link is attributed to style-src",
      "fonts.googleapis.com" in
      C.extract('<link rel="stylesheet" href="https://fonts.googleapis.com/c">'
                )["style-src"])
check("iframe src is attributed to frame-src",
      "www.googletagmanager.com" in
      C.extract('<iframe src="https://www.googletagmanager.com/ns.html">'
                )["frame-src"])


# --- end-to-end: the actual outage and its near-miss ------------------------
def violations(extra: str) -> set[str]:
    csp = C.parse_csp(BASE.format(extra=extra))
    return {h for h in C.extract(CLARITY_HTML)["script-src"]
            if not C.csp_allows(csp, "script-src", h, SELF)}


check("CASE 1 — no clarity.ms at all is caught (the original bug)",
      violations("") == {"www.clarity.ms", "scripts.clarity.ms"})
check("CASE 2 — allowlisting only the tag host still fails on the payload host",
      violations(" https://www.clarity.ms") == {"scripts.clarity.ms"})
check("CASE 3 — tag host + wildcard is clean (the shipped fix)",
      violations(" https://www.clarity.ms https://*.clarity.ms") == set())


# --- _headers parsing -------------------------------------------------------
BLOCKS = C.parse_headers_file(
    "# comment\n/*\n  Content-Security-Policy: default-src 'self'\n"
    "  X-Frame-Options: SAMEORIGIN\n\n/embed\n  Content-Security-Policy: default-src *\n")
check("later specific block overrides the wildcard block",
      C.headers_for(BLOCKS, "/embed")["content-security-policy"] == "default-src *")
check("wildcard block still applies to other paths",
      C.headers_for(BLOCKS, "/foo")["content-security-policy"] == "default-src 'self'")
check("non-overridden headers survive the merge",
      C.headers_for(BLOCKS, "/embed")["x-frame-options"] == "SAMEORIGIN")


failed = [n for ok, n in results if not ok]
for ok, name in results:
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
if failed:
    print(f"\nFAILED — {len(failed)}/{len(results)} assertion(s).")
    sys.exit(1)
print(f"\nSUCCESS — {len(results)} assertion(s) passed.")
