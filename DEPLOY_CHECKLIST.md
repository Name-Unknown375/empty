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
- Layout generator tests: `node _build/test_layout_gen.mjs`.
- Local preview: `node _build/serve_local.mjs 8765` (pretty URLs included).
- Revert anchor for everything: branch `savepoint-phase-0`.
