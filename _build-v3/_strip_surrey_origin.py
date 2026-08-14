#!/usr/bin/env python3
"""One-time transform: drop Surrey-origin framing from city_data.json.

Renames driveTimeFromSurrey -> deliveryWindow and rewrites the value to drop
the Surrey reference. Rewrites the first FAQ answer's Surrey sentence with a
pattern replacement. Rewrites the intro paragraph's Surrey sentence per-city
using a hand-curated mapping (intros are too unique for regex).

The NAP block / LocalBusiness schema continues to declare Surrey as the
business address — that's legal/factual and stays.

Run once. Re-runs are idempotent (already-transformed values pass through).
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_FILE = HERE / "city_data.json"


# --- 1. New deliveryWindow values per city slug --------------------
# These replace the old driveTimeFromSurrey values. Keep travel-time + route
# information (genuinely useful for customers), drop "Surrey warehouse" framing.
DELIVERY_WINDOW = {
    "surrey": "We're based in Surrey itself — most neighborhoods are a 10-25 minute reach for our crew",
    "langley": "Standard Langley delivery runs 15-20 minutes via Fraser Highway",
    "vancouver": "Standard Vancouver delivery runs 40-55 minutes via Highway 1 and the Port Mann Bridge",
    "burnaby": "Standard Burnaby delivery runs 35-45 minutes via Highway 1",
    "abbotsford": "Standard Abbotsford delivery runs 35-45 minutes via Highway 1",
    "coquitlam": "Standard Coquitlam delivery runs 35-45 minutes",
    "richmond": "Standard Richmond delivery runs 40-50 minutes via the Alex Fraser Bridge",
    "maple-ridge": "Standard Maple Ridge delivery runs 30-40 minutes via the Golden Ears Bridge",
    "north-vancouver": "Standard North Vancouver delivery runs 55-70 minutes via the Ironworkers Memorial Bridge",
    "delta": "Standard Delta delivery runs 25-35 minutes via Highway 17 / 91",
    "white-rock": "Standard White Rock delivery runs 20-30 minutes",
    "port-moody": "Standard Port Moody delivery runs 40-50 minutes via Highway 1",
    "new-westminster": "Standard New Westminster delivery runs 20-30 minutes via the Pattullo Bridge",
    "pitt-meadows": "Standard Pitt Meadows delivery runs 30-40 minutes via the Golden Ears Bridge",
    "langley-township": "Standard Langley Township delivery runs 15-25 minutes",
    "fort-langley": "Standard Fort Langley delivery runs 20-25 minutes via 200 Street",
    "willoughby": "Standard Willoughby delivery runs 15-20 minutes",
    "carvolth": "Standard Carvolth delivery runs 15-20 minutes",
    "port-kells": "Standard Port Kells delivery runs 10-15 minutes",
    "east-newton-north": "Standard East Newton delivery runs 10-15 minutes",
    "east-clayton": "Standard East Clayton delivery runs 10-15 minutes",
    "walnut-grove": "Standard Walnut Grove delivery runs 15-20 minutes",
    "tsawwassen": "Standard Tsawwassen delivery runs 35-45 minutes via Highway 17",
    "ladner": "Standard Ladner delivery runs 25-35 minutes via Highway 17",
    "aldergrove": "Standard Aldergrove delivery runs 25-35 minutes via Highway 1",
    "chilliwack": "Standard Chilliwack delivery runs 50-65 minutes via Highway 1",
    "mission": "Standard Mission delivery runs 50-60 minutes via Highway 7 or 11",
    "harrison-hot-springs": "Standard Harrison Hot Springs delivery runs 80-100 minutes via Highway 7",
}


# --- 2. Per-city intro paragraph replacements ----------------------
# Each entry: (substring to find in intro, replacement). The substring should
# be the Surrey-mentioning fragment; replacement either rephrases or removes it.
# Find substrings copied verbatim from city_data.json. Replacement strings are
# rewrites that drop Surrey origin while keeping useful local context.
INTRO_FIXES = {
    "langley": (
        "just a 15-20 minute drive from our Surrey warehouse via the Fraser Highway",
        "well within our standard 15-20 minute Langley delivery window via the Fraser Highway",
    ),
    "vancouver": (
        "Serving Vancouver from our Surrey warehouse means crossing the Port Mann Bridge, but that hasn't stopped us from becoming",
        "Serving Vancouver means we've become",
    ),
    "burnaby": (
        "Our Surrey warehouse is a straightforward 35-45 minute drive via Highway 1, which lets us offer flexible same-week setup windows when planning gets compressed.",
        "Our standard Burnaby delivery window is 35-45 minutes via Highway 1, which lets us offer flexible same-week setup windows when planning gets compressed.",
    ),
    "abbotsford": (
        "Abbotsford is roughly 35-45 minutes from our Surrey warehouse via Highway 1, and",
        "Abbotsford is one of our regular Highway 1 delivery routes, and",
    ),
    "coquitlam": (
        "a 35-45 minute trip from our Surrey warehouse that lands us",
        "a 35-45 minute delivery route that lands us",
    ),
    "richmond": (
        "from our Surrey warehouse",
        "for our crews",
    ),
    "maple-ridge": (
        "30-40 minutes from our Surrey warehouse",
        "a 30-40 minute Golden Ears Bridge delivery",
    ),
    "north-vancouver": (
        "The trip from our Surrey warehouse runs 55-70 minutes via the Ironworkers Memorial Bridge, and",
        "Our standard North Van delivery window runs 55-70 minutes via the Ironworkers Memorial Bridge, and",
    ),
    "delta": (
        "25-35 minutes from our Surrey warehouse via Highway 17 or 91",
        "a 25-35 minute Delta delivery via Highway 17 or 91",
    ),
    "white-rock": (
        "About 20-30 minutes from our Surrey warehouse, we've handled",
        "Across our regular White Rock delivery window of 20-30 minutes, we've handled",
    ),
    "port-moody": (
        "about 40-50 minutes from our Surrey warehouse via Highway 1",
        "a 40-50 minute Port Moody delivery via Highway 1",
    ),
    "new-westminster": (
        "We're about 20-30 minutes from our Surrey warehouse via the Pattullo Bridge, so same-week setup windows are genuinely flexible",
        "Our standard New Westminster delivery window is 20-30 minutes via the Pattullo Bridge, so same-week setup is genuinely flexible",
    ),
    "pitt-meadows": (
        "Pitt Meadows is a 30-40 minute drive from our Surrey warehouse via the Golden Ears Bridge, and",
        "Pitt Meadows is a regular 30-40 minute Golden Ears Bridge delivery for us, and",
    ),
    "langley-township": (
        "Forever Party Rentals is 15-25 minutes from every corner of the Township via our Surrey warehouse",
        "Forever Party Rentals reaches every corner of the Township within a standard 15-25 minute delivery window",
    ),
    "willoughby": (
        "only 15-20 minutes from our Surrey warehouse",
        "well within our standard 15-20 minute delivery window",
    ),
    "carvolth": (
        "just 10-15 minutes from our Surrey warehouse",
        "a quick 10-15 minute delivery for our crew",
    ),
    "port-kells": (
        "our Surrey warehouse is just 5 to 10 minutes away, making this the fastest delivery run Forever Party Rentals does",
        "this is one of the fastest delivery runs we do — typically 5-10 minutes door-to-door",
    ),
    "east-newton-north": (
        "only 10-15 minutes from our Surrey warehouse",
        "well within our standard 10-15 minute delivery window",
    ),
    "walnut-grove": (
        "Walnut Grove is about 15-20 minutes from our Surrey warehouse, and",
        "Walnut Grove is a regular 15-20 minute delivery for us, and",
    ),
    "chilliwack": (
        "Forever Party Rentals makes the trip from Surrey in about 45 to 60 minutes via Highway 1",
        "Standard Chilliwack delivery runs about 45-60 minutes via Highway 1",
    ),
    "harrison-hot-springs": (
        "Forever Party Rentals makes the trip from Surrey in about 90 to 105 minutes via Highway 1 and Highway 9, and we treat every Harrison delivery as a full-day operation so nothing is rushed.",
        "Standard Harrison Hot Springs delivery runs about 90-105 minutes via Highway 1 and Highway 9, and we treat every Harrison booking as a full-day operation so nothing is rushed.",
    ),
    # harrison also has a second Surrey-adjacent phrasing:
    "harrison-hot-springs__b": (
        "Because we're coming from out of town, we",
        "Because Harrison is one of our longer delivery routes, we",
    ),
}


# A few cities have two Surrey-adjacent fragments in their intro. Provide an
# optional second-pass mapping (keyed `<slug>__b`) applied alongside the main.
EXTRA_INTRO_FIXES_KEY_SUFFIX = "__b"


# --- 3. FAQ rewrite (uniform pattern across all cities except Surrey) ---
# Old pattern: "From our Surrey warehouse, it's [about|just|roughly] X-Y minutes [via Z]."
# (sometimes followed by no further sentence, sometimes followed by more)
# Replacement: "Standard {City} delivery runs X-Y minutes [via Z]."
# Modifier is now optional, time range accepts en-dash (–) or hyphen (-),
# and a trailing em-dash fragment ("— we're basically in the neighborhood")
# is captured + dropped along with the rest.
FAQ_SURREY_PATTERN = re.compile(
    r"From our Surrey warehouse, it's (?:(about|just|only|roughly) )?"
    r"(\d+[-–]\d+) minutes"
    r"(\s+via [^.—]+?)?"
    r"(?:\s*—[^.]+?)?"
    r"\."
)


def fix_faq_answer(answer: str, city_name: str) -> str:
    """Replace the 'From our Surrey warehouse...' sentence with a city-named
    delivery-window sentence. Idempotent — strings without the pattern pass
    through unchanged. Handles en-dash time ranges and optional trailing
    em-dash clauses."""

    def repl(m):
        modifier = m.group(1)  # 'about', 'just', 'only', 'roughly', or None
        time = m.group(2).replace("–", "-")  # Normalize en-dash to hyphen
        route = m.group(3) or ""  # ' via Z' or ''
        prefix = f"{modifier} " if modifier else ""
        return f"Standard {city_name} delivery runs {prefix}{time} minutes{route}."

    return FAQ_SURREY_PATTERN.sub(repl, answer)


def main():
    raw = DATA_FILE.read_text(encoding="utf-8")
    data = json.loads(raw)

    cities = data["cities"]
    changes = []

    for slug, city in cities.items():
        # 1. Rename + rewrite driveTimeFromSurrey -> deliveryWindow
        if slug in DELIVERY_WINDOW:
            new_value = DELIVERY_WINDOW[slug]
            old_value = city.get("driveTimeFromSurrey", "")
            if old_value:
                city["deliveryWindow"] = new_value
                if "driveTimeFromSurrey" in city:
                    del city["driveTimeFromSurrey"]
                changes.append(f"  [{slug}] deliveryWindow rewritten")

        # 2. Intro Surrey-sentence rewrite (primary + optional second pass)
        for key in (slug, slug + EXTRA_INTRO_FIXES_KEY_SUFFIX):
            if key in INTRO_FIXES and "intro" in city:
                old_str, new_str = INTRO_FIXES[key]
                if old_str in city["intro"]:
                    city["intro"] = city["intro"].replace(old_str, new_str)
                    changes.append(f"  [{slug}] intro: '{key}' rewritten")

        # 3. FAQ pattern rewrite — typically faqs[0] (the "Do you deliver" Q)
        for i, faq in enumerate(city.get("faqs", [])):
            new_a = fix_faq_answer(faq.get("a", ""), city["name"])
            if new_a != faq.get("a", ""):
                faq["a"] = new_a
                changes.append(f"  [{slug}] faqs[{i}].a Surrey sentence rewritten")

    # Update top-level _schema field rename
    schema = data.get("_schema", {})
    if "driveTimeFromSurrey" in schema:
        schema["deliveryWindow"] = "Standard delivery window string for this city's coverage"
        del schema["driveTimeFromSurrey"]
        changes.append("  [_schema] driveTimeFromSurrey -> deliveryWindow")

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Rewrote {DATA_FILE}")
    print(f"\n{len(changes)} change(s):")
    for c in changes:
        print(c)


if __name__ == "__main__":
    main()
