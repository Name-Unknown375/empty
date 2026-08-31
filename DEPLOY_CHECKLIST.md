# Planner Launch — Deploy Checklist

Everything below is gated on a human (Devon) — the code side is committed.
Work through it top to bottom; nothing here takes more than a few minutes
except the device QA.

## 1. Deploy to Netlify
- [ ] Push `main` (or deploy via the Netlify UI). First deploy after this
      work installs `@netlify/blobs` (new `package.json`) and registers two
      Functions: `/api/planner-beacon` (usage beacon) and `/api/share`
      (short links). No env vars needed.
- [ ] Netlify will auto-detect two new forms on this deploy:
      `planner-quote` now carries an `event_date` field, and
      `partner-embed` (from /embed-the-planner) is brand new.
      Check Site → Forms after deploy and wire both to email notifications.

## 2. Post-deploy smoke test (5 minutes, on your phone + laptop)
- [ ] Open /event-layout-planner on your PHONE — wizard should open on a
      fresh visit; build a 100-guest layout; pinch-zoom; long-press a table.
- [ ] Tap Share → you should get the short-link sheet with a QR code
      (this is the part that cannot be tested locally — needs live
      Functions + Blobs). Scan the QR with another device.
- [ ] /tent-size-calculator → calculate → "Open this exact layout in the
      planner" → planner builds it.
- [ ] Pick an event date in the cost panel → availability badges appear.
- [ ] Download the PDF; check page 1 dimensions + page 2 summary.
- [ ] Submit a test quote → confirm the email arrives with PNG + date.

## 3. GTM / GA4 (one-time config in your GTM container GTM-KC35GGRQ)
- [ ] Add Custom Event triggers for: `planner_open`, `planner_first_item`,
      `planner_template_apply`, `planner_wizard_start`,
      `planner_wizard_complete`, `planner_export`, `planner_share`,
      `planner_quote_submit`, `planner_availability_check`.
- [ ] Add a GA4 Event tag per trigger forwarding the `planner_*`-prefixed
      dataLayer params (e.g. `planner_mode`, `planner_format`,
      `planner_total_bucket`).
- [ ] In GA4, mark `planner_quote_submit` as a key event (conversion).
- [ ] Verify with GTM Preview on /event-layout-planner: open the planner,
      place an item, export a PDF, submit a test quote — each should fire.
- [ ] Partner-embed + direct-open traffic doesn't hit GTM; it lands in the
      Netlify Blobs store `planner-analytics` (one tiny JSON per event,
      keyed `<YYYY-MM-DD>/<id>`, includes embedding hostname).

## 3b. Meta Pixel (one-time verify after deploy)
Pixel 1497259508391912 is in every page `<head>` (base code + PageView, idle-
deferred like GTM). `trackEvent()` in shared.js mirrors conversions to Meta:
`quote_form_submit` → `Lead`, `phone_click` → `Contact` (book_now_click is
GTM-only by design).
- [ ] Load any page → PageView appears in Events Manager (or Pixel Helper).
- [ ] Submit a test quote on /contact → `Lead` fires with fulfilment /
      rental_type / guest_bucket params; tap a tel: link → `Contact`.
- [ ] Optional backstop: in Events Manager, create a custom conversion on
      PageView of /thank-you (catches Leads lost to the 300 ms redirect race).

## 4. Decide the dance-floor price (2 minutes)
The 12×12 dance floor is $800 on the site/planner but $750 in live RentKit.
- [ ] If RentKit is right: `python3 _build/sync_planner_catalog.py --write`,
      bump `?v=` on planner.js include, regenerate + deploy.
- [ ] If the site is right: update the rate in RentKit/Adelie admin.
- Also: `bistro-string-lights` is mapped but missing from the live shop
  inventory — possibly hidden by accident; check the Adelie admin.

## 5. Baseline, then promote
- [ ] Let analytics run ~2 weeks for a funnel baseline.
- [ ] Then start partner outreach: templates in `_build/partner_outreach.md`;
      add accepted partners to `site/planner/partners.json` (slug → name)
      for the co-branded badge.
- [ ] Watch Search Console for /tent-size-calculator and
      /event-layout-planner impressions ("tent size calculator",
      "free event layout planner" are the target queries).

## Maintenance notes
- Price sync: `python3 _build/sync_planner_catalog.py --check` (also
  available via `python3 _build/verify.py --price-drift`). Never edits
  without `--write`.
- Adding a third-party tag (analytics, pixel, embed) is a TWO-file change:
  the snippet in `_build/*template.html` **and** the host in the CSP in
  `site/_headers`. Miss the second and the tag is refused by every browser
  while still being present on all 300 pages — no check but `check_csp.py`
  notices. Run `python3 _build/check_csp.py` before deploying.
- Changing `site/shared.js` is also a TWO-step change: edit the file **and**
  bump `shared.js?v=N` everywhere (`find site _build -name '*.html'` + sed on
  the bare `shared\.js\?v=N` — blog pages use `../shared.js`). `/shared.js` is
  served `immutable` for a year, so a missed page keeps the old script forever.
  Do NOT regenerate pages for a JS-only change — the generators restamp
  `lastmod` and you'd tell Google 250+ pages changed. `node
  _build/tests/clarity_tagging_test.mjs` is the guard.
- Layout generator tests: `node _build/test_layout_gen.mjs`,
  `python3 _build/tests/csp_check_test.py`,
  `node _build/tests/clarity_tagging_test.mjs`,
  `node _build/tests/blog_article_sanitize_test.mjs`.
- Local preview: `node _build/serve_local.mjs 8765` (pretty URLs included).
- Revert anchor for everything: branch `savepoint-phase-0`.

## 6. GBP — Christmas + map pack (Devon, target live by 1 Sep)

Website titles do not win the map pack. Do this in Google Business Profile; do **not** change the primary category off Party equipment rental.

- [ ] Add **Christmas light installation** as a service with price `$8.50–$12/ft` and website `https://www.foreverpartyrentals.com/christmas-lights`. Live by **1 Sep**, not 1 Oct.
- [ ] Secondary category only if Google allows: Holiday lighting contractor or Lighting contractor. Keep **Party equipment rental** as primary.
- [ ] Upload 10+ photos this week: roofline night shots, crew on ladder, before/after, Surrey warehouse.
- [ ] Weekly GBP posts Sep–Nov (“now booking Surrey / Langley / Vancouver”).
- [ ] Q&A: “Do you install Christmas lights in Surrey / Vancouver / Langley?” — answer with price + the city page URL.
- [ ] Products/services: one row per Tier-1 city pointing at that city URL (`/christmas-lights-surrey`, `-vancouver`, `-langley`, `-abbotsford`).
- [ ] Review replies: city + product on party-rental reviews now; Christmas phrasing as soon as there is even one lighting job.
- [ ] NAP must match schema: 9317 188 St, Surrey V4N 3V1, 778-990-7983, hours Mon–Fri 9:30–5:30 / Sat–Sun 10–5 (GBP).

## 7. GSC inspect after `site-v3` deploy (28-day title hold)

Sep 1 title batch is in [TITLE_BATCH_2026-09.md](TITLE_BATCH_2026-09.md). After production matches `site-v3`, Search Console → URL Inspection → Request indexing. Do **not** retitle for 28 days (freeze until **29 Sep 2026**). Do not chase projector, competitor-brand queries, or new city pages.

- [ ] `/`
- [ ] `/how-many-people-fit-at-a-6ft-rectangular-table`
- [ ] `/how-many-people-fit-at-round-tables`
- [ ] `/surrey-party-rentals`
- [ ] `/langley-party-rentals`
- [ ] `/abbotsford-party-rentals`
- [ ] `/dance-floor-rental-vancouver`
- [ ] `/tents`
- [ ] `/tables`
- [ ] `/wedding-rentals`
- [ ] `/birthday-party-rentals`

28-day scoreboard (3-month baseline in TITLE_BATCH_2026-09.md; judge on a **Last 28 days** Canada Web export, not the 3-month zip):

| Query / page | Now | 29 Sep target |
|---|---|---|
| event rentals surrey CTR | 0.93% at pos 2.3 | ≥4% |
| langley party rentals CTR | 1.22% at pos 5.1 | ≥4% |
| abbotsford party rentals CTR | 1.32% at pos 4.8 | ≥4% |
| 6ft seating-guide page CTR | 0.45% at pos 6.0 | ≥3% |
| /tents page impressions | 16 | triple+ |
| /tables page impressions | 12 | triple+ |
| /wedding-rentals impressions | 42 | triple+ |
| /birthday-party-rentals impressions | 57 | triple+ |
| party rentals vancouver position | 22.5 | ≤15 (off-site; not this batch) |

## 8. Package instant book — RentKit coupon `bundle10`

Package pages now fill the Adelie cart and send shoppers to `/checkout?coupon=bundle10`.
The 10% only applies if this coupon exists and checkout coupons are on.

- [ ] In Adelie / RentKit: enable coupons on the embedded checkout (`enableCoupons`).
- [ ] Create coupon **`BUNDLE10`** (code is case-sensitive — lowercase `bundle10` returns “not found”): 10% off, status **active**.
- [ ] Optional: restrict `bundle10` to package component SKUs (tables, chairs,
      marquees, bistro lights, cocktail tables, cocktail+spandex combo
      `xzFDs0DrIYdzyG0PEP9F`) so add-ons like dance floor stay full price.
      Unrestricted, the code discounts the whole cart and works à la carte.
- [ ] Smoke: open `/wedding-package-50-guests`, pick a date, Instant book
      Essentials → checkout shows the items and **Coupon applied: 10% off**.
      Repeat Garden Premium (cocktail+spandex combo line, not a bare cover).
