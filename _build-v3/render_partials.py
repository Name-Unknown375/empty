"""
Forever Party Rentals — nav/footer partial renderer.

Single source of truth for the nav and footer markup that gets baked into every
page at build time. Generators import render_nav() / render_footer() and pass
the strings into Jinja templates as `nav_html` / `footer_html`. The CLI
companion (apply_partials.py) calls the same functions when injecting into
hand-authored pages.

Reads:
  _build/site_constants.json      — brand constants (phone/email/hours/...)
  _build/city_data.json           — cities + navOrder + christmasServiceLevel
  _build/products.json            — Surrey tent plural override
  _build/partials/nav.html.j2     — nav template
  _build/partials/footer.html.j2  — footer template

No Netlify or third-party dependencies. Python 3.8+ + Jinja2 (already a project dep).
"""
from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).resolve().parent
PARTIALS_DIR = HERE / "partials"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
CITY_DATA_FILE = HERE / "city_data.json"


def _load_data() -> tuple[dict, dict]:
    with open(SITE_CONSTANTS_FILE, encoding="utf-8") as f:
        fpr = json.load(f)
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    return fpr, city_data


def _build_nav_context(fpr: dict, city_data: dict) -> dict:
    """Resolve cities and christmas_cities lists for the nav template."""
    nav_order: list[str] = city_data["navOrder"]
    cities_dict: dict = city_data["cities"]

    # Sanity: every navOrder slug exists in cities (loud failure beats silent drift).
    missing = [s for s in nav_order if s not in cities_dict]
    if missing:
        raise SystemExit(f"navOrder references unknown city slugs: {missing}")

    cities = [
        {"slug": slug, "name": cities_dict[slug]["name"]}
        for slug in nav_order
    ]
    christmas_cities = [
        {"slug": slug, "name": cities_dict[slug]["name"]}
        for slug in nav_order
        if cities_dict[slug].get("christmasServiceLevel") == "full"
    ]

    return {
        "fpr": fpr,
        "cities": cities,
        "christmas_cities": christmas_cities,
    }


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(PARTIALS_DIR)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=False,
        lstrip_blocks=False,
        keep_trailing_newline=False,
    )


def render_nav() -> str:
    fpr, city_data = _load_data()
    ctx = _build_nav_context(fpr, city_data)
    return _env().get_template("nav.html.j2").render(**ctx).strip()


def render_footer() -> str:
    fpr, _ = _load_data()
    return _env().get_template("footer.html.j2").render(fpr=fpr).strip()


if __name__ == "__main__":
    # Handy for spot-checking from the CLI: `python3 _build/render_partials.py`
    nav = render_nav()
    footer = render_footer()
    print(f"nav: {len(nav):,} chars")
    print(f"footer: {len(footer):,} chars")
    print(f"first nav line: {nav.splitlines()[0][:120]}")
    print(f"first footer line: {footer.splitlines()[0][:120]}")
