# V2 Motion + UX Action Plan
**Date:** 2026-07-18 · **Scope:** `_build-v2/` + `site-v2/` only (live site untouched) · **Builds on:** FRONTEND_IMPROVEMENT_PLAN_2026-07-18.md (all 15 items shipped in v2)

Sources: `transitions-dev` skill (motion tokens + 27 tested snippets) and `ui-ux-pro-max` skill (design-system read + UX rulebook audit of site-v2).

**Design-system read (ui-ux-pro-max):** the correct style register for this site is **Trust & Authority** — credentials, real photography, metrics, calm confident motion. The existing green/gold/serif identity already delivers it; the tool's generic palette/font suggestions are ignored (identity is a hard guardrail). What we take from it: the motion rules (150–300ms micro-interactions, exit faster than enter, transform/opacity only, everything reduced-motion-gated), the mobile rulebook (44px targets, 16px inputs, safe areas), and restraint ("animate 1–2 key elements per view — motion conveys meaning, never decoration").

**Hard guardrails (unchanged from the v1→v2 plan):** URL structure, slugs, nav IA/labels, form field names, copy, JSON-LD, analytics events, Adelie widget internals. All template changes go through `_build-v2/` and regenerate; `verify.py` + `check_links.py` + `check_schema.py` before anything ships; CLS < 0.1.

---

## Part A — Motion foundation (do first, everything else reads from it)

### A1. Install the motion tokens
Copy the token block (durations, easings, distances, scales, blurs) from `transitions-dev/_root.css` into the V2 LAYER section of `site-v2/shared.css` (and its source in `_build-v2`). Only the token scale plus the per-snippet variables for transitions we actually install (Part B) — not all 27 blocks.

### A2. Tokenize the existing ad-hoc motion (`transitions refine`)
shared.css currently carries ~15 hardcoded durations (.12s/.15s/.18s/.2s/.22s/.25s/.35s). Map by **usage**, not number:

| Current | Usage | Token |
| --- | --- | --- |
| `.15s` color/bg/opacity hovers (nav, footer, pills, chips, links) | micro hover feedback | `--duration-quick` (150ms) |
| `.18s`–`.22s` nav underline scaleX, dropdown caret, padding-left slides | small position/indicator moves | `--duration-fast` (250ms) + `--ease-smooth-out` |
| `.2s` card hover lift/shadow, logo scale, FAQ chevron | hover lift / icon rotate | `--duration-fast` + `--ease-smooth-out` |
| `.25s` hamburger spans | icon morph | `--duration-fast` |
| `.35s ease-out` scroll-reveal + 45ms JS stagger | content reveal | `--duration-medium` + `--ease-in-out`; stagger → `--duration-stagger` (40ms, read from CSS in shared.js) |

Also: dedupe the `.card, .blog-card` transition rule (declared at both shared.css:411 and shared.css:828) — keep the v2-layer one.

---

## Part B — Component transition map (transitions-dev)

Priority = how many pages feel it × how broken the current state is. Nav + FAQ ship on all ~300 pages and currently **snap** (`display:none → block`, 0ms) — the ui-ux-pro-max rulebook flags instant state changes as a critical anti-pattern.

### Batch 1 — sitewide chrome (highest impact)

**B1. Desktop dropdowns + mega-dropdown + subdropdown → `05-menu-dropdown`.**
Currently instant `display` swap (shared.css:152–172). Install the origin-aware grow (opacity + `--scale-medium` from the trigger, `--duration-fast` open / `--duration-quick` close). JS: extend `hydrateNav()` open/close to add `.is-closing` with the documented setTimeout cleanup (skill's #1 common mistake: skipping cleanup makes the next open jump). The mega-dropdown keeps its `translateX(-50%)` centering — compose transforms, don't overwrite it.

**B2. FAQ accordion → `21-accordion`.**
Currently instant (`.faq-a { display:none }` → `block`, shared.css:340–341). Install the grid-rows `0fr → 1fr` expand. `.faq-a` has no inner wrapper in the generated markup — wrap its contents in JS inside `initFAQ()` (it already upgrades semantics there), which avoids touching every template + hand-authored blog page. Padding goes on the inner wrapper, never the grid track (skill gotcha: padding on the `0fr` track never fully closes). Keep the existing `+` rotate-to-`×` chevron — it already avoids the Chromium-only `d:` path morph trap.

**B3. Mobile menu → `07-panel-reveal` + hamburger morph.**
Currently instant fullscreen swap (shared.css:178–179). Slide-down + cross-blur panel (`--duration-slow` open / `--duration-medium` close), keep the `hidden` attribute and body scroll-lock logic — add the class one frame after unhiding so the transition runs. Hamburger spans already have `transition: all .25s` but **no open state exists** — add the → X morph keyed off `aria-expanded="true"` (middle span fades, outer spans rotate). Verify the `top: 72px` offset against the 40px topbar while at scroll-top (pre-existing, easy to fix while in there).

### Batch 2 — conversion moments

**B4. Contact form feedback → `04-text-states-swap` + `12-error-state-shake`.**
Status line and button label currently swap via bare `textContent` (shared.js:100–106, 166). Wrap both in the text-swap so "Send Message → Sending…" and status updates blur-transition instead of popping. On failed HTML5 validation, shake the first invalid field (keep `.is-error` and `.is-shaking` orthogonal — skill gotcha — so repeat submits re-shake) and focus it (`focus-management`, WCAG). Add inline `error-clarity` copy under the field, validating on blur not keystroke. Field names, action, honeypot, tracking: untouched.

**B5. Thank-you page → `10-success-check` (+ `09-icon-swap` if pairing with a spinner).**
The form redirects to `/thank-you` on success — that page is the natural home for the one celebratory moment on the site. Stroke-drawn check above the headline, `--duration-very-slow`. Remember the `stroke-dasharray` must be `path.getTotalLength()+1`, not the placeholder `20`. Note: `thank-you.html` is hand-authored — edit it directly in site-v2 and add it to `apply_partials`' HAND_AUTHORED list (already flagged in V2_REDESIGN_NOTES).

**B6. Blog copy-link → `04-text-states-swap`.**
"Copy link → Copied!" is a bare textContent swap (shared.js:370–372). Per the skill's tie-breaker, text swap beats a toast (lower overhead, no new surface).

**B7. Card CTA links → `24-learn-more-hover`.**
`.card-link` currently ships a literal `→` character with inline `style="font-size:13px"`. Replace with the skill's chevron-spreads-into-arrow SVG hover (fits the existing Phosphor-style 1.5-stroke icon set), and promote the inline font-size to a class while in there (finishes plan item 15).

**B8. Stats → `02-number-pop-in` on first reveal.**
Stat numbers (city/homepage bands) currently just fade in with the generic reveal. Pop the digits once when the stats band first enters. Chosen over `26-spinning-counter` per the skill tie-breaker (lower overhead) and the Trust & Authority register (confident, not slot-machine). This is the *one* animated element in that view — the generic `.reveal` class should skip `.stat-item` when the pop-in takes over.

### Batch 3 — perceived performance (optional, measure first)

**B9. Adelie widget slots → `14-skeleton-reveal`.**
The reserved CLS boxes (`[data-adelie]` min-heights, shared.css bottom; the `/rentals` embed) sit empty-white until the third-party script injects. Pulse a skeleton in the reserved space and cross-fade to content via a one-shot MutationObserver watching for injected children. No styling of Adelie's own DOM — we only touch our placeholder layer.

**B10. Homepage hero copy → `18-texts-reveal` (opt-in).**
Staggered rise for the H1 + subline + CTA on the homepage only. Respect the excessive-motion cap: if this ships, nothing else animates in the hero viewport (the scroll-reveal already skips the initial viewport, so this composes cleanly). Skip on inner pages — 300 templated pages re-animating a hero on every navigation would read as noise, not craft.

### Deliberately NOT installing
`19-card-tilt` (3D hover is the wrong register for a trust site; hover-only, dead on mobile), `15-shimmer-text`, `23-like-button`, `20-plus-menu-morph`, `11-avatar-group-hover`, `26-spinning-counter` (superseded by B8), any parallax. One marquee per page stays the cap; the logo marquee remains the only infinite animation (ui-ux-pro-max: continuous animation for loaders only — the marquee is the tolerated legacy exception, already pause-on-hover + reduced-motion-gated).

---

## Part C — Mobile/UX fixes (ui-ux-pro-max audit of site-v2)

Found by rule-by-rule pass; ordered by severity.

1. **iOS zoom-on-focus (HIGH):** `.form-group input/textarea/select` are 14px (shared.css:346). iOS auto-zooms any focused field under 16px — on the money page (contact/quote form). Bump to 16px ≤768px (desktop can stay 14px).
2. **Contrast regression still live (HIGH):** `.card-tag` is white 11px text on gold (shared.css:230) — the same ~2.4:1 fail the buttons had before v2 fixed them to dark-green-on-gold. Apply the `.btn-gold` treatment (`color: var(--green-dark)`).
3. **Touch targets under 44px (MED):** `.area-region a` (~30px tall, shared.css:807), `.blog-topic` chips (~33px), `.post-share` pills, `#topbar` links, `.footer-link`. Bump padding on ≤768px (or extend hit-area via `::after`) — visual design unchanged at desktop.
4. **Tap delay (MED):** no `touch-action: manipulation` anywhere. Add to `a, button, .btn, .faq-q, [role="button"]`.
5. **Sub-dropdown reachability (LOW):** `.dropdown-sub` flyouts open on `:hover` only — hover-less touch devices at ≥1024px (iPads) can't reach the flyout, though the parent link itself navigates. Acceptable escape hatch; optionally toggle `.is-open` on first tap.
6. **Verified already right (no action):** viewport meta, skip link, `focus-visible` rings, `scroll-behavior: smooth` + reduced-motion override, `env(safe-area-inset-bottom)` on the CTA bar, form `type`/`autocomplete` attrs, aria on nav/FAQ, srcset + width/height on heroes, reserved widget space.

---

## Part D — Execution order + verification

**Order:** A1–A2 (tokens, one commit) → C1–C4 (pure CSS fixes, same commit is fine) → B1–B3 (sitewide chrome, one commit, biggest review) → B4–B8 (conversion moments) → B9–B10 (optional, only after Lighthouse baseline).

**Every batch:**
1. Source edits in `_build-v2/` (templates/partials/shared.css/shared.js) → regenerate → `verify.py` (29/29), `check_links.py` (0 broken), `check_schema.py` (clean).
2. Cache-bust: `shared.css?v=25`, `shared.js?v=20` (v2 track).
3. `python3 compare_sites.py` → eyeball home, a city page, a SKU page, /rentals, blog post at 375px and desktop.
4. Reduced-motion pass: OS setting on → every new transition must fully disable (all skill snippets ship the guard — **never strip it**; the global shared.css:57 kill-switch is the backstop).
5. CLS check on home + city + SKU: every new transition is transform/opacity/grid-template-rows only — no width/height/top/left animation anywhere (grid-rows on the accordion is the intentional exception; it's user-initiated, below the fold, and the tested snippet).
6. Keyboard pass on B1–B3: Escape still closes, focus stays visible mid-transition, `aria-expanded` flips before the animation starts (state is truth; motion is decoration).

**Definition of "best it can be" for this site:** every state change the user can trigger has a ≤400ms, meaning-bearing, interruptible transition; nothing moves that the user didn't cause except the one scroll-reveal layer; all of it disappears under reduced-motion; and the mobile money path (call bar → form → thank-you) is 44px-target, 16px-input, zoom-free end to end.
