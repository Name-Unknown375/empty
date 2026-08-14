#!/usr/bin/env python3
"""
Forever Party Rentals — explicit .html → extensionless 301 generator.

Why this exists: netlify.toml sets `pretty_urls = true`, but live checks
(June 10, 2026) showed `/surrey-party-rentals.html` returning 200 instead of
redirecting — and the GSC export had 139 `.html` variants collecting
impressions, splitting equity with the clean canonicals. This script makes
the consolidation explicit: one `301!` rule per published page.

Behaviour:
  * Scans site/*.html and site/blog/*.html.
  * Excludes 404.html and checkout.html, plus any path that already has a
    `200!` force-rewrite earlier in _redirects (first match wins on Netlify,
    but we keep the generated block conflict-free anyway).
  * index.html → / and blog/index.html → /blog/ (special-cased).
  * Writes the rules into site/_redirects between BEGIN/END markers,
    AFTER all hand-maintained rules. Re-runs replace the marked block
    in place — fully idempotent.

Usage:
    python3 generate_redirects.py            # rewrites site/_redirects
    python3 generate_redirects.py --dry-run  # print the block, change nothing
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site-v3"
REDIRECTS_FILE = SITE_DIR / "_redirects"

BEGIN_MARKER = "# ── BEGIN GENERATED: html → extensionless 301s (generate_redirects.py — do not edit by hand) ──"
END_MARKER = "# ── END GENERATED: html → extensionless 301s ──"

# Pages that must never redirect away from their .html form (or that we
# don't want in the redirect map at all).
EXCLUDED_FILES = {
    "404.html",       # error page — Netlify needs to serve it as-is
    "checkout.html",  # transactional surface; embed scripts reference it
}


def forced_200_paths(existing: str) -> set[str]:
    """Paths already pinned with a 200! force-rewrite in the hand-maintained
    part of _redirects — never emit a 301 for these."""
    pinned = set()
    for line in existing.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if len(parts) >= 3 and parts[2] in {"200!", "200"} and "*" not in parts[0]:
            pinned.add(parts[0])
    return pinned


def collect_rules(pinned: set[str]) -> list[tuple[str, str]]:
    rules: list[tuple[str, str]] = []

    def add(html_rel: str, url_prefix: str = "") -> None:
        name = Path(html_rel).name
        if name in EXCLUDED_FILES:
            return
        src = f"{url_prefix}/{name}"
        if src in pinned:
            return
        if name == "index.html":
            dst = f"{url_prefix}/" if url_prefix else "/"
        else:
            dst = f"{url_prefix}/{name[:-5]}"
        rules.append((src, dst))

    for f in sorted(SITE_DIR.glob("*.html")):
        add(f.name)
    for f in sorted((SITE_DIR / "blog").glob("*.html")):
        # Skip build-internal blog template if present.
        if f.name.startswith("_"):
            continue
        add(f.name, url_prefix="/blog")
    return rules


def build_block(rules: list[tuple[str, str]]) -> str:
    width = max(len(src) for src, _ in rules) + 2
    lines = [BEGIN_MARKER]
    lines.append("# pretty_urls was observed NOT redirecting .html variants in production;")
    lines.append("# these explicit 301s consolidate /foo.html signals onto /foo.")
    for src, dst in rules:
        lines.append(f"{src.ljust(width)}{dst}  301!")
    lines.append(END_MARKER)
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    existing = REDIRECTS_FILE.read_text(encoding="utf-8")

    # Strip any previous generated block (idempotent re-run).
    pattern = re.compile(
        re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER) + r"\n?",
        flags=re.DOTALL,
    )
    base = pattern.sub("", existing).rstrip("\n")

    pinned = forced_200_paths(base)
    rules = collect_rules(pinned)
    block = build_block(rules)
    out = base + "\n\n" + block + "\n"

    if args.dry_run:
        print(block)
        print(f"\n({len(rules)} rules — dry run, {REDIRECTS_FILE} unchanged)", file=sys.stderr)
        return 0

    REDIRECTS_FILE.write_text(out, encoding="utf-8")
    print(f"wrote {REDIRECTS_FILE} — {len(rules)} generated 301 rules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
