# Partner Outreach — Embeddable Layout Planner

Templates for pitching the free embeddable planner (`/embed-the-planner`).
Keep each send under 150 words, personalize the [brackets], send from
welcome@foreverpartyrentals.com. Never pitch companies that compete in the
Lower Mainland service area.

---

## Template 1 — Non-competing rental company (outside the Lower Mainland)

**Subject:** Free layout planner for [Company] customers — no catch

Hi [Name],

I run Forever Party Rentals in Surrey, BC — far enough from [their region] that we'll never quote the same wedding.

We built a drag-and-drop event layout planner for our site (tents, tables, chairs, dance floors, all to scale, full touch support on phones) and we let non-competing rental companies embed it free. One iframe snippet, two minutes. When it's embedded on your site it automatically hides our pricing and quote form, so your customers see the tool, not us. We can also co-brand the badge: "Built for [Company] · Powered by Forever Party Rentals."

Try it here: https://www.foreverpartyrentals.com/event-layout-planner
Setup page: https://www.foreverpartyrentals.com/embed-the-planner

Want a partner slug? Reply and I'll set it up same day.

Devon
Forever Party Rentals · 778-990-7983

---

## Template 2 — Venue

**Subject:** A "will it fit?" tool for [Venue] event inquiries

Hi [Name],

Every venue manager answers the same question weekly: "will 120 guests fit in the [lawn/hall/courtyard]?"

We built a free, to-scale event layout planner — couples enter your space's real dimensions and drag in tables, a dance floor, and seating until it works. Venues can embed it on their site free with one iframe snippet; visitors need no account, and it works on phones. It can load pre-set to your room's dimensions, and we can co-brand it "Built for [Venue]."

For you that means fewer back-and-forth emails and inquiries that arrive with a floor plan attached.

See it live: https://www.foreverpartyrentals.com/event-layout-planner
Embed details: https://www.foreverpartyrentals.com/embed-the-planner

Happy to set up your slug this week.

Devon
Forever Party Rentals · Surrey, BC

---

## Template 3 — Planner / photographer

**Subject:** Free to-scale floor plan tool your clients can use (and you can embed)

Hi [Name],

Loved [specific recent event/post — personalize this].

We built a free drag-and-drop event layout planner — to-scale tents, tables, and dance floors, no signup, exports a clean PNG. Planners use it to rough out layouts with clients in a meeting; photographers use it to scout where the head table and aisle will sit before the day.

If it's useful, you're welcome to embed it on your site (one iframe, free, co-branded "Built for [Studio/Company]") or just link it to clients. Either way it stays free — we make our money renting tents in the Lower Mainland, not selling software.

Tool: https://www.foreverpartyrentals.com/event-layout-planner
Embed: https://www.foreverpartyrentals.com/embed-the-planner

Devon
Forever Party Rentals · 778-990-7983

---

## Tracking checklist

How embeds get measured: the planner fires `navigator.sendBeacon()` events to
`/api/planner-beacon` (Netlify Function, `netlify/functions/planner-beacon.mjs`)
whenever it runs outside our hub page. Each event lands in the
**`planner-analytics` Netlify Blobs store** as one JSON record per event under
`<YYYY-MM-DD>/<id>`, containing: event `name` (`planner_*`), **`host` = the
embedding page's hostname** (how partner embeds in the wild get counted),
`mode` (`external_embed` / `direct`), `partner` (slug, when present),
`viewport`, `format`, timestamp. No cookies, no PII.

Per outreach batch:

- [ ] Log each send (company, contact, template used, date) — replies expected within ~1 week
- [ ] On request: add slug to `site/planner/partners.json` (`"slug": { "name": "Company Name" }`), deploy, reply with their exact snippet (`?host=external&partner=slug`)
- [ ] Confirm their embed is live: visit their page, check the badge renders "Built for {Them} · Powered by Forever Party Rentals"
- [ ] Weekly: scan the `planner-analytics` blob store for new `host` values → new unlisted embeds (follow up: offer co-branding) and for `partner` values → confirm granted slugs are actually deployed
- [ ] Watch `planner_quote_submit` / `planner_open` counts by `host` to spot high-traffic partners worth a closer relationship
- [ ] Monthly: check referring-domain backlinks (the credit link) in Search Console — the embed's second payoff
- [ ] Form submissions arrive via the Netlify form `partner-embed` (from `/embed-the-planner`) — check the Netlify Forms dashboard

Notes for future batches:
- Form fields: company, website, email, message (honeypot `bot-field`, action `/thank-you`)
- Partner slugs: lowercase a–z, 0–9, hyphens (enforced by planner.js regex)
- The FPR credit link must stay visible — it's the licence and the link-building payoff
