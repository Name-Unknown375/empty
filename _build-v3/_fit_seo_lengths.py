#!/usr/bin/env python3
"""One-time normalizer: bring override-file <title> (<=60) and meta_description
(140-160) within SEO length limits. Titles drop trailing descriptor clauses;
most metas shorten the "five-star reviews" suffix and/or cut at a clause
boundary; 22 metas that can't be trimmed cleanly use hand-authored copy.
Operates only on out-of-range fields; in-range overrides are left untouched."""
import re, glob, os

TITLE_MAX, META_LO, META_HI = 60, 140, 160

# Hand-authored, in-range copy for metas that can't be trimmed cleanly
# (19 rewords + 3 too-short pads). Local entities/keywords preserved.
CURATED = {
    "tent-rentals-surrey": "Tent rentals in Surrey — marquee tents from 20×20 to 30×60, delivered and installed same-week by our local Surrey-warehouse crew. 190+ five-star reviews.",
    "tent-rental-north-vancouver": "Tent rentals in North Vancouver — marquee tents delivered to Lynn Valley, Deep Cove waterfront, Edgemont and Capilano-area events. 190+ five-star reviews.",
    "tent-rental-langley-township": "Tent rentals in Langley Township — marquee tents for Township 7 vineyards, Krause Berry Farms receptions and Campbell Valley ceremonies. 190+ reviews.",
    "tent-rental-fort-langley": "Tent rentals in Fort Langley — marquees for Bedford Landing receptions, National Historic Site events and heritage-village backyards. 190+ reviews.",
    "tent-rental-port-kells": "Tent rentals in Port Kells — marquees for residential backyards, industrial-park corporate events and Tynehead-adjacent acreages. 190+ five-star reviews.",
    "tent-rental-east-newton-north": "Tent rentals in East Newton — marquees for backyard receptions, Newton Town Centre weddings and Athletic Park events, home-dock delivery. 190+ reviews.",
    "tent-rental-walnut-grove": "Tent rentals in Walnut Grove — marquees for Yorkson backyards, Bedford Landing residences and Derby Reach-adjacent acreages. 190+ five-star reviews.",
    "tent-rental-tsawwassen": "Tent rentals in Tsawwassen — marquees for English Bluff, Tsawwassen Shores waterfront and Beach Grove, engineered for Boundary Bay wind. 190+ reviews.",
    "chair-rentals-vancouver": "Chair rentals in Vancouver — White Chiavari, Fanback folding and Resin Garden chairs delivered and positioned to your floor plan. 190+ five-star reviews.",
    "chair-rentals-maple-ridge": "Chair rentals in Maple Ridge — White Chiavari, Fanback folding and Resin Garden chairs delivered, wiped and positioned by our crew. 190+ five-star reviews.",
    "chair-rentals-new-westminster": "Chair rentals in New Westminster — White Chiavari, Fanback folding and Resin Garden chairs delivered and positioned by the local crew. 190+ reviews.",
    "chair-rentals-pitt-meadows": "Chair rentals in Pitt Meadows — White Chiavari, Fanback folding and Resin Garden chairs for Swaneset Bay and Pitt Lake ceremonies. 190+ five-star reviews.",
    "chair-rentals-willoughby": "Chair rentals in Willoughby — White Chiavari, Fanback folding and Resin Garden chairs for Yorkson, Langley Events Centre and park events. 190+ reviews.",
    "chair-rentals-ladner": "Chair rentals in Ladner — White Chiavari, Fanback folding and Resin Garden chairs for Westham Island farms and Ladner Village receptions. 190+ reviews.",
    "chair-rentals-chilliwack": "Chair rentals in Chilliwack — White Chiavari, Fanback folding and Resin Garden chairs for Cultus Lake, Heritage Park and valley acreages. 190+ reviews.",
    "chair-rentals-mission": "Chair rentals in Mission — White Chiavari, Fanback folding and Resin Garden chairs for Heritage Park, Westminster Abbey and Hatzic Valley events. 190+ reviews.",
    "table-rentals-surrey": "Table rentals in Surrey — 5ft round, 6ft and 8ft banquet, and cocktail highboys delivered same-week from our local Surrey warehouse. 190+ five-star reviews.",
    "table-rentals-north-vancouver": "Table rentals in North Vancouver — 5ft round, 6ft and 8ft banquet, and cocktail highboys delivered and positioned by the local crew. 190+ reviews.",
    "dance-floor-rental-surrey": "Dance floor rentals in Surrey — 12×12, 12×16 and 16×20 portable floors delivered and leveled with subfloor, same-week from our warehouse. 190+ reviews.",
    # too-short pads (added "and" before final item to clear 140)
    "tent-rental-coquitlam": "Marquee tent rentals in Coquitlam 20×20 to 30×60 — engineered install, sidewalls, hillside-aware staking, and lighting. 190+ five-star reviews.",
    "tent-rental-richmond": "Marquee tent rentals in Richmond 20×20 to 30×60 — engineered install, sidewalls, ballast for waterfront, and lighting. 190+ five-star reviews.",
    "tent-rental-delta": "Marquee tent rentals in Delta 20×20 to 30×60 — engineered install, sidewalls, ballast for shoreline wind, and lighting. 190+ five-star reviews.",
}


def fit_title(t, limit=TITLE_MAX):
    t = t.strip()
    if len(t) <= limit:
        return t
    seps = [" — ", " – ", " + ", " | ", " · "]
    cur = t
    while len(cur) > limit:
        cand = [(cur.rfind(s), s) for s in seps]
        cand = [(i, s) for i, s in cand if i > 0]
        if not cand:
            break
        i, _ = max(cand)
        cur = cur[:i].rstrip(" —–+|·,")
    if len(cur) > limit:
        cur = cur[:limit].rsplit(" ", 1)[0].rstrip(" —–+|·,-")
    return cur


def _shorten_suffix(d):
    return re.sub(r"(\d+\+?)\s*five-star reviews\.", r"\1 reviews.", d)


def _clause_cut(d, lo=META_LO, hi=META_HI):
    rev = re.compile(r"\s*\d+\+?\s*(?:five-star )?reviews\.?\s*$", re.I)
    m = rev.search(d)
    suffix, body = "", d
    if m:
        suffix = " " + d[m.start():].strip()
        body = d[: m.start()].rstrip()
    cands = []
    for mt in re.finditer(r"[.,;]| — ", body):
        seg = body[: mt.start()].rstrip(" ,;—-")
        seg2 = seg if seg.endswith(".") else seg + "."
        total = seg2 + suffix
        if lo <= len(total) <= hi:
            cands.append((len(total), total))
    return max(cands)[1] if cands else None


def fit_meta(slug, d):
    if slug in CURATED:
        return CURATED[slug]
    if META_LO <= len(d) <= META_HI:
        return d
    d2 = _shorten_suffix(d)
    if META_LO <= len(d2) <= META_HI:
        return d2
    if len(d2) > META_HI:
        c = _clause_cut(d2)
        if c:
            return c
    return d


def patch_line(text, key, newval):
    pat = re.compile(rf'^({re.escape(key)}:\s*)"(.*)"\s*$', re.M)
    m = pat.search(text)
    if not m:
        return text, None, None
    old = m.group(2)
    if old == newval:
        return text, old, newval
    return pat.sub(lambda _m: f'{_m.group(1)}"{newval}"', text, count=1), old, newval


changed = 0
warns = []
for path in sorted(glob.glob("_build/overrides/products/*.md") + glob.glob("_build/overrides/cities/*.md")):
    slug = os.path.basename(path)[:-3]
    text = open(path, encoding="utf-8").read()
    tm = re.search(r'^title:\s*"(.*)"\s*$', text, re.M)
    dm = re.search(r'^meta_description:\s*"(.*)"\s*$', text, re.M)
    if not tm or not dm:
        continue
    new_t = fit_title(tm.group(1))
    new_d = fit_meta(slug, dm.group(1))
    if len(new_t) > TITLE_MAX:
        warns.append(f"{slug}: title still {len(new_t)}")
    if not (META_LO <= len(new_d) <= META_HI):
        warns.append(f"{slug}: meta still {len(new_d)} -> {new_d}")
    if new_t == tm.group(1) and new_d == dm.group(1):
        continue
    text, _, _ = patch_line(text, "title", new_t)
    text, _, _ = patch_line(text, "meta_description", new_d)
    open(path, "w", encoding="utf-8").write(text)
    changed += 1
    print(f"  {slug}: title {len(tm.group(1))}→{len(new_t)} | meta {len(dm.group(1))}→{len(new_d)}")

print(f"\nPatched {changed} override file(s).")
if warns:
    print("WARNINGS (still out of range):")
    for w in warns:
        print("  ", w)
else:
    print("All patched fields within limits ✓")
