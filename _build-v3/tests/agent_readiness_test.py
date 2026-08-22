#!/usr/bin/env python3
"""Agent-readiness guards: 404 recovery, llms.txt when-to-use, Organization JSON-LD, headers.

    python3 _build-v3/tests/agent_readiness_test.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SITE = ROOT / "site-v3"

results: list[tuple[bool, str]] = []


def ok(name: str, cond: bool) -> None:
    results.append((bool(cond), name))


def main() -> int:
    nf_html = (SITE / "404.html").read_text(encoding="utf-8")
    nf_md = (SITE / "404.md").read_text(encoding="utf-8")
    ok("404.html has data-page-class=404", 'data-page-class="404"' in nf_html)
    ok("404.html links /llms.txt", 'href="/llms.txt"' in nf_html)
    ok("404.html links /sitemap.xml", 'href="/sitemap.xml"' in nf_html)
    ok("404.md links /llms.txt", "/llms.txt" in nf_md)
    ok("404.md links /sitemap.xml", "/sitemap.xml" in nf_md)

    llms = (SITE / "llms.txt").read_text(encoding="utf-8")
    ok("llms.txt has When to use heading", re.search(r"^## When to use this\s*$", llms, re.M) is not None)
    ok("llms.txt names a concrete job (quote/book)", re.search(r"quote or book", llms, re.I) is not None)
    ok("llms.txt points at /rentals", "/rentals" in llms)
    ok("llms.txt says how to call (Accept: text/markdown)", "Accept: text/markdown" in llms)
    ok("llms.txt says what not to use this for", "Do not use this site" in llms)

    index = (SITE / "index.html").read_text(encoding="utf-8")
    ok("homepage title includes brand name",
       "<title>Forever Party Rentals |" in index)
    blocks = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', index, re.S | re.I)
    org = None
    for b in blocks:
        obj = json.loads(b)
        if obj.get("@type") == "Organization":
            org = obj
            break
    ok("homepage has Organization JSON-LD", org is not None)
    if org:
        ok("Organization.name", org.get("name") == "Forever Party Rentals")
        ok("Organization.description", bool(str(org.get("description") or "").strip()))
        ok("Organization.url", bool(org.get("url")))
        addr = org.get("address") or {}
        ok("Organization.address is PostalAddress",
           isinstance(addr, dict) and addr.get("@type") == "PostalAddress")
        cp = org.get("contactPoint") or {}
        ok("Organization.contactPoint is ContactPoint",
           isinstance(cp, dict) and cp.get("@type") == "ContactPoint")
        ok("contactPoint.contactType", bool(cp.get("contactType")))
        ok("contactPoint has email or telephone",
           bool(cp.get("email") or cp.get("telephone")))

    headers = (SITE / "_headers").read_text(encoding="utf-8")
    ok("_headers sets llms.txt Content-Type markdown",
       re.search(r"/llms\.txt\n\s+Content-Type:\s*text/markdown", headers) is not None)
    ok("_headers describedby llms.txt on /",
       'Link: </llms.txt>; rel="describedby"; type="text/markdown"' in headers)

    index_md = SITE / "index.md"
    ok("index.md homepage twin exists", index_md.is_file() and "Forever Party Rentals" in index_md.read_text())

    failed = [name for pass_, name in results if not pass_]
    for pass_, name in results:
        print(f"  {'ok  ' if pass_ else 'FAIL'} {name}")
    if failed:
        print(f"\nFAILED — {len(failed)}/{len(results)}")
        return 1
    print(f"\nSUCCESS — {len(results)} checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
