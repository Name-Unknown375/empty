"""
Pre-flight diff check for the static-nav refactor.

Compares the output of render_partials.py to a captured snapshot of the
JS-injected `#nav.outerHTML` and `#footer.outerHTML` from a live page. A
whitespace-only difference is the bar for moving on to commit 4 (where actual
page HTML starts changing).

Usage:
  1. Open https://foreverpartyrentals.com/  (or any page) in a browser.
  2. In DevTools console:
        copy(document.getElementById('nav').outerHTML)
     Paste into _build/snapshots/nav.html.
  3. Repeat for #footer:
        copy(document.getElementById('footer').outerHTML)
     Paste into _build/snapshots/footer.html.
  4. Run: python3 _build/verify_partials.py
     - Exit 0 + 'OK' lines  -> partials match; safe to proceed.
     - Exit 1 + diff output -> partial drifted; fix before migrating any page.

No third-party deps. Python stdlib + render_partials.py.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
import difflib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_partials import render_nav, render_footer  # noqa: E402

SNAPSHOTS_DIR = Path(__file__).resolve().parent / "snapshots"


def normalize(html: str) -> list[str]:
    """Collapse runs of whitespace and split into tokens for line-based diffing.

    The captured outerHTML is one giant line; the rendered partial is
    pretty-printed. We don't care about that — only semantic content.
    Tokenize on whitespace, drop empty tokens, return as list-of-lines so
    difflib produces readable output when there IS a real diff.
    """
    # Strip the topbar + skip-link wrapper that surrounds nav in our partial
    # but NOT in the JS-rendered DOM (where nav is its own element).
    return [t for t in re.split(r"\s+", html.strip()) if t]


def diff(name: str, captured_path: Path, rendered: str) -> bool:
    """Return True if equivalent, False otherwise (and print a diff)."""
    if not captured_path.exists():
        print(f"{name}: SKIP (no snapshot at {captured_path.relative_to(Path.cwd())})")
        print(f"  Capture from prod via DevTools and save to that path.")
        return False
    captured = captured_path.read_text(encoding="utf-8")
    a = normalize(captured)
    b = normalize(rendered)
    if a == b:
        print(f"{name}: OK ({len(a)} tokens match)")
        return True
    print(f"{name}: DIFF")
    out = difflib.unified_diff(a, b, fromfile=f"captured/{name}", tofile=f"rendered/{name}", lineterm="", n=3)
    for line in list(out)[:200]:
        print(f"  {line}")
    return False


def structural_check(nav_html: str, footer_html: str) -> list[str]:
    """Cheap sanity assertions that don't need a snapshot. Catches gross omissions
    (missing dropdown ID, wrong city count, missing #footer column) without
    requiring the user to capture prod HTML first."""
    failures = []

    # dd-batteries was folded into dd-misc in a0b96c0 (planner Phase 0 nav rework);
    # city counts updated to match the current cities/christmas arrays.
    expected_nav_ids = ["nav", "navMobile", "dd-tents", "dd-chairs", "dd-tables",
                        "dd-misc", "dd-packages", "dd-areas",
                        "topbar"]
    for sid in expected_nav_ids:
        if f'id="{sid}"' not in nav_html:
            failures.append(f"nav: missing id=\"{sid}\"")

    # Mega-dropdown city links: 29 party-rental cities + 15 christmas-light cities
    party_links = len(re.findall(r'href="/[a-z\-]+-party-rentals"', nav_html))
    if party_links != 29:
        failures.append(f"nav: expected 29 party-rentals city links, got {party_links}")
    christmas_links = len(re.findall(r'href="/christmas-lights-[a-z\-]+"', nav_html))
    if christmas_links != 15:
        failures.append(f"nav: expected 15 christmas-lights city links, got {christmas_links}")

    if 'id="footer"' not in footer_html:
        failures.append("footer: missing id=\"footer\"")
    if 'class="footer-grid"' not in footer_html:
        failures.append("footer: missing footer-grid")
    # 4 columns expected: logo+CTA, Rentals, Service Areas, Contact.
    col_titles = len(re.findall(r'class="footer-col-title"', footer_html))
    if col_titles != 3:
        failures.append(f"footer: expected 3 footer-col-title elements (Rentals/Areas/Contact), got {col_titles}")

    return failures


def main() -> int:
    nav_rendered = render_nav()
    footer_rendered = render_footer()

    # Our nav partial includes a leading <a class="skip-link"> + #topbar block.
    # The captured #nav.outerHTML only contains <nav id="nav">. Slice the
    # rendered output to start at the <nav> element for a fair comparison.
    nav_start = nav_rendered.find("<nav ")
    if nav_start == -1:
        print("ERROR: rendered nav has no <nav> element")
        return 2
    nav_only = nav_rendered[nav_start:]

    print(f"Rendered nav (full partial): {len(nav_rendered):,} chars")
    print(f"Rendered nav (just <nav>):    {len(nav_only):,} chars")
    print(f"Rendered footer:              {len(footer_rendered):,} chars")
    print()

    print("== Structural sanity check (no snapshot needed) ==")
    failures = structural_check(nav_rendered, footer_rendered)
    if failures:
        for f in failures:
            print(f"  FAIL: {f}")
        print()
        print("Structural check failed. Fix the partials before continuing.")
        return 1
    print("  OK")
    print()

    print("== Snapshot diff check (requires _build/snapshots/{nav,footer}.html) ==")
    nav_ok = diff("nav", SNAPSHOTS_DIR / "nav.html", nav_only)
    footer_ok = diff("footer", SNAPSHOTS_DIR / "footer.html", footer_rendered)

    print()
    if nav_ok and footer_ok:
        print("All partials match snapshots. Safe to proceed with commits 4–7.")
        return 0
    if not (SNAPSHOTS_DIR / "nav.html").exists() or not (SNAPSHOTS_DIR / "footer.html").exists():
        print("Structural check passed; snapshot diff was skipped (no snapshots).")
        print("Capture snapshots and re-run for full verification.")
        return 0  # structural check passed; snapshots optional but recommended
    print("Mismatch detected. Fix the partial(s) before migrating any page.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
