# Forever Party Rentals — Blog CMS

This is a **static-HTML CMS pattern**: no backend, no database, no dependencies. One JSON file is the single source of truth for every post's metadata; HTML pages consume that JSON at runtime.

## File structure

```
site/blog/
├── posts.json              ← SOURCE OF TRUTH (every post's metadata)
├── index.html              ← Hub page (reads posts.json, renders cards)
├── _template.html          ← Canonical shell for new posts (copy + fill in)
├── <slug>.html             ← One file per post, named by the slug in posts.json
└── README.md               ← This file
```

## The 3-step workflow

### 1. To EDIT an existing post's metadata (title, date, excerpt, read-time, etc.)

Edit `posts.json`. That's it. Both the hub's card and the post's own related-posts strip update on reload — no HTML changes needed for metadata.

*Note:* the post's on-page body content (h1, sections, body copy) still lives in `<slug>.html` — `posts.json` only controls the card metadata and the schema.org JSON-LD reads.

### 2. To ADD a new post

1. **Append an entry to `posts.json`** (copy the shape of any existing post; pick a unique `slug`).
2. **Copy `_template.html` → `<slug>.html`**. Fill in the post body, canonical URL, JSON-LD, `h1`, TOC, and content sections.
3. **Done.** The hub picks it up automatically because it reads `posts.json`.

### 3. To REMOVE a post

Delete its entry from `posts.json` and delete `<slug>.html`. The hub will stop showing the card.

## `posts.json` schema

Every post entry has:

| field      | type    | required | purpose                                                                  |
|------------|---------|----------|--------------------------------------------------------------------------|
| `slug`     | string  | ✅       | URL path (`<slug>.html`). Must be unique. kebab-case.                    |
| `topic`    | enum    | ✅       | One of: `sizing`, `venues`, `compare`, `weather`, `wedding`              |
| `title`    | HTML    | ✅       | Card headline — may contain `<em>` for the gold italic accent            |
| `h4`       | string  | ✅       | Small subhead shown below card date/read-time                            |
| `excerpt`  | string  | ✅       | 1–2 sentence preview shown on the card                                   |
| `author`   | enum    | ✅       | Key into `meta.authors`: `devon` or `team`                               |
| `date`     | ISO     | ✅       | `YYYY-MM-DD` — used for sort and display                                 |
| `read`     | integer | ✅       | Minutes                                                                  |
| `status`   | enum    | ✅       | `live` (HTML page exists) or `scaffold` (page not built yet)             |

Topic metadata (label, cover class) lives in `meta.topics` — that's where you'd add a new category later without touching any post entry.

## Authors

Currently two canonical authors, both keyed in `meta.authors`:
- `devon` → **Devon**, Owner
- `team`  → **Forever Party Rentals Team**

To add a new author: append to `meta.authors`, then reference by key from the post.

## Post status

- **live** (1 post): `tent-size-guide-lower-mainland-wedding.html` is the pilot — fully written, ~1780 words, 10 sections, schema.org JSON-LD, author byline.
- **scaffold** (29 posts): exist in the manifest and render on the hub, but their HTML files haven't been written yet. They'll 404 until built from `_template.html`. The hub marks them with a `◦` after the read-time as a visual tell for the team.

## Why not a real CMS?

The rest of the site is static HTML served from Squarespace / a similar static host. Dropping in WordPress or Sanity would break the deployment model. This pattern gives us what the team actually needs — **one file to edit, metadata everywhere stays in sync** — with zero infrastructure.

If Forever outgrows this (say, 100+ posts, or non-technical team members needing a dashboard), the migration target would be [Decap CMS](https://decapcms.org/) or [TinaCMS](https://tina.io/) — both read/write the same JSON files, so the content itself doesn't have to move.

## Cache-busting

The blog files reference `../shared.css?v=6` and `../shared.js?v=6`. When you edit those shared files, bump the `v=` number across every page that references them, or the browser will serve stale CSS.
