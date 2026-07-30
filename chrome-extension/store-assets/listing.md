# Chrome Web Store listing — Event Layout Planner

Everything to paste into the Chrome Web Store Developer Dashboard, tab by tab.
Assets referenced here live in this folder.

## Store listing tab

**Name** (44/45 chars)
```
Event Layout Planner — Forever Party Rentals
```

**Summary** (123/132 chars — must match manifest description)
```
Drag-and-drop party layout planner. Tents, tables, chairs & dance floors to scale, with live rental pricing and PDF export.
```

**Description**
```
Will a 20×20 tent fit in your backyard? How many round tables does a 50-guest wedding actually need? Sketch it to scale and know for sure.

The Event Layout Planner is a free drag-and-drop floor plan tool for parties and events. Enter your venue's real dimensions (or draw a custom shape), then drag in tents, tables, chairs, dance floors, staging and more — everything is drawn to scale, so what fits on screen fits on the ground.

PLAN IT YOUR WAY
• "Plan for me" wizard — enter your guest count and seating style and get a complete starter layout
• 19 ready-made templates: weddings from 20 to 200 guests, backyard birthdays, ceremonies, corporate dinners and cocktail receptions
• Or start from a blank canvas and build it yourself

BUILT FOR REAL EVENT PLANNING
• Drop a table and chairs place themselves around it — adjust the count per table
• Ceremony seating generator: rows, sections, and aisle width, configurable
• Upload a photo or Google Maps screenshot of your yard, calibrate the scale in two clicks, and design right on top of it
• Measure tool, text labels, multi-select, align & distribute, undo/redo
• Guest list with per-seat name assignment — names appear on the plan and in the PDF seating chart
• Layout check warns about overlapping items, tight aisles, and anything placed outside the venue

SHARE AND EXPORT
• Download a professional PDF: scaled drawing, itemized equipment list, and seating chart
• Copy a share link anyone can open in their browser — no account needed
• Save and load layouts as files; your work-in-progress also auto-saves locally
• Works offline — the whole planner is bundled in the extension

LIVE RENTAL PRICING
The planner prices your layout as you build it, using the real rental catalog of Forever Party Rentals, a party rental company serving Metro Vancouver and the Fraser Valley in BC, Canada. If you're local, you can check item availability for your date and send your finished layout to us for a quote. If you're not, everything else — planning, templates, PDF export, sharing — works anywhere, free, with no signup.

No account. No ads. Free.
```

**Category**: Workflow & Planning
**Language**: English

**Graphic assets**
| Asset | File |
|---|---|
| Store icon 128×128 | `icon-128.png` |
| Screenshots (1280×800) | `screenshots/wedding-50.png`, `screenshots/birthday-30.png`, `screenshots/corporate-seated-60.png`, `screenshots/ceremony-100.png` |
| Small promo tile 440×280 | `promo-tile-440x280.png` |

Suggested screenshot order: wedding-50 (shows pricing + tent), birthday-30
(backyard scale), corporate-seated-60 (round tables + auto-chairs),
ceremony-100 (ceremony rows). All four are real captures of this build.

## Privacy tab

**Single purpose description**
```
Plan party and event floor layouts: draw a to-scale venue, arrange rental equipment (tents, tables, chairs, dance floors), and export or share the finished plan.
```

**Permission justifications**

`host_permissions: https://www.foreverpartyrentals.com/*`
```
Three optional, user-initiated features call the Forever Party Rentals website: (1) the Share button creates a short shareable link for the user's layout, (2) the quote form submits the user's layout and contact details when the user asks for a rental quote, (3) anonymous usage events (no PII) are sent so we can see the tool is being used. The planner itself runs entirely inside the extension and works offline.
```

`host_permissions: https://api.rentkit.com/*`
```
When the user picks an event date in the "Check availability" field, the planner queries our rental-inventory system (RentKit) to show whether each placed item is in stock for that date. Only item IDs and the chosen date are sent; nothing else.
```

**Remote code**: No, I am not using remote code. (All JS — planner, jsPDF,
svg2pdf, qrcode-generator — is bundled in the package.)

**Data usage disclosures**
- ✅ Personally identifiable information (name, email, phone, event details) —
  collected ONLY when the user fills in and submits the "Get a Quote" form;
  used solely to email the rental quote the user requested.
- ✅ User activity — anonymous feature-usage events (e.g. "template loaded",
  "PDF exported"); no PII, no browsing history, nothing read from other tabs.
- Certify: data is NOT sold; NOT used or transferred for purposes unrelated
  to the single purpose; NOT used for creditworthiness or lending.

**Privacy policy URL**
```
https://www.foreverpartyrentals.com/privacy
```
(Before submitting, confirm the privacy page mentions the quote form's
name/email/phone handling and the anonymous usage beacon — the store reviewer
may check.)

## Distribution tab

- Visibility: Public
- Regions: all (the planner is useful anywhere; quotes are only fulfilled in
  BC, and the description says so)
- Pricing: Free
