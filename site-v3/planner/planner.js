/* Forever Party Rentals — Event Layout Planner
 *
 * Single-file vanilla JS app. Loaded by event-layout-planner-embed.html
 * (which is the actual app surface; the hub page just iframes it).
 *
 * Coordinate system: world units = feet. Pixels-per-foot is the `scale`
 * factor in state.view, applied to a single root <g> transform.
 *
 * No build step, no framework. Rendering = full SVG re-render on each
 * mutation; the working set is small (<100 items), so the simplicity
 * dominates the perf cost.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────
  // SAVE_VERSION 3 marks files that may carry tent annotations (walls,
  // clearance) and resizable planning items. Nothing branches on the
  // number — applyState spreads whole items — so v2/v1 files load fine
  // in v3 code and vice versa; it's provenance for debugging only.
  // (v2 note kept for history: eventDays stays in the schema but is
  // pinned to 1 — FPR prices a 1–3 day weekend as a single rental.)
  const SAVE_VERSION = 3;
  const MIN_SCALE = 4;        // px per foot
  const MAX_SCALE = 80;
  const HISTORY_MAX = 50;
  const ROTATE_HANDLE_OFFSET_FT = 1.5;  // distance above the item, in feet
  const SNAP_PX = 8;          // magnetic-snap threshold, screen pixels
  const TENT_CLEARANCE_FT = 5;  // stake/ballast band beyond the canopy
  const SITE_URL = 'https://www.foreverpartyrentals.com';
  const PLANNER_HUB_URL = SITE_URL + '/event-layout-planner';

  // SVG namespace helper
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  // ── State ──────────────────────────────────────────────────────────────
  let catalog = null;        // { groups: [...] }
  let byKey = {};            // key -> catalog item

  let state = {
    eventName: '',
    venue: { widthFt: 40, depthFt: 30 },
    items: [],
    guests: [],     // [{ id, name, tableId|null }] — see Guest list section
    view: { scale: 14, panX: 0, panY: 0 },
    selectedIds: [],
    eventDays: 1,   // pinned to 1 — FPR weekend rentals are priced as a single rental
  };
  let history = [];          // past snapshots
  let future = [];           // redo stack
  let nextId = 1;
  const newId = () => `i${nextId++}`;
  let nextGuestId = 1;
  const newGuestId = () => `g${nextGuestId++}`;

  // ── Selection helpers ────────────────────────────────────────────────
  // Items can be a "table+chairs" composite via parentId on each chair.
  // selectedIds is the source of truth; helpers below derive everything
  // else (single-vs-multi, child cascade, etc.).
  const isSelected   = (id) => state.selectedIds.indexOf(id) !== -1;
  const selectedItems = () => state.items.filter(it => isSelected(it.id));
  const firstSelected = () => {
    if (state.selectedIds.length !== 1) return null;
    return state.items.find(it => it.id === state.selectedIds[0]) || null;
  };
  const setSelection = (ids) => { state.selectedIds = Array.isArray(ids) ? ids.slice() : []; };
  const clearSelection = () => { state.selectedIds = []; };
  const toggleInSelection = (id) => {
    const i = state.selectedIds.indexOf(id);
    if (i === -1) state.selectedIds.push(id);
    else state.selectedIds.splice(i, 1);
  };
  const getChildren = (id) => state.items.filter(it => it.parentId === id);
  // Set of all item ids that should move together when `ids` are dragged:
  // the selection itself, plus every child whose parent is selected.
  // De-dupes a child that's also explicitly selected so it moves once.
  const expandWithChildren = (ids) => {
    const set = new Set(ids);
    for (const id of ids) {
      for (const ch of getChildren(id)) set.add(ch.id);
    }
    return set;
  };

  const inIframe = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
  const queryEmbed = new URLSearchParams(location.search).get('embed') === '1';
  const isEmbed = inIframe || queryEmbed;

  // "Lite" mode: hide our pricing + quote form when the planner is iframed
  // by a third-party rental site (their visitors shouldn't see our prices
  // or fill out a Forever Party Rentals quote form). Auto-detected when
  // the parent frame is cross-origin; force-on with `?host=external` for
  // direct-link testing. Same-origin iframes (our own hub) keep full UI.
  const isExternalEmbed = (() => {
    if (new URLSearchParams(location.search).get('host') === 'external') return true;
    if (!inIframe) return false;
    try { void window.parent.location.origin; return false; }
    catch (e) { return true; }
  })();

  // Read-only viewer mode (?view=readonly). Hides editing chrome and
  // blocks mutations so a customer can share a layout link with a venue
  // host or family member without them accidentally editing it.
  // Pan + zoom remain enabled (they're not destructive).
  // Share links put ?view=readonly on the hub URL, not the embed iframe,
  // so we also read the parent's query string when same-origin.
  const isReadonly = (() => {
    const own = new URLSearchParams(location.search).get('view');
    if (own === 'readonly' || own === 'view') return true;
    try {
      if (window.parent && window.parent !== window &&
          window.parent.location.origin === window.location.origin) {
        const v = new URLSearchParams(window.parent.location.search).get('view');
        if (v === 'readonly' || v === 'view') return true;
      }
    } catch (e) { /* cross-origin denial */ }
    return false;
  })();

  // ── Analytics ─────────────────────────────────────────────────────────
  // Two transports, no cookies, no PII:
  //   • Same-origin iframe (our hub page): postMessage → the hub relays
  //     into its GTM dataLayer. The embed page itself ships no GTM (its
  //     CSP is script-src 'self') — the hub owns the tag.
  //   • External embeds / direct opens: sendBeacon to /api/planner-beacon
  //     (a Netlify Function; connect-src 'self' allows it). Referrer
  //     hostname only — this is also how partner embeds get counted.
  // ?debug=1 mirrors every event to the console. Failures are swallowed:
  // analytics must never break the planner.
  const PARTNER_SLUG = (new URLSearchParams(location.search).get('partner') || '').slice(0, 64);
  const ANALYTICS_DEBUG = new URLSearchParams(location.search).get('debug') === '1';
  const hasSameOriginParent = (() => {
    try {
      return window.parent && window.parent !== window &&
             window.parent.location.origin === window.location.origin;
    } catch (e) { return false; }
  })();
  function track(name, params) {
    const payload = Object.assign(
      { mode: isExternalEmbed ? 'external_embed' : (hasSameOriginParent ? 'hub' : 'direct') },
      PARTNER_SLUG ? { partner: PARTNER_SLUG } : null,
      params || {}
    );
    if (ANALYTICS_DEBUG) { try { console.log('[planner]', name, payload); } catch (e) {} }
    try {
      if (hasSameOriginParent) {
        window.parent.postMessage({ type: 'fpr-planner-event', name, params: payload }, location.origin);
        return;
      }
      if (navigator.sendBeacon) {
        let host = 'direct';
        try { if (document.referrer) host = new URL(document.referrer).hostname; } catch (e) {}
        navigator.sendBeacon(
          '/api/planner-beacon',
          new Blob([JSON.stringify({ name, params: payload, host })], { type: 'application/json' })
        );
      }
    } catch (e) { /* never break the app over analytics */ }
  }
  // First-item funnel event fires once per page load, from whichever add
  // path the user reaches first (drop, dblclick, paste, ceremony rows…).
  let firstItemTracked = false;
  function trackFirstItem(key) {
    if (firstItemTracked) return;
    firstItemTracked = true;
    track('planner_first_item', { item_key: key });
  }
  // Quote totals are reported as coarse bands, not exact dollars.
  function totalBucket(total) {
    if (!(total > 0)) return '0';
    if (total <= 500) return '1-500';
    if (total <= 1500) return '500-1500';
    if (total <= 3000) return '1500-3000';
    if (total <= 6000) return '3000-6000';
    return '6000+';
  }

  // Coarse-pointer (touch-first) devices get bigger invisible hit targets
  // on the small grab handles. Evaluated once — device class doesn't change.
  const IS_COARSE_POINTER = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // Tracks whether Space is currently held — when true, left-drag pans
  // instead of starting a marquee selection (Figma-style).
  let spaceDown = false;
  // Single reusable DOM node for the marquee selection overlay; created in init.
  let marqueeEl = null;
  // In-app clipboard for Cmd/Ctrl+C/V AND the right-click "Paste here"
  // action. Lifted to module scope so context-menu handlers can see it.
  // Deliberately ephemeral — page-session only, no OS clipboard sync.
  let clipboard = [];
  // Right-click context menu state.
  let contextMenuEl = null;
  // Set by the touch long-press path: clicks landing within this window
  // are the "ghost click" the browser fires after pointerup — swallow them
  // so the menu item under the finger isn't activated by accident.
  let contextMenuTouchGuardUntil = 0;

  // ── DOM refs (filled in init) ─────────────────────────────────────────
  let dom = {};

  function getEventDate() {
    const input = document.getElementById('plEventDate');
    return (input && input.value) || '';
  }
  function setEventDate(dateStr) {
    const input = document.getElementById('plEventDate');
    if (input && dateStr) input.value = dateStr;
  }
  function minDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // ── State serialize / apply ───────────────────────────────────────────
  // Single canonical shape used by: undo/redo snapshots, .json save/load,
  // shareable URL hash, localStorage auto-save, and template loading.
  function serializeState({ withMeta = false } = {}) {
    const core = {
      eventName: state.eventName,
      venue: state.venue,
      items: state.items,
      guests: state.guests,
      eventDays: state.eventDays,
      eventDate: getEventDate(),
    };
    if (!withMeta) return core;
    return {
      version: SAVE_VERSION,
      generator: 'Forever Party Rentals — Event Layout Planner',
      ...core,
    };
  }

  function applyState(parsed, { resetSelection = true } = {}) {
    if (!parsed || !parsed.venue || !Array.isArray(parsed.items)) {
      throw new Error('Invalid state — missing venue or items');
    }
    state.eventName = parsed.eventName || '';
    // Spread the whole venue object so future fields (backdrop, shape,
    // polygon, …) round-trip through save/load without needing per-field
    // updates here.
    state.venue = { ...parsed.venue };
    if (!Number.isFinite(state.venue.widthFt) || state.venue.widthFt <= 0) state.venue.widthFt = 40;
    if (!Number.isFinite(state.venue.depthFt) || state.venue.depthFt <= 0) state.venue.depthFt = 30;
    state.items = parsed.items.map(it => ({ ...it }));
    // Guests: explicit array (incl. empty) replaces; undefined PRESERVES the
    // current list — templates and the layout wizard replace furniture, and
    // a typed-in guest list shouldn't be collateral damage. Assignments to
    // tables that no longer exist are kept but treated as unassigned by
    // every display surface (non-destructive — undo can resurrect tables).
    if (Array.isArray(parsed.guests)) {
      state.guests = parsed.guests
        .map(g => ({
          id: typeof g.id === 'string' ? g.id : newGuestId(),
          name: String(g.name || '').trim().slice(0, 60),
          tableId: g.tableId || null,
        }))
        .filter(g => g.name);
    }
    state.eventDays = parsed.eventDays || 1;
    if (parsed.eventDate) setEventDate(parsed.eventDate);
    if (resetSelection) clearSelection();
    // Bump nextId past anything in the loaded items so new items don't collide.
    for (const it of state.items) {
      const n = parseInt(String(it.id || '').replace(/^i/, ''), 10);
      if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
    }
    for (const g of state.guests) {
      const n = parseInt(String(g.id || '').replace(/^g/, ''), 10);
      if (Number.isFinite(n) && n >= nextGuestId) nextGuestId = n + 1;
    }
  }

  // ── History ────────────────────────────────────────────────────────────
  function snapshot() {
    return JSON.stringify(serializeState());
  }
  function restoreSnapshot(s) {
    applyState(JSON.parse(s));
  }
  // `snap` lets gesture code capture the snapshot at pointerdown but only
  // push it onto the undo stack once the gesture actually changes state —
  // a plain click-to-select shouldn't burn an undo step.
  function commit(snap) {
    history.push(snap || snapshot());
    if (history.length > HISTORY_MAX) history.shift();
    future.length = 0;
    scheduleAutoSave();
  }
  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restoreSnapshot(history.pop());
    render();
  }
  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restoreSnapshot(future.pop());
    render();
  }

  // ── Coordinate helpers ────────────────────────────────────────────────
  function clientToWorld(clientX, clientY) {
    const r = dom.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - state.view.panX) / state.view.scale,
      y: (clientY - r.top  - state.view.panY) / state.view.scale,
    };
  }

  function fitToVenue() {
    const r = dom.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const margin = 40;
    const sx = (r.width - margin * 2) / state.venue.widthFt;
    const sy = (r.height - margin * 2) / state.venue.depthFt;
    state.view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(sx, sy)));
    state.view.panX = (r.width  - state.venue.widthFt * state.view.scale) / 2;
    state.view.panY = (r.height - state.venue.depthFt * state.view.scale) / 2;
  }

  // ── Catalog ────────────────────────────────────────────────────────────
  async function loadCatalog() {
    const res = await fetch('planner/catalog.json', { cache: 'no-cache' });
    catalog = await res.json();
    byKey = {};
    for (const group of catalog.groups) {
      for (const it of group.items) byKey[it.key] = it;
    }
    // Synthetic catalog entry for free-form text labels ("DJ", "Bar",
    // "Caterer Prep"). Not added to a palette group — the toolbar button
    // is the entry point. priceCAD=0 so labels don't show up in cost.
    byKey['text-label'] = {
      key: 'text-label',
      label: 'Text Label',
      shape: 'text',
      widthFt: 3, depthFt: 1.4,   // dummy defaults; per-item size overrides via item.widthFt/depthFt
      seats: 0, priceCAD: 0, priceUnit: 'event',
    };
    // Synthetic entry for resizable "custom area" boxes — stages, buffet
    // runs, gift tables, pools: things FPR doesn't rent but a layout has
    // to flow around. Dimensions + name live per-item (like text labels);
    // priceCAD=0 keeps them out of the estimate. Surfaced via a synthetic
    // "Extras" palette group so drag/tap/drop all work unchanged.
    byKey['custom-area'] = {
      key: 'custom-area',
      label: 'Custom Area',
      shape: 'customArea',
      widthFt: 8, depthFt: 4,     // defaults; user-saved defaults override in makeItem
      seats: 0, priceCAD: 0, priceUnit: 'event',
    };
    // Unpriced planning items — stage, bar, DJ booth, buffet run. FPR
    // does NOT rent these; like custom areas they're context the layout
    // flows around, so priceCAD=0 keeps them out of every estimate.
    // Injected here rather than catalog.json so the RentKit price-sync
    // tooling (_build/sync_planner_catalog.py) never sees sku-less rows.
    const planningItems = [
      { key: 'stage',      label: 'Stage',      widthFt: 12, depthFt: 8,   planningLabel: 'STAGE' },
      { key: 'bar',        label: 'Bar',        widthFt: 8,  depthFt: 3,   planningLabel: 'BAR' },
      { key: 'dj-booth',   label: 'DJ Booth',   widthFt: 6,  depthFt: 4,   planningLabel: 'DJ' },
      { key: 'buffet-run', label: 'Buffet Run', widthFt: 8,  depthFt: 2.5, planningLabel: 'BUFFET' },
    ].map(p => ({
      key: p.key, label: p.label, shape: 'planning', resizable: true,
      widthFt: p.widthFt, depthFt: p.depthFt, planningLabel: p.planningLabel,
      seats: 0, priceCAD: 0, priceUnit: 'event',
      hint: `${p.label} — not a rental item; a resizable placeholder your layout flows around`,
    }));
    for (const it of planningItems) byKey[it.key] = it;
    catalog.groups.push({
      key: 'extras',
      label: 'Extras',
      items: [...planningItems, byKey['custom-area']],
    });
  }

  // ── Custom-area saved size defaults ───────────────────────────────────
  // "Save as my default size" persists per-key dims so the next custom
  // area starts at the size the user actually uses (top competitor
  // complaint: tools that forget custom dimensions).
  const CUSTOM_DIMS_KEY = 'fpr-planner-custom-dims-v1';
  let customDims = (() => {
    try {
      const raw = localStorage.getItem(CUSTOM_DIMS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') return p;
      }
    } catch (e) { /* quota/privacy mode — defaults still work */ }
    return {};
  })();
  function saveCustomDims() {
    try { localStorage.setItem(CUSTOM_DIMS_KEY, JSON.stringify(customDims)); } catch (e) {}
  }

  // Approximate the on-canvas footprint of a label so itemSize / drag /
  // marquee select all work without measuring the SVG. Fudge factors
  // tuned for Jost 600 weight; close enough for hit testing and bbox.
  function approximateLabelSize(text, fontSize) {
    const t = (text || '').trim() || 'Label';
    const fs = fontSize || 1.2;
    const w = Math.max(1.5, t.length * fs * 0.55);
    const d = fs * 1.3;
    return { widthFt: w, depthFt: d };
  }

  // Build a label item placed at world coords (wx, wy). Stores widthFt/
  // depthFt on the item so itemSize() returns sensible values during
  // drag, selection, and export.
  function makeLabelItem(text, wx, wy) {
    const sz = approximateLabelSize(text, 1.2);
    return {
      id: newId(),
      key: 'text-label',
      text: text.trim(),
      fontSize: 1.2,
      x: wx - sz.widthFt / 2,
      y: wy - sz.depthFt / 2,
      widthFt: sz.widthFt,
      depthFt: sz.depthFt,
      rotation: 0,
    };
  }

  // ── Venue shape (rect vs polygon) ─────────────────────────────────────
  // state.venue.shape is 'rect' (default; absent on legacy saves) or
  // 'polygon'. Polygon vertices live in state.venue.polygon as an array
  // of {x, y} in feet, normalized so the minimum vertex is (0, 0). The
  // venue widthFt/depthFt always reflect the AABB so the rest of the app
  // (fit-to-view, tick labels, item bounds) works for either shape.
  function isPolygonVenue() {
    const v = state.venue;
    return !!(v && v.shape === 'polygon' && Array.isArray(v.polygon) && v.polygon.length >= 3);
  }

  // Shoelace formula — signed area, take abs. In sq ft.
  function polygonArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  // Translate vertices so min(x) = 0 and min(y) = 0; sync widthFt/depthFt
  // to the AABB dimensions. Called after every polygon edit so the rest
  // of the renderer (which assumes venue origin at (0,0)) keeps working.
  function fitVenueToPolygon() {
    if (!isPolygonVenue()) return;
    const poly = state.venue.polygon;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) return;
    if (minX !== 0 || minY !== 0) {
      // Translate items along with the polygon so the layout doesn't
      // visually shift when the user drags a vertex past the min.
      for (const p of poly) { p.x -= minX; p.y -= minY; }
      for (const it of state.items) { it.x -= minX; it.y -= minY; }
      if (state.venue.backdrop) {
        state.venue.backdrop.x -= minX;
        state.venue.backdrop.y -= minY;
      }
    }
    state.venue.widthFt = Math.max(1, maxX - minX);
    state.venue.depthFt = Math.max(1, maxY - minY);
  }

  // Polygon-aware venue area in sq ft. Used by future capacity / density
  // hooks — current density uses tent area only, but exposing this now
  // makes "use venue area" tweaks 1-line changes later.
  function venueAreaFt2() {
    return isPolygonVenue()
      ? polygonArea(state.venue.polygon)
      : state.venue.widthFt * state.venue.depthFt;
  }

  // ── Polygon drawing mode ──────────────────────────────────────────────
  // Active while the user is clicking out a new shape. Each click pushes
  // a vertex; double-click or click on the first vertex closes the shape.
  let drawingPolygon = null;  // null | { vertices: [{x,y}], cursor: {x,y}|null }

  function startDrawPolygon() {
    if (drawingPolygon) return;
    drawingPolygon = { vertices: [], cursor: null };
    backdropEditMode = false;
    calibrating = null;
    hideCalibrationOverlay();
    showCalibrationOverlay('Click to add corners. Double-click (or click the first dot) to close. Esc to cancel.');
    dom.canvas.classList.add('pl-drawing-poly');
    render();
  }

  function cancelDrawPolygon() {
    if (!drawingPolygon) return;
    drawingPolygon = null;
    hideCalibrationOverlay();
    dom.canvas.classList.remove('pl-drawing-poly');
    render();
  }

  function addPolygonVertex(world) {
    if (!drawingPolygon) return;
    drawingPolygon.vertices.push({ x: world.x, y: world.y });
    render();
  }

  function finishDrawPolygon() {
    if (!drawingPolygon) return;
    const verts = drawingPolygon.vertices;
    if (verts.length < 3) {
      showToast('A shape needs at least 3 corners.', 2500);
      return;
    }
    commit();
    state.venue.shape = 'polygon';
    state.venue.polygon = verts.map(p => ({ x: p.x, y: p.y }));
    fitVenueToPolygon();
    drawingPolygon = null;
    hideCalibrationOverlay();
    dom.canvas.classList.remove('pl-drawing-poly');
    fitToVenue();
    render();
    showToast('Custom shape set. Drag any corner to refine. Reset to rectangle from the side panel.', 4500);
  }

  function resetVenueToRect() {
    if (!isPolygonVenue()) return;
    plConfirm('Reset the venue to a rectangle? The current AABB size will be kept.', { okLabel: 'Reset' }).then(ok => {
      if (!ok) return;
      commit();
      state.venue.shape = 'rect';
      delete state.venue.polygon;
      render();
    });
  }

  // Test if a click landed near (in screen pixels) the polygon's first
  // vertex while drawing — used to "close" the polygon by clicking back
  // on the start. Returns boolean.
  function isClickOnFirstVertex(world) {
    if (!drawingPolygon || drawingPolygon.vertices.length < 3) return false;
    const v0 = drawingPolygon.vertices[0];
    const dx = (world.x - v0.x) * state.view.scale;
    const dy = (world.y - v0.y) * state.view.scale;
    return Math.sqrt(dx * dx + dy * dy) < 12;  // 12 px tolerance
  }

  // ── Fullscreen toggle ─────────────────────────────────────────────────
  // Uses the standard Fullscreen API on documentElement so the whole
  // planner (toolbar + palette + canvas + sidebar) goes edge-to-edge.
  // When embedded in an iframe the parent must include `allowfullscreen`
  // (the hub page's iframe does); for cross-origin embedders we fall
  // back to a toast if the request is denied.
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function toggleFullscreen() {
    if (isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) {
      showToast('Your browser does not support fullscreen mode.', 3000);
      return;
    }
    const result = req.call(el);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        showToast('Fullscreen blocked — the page that hosts the planner may not allow it.', 4000);
      });
    }
  }
  function updateFullscreenButton() {
    const btn = document.getElementById('plBtnFullscreen');
    if (!btn) return;
    const fs = isFullscreen();
    btn.classList.toggle('pl-btn-active', fs);
    btn.title = fs ? 'Exit fullscreen (F)' : 'Toggle fullscreen (F)';
    btn.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Enter fullscreen');
    document.body.classList.toggle('pl-is-fullscreen', fs);
  }

  // ── First-visit tour ──────────────────────────────────────────────────
  // 3-step overlay shown the first time someone opens the planner with an
  // empty layout. Each step spotlights one chunk of UI (palette / canvas /
  // quote form) with a short tooltip. The Help button re-triggers it any
  // time. localStorage flag so we don't pester returning users.
  const TOUR_KEY = 'fpr-planner-tour-seen-v1';
  const tourSteps = [
    {
      title: 'Drag in items from the left',
      body: 'Tents, tables, chairs, dance floors, and cocktail highboys live in the catalog on the left. Drop a table and chairs auto-place around it. Hold Shift while dropping to skip auto-chairs.',
      targetSelector: '.planner-palette',
    },
    {
      title: 'Design your event',
      body: 'Set your venue size at the top of the left rail (or draw a custom shape). Optionally upload a yard photo as a backdrop and design on top of it. Use Measure to check distances.',
      targetSelector: '#plCanvas',
    },
    {
      title: 'Send for a quote',
      body: 'When you’re happy with the layout, fill out the form on the right. We’ll email a tailored quote within 24 hours, and the email includes a copy of your design.',
      targetSelector: '.pl-quote-block',
    },
  ];
  let tourIdx = 0;

  function maybeStartTour() {
    if (isReadonly) return;
    if (state.items.length > 0) return;   // returning user with restored items
    try { if (localStorage.getItem(TOUR_KEY)) return; } catch (e) {}
    setTimeout(startTour, 400);   // brief delay so layout has settled
  }

  function startTour() {
    tourIdx = 0;
    showTourStep();
  }

  function endTour() {
    if (dom.tourOverlay) dom.tourOverlay.hidden = true;
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
  }

  function showTourStep() {
    if (!dom.tourOverlay) return;
    const step = tourSteps[tourIdx];
    if (!step) { endTour(); return; }
    const target = document.querySelector(step.targetSelector);
    if (!target) { tourIdx++; return showTourStep(); }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const sl = dom.tourSpotlight;
    sl.style.left   = (rect.left - pad) + 'px';
    sl.style.top    = (rect.top - pad) + 'px';
    sl.style.width  = (rect.width + 2 * pad) + 'px';
    sl.style.height = (rect.height + 2 * pad) + 'px';

    dom.tourTitle.textContent = step.title;
    dom.tourBody.textContent  = step.body;
    dom.tourStep.textContent  = `${tourIdx + 1} / ${tourSteps.length}`;
    dom.tourNext.textContent  = (tourIdx === tourSteps.length - 1) ? 'Got it' : 'Next →';
    dom.tourOverlay.hidden = false;

    // Position the card next to the target rect — prefer right side, fall
    // back to left, then top, then bottom. Clamp into the viewport.
    requestAnimationFrame(() => {
      const card = dom.tourCard;
      card.style.visibility = 'hidden';
      card.style.left = '0px'; card.style.top = '0px';
      const cw = card.offsetWidth || 320;
      const ch = card.offsetHeight || 200;
      const margin = 18;
      let left, top;
      // Try right of target
      if (rect.right + margin + cw <= window.innerWidth - 10) {
        left = rect.right + margin;
        top  = Math.max(20, rect.top + (rect.height - ch) / 2);
      // Try left
      } else if (rect.left - margin - cw >= 10) {
        left = rect.left - margin - cw;
        top  = Math.max(20, rect.top + (rect.height - ch) / 2);
      // Below
      } else if (rect.bottom + margin + ch <= window.innerHeight - 10) {
        left = Math.max(20, rect.left + (rect.width - cw) / 2);
        top  = rect.bottom + margin;
      } else {
        // Above
        left = Math.max(20, rect.left + (rect.width - cw) / 2);
        top  = Math.max(20, rect.top - margin - ch);
      }
      // Final clamp
      left = Math.max(10, Math.min(left, window.innerWidth  - cw - 10));
      top  = Math.max(10, Math.min(top,  window.innerHeight - ch - 10));
      card.style.left = left + 'px';
      card.style.top  = top  + 'px';
      card.style.visibility = 'visible';
    });
  }

  function nextTourStep() {
    tourIdx++;
    if (tourIdx >= tourSteps.length) endTour();
    else showTourStep();
  }

  function setupTour() {
    if (dom.tourSkip) dom.tourSkip.addEventListener('click', endTour);
    if (dom.tourNext) dom.tourNext.addEventListener('click', nextTourStep);
    const btnHelp = document.getElementById('plBtnHelp');
    if (btnHelp) btnHelp.addEventListener('click', startTour);
    // Esc dismisses the tour at any step.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.tourOverlay && !dom.tourOverlay.hidden) {
        endTour();
      }
    });
    // Re-position the spotlight + card on window resize while a step is shown.
    window.addEventListener('resize', () => {
      if (dom.tourOverlay && !dom.tourOverlay.hidden) showTourStep();
    });
  }

  // ── Distance measurement tool ─────────────────────────────────────────
  // Toggled by the Measure toolbar button. While active, two clicks define
  // a measurement segment; the foot reading is shown at the segment's
  // midpoint. Multiple segments stack until measure mode is exited (Esc
  // or clicking Measure again clears them all).
  let measureMode = false;
  let measureFirstPoint = null;     // { x, y } in world coords
  let measureCursor = null;          // { x, y } during preview
  let measurements = [];             // [{ x1, y1, x2, y2 }, …]

  function toggleMeasureMode() {
    if (measureMode) {
      exitMeasureMode();
    } else {
      // Exit any conflicting modes
      if (drawingPolygon) cancelDrawPolygon();
      if (calibrating) cancelCalibration();
      backdropEditMode = false;
      measureMode = true;
      measureFirstPoint = null;
      measureCursor = null;
      dom.canvas.classList.add('pl-measuring');
      showCalibrationOverlay('Click two points to measure. Esc clears + exits.');
      render();
    }
  }
  function exitMeasureMode() {
    if (!measureMode) return;
    measureMode = false;
    measureFirstPoint = null;
    measureCursor = null;
    measurements = [];
    dom.canvas.classList.remove('pl-measuring');
    hideCalibrationOverlay();
    render();
  }
  function onMeasureClick(world) {
    if (!measureFirstPoint) {
      measureFirstPoint = { x: world.x, y: world.y };
    } else {
      measurements.push({
        x1: measureFirstPoint.x, y1: measureFirstPoint.y,
        x2: world.x, y2: world.y,
      });
      measureFirstPoint = null;
    }
    render();
  }

  // ── Backdrop image (site photo / blueprint underlay) ──────────────────
  // Stored as a JPEG data URL on state.venue.backdrop so the whole planner
  // serializes through one shape. New layouts have no backdrop; old saves
  // load fine because every read sites guard with `if (!backdrop) return;`.
  // After upload we downscale to MAX_BACKDROP_PX on the long edge to keep
  // localStorage + JSON file sizes manageable (a 4000x3000 phone photo
  // becomes ~150-300KB JPEG).
  const MAX_BACKDROP_PX = 1500;
  const BACKDROP_JPEG_Q = 0.78;
  const BACKDROP_DEFAULT_OPACITY = 0.5;

  // True while the user is in "move/scale the backdrop" mode (set by the
  // panel button). Suppresses item clicks; canvas pointerdown drags the
  // backdrop instead of starting a marquee.
  let backdropEditMode = false;
  // True while waiting for the two calibration clicks. After click 1 we
  // store the first point and wait for click 2.
  let calibrating = null; // null | { firstWorld:{x,y} | null }

  function hasBackdrop() {
    return !!(state.venue && state.venue.backdrop && state.venue.backdrop.src);
  }

  // Read a File and resize/encode to a JPEG data URL bounded by MAX_BACKDROP_PX.
  // Returns Promise<{ dataUrl, widthPx, heightPx, naturalAspect }>.
  function loadAndDownscaleImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not decode image'));
        img.onload = () => {
          const w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0) return reject(new Error('Image has no dimensions'));
          const long = Math.max(w0, h0);
          const k = (long > MAX_BACKDROP_PX) ? (MAX_BACKDROP_PX / long) : 1;
          const w = Math.round(w0 * k), h = Math.round(h0 * k);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = c.toDataURL('image/jpeg', BACKDROP_JPEG_Q);
          resolve({ dataUrl, widthPx: w, heightPx: h, naturalAspect: w / h });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Place a freshly-uploaded backdrop. Default size: 80% of venue width,
  // height derived from natural aspect. Centered within the venue. The user
  // is then put into calibrate mode to set real-world scale (2 clicks).
  async function uploadBackdropFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showToast('That file does not look like an image.', 3000);
      return;
    }
    let img;
    try {
      img = await loadAndDownscaleImage(file);
    } catch (err) {
      showToast('Could not load that image — try a JPG or PNG.', 3500);
      return;
    }
    commit();
    const widthFt = state.venue.widthFt * 0.8;
    const heightFt = widthFt / img.naturalAspect;
    const x = (state.venue.widthFt - widthFt) / 2;
    const y = (state.venue.depthFt - heightFt) / 2;
    state.venue.backdrop = {
      src: img.dataUrl,
      x, y, widthFt, heightFt,
      rotation: 0,
      opacity: BACKDROP_DEFAULT_OPACITY,
    };
    render();
    showToast('Click two points on the photo to set the scale (or skip).', 5000);
    startCalibration();
  }

  function removeBackdrop() {
    if (!hasBackdrop()) return;
    plConfirm('Remove the background photo?', { okLabel: 'Remove', danger: true }).then(ok => {
      if (!ok) return;
      commit();
      delete state.venue.backdrop;
      backdropEditMode = false;
      calibrating = null;
      hideCalibrationOverlay();
      render();
    });
  }

  function setBackdropOpacity(v) {
    if (!hasBackdrop()) return;
    const n = Math.max(0, Math.min(1, parseFloat(v)));
    if (!Number.isFinite(n)) return;
    state.venue.backdrop.opacity = n;
    render();
  }

  function toggleBackdropMove() {
    if (!hasBackdrop()) return;
    backdropEditMode = !backdropEditMode;
    if (backdropEditMode) {
      calibrating = null;
      hideCalibrationOverlay();
      showToast('Move mode — drag the photo. Click outside or press Esc to finish.', 4000);
    }
    render();
  }

  function drawBackdrop(parent) {
    if (!hasBackdrop()) return;
    const b = state.venue.backdrop;
    const cx = b.x + b.widthFt / 2;
    const cy = b.y + b.heightFt / 2;
    const g = svg('g', {
      class: 'pl-backdrop-group' + (backdropEditMode ? ' pl-backdrop-edit' : ''),
      transform: `translate(${cx}, ${cy}) rotate(${b.rotation || 0}) translate(${-cx}, ${-cy})`,
    }, parent);
    const img = svg('image', {
      x: b.x, y: b.y,
      width: b.widthFt, height: b.heightFt,
      opacity: (b.opacity != null) ? b.opacity : BACKDROP_DEFAULT_OPACITY,
      href: b.src,
      preserveAspectRatio: 'none',
      'pointer-events': backdropEditMode ? 'auto' : 'none',
      'data-backdrop': '1',
    }, g);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', b.src);  // fallback for older renderers
    if (backdropEditMode) {
      // Dashed outline so the user can see the bounds while moving.
      svg('rect', {
        x: b.x, y: b.y, width: b.widthFt, height: b.heightFt,
        fill: 'none', stroke: '#C9A44A',
        'stroke-dasharray': '0.5 0.4',
        'stroke-width': 0.05,
        'pointer-events': 'none',
      }, g);
    }
  }

  // ── Scale calibration ─────────────────────────────────────────────────
  // Two-click flow: click point A, click point B, prompt for the real
  // distance in feet, scale the backdrop so the click distance equals it.
  function startCalibration() {
    if (!hasBackdrop()) return;
    backdropEditMode = false;
    calibrating = { firstWorld: null };
    showCalibrationOverlay('Click the FIRST point of a known distance on the photo.');
  }
  function cancelCalibration() {
    calibrating = null;
    hideCalibrationOverlay();
  }
  function showCalibrationOverlay(text) {
    if (dom.calibrationHint) {
      dom.calibrationHint.textContent = text;
      dom.calibrationHint.hidden = false;
    }
    dom.canvas.classList.add('pl-calibrating');
  }
  function hideCalibrationOverlay() {
    if (dom.calibrationHint) dom.calibrationHint.hidden = true;
    dom.canvas.classList.remove('pl-calibrating');
  }
  // Called from pointerdown when calibrating is non-null.
  function onCalibrationClick(world) {
    if (!calibrating) return;
    if (!calibrating.firstWorld) {
      calibrating.firstWorld = { x: world.x, y: world.y };
      showCalibrationOverlay('Now click the SECOND point.');
      return;
    }
    const dx = world.x - calibrating.firstWorld.x;
    const dy = world.y - calibrating.firstWorld.y;
    const distFt = Math.sqrt(dx * dx + dy * dy);
    if (distFt < 0.01) {
      showToast('Pick two different points — try again.', 3000);
      calibrating.firstWorld = null;
      showCalibrationOverlay('Click the FIRST point of a known distance.');
      return;
    }
    plPrompt('How many feet between those two points?', '', { okLabel: 'Set scale' }).then(ans => {
      if (ans == null) { cancelCalibration(); render(); return; }
      const real = parseFloat(ans);
      if (!Number.isFinite(real) || real <= 0) {
        showToast('That did not look like a number — calibration cancelled.', 3000);
        cancelCalibration(); render(); return;
      }
      // Scale the backdrop so distFt becomes `real` feet.
      const k = real / distFt;
      const b = state.venue.backdrop;
      const cx = b.x + b.widthFt / 2;
      const cy = b.y + b.heightFt / 2;
      commit();
      b.widthFt *= k;
      b.heightFt *= k;
      // Re-center on the same world point so the user's click target stays put
      b.x = cx - b.widthFt / 2;
      b.y = cy - b.heightFt / 2;
      cancelCalibration();
      render();
      showToast('Scale set. Drag the photo with the Move button if you want to reposition.', 4500);
    });
  }

  // ── Templates ─────────────────────────────────────────────────────────
  // Recipes (templates.json) define a venue + a list of item placements.
  // Applying a template runs each placement through expandRecipeToState(),
  // which calls placeChairsAround() for every table marked withChairs:true,
  // so the saved data stays compact (~15 entries vs ~120 with explicit
  // chairs) but the loaded layout is fully populated.
  let templates = [];
  async function loadTemplates() {
    try {
      const res = await fetch('planner/templates.json', { cache: 'no-cache' });
      const data = await res.json();
      templates = data.templates || [];
    } catch (err) {
      templates = [];
    }
  }

  function expandRecipeToState(recipe) {
    const items = [];
    for (const r of recipe.items) {
      const cat = byKey[r.key];
      if (!cat) continue;
      const sz = itemSize(cat);
      const item = {
        id: newId(),
        key: r.key,
        x: r.cx - sz.w / 2,
        y: r.cy - sz.d / 2,
        rotation: r.rotation || 0,
      };
      items.push(item);
      if (r.withChairs && cat.seats > 1) {
        const chairs = placeChairsAround(item, r.chairKey || DEFAULT_CHAIR_KEY, r.chairCount);
        items.push(...chairs);
      }
    }
    return {
      eventName: recipe.label,
      venue: { widthFt: recipe.venue.widthFt, depthFt: recipe.venue.depthFt },
      items,
      eventDays: 1,
    };
  }

  function applyTemplate(recipe) {
    const doApply = () => {
      commit();
      applyState(expandRecipeToState(recipe));
      fitToVenue();
      render();
      track('planner_template_apply', { template_id: recipe.id || recipe.label });
    };
    if (state.items.length === 0) { doApply(); return; }
    plConfirm(`Replace your current layout with the "${recipe.label}" template?`, { okLabel: 'Replace' })
      .then(ok => { if (ok) doApply(); });
  }

  // Footprint of an item in feet (axis-aligned bounding box).
  // `arg` is either a state.items entry OR a catalog entry — both expose
  // shape + dimensions (the catalog has fixed dims, items can override).
  function itemSize(arg) {
    if (arg.shape === 'circle') return { w: arg.diameterFt, d: arg.diameterFt };
    return { w: arg.widthFt, d: arg.depthFt };
  }
  // Effective size for an item — text labels carry per-instance dims on
  // the item itself; everything else is fixed by the catalog. Use this
  // instead of `itemSize(byKey[item.key])` whenever you need an item's
  // current footprint.
  function effectiveSize(item) {
    const cat = byKey[item.key];
    if (!cat) return { w: 0, d: 0 };
    // Text labels, custom areas, and resizable planning items carry their
    // own per-item dims. Fall back to catalog dims if an item somehow
    // arrives without them (e.g. a share link with empty size slots).
    if (cat.shape === 'text' || cat.shape === 'customArea' || cat.resizable) {
      const sz = itemSize(item);
      if (sz.w > 0 && sz.d > 0) return sz;
    }
    return itemSize(cat);
  }

  // Default position for a new item, dropped at world coords (wx, wy).
  function makeItem(key, wx, wy) {
    const cat = byKey[key];
    if (!cat) return null;
    if (cat.shape === 'customArea' || cat.resizable) {
      // Per-item dims, seeded from the user's saved defaults if any.
      const saved = customDims[key] || {};
      const w = (saved.widthFt > 0) ? saved.widthFt : cat.widthFt;
      const d = (saved.depthFt > 0) ? saved.depthFt : cat.depthFt;
      const it = {
        id: newId(),
        key,
        x: wx - w / 2,
        y: wy - d / 2,
        widthFt: w,
        depthFt: d,
        rotation: 0,
      };
      if (cat.shape === 'customArea') it.text = 'Custom area';
      return it;
    }
    const sz = itemSize(cat);
    return {
      id: newId(),
      key,
      // store top-left of axis-aligned bbox (pre-rotation), in feet
      x: wx - sz.w / 2,
      y: wy - sz.d / 2,
      rotation: 0,
    };
  }

  // ── Auto-chair placement ──────────────────────────────────────────────
  // Drop a 5ft round → 8 Chiavari chairs auto-placed evenly around it.
  // Drop a 6ft banquet → chairs along the long edges + short ends.
  // Triggered from the drop handler unless the user held Shift.
  // Only fires for items where shape is rect/circle AND seats > 1 (so it
  // won't fire for chairs themselves, which have seats=1).
  const DEFAULT_CHAIR_KEY = 'resin-garden-chair';
  const CHAIR_GAP_FT = 0.25;        // table-to-chair gap
  const CHAIR_SPACING_FT = 0.35;    // chair-to-chair gap on long edges (~4.2 inches)

  // count overrides the catalog default (used by the chair-count stepper).
  // Every returned chair gets parentId=table.id so the table+chairs move,
  // rotate, delete, and duplicate as one composite.
  function placeChairsAround(table, chairKey = DEFAULT_CHAIR_KEY, count) {
    const tableCat = byKey[table.key];
    const chairCat = byKey[chairKey];
    if (!tableCat || !chairCat) return [];
    // Enforce the contract above: chairs auto-place around seated TABLES
    // only — never around chairs themselves (seats=1) or zero-seat items.
    if (!(tableCat.seats > 1)) return [];
    const N = (count != null) ? count : tableCat.seats;
    if (!(N > 0)) return [];
    let chairs;
    if (tableCat.shape === 'circle')      chairs = _placeChairsRound(table, tableCat, chairCat, chairKey, N);
    else if (tableCat.shape === 'rect')   chairs = _placeChairsRect(table, tableCat, chairCat, chairKey, N);
    else return [];
    // Re-apply table rotation around its center so the freshly-generated
    // chairs sit correctly around a tilted table (e.g. user rotates table,
    // then changes chair count — chairs should respect rotation).
    const rot = table.rotation || 0;
    if (rot) {
      const sz = itemSize(tableCat);
      const cx = table.x + sz.w / 2, cy = table.y + sz.d / 2;
      const rad = rot * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      for (const ch of chairs) {
        const chCat = byKey[ch.key];
        const chSz = itemSize(chCat);
        const chCx = ch.x + chSz.w / 2, chCy = ch.y + chSz.d / 2;
        const dx = chCx - cx, dy = chCy - cy;
        ch.x = (cx + dx * cos - dy * sin) - chSz.w / 2;
        ch.y = (cy + dx * sin + dy * cos) - chSz.d / 2;
        ch.rotation = ((ch.rotation || 0) + rot) % 360;
      }
    }
    for (const ch of chairs) ch.parentId = table.id;
    return chairs;
  }

  function _placeChairsRound(table, tCat, cCat, chairKey, N) {
    const tableR = tCat.diameterFt / 2;
    const chairHalfDepth = cCat.depthFt / 2;
    const dist = tableR + chairHalfDepth + CHAIR_GAP_FT;
    const tCx = table.x + tCat.diameterFt / 2;
    const tCy = table.y + tCat.diameterFt / 2;
    const chairs = [];
    for (let i = 0; i < N; i++) {
      const angleRad = (2 * Math.PI * i / N) - Math.PI / 2;  // start at 12 o'clock
      const cx = tCx + dist * Math.cos(angleRad);
      const cy = tCy + dist * Math.sin(angleRad);
      chairs.push({
        id: newId(),
        key: chairKey,
        x: cx - cCat.widthFt / 2,
        y: cy - cCat.depthFt / 2,
        rotation: (angleRad * 180 / Math.PI) + 90,
      });
    }
    return chairs;
  }

  function _placeChairsRect(table, tCat, cCat, chairKey, N) {
    const tw = tCat.widthFt, td = tCat.depthFt;
    const cw = cCat.widthFt, cd = cCat.depthFt;
    const tCx = table.x + tw / 2;
    const tCy = table.y + td / 2;

    // Long-edges-first algorithm:
    //   At catalog default (e.g. 8 for a 6ft banquet, 10 for 8ft) the
    //   layout is `maxPerSide × 2 + 2 ends`. Decreasing from default
    //   drops END chairs first, then sheds long-edge chairs alternately.
    //   Increasing past default overflows on long edges (tighter pitch).
    //   maxPerSide derives from cat.seats so 6ft → 3 and 8ft → 4 stays
    //   correct without baking widths into the algorithm.
    const maxPerSide = Math.max(1, Math.floor(((tCat.seats || 4) - 2) / 2));

    const longTotal = Math.max(0, N - Math.min(2, Math.max(0, N - 2 * maxPerSide)));
    const endsTotal = N - longTotal;
    // Bias the extra long-edge chair to the TOP side when split is uneven
    // (purely cosmetic — top is "near the head" by FPR convention).
    const topCount = Math.ceil(longTotal / 2);
    const bottomCount = Math.floor(longTotal / 2);

    const chairs = [];

    // Lay chairs out along an edge with a fixed CHAIR_SPACING_FT gap
    // between adjacent chair-edges, then center the whole strip on the
    // table's mid-line. If the strip would overflow the table width
    // (high counts on a small table), fall back to even-spacing across
    // the full edge so chairs don't drift past the table corners.
    function edgeStartCx(count) {
      const total = count * cw + Math.max(0, count - 1) * CHAIR_SPACING_FT;
      if (total > tw) {
        // Fall back to even spacing inside the table width
        return null;
      }
      return tCx - total / 2 + cw / 2;
    }

    // Top long edge (side = -1, chair faces down → rotation 180°)
    {
      const startCx = edgeStartCx(topCount);
      for (let i = 0; i < topCount; i++) {
        const cx = (startCx != null)
          ? startCx + i * (cw + CHAIR_SPACING_FT)
          : tCx - tw / 2 + tw * ((i + 1) / (topCount + 1));
        const cy = tCy - (td / 2 + cd / 2 + CHAIR_GAP_FT);
        chairs.push({
          id: newId(), key: chairKey,
          x: cx - cw / 2, y: cy - cd / 2,
          rotation: 180,
        });
      }
    }
    // Bottom long edge (side = +1, chair faces up → rotation 0°)
    {
      const startCx = edgeStartCx(bottomCount);
      for (let i = 0; i < bottomCount; i++) {
        const cx = (startCx != null)
          ? startCx + i * (cw + CHAIR_SPACING_FT)
          : tCx - tw / 2 + tw * ((i + 1) / (bottomCount + 1));
        const cy = tCy + (td / 2 + cd / 2 + CHAIR_GAP_FT);
        chairs.push({
          id: newId(), key: chairKey,
          x: cx - cw / 2, y: cy - cd / 2,
          rotation: 0,
        });
      }
    }
    // Right end (faces right → rotation 90°). Always added before left end
    // so when count drops from 2 → 1, the LEFT end disappears first.
    if (endsTotal >= 1) {
      chairs.push({
        id: newId(), key: chairKey,
        x: tCx + tw / 2 + CHAIR_GAP_FT,
        y: tCy - cd / 2,
        rotation: 90,
      });
    }
    if (endsTotal >= 2) {
      chairs.push({
        id: newId(), key: chairKey,
        x: tCx - tw / 2 - CHAIR_GAP_FT - cw,
        y: tCy - cd / 2,
        rotation: 270,
      });
    }
    return chairs;
  }

  // ── Tile thumbnails (palette) ─────────────────────────────────────────
  function tileThumb(item) {
    const sz = itemSize(item);
    const max = Math.max(sz.w, sz.d);
    const s = 30 / max;          // px per foot for the thumb
    const w = sz.w * s, d = sz.d * s;
    const ox = (38 - w) / 2, oy = (36 - d) / 2;
    let inner = '';
    const cls = shapeClass(item);
    if (item.shape === 'circle') {
      inner = `<circle cx="${ox + w/2}" cy="${oy + d/2}" r="${w/2}" class="${cls}"/>`;
    } else if (item.shape === 'tent') {
      inner = `<rect x="${ox}" y="${oy}" width="${w}" height="${d}" class="${cls}"/>`;
    } else if (item.shape === 'danceFloor') {
      // Mini checker
      const tiles = 4;
      const tw = w / tiles, td = d / tiles;
      let c = '';
      for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
        const fill = ((i + j) % 2 === 0) ? '#1a1a1a' : '#fff';
        c += `<rect x="${ox + i*tw}" y="${oy + j*td}" width="${tw}" height="${td}" fill="${fill}"/>`;
      }
      inner = `${c}<rect x="${ox}" y="${oy}" width="${w}" height="${d}" fill="none" stroke="#1a1a1a" stroke-width=".5"/>`;
    } else if (item.shape === 'lighting') {
      // Dashed strand with bulb dots
      const cy = oy + d / 2;
      let bulbs = '';
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        bulbs += `<circle cx="${ox + w * fx}" cy="${cy}" r="1.6" fill="#e7c46a" stroke="#8b6f2c" stroke-width=".5"/>`;
      }
      inner = `<path d="M ${ox} ${cy} Q ${ox + w * 0.25} ${cy + 4} ${ox + w * 0.5} ${cy} Q ${ox + w * 0.75} ${cy + 4} ${ox + w} ${cy}" fill="none" stroke="#8b6f2c" stroke-width="1" stroke-dasharray="2 1.5"/>${bulbs}`;
    } else if (item.shape === 'heater') {
      inner = `<rect x="${ox}" y="${oy}" width="${w}" height="${d}" rx="4" fill="#fff" stroke="#c45a28" stroke-width="1.4"/>` +
        `<circle cx="${ox + w / 2}" cy="${oy + d / 2}" r="${Math.min(w, d) * 0.22}" fill="#c45a28"/>`;
    } else if (item.shape === 'sidewall') {
      const cy = oy + d / 2;
      inner = `<line x1="${ox}" y1="${cy}" x2="${ox + w}" y2="${cy}" stroke="#1E3A2F" stroke-width="3"/>` +
        `<line x1="${ox}" y1="${cy - 4}" x2="${ox}" y2="${cy + 4}" stroke="#1E3A2F" stroke-width="1.2"/>` +
        `<line x1="${ox + w}" y1="${cy - 4}" x2="${ox + w}" y2="${cy + 4}" stroke="#1E3A2F" stroke-width="1.2"/>`;
    } else {
      inner = `<rect x="${ox}" y="${oy}" width="${w}" height="${d}" class="${cls}"/>`;
    }
    return `<svg viewBox="0 0 38 36" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  function shapeClass(item) {
    if (item.shape === 'tent') return 'pl-item-tent';
    if (item.shape === 'danceFloor') return 'pl-item-default';  // checker has its own fills
    if (item.shape === 'customArea') return 'pl-item-custom';
    if (item.shape === 'planning') return 'pl-item-stage';
    if (item.key && item.key.includes('chair')) return 'pl-item-chair';
    if (item.key && (item.key.startsWith('stage') || item.key.startsWith('bar'))) return 'pl-item-stage';
    return 'pl-item-table';
  }

  // ── Render: palette ───────────────────────────────────────────────────
  function renderPalette() {
    const groupsHTML = catalog.groups.map(g => `
      <div class="pl-group">
        <div class="pl-group-label">${g.label}</div>
        <div class="pl-tiles">
          ${g.items.map(it => `
            <div class="pl-tile" draggable="true" data-key="${it.key}" title="${it.hint || it.label}">
              <div class="pl-tile-thumb">${tileThumb(it)}</div>
              <div class="pl-tile-label">${it.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
    dom.paletteGroups.innerHTML = groupsHTML;

    // Wire HTML5 drag-and-drop on each tile
    dom.paletteGroups.querySelectorAll('.pl-tile').forEach(tile => {
      tile.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/x-planner-key', tile.dataset.key);
        e.dataTransfer.effectAllowed = 'copy';
        tile.classList.add('pl-dragging');
      });
      tile.addEventListener('dragend', () => tile.classList.remove('pl-dragging'));
      // Click to add at venue center (desktop no-drag fallback)
      tile.addEventListener('dblclick', e => addItemFromPalette(tile.dataset.key, e.shiftKey));
      // Touch: a plain tap places the item — HTML5 drag-and-drop doesn't
      // exist on touch, so tap-to-add IS the mobile add path. A tap is a
      // pointerup within 10px of its pointerdown.
      tile.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        tile._touchStart = { x: e.clientX, y: e.clientY };
      });
      tile.addEventListener('pointerup', e => {
        if (e.pointerType !== 'touch' || !tile._touchStart) return;
        const moved = Math.abs(e.clientX - tile._touchStart.x) + Math.abs(e.clientY - tile._touchStart.y);
        tile._touchStart = null;
        if (moved > 10) return;
        addItemFromPalette(tile.dataset.key, false);
        closeMobileSheets();
        showToast('Added to the centre of your venue — drag it into place', 2600);
      });
    });
  }

  // ── Mobile chrome ─────────────────────────────────────────────────────
  // Phones get the palette as a bottom sheet and the stats/cost/quote
  // sidebar as a slide-over summoned by a floating totals pill. The
  // elements exist on every viewport; CSS only reveals them ≤720px.
  function closeMobileSheets() {
    if (dom.palette) dom.palette.classList.remove('pl-sheet-open');
    if (dom.sidebar) dom.sidebar.classList.remove('pl-sheet-open');
    if (dom.scrim) dom.scrim.classList.remove('pl-scrim-show');
  }
  function setupMobileChrome() {
    dom.palette = document.querySelector('.planner-palette');
    dom.sidebar = document.querySelector('.planner-sidebar');
    if (!dom.palette || !dom.sidebar || !dom.app) return;

    dom.scrim = document.createElement('div');
    dom.scrim.className = 'pl-scrim';
    dom.scrim.addEventListener('click', closeMobileSheets);
    dom.app.appendChild(dom.scrim);

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'pl-sheet-handle';
    handle.setAttribute('aria-label', 'Open the items and venue panel');
    handle.innerHTML = '<span class="pl-sheet-grip" aria-hidden="true"></span><span>Items &amp; venue</span>';
    handle.setAttribute('aria-expanded', 'false');
    handle.addEventListener('click', () => {
      const open = dom.palette.classList.toggle('pl-sheet-open');
      dom.sidebar.classList.remove('pl-sheet-open');
      dom.scrim.classList.toggle('pl-scrim-show', open);
      handle.setAttribute('aria-expanded', String(open));
      if (dom.totalsPill) dom.totalsPill.setAttribute('aria-expanded', 'false');
    });
    dom.palette.insertBefore(handle, dom.palette.firstChild);

    dom.totalsPill = document.createElement('button');
    dom.totalsPill.type = 'button';
    dom.totalsPill.className = 'pl-totals-pill';
    dom.totalsPill.setAttribute('aria-label', 'Open the capacity and cost panel');
    dom.totalsPill.textContent = '0 seats';
    dom.totalsPill.setAttribute('aria-expanded', 'false');
    dom.totalsPill.addEventListener('click', () => {
      const open = dom.sidebar.classList.toggle('pl-sheet-open');
      dom.palette.classList.remove('pl-sheet-open');
      dom.scrim.classList.toggle('pl-scrim-show', open);
      dom.totalsPill.setAttribute('aria-expanded', String(open));
      const h = dom.palette.querySelector('.pl-sheet-handle');
      if (h) h.setAttribute('aria-expanded', 'false');
    });
    dom.canvas.appendChild(dom.totalsPill);
  }

  // Shared add path for palette dblclick (desktop) and tap (touch).
  function addItemFromPalette(key, suppressChairs) {
    const it = makeItem(key, state.venue.widthFt / 2, state.venue.depthFt / 2);
    if (!it) return;
    commit();
    state.items.push(it);
    trackFirstItem(it.key);
    if (!suppressChairs) {
      const chairs = placeChairsAround(it);
      if (chairs.length) state.items.push(...chairs);
    }
    setSelection([it.id]);
    render();
  }

  // ── Render: SVG canvas ────────────────────────────────────────────────
  // ── Layout validation + table numbering ──────────────────────────────
  // Soft guidance, never hard blocks. Industry defaults documented here:
  //   • 4 ft minimum guest aisle between seated-table chair rings
  //     (service aisles want 6–8 ft; fire-code egress paths are 44 in)
  //   • furniture shouldn't overlap or sit outside the venue boundary
  // Both maps recompute once per render — ≤~50 solid items keeps the
  // pairwise checks trivial.
  let _issues = { flagged: new Set(), messages: [] };
  let _tableNums = new Map();

  const _isSeatedTable = (it) => {
    const c = byKey[it.key];
    return !!(c && (c.shape === 'circle' || c.shape === 'rect') && c.seats > 1 && !c.key.includes('chair'));
  };

  // Seated tables numbered in reading order (top-left → bottom-right,
  // 4 ft row tolerance). Numbers appear from 2 tables up, render on the
  // canvas and in every export, and renumber automatically as tables move.
  function computeTableNumbers() {
    const tables = state.items.filter(_isSeatedTable);
    if (tables.length < 2) return new Map();
    const center = (t) => {
      const sz = effectiveSize(t);
      return { x: t.x + sz.w / 2, y: t.y + sz.d / 2 };
    };
    const banquet = tables.every(t => (t.key || '').startsWith('banquet'));
    const sorted = tables.slice().sort((a, b) => {
      const ca = center(a), cb = center(b);
      if (banquet) {
        const runY = Math.min(...tables.filter(t => ((t.rotation || 0) % 180) !== 0).map(t => center(t).y), 1e9);
        const band = (t) => {
          const cross = ((t.rotation || 0) % 180) === 0;
          const y = center(t).y;
          if (cross && y < runY - 1) return 0;
          if (!cross) return 1;
          return 2;
        };
        const ba = band(a), bb = band(b);
        if (ba !== bb) return ba - bb;
        if (ba === 1) {
          if (Math.abs(ca.x - cb.x) > 2) return ca.x - cb.x;
          return ca.y - cb.y;
        }
        return (ca.x - cb.x) || (ca.y - cb.y);
      }
      if (Math.abs(ca.y - cb.y) > 4) return ca.y - cb.y;
      return ca.x - cb.x;
    });
    const m = new Map();
    sorted.forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }

  // Rotated-rect corners of an item, in world feet. `pad` inflates the
  // rect on every side (used for chair envelopes in the aisle check).
  function _itemCorners(it, pad = 0) {
    const sz = effectiveSize(it);
    const cx = it.x + sz.w / 2, cy = it.y + sz.d / 2;
    const rad = (it.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const hw = sz.w / 2 + pad, hd = sz.d / 2 + pad;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({
      x: cx + x * cos - y * sin,
      y: cy + x * sin + y * cos,
    }));
  }

  function _segPointDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
  }

  // Minimum distance between two convex quads (0 when they intersect).
  function _quadMinDist(qa, qb) {
    if (_quadsOverlap(qa, qb, 0)) return 0;
    let min = Infinity;
    for (const [q1, q2] of [[qa, qb], [qb, qa]]) {
      for (const p of q1) {
        for (let i = 0; i < 4; i++) {
          const d = _segPointDist(p, q2[i], q2[(i + 1) % 4]);
          if (d < min) min = d;
        }
      }
    }
    return min;
  }

  // Separating-axis test on two convex quads, with a small penetration
  // tolerance so deliberately abutting items (head-table pairs, joined
  // marquees) don't trip the overlap warning.
  function _quadsOverlap(qa, qb, tol) {
    const axes = [];
    for (const q of [qa, qb]) {
      for (let i = 0; i < 4; i++) {
        const p = q[i], n = q[(i + 1) % 4];
        axes.push({ x: -(n.y - p.y), y: n.x - p.x });
      }
    }
    for (const ax of axes) {
      const len = Math.hypot(ax.x, ax.y) || 1;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of qa) { const d = (p.x * ax.x + p.y * ax.y) / len; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const p of qb) { const d = (p.x * ax.x + p.y * ax.y) / len; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      if (maxA - tol <= minB || maxB - tol <= minA) return false;
    }
    return true;
  }

  function _pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
          p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function _pointInVenue(p) {
    if (isPolygonVenue()) return _pointInPolygon(p, state.venue.polygon);
    return p.x >= -0.05 && p.y >= -0.05 &&
           p.x <= state.venue.widthFt + 0.05 && p.y <= state.venue.depthFt + 0.05;
  }

  function validateLayout() {
    const flagged = new Set();
    const messages = [];
    // Solids = anything that physically occupies floor space except chairs
    // (they hug tables by design) and text labels. Tents are checked for
    // the outside-venue rule only — furniture inside a tent is the point.
    const solids = state.items.filter(it => {
      const c = byKey[it.key];
      return c && c.shape !== 'text' && c.shape !== 'tent' && !(c.key && c.key.includes('chair'));
    });
    const tents = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'tent');

    // 1. Overlapping furniture
    const corners = new Map();
    const cornersOf = (it) => {
      if (!corners.has(it.id)) corners.set(it.id, _itemCorners(it));
      return corners.get(it.id);
    };
    let overlapPairs = 0;
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        if (_quadsOverlap(cornersOf(solids[i]), cornersOf(solids[j]), 0.05)) {
          flagged.add(solids[i].id);
          flagged.add(solids[j].id);
          overlapPairs++;
        }
      }
    }
    if (overlapPairs > 0) {
      messages.push({
        ids: [...flagged],
        text: overlapPairs === 1 ? 'Two items overlap' : `${overlapPairs} pairs of items overlap`,
      });
    }

    // 2. Items poking outside the venue boundary
    const outside = [];
    for (const it of [...solids, ...tents]) {
      if (cornersOf(it).some(p => !_pointInVenue(p))) outside.push(it);
    }
    if (outside.length > 0) {
      for (const it of outside) flagged.add(it.id);
      messages.push({
        ids: outside.map(it => it.id),
        text: outside.length === 1
          ? `${(byKey[outside[0].key] || {}).label || 'An item'} extends outside the venue`
          : `${outside.length} items extend outside the venue`,
      });
    }

    // 3. Tight aisles: < 3 ft between the ACTUAL chairs of two different
    // tables (guests pass behind pulled-out chairs). Measuring real chair
    // items — not an inflated envelope — keeps intentional composites
    // (head-table pairs, end-to-end banquet runs with no end chairs) from
    // false-flagging. Touching/overlapping chair sets (joined units) are
    // skipped via the > 0.05 floor.
    // Industry catering pitch for 5ft rounds is 10–10.75 ft centres —
    // chair-back gaps of 1.5–1.7 ft are standard install density (and
    // what the wizard/templates generate). Flag only below 1.5 ft, where
    // guests genuinely can't pull out and pass.
    const AISLE_MIN_FT = 1.5;
    const seated = state.items.filter(_isSeatedTable);
    const chairQuads = new Map(); // chairId -> corners
    const chairsOf = (t) => getChildren(t.id).filter(c => byKey[c.key] && c.key.includes('chair'));
    const quadOf = (c) => {
      if (!chairQuads.has(c.id)) chairQuads.set(c.id, _itemCorners(c));
      return chairQuads.get(c.id);
    };
    const tightPairs = [];
    for (let i = 0; i < seated.length; i++) {
      for (let j = i + 1; j < seated.length; j++) {
        const a = seated[i], b = seated[j];
        const sa = effectiveSize(a), sb = effectiveSize(b);
        // Centre-distance prefilter: skip pairs too far apart to matter.
        const reach = (Math.max(sa.w, sa.d) + Math.max(sb.w, sb.d)) / 2 + 2 * 2.2 + AISLE_MIN_FT + 1;
        const cd = Math.hypot(
          (a.x + sa.w / 2) - (b.x + sb.w / 2),
          (a.y + sa.d / 2) - (b.y + sb.d / 2)
        );
        if (cd > reach) continue;
        // Abutting tables (head-table pairs, end-to-end banquet runs) are
        // one deliberate unit — their chairs sit close by design.
        if (_quadMinDist(cornersOf(a), cornersOf(b)) < 0.6) continue;
        // Collinear same-orientation banquet segments (centres on one
        // line, even with a gap between segments) also read as a single
        // long table, not an aisle. Rect tables only — rounds have no axis.
        if (sa.w !== sa.d && sb.w !== sb.d) {
          const rotA = (((a.rotation || 0) % 180) + 180) % 180;
          const rotB = (((b.rotation || 0) % 180) + 180) % 180;
          const sameOrient = Math.abs(rotA - rotB) < 10 || Math.abs(rotA - rotB) > 170;
          if (sameOrient) {
            const dxc = (b.x + sb.w / 2) - (a.x + sa.w / 2);
            const dyc = (b.y + sb.d / 2) - (a.y + sa.d / 2);
            const baseAng = ((sa.w >= sa.d ? 0 : 90) + (a.rotation || 0)) * Math.PI / 180;
            const lateral = Math.abs(-Math.sin(baseAng) * dxc + Math.cos(baseAng) * dyc);
            if (lateral < 1.5) continue;
          }
        }
        const ca = chairsOf(a), cb = chairsOf(b);
        if (!ca.length || !cb.length) continue;
        let min = Infinity;
        for (const x of ca) {
          for (const y of cb) {
            const d = _quadMinDist(quadOf(x), quadOf(y));
            if (d < min) min = d;
            if (min <= 0.05) break;
          }
          if (min <= 0.05) break;
        }
        if (min > 0.05 && min < AISLE_MIN_FT) tightPairs.push([a, b, min]);
      }
    }
    if (tightPairs.length > 0) {
      const ids = [...new Set(tightPairs.flatMap(([a, b]) => [a.id, b.id]))];
      for (const id of ids) flagged.add(id);
      const worst = tightPairs.reduce((m, p) => Math.min(m, p[2]), Infinity);
      messages.push({
        ids,
        text: `${tightPairs.length === 1 ? 'One table pair is' : tightPairs.length + ' table pairs are'} extremely tight (under 1.5 ft between chairs, tightest ${Math.max(0, worst).toFixed(1)} ft) — guests can't pull out and pass`,
      });
    }

    return { flagged, messages };
  }

  function render() {
    if (!dom.svg) return;

    _tableNums = computeTableNumbers();
    _issues = validateLayout();

    // Hide/show empty hint
    dom.emptyHint.style.display = (state.items.length === 0) ? 'block' : 'none';

    // Inputs reflect state
    if (document.activeElement !== dom.venueW) dom.venueW.value = state.venue.widthFt;
    if (document.activeElement !== dom.venueD) dom.venueD.value = state.venue.depthFt;
    if (document.activeElement !== dom.eventName) dom.eventName.value = state.eventName;

    // Build the SVG
    dom.svg.innerHTML = '';

    // Defs: clipPath for the venue interior so the grid stays inside the
    // shape (visible distinction for polygon venues; harmless for rect).
    const defs = svg('defs', {}, dom.svg);
    const clip = svg('clipPath', { id: 'pl-venue-clip' }, defs);
    if (isPolygonVenue()) {
      svg('polygon', {
        points: state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '),
      }, clip);
    } else {
      svg('rect', {
        x: 0, y: 0, width: state.venue.widthFt, height: state.venue.depthFt,
      }, clip);
    }

    const root = svg('g', {
      transform: `translate(${state.view.panX}, ${state.view.panY}) scale(${state.view.scale})`,
    }, dom.svg);

    // Layer order matters here:
    //  1. White page-fill (gives the "we're working on a sheet" feel)
    //  2. Backdrop image (sits on top of the white page, under everything else)
    //  3. Grid (clipped to venue shape; semi-transparent over backdrop)
    //  4. Venue stroke (boundary outline, drawn after backdrop+grid so it
    //     stays crisp on top — fill is on the page-fill layer above)
    //  5. Items (added below in subsequent code)
    //  6. Selection halos + polygon handles (drawn last)
    if (isPolygonVenue()) {
      svg('polygon', {
        points: state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '),
        class: 'pl-venue-fill',
      }, root);
    } else {
      svg('rect', {
        x: 0, y: 0,
        width: state.venue.widthFt, height: state.venue.depthFt,
        class: 'pl-venue-fill',
      }, root);
    }

    // Optional site-photo backdrop (Google Maps screenshot of yard, etc.).
    // Pointer-events: none unless in "move backdrop" mode.
    drawBackdrop(root);

    // Grid pattern (5ft major, 1ft minor) — clipped to the venue shape
    // so polygon venues don't have grid leaking outside the boundary.
    const gridG = svg('g', { 'clip-path': 'url(#pl-venue-clip)' }, root);
    drawGrid(gridG);

    // Venue boundary STROKE (no fill — fill was drawn first as the page).
    if (isPolygonVenue()) {
      svg('polygon', {
        points: state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '),
        class: 'pl-venue-rect',
        'vector-effect': 'non-scaling-stroke',
      }, root);
    } else {
      svg('rect', {
        x: 0, y: 0,
        width: state.venue.widthFt,
        height: state.venue.depthFt,
        class: 'pl-venue-rect',
        'vector-effect': 'non-scaling-stroke',
      }, root);
    }

    // Z-order: tents at the bottom (large containers), then tables/chairs/
    // dance floors, then text labels last so they're always readable above
    // everything else (including under-table chairs and backdrop overlays).
    const tents  = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'tent');
    const labels = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'text');
    const others = state.items.filter(it => byKey[it.key] && byKey[it.key].shape !== 'tent' && byKey[it.key].shape !== 'text');

    for (const it of tents)  drawItem(root, it);
    for (const it of others) drawItem(root, it);
    for (const it of labels) drawItem(root, it);

    // Guest names beside their assigned tables' chairs (zoom-gated).
    drawGuestNames(root);

    // Selection halos drawn last, on top of everything. The rotate handle
    // only appears when exactly one item is selected (multi-rotate uses
    // toolbar buttons which rotate each item around its own center).
    const sel = selectedItems();
    const showHandle = sel.length === 1;
    for (const item of sel) drawSelection(root, item, showHandle);

    // Magnetic-snap alignment guides + gap labels (drag/resize only).
    if (activeGuides.length || activeDims.length) drawSnapGuides(root);

    // Polygon vertex handles — only when the venue is a polygon and we're
    // not currently in draw mode (would conflict with the click-to-add-
    // vertex flow).
    if (isPolygonVenue() && !drawingPolygon) {
      drawPolygonVertexHandles(root);
    }
    // Draw-mode preview: in-progress vertices, edges, cursor preview line.
    if (drawingPolygon) {
      drawPolygonInProgress(root);
    }
    // Distance measurements (segments + labels) on top of everything.
    if (measureMode || measurements.length) {
      drawMeasurements(root);
    }

    // Update zoom readout
    const zoomPct = Math.round((state.view.scale / 14) * 100);
    dom.zoomReadout.textContent = `${zoomPct}%`;

    // Update stats / tally / cost estimator
    renderStats();
    renderQuote();
    renderValidation();

    // Update toolbar enabled states
    dom.btnUndo.disabled = history.length === 0;
    dom.btnRedo.disabled = future.length === 0;
    const hasSel = state.selectedIds.length > 0;
    dom.btnRotateLeft.disabled = !hasSel;
    dom.btnRotateRight.disabled = !hasSel;
    dom.btnDuplicate.disabled = !hasSel;
    dom.btnDelete.disabled = !hasSel;

    // Inspector (chair-count stepper) — visible only when single seated
    // table is selected. Lives in the right rail above the stats.
    renderInspector();

    // Guest list panel (right rail).
    renderGuestPanel();

    // Backdrop panel visibility + button state.
    renderBackdropPanel();

    // Venue mode panel — toggle rect inputs vs polygon info.
    renderVenuePanel();

    // Measure-button active state
    const btnM = document.getElementById('plBtnMeasure');
    if (btnM) btnM.classList.toggle('pl-btn-active', measureMode);
  }

  function renderVenuePanel() {
    if (!dom.btnVenueDraw) return;
    const isPoly = isPolygonVenue();
    // Size inputs + label + units stay visible in BOTH modes — when in
    // polygon mode they reflect the AABB (read-only feel) and the user
    // can still reset to rect via the polygon panel below.
    if (dom.venueSizeRow) dom.venueSizeRow.hidden = false;
    if (dom.venueUnits)   dom.venueUnits.hidden   = false;
    if (dom.venuePolyInfo) dom.venuePolyInfo.hidden = !isPoly;
    if (isPoly) {
      if (dom.venuePolyAabb) dom.venuePolyAabb.textContent = `${state.venue.widthFt.toFixed(1)} × ${state.venue.depthFt.toFixed(1)}`;
      if (dom.venuePolyArea) dom.venuePolyArea.textContent = Math.round(venueAreaFt2()).toLocaleString();
    }
    // Make the size inputs read-only when in polygon mode so the user
    // can't half-edit. They unlock when "Reset to rectangle" is clicked.
    if (dom.venueW) {
      dom.venueW.disabled = isPoly;
      dom.venueW.title = isPoly ? 'Reset to rectangle to edit width' : '';
    }
    if (dom.venueD) {
      dom.venueD.disabled = isPoly;
      dom.venueD.title = isPoly ? 'Reset to rectangle to edit depth' : '';
    }
    // Update only the trailing text node (the icon stays as-is from HTML).
    const lastNode = dom.btnVenueDraw.lastChild;
    const wantedLabel = isPoly ? ' Re-draw shape' : ' Draw custom shape';
    if (lastNode && lastNode.nodeType === Node.TEXT_NODE) {
      if (lastNode.textContent !== wantedLabel) lastNode.textContent = wantedLabel;
    }
  }

  function renderBackdropPanel() {
    if (!dom.btnAddBackdrop) return;
    const has = hasBackdrop();
    dom.btnAddBackdrop.hidden = has;
    if (dom.backdropPanel) dom.backdropPanel.hidden = !has;
    if (has && dom.backdropOpacity && document.activeElement !== dom.backdropOpacity) {
      dom.backdropOpacity.value = (state.venue.backdrop.opacity != null ? state.venue.backdrop.opacity : BACKDROP_DEFAULT_OPACITY);
    }
    if (dom.btnBackdropMove) {
      dom.btnBackdropMove.classList.toggle('pl-btn-active', !!backdropEditMode);
      dom.btnBackdropMove.textContent = backdropEditMode ? 'Done moving' : 'Move';
    }
  }

  function drawGrid(parent) {
    const w = state.venue.widthFt, d = state.venue.depthFt;
    const grid = svg('g', { class: 'pl-grid-group' }, parent);
    // 1-ft minor lines (skip those that coincide with 5-ft major lines —
    // we draw majors below in a separate pass for stronger styling)
    for (let x = 1; x < w; x++) {
      if (x % 5 === 0) continue;
      svg('line', { x1: x, y1: 0, x2: x, y2: d, class: 'pl-grid', 'vector-effect': 'non-scaling-stroke' }, grid);
    }
    for (let y = 1; y < d; y++) {
      if (y % 5 === 0) continue;
      svg('line', { x1: 0, y1: y, x2: w, y2: y, class: 'pl-grid', 'vector-effect': 'non-scaling-stroke' }, grid);
    }
    // 5-ft major lines
    for (let x = 0; x <= w; x += 5) {
      svg('line', { x1: x, y1: 0, x2: x, y2: d, class: 'pl-grid-major', 'vector-effect': 'non-scaling-stroke' }, grid);
    }
    for (let y = 0; y <= d; y += 5) {
      svg('line', { x1: 0, y1: y, x2: w, y2: y, class: 'pl-grid-major', 'vector-effect': 'non-scaling-stroke' }, grid);
    }
    // Foot tick labels every 5 ft on the top edge (x labels) and left edge
    // (y labels). Positioned outside the venue rect so the interior stays
    // clean. font-size is in feet (world units); 1.4 ft ≈ 20 px at default
    // zoom — readable without dominating.
    for (let x = 5; x <= w; x += 5) {
      const t = svg('text', {
        x: x, y: -0.6,
        'text-anchor': 'middle', 'dominant-baseline': 'auto',
        'font-size': 1.4, class: 'pl-grid-label',
      }, grid);
      t.textContent = x + "'";
    }
    for (let y = 5; y <= d; y += 5) {
      const t = svg('text', {
        x: -0.6, y: y,
        'text-anchor': 'end', 'dominant-baseline': 'middle',
        'font-size': 1.4, class: 'pl-grid-label',
      }, grid);
      t.textContent = y + "'";
    }
  }

  // Vertex handles drawn on each polygon corner (when venue.shape === 'polygon')
  // so the user can drag a corner to refine the shape post-commit.
  function drawPolygonVertexHandles(parent) {
    const poly = state.venue.polygon;
    const g = svg('g', { class: 'pl-poly-handles' }, parent);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      svg('circle', {
        cx: p.x, cy: p.y, r: 0.5,
        class: 'pl-poly-handle',
        'data-handle': 'poly-vertex',
        'data-vertex-index': String(i),
        'vector-effect': 'non-scaling-stroke',
      }, g);
    }
  }

  // While the user is drawing a polygon, show:
  //  • the placed vertices as filled dots (first vertex highlighted gold),
  //  • lines connecting them in order,
  //  • a dashed preview line from the last vertex to the current cursor.
  function drawPolygonInProgress(parent) {
    const verts = drawingPolygon.vertices;
    const g = svg('g', { class: 'pl-poly-draw' }, parent);
    // Filled polygon preview (semi-transparent) so the user sees the shape forming
    if (verts.length >= 3) {
      svg('polygon', {
        points: verts.map(p => `${p.x},${p.y}`).join(' '),
        fill: 'rgba(201, 164, 74, .15)',
        stroke: 'none',
        'pointer-events': 'none',
      }, g);
    }
    // Edges between placed vertices
    for (let i = 0; i < verts.length - 1; i++) {
      svg('line', {
        x1: verts[i].x, y1: verts[i].y,
        x2: verts[i + 1].x, y2: verts[i + 1].y,
        stroke: 'var(--pl-gold, #C9A44A)', 'stroke-width': 0.1,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }, g);
    }
    // Live preview line from last vertex to cursor
    if (verts.length > 0 && drawingPolygon.cursor) {
      svg('line', {
        x1: verts[verts.length - 1].x, y1: verts[verts.length - 1].y,
        x2: drawingPolygon.cursor.x, y2: drawingPolygon.cursor.y,
        stroke: 'var(--pl-gold, #C9A44A)', 'stroke-width': 0.08,
        'stroke-dasharray': '0.5 0.4',
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }, g);
    }
    // Vertex dots — first one highlighted so the user knows where to click to close
    for (let i = 0; i < verts.length; i++) {
      const isFirst = (i === 0);
      svg('circle', {
        cx: verts[i].x, cy: verts[i].y, r: isFirst ? 0.55 : 0.35,
        fill: isFirst ? 'var(--pl-gold, #C9A44A)' : '#fff',
        stroke: 'var(--pl-green, #1E3A2F)',
        'stroke-width': 0.08,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }, g);
    }
  }

  // Draw all measurement segments + the in-progress preview (if any).
  // Distance labels render with a white halo via paint-order so they stay
  // legible over backdrops, items, and dance floors.
  function drawMeasurements(parent) {
    const g = svg('g', { 'pointer-events': 'none' }, parent);
    for (const m of measurements) drawMeasurementSegment(g, m.x1, m.y1, m.x2, m.y2, true);
    if (measureFirstPoint) {
      // Always show the first-point dot so the user knows the click registered.
      svg('circle', {
        cx: measureFirstPoint.x, cy: measureFirstPoint.y, r: 0.18,
        fill: '#C9A44A', stroke: '#1E3A2F', 'stroke-width': SPR_PRIMARY,
        'vector-effect': SPR_NSS,
      }, g);
      if (measureCursor) {
        drawMeasurementSegment(g, measureFirstPoint.x, measureFirstPoint.y,
                               measureCursor.x, measureCursor.y, false);
      }
    }
  }
  function drawMeasurementSegment(parent, x1, y1, x2, y2, committed) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    const opacity = committed ? 1 : 0.7;
    svg('line', {
      x1, y1, x2, y2,
      stroke: '#C9A44A', 'stroke-width': SPR_PRIMARY,
      'stroke-dasharray': '5 4',
      'vector-effect': SPR_NSS,
      opacity,
    }, parent);
    // Endpoint dots
    for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
      svg('circle', {
        cx, cy, r: 0.18,
        fill: '#C9A44A', stroke: '#1E3A2F', 'stroke-width': SPR_PRIMARY,
        'vector-effect': SPR_NSS, opacity,
      }, parent);
    }
    // Label at midpoint, offset perpendicular to the segment
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    const perp = 0.7;   // ft offset from the line
    const lx = midX + (-dy / len) * perp;
    const ly = midY + ( dx / len) * perp;
    const t = svg('text', {
      x: lx, y: ly,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 1.1,
      'font-family': 'Jost, sans-serif', 'font-weight': '600',
      fill: '#1E3A2F',
      stroke: '#fff', 'stroke-width': 4, 'stroke-opacity': 0.85,
      'paint-order': 'stroke fill',
      opacity,
    }, parent);
    t.textContent = `${len.toFixed(1)} ft`;
  }

  // ── Item sprites ──────────────────────────────────────────────────────
  // Each sprite renders a single catalog item into a pre-translated +
  // rotated SVG <g> in the item's local frame (origin = item center).
  // All strokes use vector-effect=non-scaling-stroke so widths are pixel
  // values that stay constant at every zoom AND in PNG/Print export.
  // Width hierarchy: PRIMARY (1.2 px) for outlines, SECONDARY (1.0 px)
  // for inner detail like X-bases / spider legs / spindles, TERTIARY
  // (0.6 px) for very subtle edge bevels. Tuned in sprite-preview.html.
  const SPR_PRIMARY   = 1.2;
  const SPR_SECONDARY = 1.0;
  const SPR_TERTIARY  = 0.6;
  const SPR_NSS = 'non-scaling-stroke';
  const CHAIR_STROKE = '#1E3A2F';
  const TABLE_FILL   = '#d8c79a';
  const TABLE_STROKE = '#8b6f2c';

  // Master dispatcher. Used by both the live canvas (drawItem) and the
  // PNG/Print export (drawItemInto) so both paths render identically.
  function drawSprite(g, cat, item, sz) {
    if (cat.shape === 'text')       return drawTextLabelSprite(g, item, sz);
    if (cat.shape === 'customArea') return drawCustomAreaSprite(g, item, sz);
    if (cat.shape === 'tent')       return drawTentSprite(g, item, sz);
    if (cat.shape === 'danceFloor') return drawDanceFloorSprite(g, sz);
    if (cat.shape === 'planning')   return drawPlanningSprite(g, cat, sz);
    if (cat.shape === 'lighting')   return drawBistroLightsSprite(g, sz);
    if (cat.shape === 'heater')     return drawHeaterSprite(g, sz);
    if (cat.shape === 'sidewall')   return drawSidewallSprite(g, sz);
    if (cat.shape === 'circle') {
      if (cat.seats > 1) return drawRoundTableSprite(g, sz);
      return drawCocktailSprite(g, sz);
    }
    if (cat.shape === 'rect') {
      if (cat.key && cat.key.includes('chair')) {
        if (cat.key.includes('chiavari')) return drawChiavariSprite(g, sz);
        if (cat.key.includes('fanback'))  return drawFanbackSprite(g, sz);
        if (cat.key.includes('resin'))    return drawResinSprite(g, sz);
        return drawChiavariSprite(g, sz);
      }
      if (cat.seats > 1) return drawBanquetSprite(g, sz);
    }
    return drawGenericRectSprite(g, cat, sz);
  }

  // CUSTOM AREA — dashed outline + centred name + dims caption. Context
  // the layout flows around (stage, buffet run, pool); never priced.
  function drawCustomAreaSprite(g, item, sz) {
    svg('rect', {
      x: -sz.w / 2, y: -sz.d / 2, width: sz.w, height: sz.d, rx: 0.15,
      fill: 'rgba(30,58,47,.05)', stroke: CHAIR_STROKE,
      'stroke-width': SPR_PRIMARY, 'stroke-dasharray': '6 4',
      'vector-effect': SPR_NSS,
    }, g);
    const label = (item.text || '').trim() || 'Custom area';
    const fontFt = Math.max(0.7, Math.min(1.5, (sz.w * 0.9) / Math.max(4, label.length * 0.6)));
    svg('text', {
      x: 0, y: 0, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-size': fontFt, fill: 'rgba(30,58,47,.75)',
      'font-family': 'Jost, sans-serif', 'font-weight': '600',
    }, g).textContent = label;
    if (sz.d >= 3) {
      svg('text', {
        x: 0, y: fontFt * 0.9, 'dominant-baseline': 'hanging', 'text-anchor': 'middle',
        'font-size': fontFt * 0.55, fill: 'rgba(30,58,47,.45)',
        'font-family': 'Jost, sans-serif', 'font-weight': '500',
      }, g).textContent = `${sz.w}×${sz.d} ft`;
    }
  }

  // CHIAVARI — square seat (slightly trapezoidal: back narrower than
  // front), backrest band along the back edge, 3 spindle ticks.
  function drawChiavariSprite(g, sz) {
    const w = sz.w, d = sz.d;
    // Trapezoidal seat (proportions tuned for 1.33×1.33 catalog spec)
    const fwH = 0.413 * w;
    const bwH = 0.376 * w;
    const fy  =  0.413 * d;
    const by  = -0.338 * d;
    svg('path', {
      d: `M ${-fwH} ${fy} L ${fwH} ${fy} L ${bwH} ${by} L ${-bwH} ${by} Z`,
      fill: '#fff', stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'stroke-linejoin': 'round', 'vector-effect': SPR_NSS,
    }, g);
    // Backrest band along the back edge — high-contrast cue at any zoom
    const bandW = 0.827 * w;
    const bandH = 0.165 * d;
    svg('rect', {
      x: -bandW/2, y: -d/2, width: bandW, height: bandH, rx: 0.05,
      fill: 'rgba(30,58,47,.18)', stroke: CHAIR_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    // 3 spindle ticks — Chiavari signature spindle backrest
    const tickX = 0.165 * w;
    const tickY1 = -d/2 + 0.041 * d;
    const tickY2 = -d/2 + 0.132 * d;
    for (const x of [-tickX, 0, tickX]) {
      svg('line', {
        x1: x, y1: tickY1, x2: x, y2: tickY2,
        stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
        'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // FANBACK — rectangular seat + half-disc fan rising past the back edge.
  function drawFanbackSprite(g, sz) {
    const w = sz.w, d = sz.d;
    // Seat (slightly forward-biased so the fan has room above)
    const seatHW = 0.433 * w;
    const seatY1 = -0.383 * d;
    const seatY2 =  0.464 * d;
    svg('rect', {
      x: -seatHW, y: seatY1,
      width: 2 * seatHW, height: seatY2 - seatY1, rx: 0.067 * w,
      fill: '#fff', stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'vector-effect': SPR_NSS,
    }, g);
    // Half-disc fan rising above the seat back edge — extends past the
    // chair bbox, which matches the real fanback silhouette (back wider
    // than seat). The bbox is what the planner uses for collision; the
    // visual fan is purely cosmetic past that.
    const fanHW = 0.52 * w;
    const fanRise = 0.30 * d;
    svg('path', {
      d: `M ${-fanHW} ${seatY1} A ${fanHW} ${fanRise} 0 0 1 ${fanHW} ${seatY1} Z`,
      fill: 'rgba(30,58,47,.14)', stroke: CHAIR_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    // 3 ribs — vertical chord lines inside the fan, slight inward bend
    const ribOuter = 0.233 * w;
    const ribTipOuter = 0.213 * w;
    const ribTopMiddle = -d/2 - 0.18 * d;
    const ribTopOuter  = -d/2 - 0.11 * d;
    svg('line', {
      x1: -ribOuter, y1: seatY1, x2: -ribTipOuter, y2: ribTopOuter,
      stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    svg('line', {
      x1: 0, y1: seatY1, x2: 0, y2: ribTopMiddle,
      stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    svg('line', {
      x1: ribOuter, y1: seatY1, x2: ribTipOuter, y2: ribTopOuter,
      stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
  }

  // RESIN GARDEN — wider rounded seat, slim backrest slab, armrest bumps
  // at the upper corners (the unique cue at small sizes).
  function drawResinSprite(g, sz) {
    const w = sz.w, d = sz.d;
    // Backrest slab — drawn first so the seat overlaps it slightly
    const backW = 0.778 * w;
    const backH = 0.120 * d;
    svg('rect', {
      x: -backW/2, y: -d/2, width: backW, height: backH, rx: 0.06 * w,
      fill: 'rgba(30,58,47,.14)', stroke: CHAIR_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    // Seat — heavy rounding to suggest molded plastic
    const seatHW = 0.443 * w;
    const seatY1 = -0.355 * d;
    const seatY2 =  0.464 * d;
    svg('rect', {
      x: -seatHW, y: seatY1, width: 2 * seatHW, height: seatY2 - seatY1,
      rx: 0.131 * w,
      fill: '#fff', stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
      'vector-effect': SPR_NSS,
    }, g);
    // Armrest bumps at upper corners — protrude past the seat outline
    const armX = 0.443 * w;
    const armY = -0.301 * d;
    const armR = 0.072 * w;
    for (const ax of [-armX, armX]) {
      svg('circle', {
        cx: ax, cy: armY, r: armR,
        fill: '#fff', stroke: CHAIR_STROKE, 'stroke-width': SPR_PRIMARY,
        'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // ROUND TABLE (banquet round) — pedestal disc + 4 spider-leg hints.
  function drawRoundTableSprite(g, sz) {
    const r = sz.w / 2;
    svg('circle', {
      cx: 0, cy: 0, r,
      fill: TABLE_FILL, stroke: TABLE_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    const legLen = 0.4 * r;
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      svg('line', {
        x1: 0, y1: 0, x2: dx * legLen, y2: dy * legLen,
        stroke: 'rgba(139,111,44,.4)', 'stroke-width': SPR_SECONDARY,
        'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
      }, g);
    }
    svg('circle', {
      cx: 0, cy: 0, r: 0.16 * r,
      fill: 'rgba(139,111,44,.55)', stroke: 'rgba(139,111,44,.7)',
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
  }

  // COCKTAIL HIGHBOY — small round + X-base reaching near the rim.
  function drawCocktailSprite(g, sz) {
    const r = sz.w / 2;
    svg('circle', {
      cx: 0, cy: 0, r,
      fill: TABLE_FILL, stroke: TABLE_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    const armEnd = 0.76 * r;
    svg('line', {
      x1: -armEnd, y1: -armEnd, x2: armEnd, y2: armEnd,
      stroke: 'rgba(139,111,44,.55)', 'stroke-width': SPR_SECONDARY,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    svg('line', {
      x1: -armEnd, y1: armEnd, x2: armEnd, y2: -armEnd,
      stroke: 'rgba(139,111,44,.55)', 'stroke-width': SPR_SECONDARY,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    svg('circle', {
      cx: 0, cy: 0, r: 0.144 * r,
      fill: 'rgba(139,111,44,.65)', stroke: 'rgba(139,111,44,.75)',
      'stroke-width': SPR_TERTIARY, 'vector-effect': SPR_NSS,
    }, g);
  }

  // BANQUET (rectangular folding tables — 6ft, 8ft) — tabletop +
  // inner-bevel inset suggesting the tabletop edge.
  function drawBanquetSprite(g, sz) {
    const w = sz.w, d = sz.d;
    svg('rect', {
      x: -w/2, y: -d/2, width: w, height: d, rx: 0.05,
      fill: TABLE_FILL, stroke: TABLE_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    // Inner bevel — fixed 0.12 ft inset (not a fraction of size, so the
    // bevel scales sensibly across 6ft + 8ft tables).
    const inset = 0.12;
    if (w > 2 * inset && d > 2 * inset) {
      svg('rect', {
        x: -w/2 + inset, y: -d/2 + inset,
        width: w - 2 * inset, height: d - 2 * inset, rx: 0.03,
        fill: 'none', stroke: 'rgba(139,111,44,.3)',
        'stroke-width': SPR_TERTIARY, 'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // TENT — dashed canopy outline + perimeter frame legs. Every FPR
  // marquee is a free-span aluminium frame: legs at the corners and every
  // ≤10 ft bay along each edge, NEVER a centre pole (the product copy
  // sells "no centre pole to design around" — keep the drawing honest).
  // Optional per-item annotations:
  //   item.walls     4 chars, sides top/right/bottom/left in the item's
  //                  local (pre-rotation) frame: o=open, w=sidewall,
  //                  d=door/entrance
  //   item.clearance true → dashed stake/ballast band TENT_CLEARANCE_FT
  //                  outside the canopy (visual guidance only; capacity
  //                  math intentionally ignores it)
  function drawTentSprite(g, item, sz) {
    const hw = sz.w / 2, hd = sz.d / 2;
    // Clearance band first, under everything.
    if (item && item.clearance) {
      const c = TENT_CLEARANCE_FT;
      svg('rect', {
        x: -hw - c, y: -hd - c, width: sz.w + c * 2, height: sz.d + c * 2, rx: 1,
        fill: 'rgba(30,58,47,.03)', stroke: 'rgba(30,58,47,.30)',
        'stroke-width': SPR_TERTIARY, 'stroke-dasharray': '3 4',
        'vector-effect': SPR_NSS,
      }, g);
      svg('text', {
        x: 0, y: -hd - c + 1.1, 'text-anchor': 'middle',
        'font-size': 0.8, fill: 'rgba(30,58,47,.45)',
        'font-family': 'Jost, sans-serif', 'font-weight': '500',
      }, g).textContent = `${TENT_CLEARANCE_FT} ft stake/ballast zone`;
    }
    // Canopy outline (the classic dashed look).
    svg('rect', {
      x: -hw, y: -hd, width: sz.w, height: sz.d,
      fill: 'rgba(30,58,47,.04)', stroke: '#1E3A2F',
      'stroke-width': 1.5, 'stroke-dasharray': '4 3',
      'vector-effect': SPR_NSS,
    }, g);
    // Per-side sidewall / entrance annotations.
    const walls = (item && typeof item.walls === 'string' && /^[owd]{4}$/.test(item.walls))
      ? item.walls : null;
    if (walls) {
      // Sides wind clockwise: top(l→r), right(t→b), bottom(r→l), left(b→t)
      // so the inward normal is always the direction of travel rotated 90°.
      const S = [
        [{ x: -hw, y: -hd }, { x:  hw, y: -hd }],
        [{ x:  hw, y: -hd }, { x:  hw, y:  hd }],
        [{ x:  hw, y:  hd }, { x: -hw, y:  hd }],
        [{ x: -hw, y:  hd }, { x: -hw, y: -hd }],
      ];
      for (let i = 0; i < 4; i++) {
        if (walls[i] !== 'o') drawTentSide(g, S[i][0], S[i][1], walls[i]);
      }
    }
    // Frame legs last so they read on top of wall lines.
    const lp = 0.22;   // half leg size → ~0.45 ft square
    for (const p of tentLegPositions(sz)) {
      svg('rect', {
        x: p.x - lp, y: p.y - lp, width: lp * 2, height: lp * 2,
        fill: '#1E3A2F', 'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // Perimeter leg positions for a free-span frame tent: corners plus
  // evenly spaced legs so no bay exceeds 10 ft (matches the real fleet's
  // bay spacing — a 10×10 popup gets just its 4 corner legs).
  function tentLegPositions(sz) {
    const hw = sz.w / 2, hd = sz.d / 2;
    const pts = [];
    const seen = new Set();
    const add = (x, y) => {
      const k = x.toFixed(2) + ',' + y.toFixed(2);
      if (!seen.has(k)) { seen.add(k); pts.push({ x, y }); }
    };
    const nx = Math.max(1, Math.ceil(sz.w / 10));
    const ny = Math.max(1, Math.ceil(sz.d / 10));
    for (let i = 0; i <= nx; i++) {
      const x = -hw + (sz.w * i) / nx;
      add(x, -hd); add(x, hd);
    }
    for (let j = 0; j <= ny; j++) {
      const y = -hd + (sz.d * j) / ny;
      add(-hw, y); add(hw, y);
    }
    return pts;
  }

  // One tent side: 'w' = solid sidewall line just inside the canopy,
  // 'd' = sidewall with a centred ~4 ft opening + inward entrance chevron.
  function drawTentSide(g, a, b, kind) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) return;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const nx = -uy, ny = ux;   // inward normal (sides wind clockwise)
    const inset = 0.35;
    const ax = a.x + nx * inset, ay = a.y + ny * inset;
    const bx = b.x + nx * inset, by = b.y + ny * inset;
    const wall = (x1, y1, x2, y2) => svg('line', {
      x1, y1, x2, y2, stroke: '#1E3A2F', 'stroke-width': 2.5,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    if (kind === 'w') { wall(ax, ay, bx, by); return; }
    // Entrance: two wall stubs with a gap, plus an inward chevron.
    const gap = Math.min(4, len * 0.5);
    const half = (len - gap) / 2;
    wall(ax, ay, ax + ux * half, ay + uy * half);
    wall(bx, by, bx - ux * half, by - uy * half);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    svg('path', {
      d: `M ${mx - ux * (gap / 2 - 0.2)} ${my - uy * (gap / 2 - 0.2)}` +
         ` L ${mx + nx * 1.1} ${my + ny * 1.1}` +
         ` L ${mx + ux * (gap / 2 - 0.2)} ${my + uy * (gap / 2 - 0.2)}`,
      fill: 'none', stroke: '#1E3A2F', 'stroke-width': SPR_SECONDARY,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': SPR_NSS,
    }, g);
  }

  // PLANNING ITEMS (stage / bar / DJ booth / buffet run) — solid-ish
  // placeholders with an all-caps label. Not rentals (never priced), but
  // drawn more assertively than the dashed custom area so they read as
  // "something is here" in exports.
  function drawPlanningSprite(g, cat, sz) {
    svg('rect', {
      x: -sz.w / 2, y: -sz.d / 2, width: sz.w, height: sz.d, rx: 0.15,
      fill: '#eae6dc', stroke: CHAIR_STROKE,
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    if (cat.key === 'stage') {
      // Corner leg pads
      const px = sz.w / 2 - 0.5, py = sz.d / 2 - 0.5, s = 0.5;
      for (const [kx, ky] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        svg('rect', {
          x: kx * px - s / 2, y: ky * py - s / 2, width: s, height: s,
          fill: 'rgba(30,58,47,.22)', stroke: CHAIR_STROKE,
          'stroke-width': SPR_TERTIARY, 'vector-effect': SPR_NSS,
        }, g);
      }
    } else if (cat.key === 'bar') {
      // Counter line along the front edge + stools just outside it
      svg('line', {
        x1: -sz.w / 2 + 0.4, y1: sz.d / 2 - 0.7,
        x2:  sz.w / 2 - 0.4, y2: sz.d / 2 - 0.7,
        stroke: TABLE_STROKE, 'stroke-width': SPR_SECONDARY,
        'vector-effect': SPR_NSS,
      }, g);
      for (const fx of [-0.28, 0, 0.28]) {
        svg('circle', {
          cx: fx * sz.w, cy: sz.d / 2 + 0.6, r: 0.45,
          fill: '#fff', stroke: CHAIR_STROKE,
          'stroke-width': SPR_SECONDARY, 'vector-effect': SPR_NSS,
        }, g);
      }
    } else if (cat.key === 'dj-booth') {
      // Twin turntables + mixer between them, upper half
      const r = Math.min(sz.w, sz.d) * 0.16;
      const ty = -sz.d * 0.18;
      for (const fx of [-0.26, 0.26]) {
        svg('circle', {
          cx: fx * sz.w, cy: ty, r,
          fill: '#fff', stroke: CHAIR_STROKE,
          'stroke-width': SPR_SECONDARY, 'vector-effect': SPR_NSS,
        }, g);
      }
      svg('rect', {
        x: -r * 0.5, y: ty - r * 0.5, width: r, height: r,
        fill: 'rgba(30,58,47,.22)', stroke: CHAIR_STROKE,
        'stroke-width': SPR_TERTIARY, 'vector-effect': SPR_NSS,
      }, g);
    } else if (cat.key === 'buffet-run') {
      // Chafing dishes along the top edge
      const n = Math.max(2, Math.round(sz.w / 2.5));
      for (let i = 0; i < n; i++) {
        svg('circle', {
          cx: -sz.w / 2 + sz.w * ((i + 0.5) / n), cy: -sz.d / 2 + 0.65, r: 0.42,
          fill: '#fff', stroke: TABLE_STROKE,
          'stroke-width': SPR_SECONDARY, 'vector-effect': SPR_NSS,
        }, g);
      }
    }
    const label = cat.planningLabel || cat.label.toUpperCase();
    const fontFt = Math.max(0.6, Math.min(1.4, (sz.w * 0.8) / Math.max(3, label.length * 0.62)));
    svg('text', {
      x: 0, y: sz.d * 0.12, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-size': fontFt, fill: 'rgba(30,58,47,.8)',
      'font-family': 'Jost, sans-serif', 'font-weight': '600',
      'letter-spacing': fontFt * 0.08,
    }, g).textContent = label;
  }

  // BISTRO STRING LIGHTS — plan-view strand: shallow scallops with bulb
  // dots. A regular draggable/rotatable item so users can run it along a
  // tent ridge or eave; footprint matches the 20 ft strand we rent. Faint
  // fill rect gives the thin strand a grabbable hit area.
  function drawBistroLightsSprite(g, sz) {
    svg('rect', {
      x: -sz.w / 2, y: -sz.d / 2, width: sz.w, height: sz.d,
      fill: 'rgba(139,111,44,.05)', stroke: 'none',
    }, g);
    const seg = 5;
    const step = sz.w / seg;
    const sag = Math.min(0.8, sz.d * 0.4);
    let d = `M ${-sz.w / 2} 0`;
    for (let i = 0; i < seg; i++) d += ` q ${step / 2} ${sag} ${step} 0`;
    svg('path', {
      d, fill: 'none', stroke: TABLE_STROKE,
      'stroke-width': SPR_SECONDARY, 'stroke-dasharray': '3 2',
      'vector-effect': SPR_NSS,
    }, g);
    for (let i = 0; i <= seg; i++) {
      svg('circle', {
        cx: -sz.w / 2 + i * step, cy: 0, r: 0.22,
        fill: '#e7c46a', stroke: TABLE_STROKE,
        'stroke-width': SPR_TERTIARY, 'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // PROPANE HEATER — compact body + flame cue + dashed 3 ft clearance
  // ring (visual guidance only — capacity math and hit testing use the
  // 2×2 catalog footprint).
  function drawHeaterSprite(g, sz) {
    svg('circle', {
      cx: 0, cy: 0, r: 3,
      fill: 'none', stroke: 'rgba(196,90,40,.45)',
      'stroke-width': SPR_TERTIARY, 'stroke-dasharray': '4 3',
      'vector-effect': SPR_NSS,
    }, g);
    svg('rect', {
      x: -sz.w / 2, y: -sz.d / 2, width: sz.w, height: sz.d, rx: 0.3,
      fill: '#fff', stroke: '#c45a28',
      'stroke-width': SPR_PRIMARY, 'vector-effect': SPR_NSS,
    }, g);
    svg('path', {
      d: 'M 0 -0.45 C 0.3 -0.1 0.32 0.12 0 0.45 C -0.32 0.12 -0.3 -0.1 0 -0.45 Z',
      fill: 'rgba(196,90,40,.8)', stroke: 'none',
    }, g);
  }

  // SIDEWALL PANEL — thick wall segment with end ticks, laid along a tent
  // edge. Faint fill rect gives the thin bar a grabbable hit area.
  function drawSidewallSprite(g, sz) {
    svg('rect', {
      x: -sz.w / 2, y: -sz.d / 2, width: sz.w, height: sz.d,
      fill: 'rgba(30,58,47,.05)', stroke: 'none',
    }, g);
    svg('line', {
      x1: -sz.w / 2, y1: 0, x2: sz.w / 2, y2: 0,
      stroke: '#1E3A2F', 'stroke-width': 3,
      'stroke-linecap': 'round', 'vector-effect': SPR_NSS,
    }, g);
    for (const ex of [-sz.w / 2, sz.w / 2]) {
      svg('line', {
        x1: ex, y1: -sz.d / 2, x2: ex, y2: sz.d / 2,
        stroke: '#1E3A2F', 'stroke-width': SPR_PRIMARY,
        'vector-effect': SPR_NSS,
      }, g);
    }
  }

  // DANCE FLOOR — black/white 4×4 checker tiles.
  function drawDanceFloorSprite(g, sz) {
    const tiles = 4;
    const tw = sz.w / tiles, td = sz.d / tiles;
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
      svg('rect', {
        x: -sz.w/2 + i*tw, y: -sz.d/2 + j*td,
        width: tw, height: td,
        fill: ((i + j) % 2 === 0) ? '#1a1a1a' : '#fff',
      }, g);
    }
    svg('rect', {
      x: -sz.w/2, y: -sz.d/2, width: sz.w, height: sz.d,
      fill: 'none', stroke: '#1a1a1a',
      'stroke-width': 1, 'vector-effect': SPR_NSS,
    }, g);
  }

  // TEXT LABEL — pill with dashed outline + centered text.
  function drawTextLabelSprite(g, item, sz) {
    svg('rect', {
      x: -sz.w/2, y: -sz.d/2, width: sz.w, height: sz.d, rx: 0.25, ry: 0.25,
      fill: 'rgba(255,255,255,.85)', stroke: 'rgba(30,58,47,.35)',
      'stroke-width': 1, 'stroke-dasharray': '0.3 0.3',
      'vector-effect': SPR_NSS,
    }, g);
    svg('text', {
      x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': item.fontSize || 1.2,
      'font-family': 'Jost, sans-serif', 'font-weight': '600',
      fill: '#1E3A2F',
    }, g).textContent = item.text || 'Label';
  }

  // GENERIC fallback — for stages, bars, or any future shape that doesn't
  // have its own sprite. Uses the legacy CSS-driven styling.
  function drawGenericRectSprite(g, cat, sz) {
    svg('rect', {
      x: -sz.w/2, y: -sz.d/2, width: sz.w, height: sz.d,
      class: shapeClass(cat), 'vector-effect': SPR_NSS,
    }, g);
  }

  function drawItem(parent, item) {
    const cat = byKey[item.key];
    if (!cat) return;
    // effectiveSize handles per-item dims (text labels, custom areas) vs
    // catalog dims (everything else).
    const sz = effectiveSize(item);
    const cx = item.x + sz.w / 2;
    const cy = item.y + sz.d / 2;

    const g = svg('g', {
      class: 'pl-item-group',
      'data-id': item.id,
      transform: `translate(${cx}, ${cy}) rotate(${item.rotation || 0})`,
    }, parent);

    drawSprite(g, cat, item, sz);

    // Tent dimension label (drawn on top of the dashed rect).
    if (cat.shape === 'tent') {
      const fontFt = Math.min(sz.w, sz.d) * 0.08;
      svg('text', {
        x: 0, y: 0, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
        'font-size': fontFt, fill: 'rgba(30,58,47,.55)',
        'font-family': 'Jost, sans-serif', 'font-weight': '500',
      }, g).textContent = `${cat.widthFt}×${cat.depthFt}`;
    }

    drawTableNumberBadge(g, item);

    // Validation halo — red dashed ring around flagged items.
    if (_issues.flagged.has(item.id)) {
      svg('rect', {
        x: -sz.w / 2 - 0.2, y: -sz.d / 2 - 0.2,
        width: sz.w + 0.4, height: sz.d + 0.4,
        class: 'pl-issue-halo', 'vector-effect': 'non-scaling-stroke',
      }, g);
    }
  }

  // Numbered badge for seated tables (reading order; only with 2+ tables).
  // Counter-rotated so the number stays upright on rotated tables. Shared
  // by the live canvas and all exports.
  function drawTableNumberBadge(g, item) {
    const n = _tableNums.get(item.id);
    if (!n) return;
    const b = svg('g', { transform: `rotate(${-(item.rotation || 0)})`, 'pointer-events': 'none' }, g);
    svg('circle', {
      cx: 0, cy: 0, r: 0.8,
      fill: '#1E3A2F', stroke: '#fff', 'stroke-width': 1.2,
      'vector-effect': SPR_NSS, opacity: 0.92,
    }, b);
    svg('text', {
      x: 0, y: 0.06, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-size': 0.9, fill: '#fff',
      'font-family': 'Jost, sans-serif', 'font-weight': '600',
    }, b).textContent = String(n);
  }

  // Sidebar warnings panel. Hidden when the layout is clean; each row
  // click selects the offending items so they're easy to find.
  function renderValidation() {
    const host = document.getElementById('plValidation');
    if (!host) return;
    if (_issues.messages.length === 0) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = '<div class="pl-validation-title">Layout check</div>' +
      _issues.messages.map((m, i) =>
        `<button type="button" class="pl-validation-row" data-issue="${i}">${m.text}</button>`
      ).join('');
    host.querySelectorAll('.pl-validation-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = _issues.messages[parseInt(btn.dataset.issue, 10)];
        if (!m) return;
        setSelection(m.ids.filter(id => state.items.some(it => it.id === id)));
        render();
      });
    });
  }

  function drawSelection(parent, item, withHandle) {
    const cat = byKey[item.key];
    if (!cat) return;
    const sz = effectiveSize(item);
    const cx = item.x + sz.w / 2;
    const cy = item.y + sz.d / 2;

    const sel = svg('g', {
      transform: `translate(${cx}, ${cy}) rotate(${item.rotation || 0})`,
      'pointer-events': 'none',
    }, parent);

    const pad = 0.25;
    if (cat.shape === 'circle') {
      svg('circle', {
        cx: 0, cy: 0, r: sz.w / 2 + pad,
        class: 'pl-selection-halo', 'vector-effect': 'non-scaling-stroke',
      }, sel);
    } else {
      svg('rect', {
        x: -sz.w/2 - pad, y: -sz.d/2 - pad,
        width: sz.w + pad*2, height: sz.d + pad*2,
        class: 'pl-selection-halo', 'vector-effect': 'non-scaling-stroke',
      }, sel);
    }

    if (!withHandle) return;
    // Rotation handle: line from top of bbox to handle, then a knob
    const handleY = -sz.d/2 - ROTATE_HANDLE_OFFSET_FT;
    svg('line', {
      x1: 0, y1: -sz.d/2, x2: 0, y2: handleY,
      class: 'pl-rotate-line', 'vector-effect': 'non-scaling-stroke',
    }, sel);
    const knob = svg('circle', {
      cx: 0, cy: handleY, r: 0.5,
      class: 'pl-rotate-handle', 'vector-effect': 'non-scaling-stroke',
      'data-handle': 'rotate',
      'pointer-events': 'auto',
    }, sel);
    knob.style.cursor = 'grab';
    if (IS_COARSE_POINTER) {
      // Invisible oversized hit circle so a fingertip can grab the knob.
      svg('circle', {
        cx: 0, cy: handleY, r: 1.3,
        fill: 'transparent', stroke: 'none',
        'data-handle': 'rotate',
        'pointer-events': 'auto',
      }, sel);
    }

    // Corner resize handles — only for items that carry per-instance dims
    // (custom areas, text labels, and resizable planning items; catalog
    // rentals are real products with fixed footprints, so resizing them
    // would lie about what arrives on the truck). Drawn in the rotated
    // selection frame; the drag handler maps pointer deltas back into
    // this local frame.
    if (cat.shape === 'customArea' || cat.shape === 'text' || cat.resizable) {
      const hs = 0.45; // handle square size, ft
      const corners = [
        { c: 'nw', x: -sz.w/2 - pad, y: -sz.d/2 - pad },
        { c: 'ne', x:  sz.w/2 + pad, y: -sz.d/2 - pad },
        { c: 'se', x:  sz.w/2 + pad, y:  sz.d/2 + pad },
        { c: 'sw', x: -sz.w/2 - pad, y:  sz.d/2 + pad },
      ];
      for (const k of corners) {
        const h = svg('rect', {
          x: k.x - hs/2, y: k.y - hs/2, width: hs, height: hs,
          class: 'pl-resize-handle', 'vector-effect': 'non-scaling-stroke',
          'data-handle': 'resize', 'data-corner': k.c,
          'pointer-events': 'auto',
        }, sel);
        h.style.cursor = (k.c === 'nw' || k.c === 'se') ? 'nwse-resize' : 'nesw-resize';
        if (IS_COARSE_POINTER) {
          svg('rect', {
            x: k.x - 1.1, y: k.y - 1.1, width: 2.2, height: 2.2,
            fill: 'transparent', stroke: 'none',
            'data-handle': 'resize', 'data-corner': k.c,
            'pointer-events': 'auto',
          }, sel);
        }
      }
    }
  }

  // ── Guest list / seating assignments ──────────────────────────────────
  // Guests live in state.guests as { id, name, tableId|null } and ride
  // through every persistence surface (undo, autosave, .json, share URL).
  // Assignment is per-TABLE — robust to chair regeneration (chair children
  // are wholesale-replaced by the count stepper / type swap, so per-chair
  // ids would not survive). Within a table, list order = seat order, and
  // names render beside the table's chairs in that order. A tableId whose
  // table no longer exists is treated as unassigned everywhere but kept on
  // the guest (undo can resurrect the table, and the assignment with it).
  let showGuestNames = true;
  try { showGuestNames = localStorage.getItem('fpr-planner-guest-names') !== '0'; } catch (e) {}

  // Seated tables in stable display order with 1-based numbers. Reuses the
  // canvas numbering when it's active (2+ tables); a lone table is "Table 1".
  function tableDisplayList() {
    const tables = state.items.filter(_isSeatedTable);
    const center = (t) => {
      const sz = effectiveSize(t);
      return { x: t.x + sz.w / 2, y: t.y + sz.d / 2 };
    };
    tables.sort((a, b) => {
      const ca = center(a), cb = center(b);
      if (Math.abs(ca.y - cb.y) > 4) return ca.y - cb.y;
      return ca.x - cb.x;
    });
    return tables.map((t, i) => {
      const chairs = getChildren(t.id).filter(ch => byKey[ch.key] && byKey[ch.key].key.includes('chair'));
      const cat = byKey[t.key];
      const seats = chairs.length > 0 ? chairs.length
        : (t.chairCount != null ? t.chairCount : (cat && cat.seats) || 0);
      return {
        table: t,
        num: i + 1,
        seats,
        guests: state.guests.filter(g => g.tableId === t.id),
      };
    });
  }
  function unassignedGuests() {
    const tableIds = new Set(state.items.filter(_isSeatedTable).map(t => t.id));
    return state.guests.filter(g => !g.tableId || !tableIds.has(g.tableId));
  }

  // Accepts "Jane Doe" or a pasted "Jane, Raj, Mei-Ling" / newline list.
  function addGuestsFromText(text) {
    const names = String(text || '').split(/[,\n;]+/)
      .map(s => s.trim().slice(0, 60)).filter(Boolean);
    if (!names.length) return 0;
    commit();
    for (const name of names) state.guests.push({ id: newGuestId(), name, tableId: null });
    render();
    track('planner_guests_add', { count: names.length, total: state.guests.length });
    return names.length;
  }
  function assignGuest(guestId, tableId) {
    const g = state.guests.find(x => x.id === guestId);
    if (!g) return;
    commit();
    g.tableId = tableId || null;
    render();
  }
  function removeGuest(guestId) {
    const i = state.guests.findIndex(x => x.id === guestId);
    if (i === -1) return;
    commit();
    state.guests.splice(i, 1);
    render();
  }

  // Short display form: "Jane D." — long enough to recognize, short enough
  // to sit beside a chair without colliding with the neighbours.
  function guestShortName(name) {
    const parts = String(name).trim().split(/\s+/);
    return parts[0] + (parts[1] ? ' ' + parts[1][0].toUpperCase() + '.' : '');
  }

  // Canvas pass: names beside each assigned table's chairs (or around the
  // rim of a chairless table). Skipped when zoomed out far enough that the
  // text would be unreadable smudge (< 8 px/ft).
  function drawGuestNames(root) {
    if (!showGuestNames || state.guests.length === 0 || state.view.scale < 8) return;
    for (const row of tableDisplayList()) {
      if (!row.guests.length) continue;
      const t = row.table;
      const sz = effectiveSize(t);
      const cx = t.x + sz.w / 2, cy = t.y + sz.d / 2;
      const chairs = getChildren(t.id).filter(ch => byKey[ch.key] && byKey[ch.key].key.includes('chair'));
      row.guests.forEach((g, i) => {
        let px, py;
        if (chairs[i]) {
          const csz = effectiveSize(chairs[i]);
          const ccx = chairs[i].x + csz.w / 2, ccy = chairs[i].y + csz.d / 2;
          const len = Math.hypot(ccx - cx, ccy - cy) || 1;
          px = ccx + (ccx - cx) / len * 1.0;
          py = ccy + (ccy - cy) / len * 1.0;
        } else {
          // Chairless table: distribute around an ellipse just outside it.
          const ang = (i / Math.max(row.guests.length, 1)) * Math.PI * 2 - Math.PI / 2;
          px = cx + Math.cos(ang) * (sz.w / 2 + 1.4);
          py = cy + Math.sin(ang) * (sz.d / 2 + 1.4);
        }
        const txt = svg('text', {
          x: px, y: py,
          class: 'pl-guest-name',
          'text-anchor': 'middle',
          'font-size': 0.9,
          'pointer-events': 'none',
        }, root);
        txt.textContent = guestShortName(g.name);
      });
    }
  }

  // Sidebar panel — list grouped by table, with per-guest table <select>.
  // Rebuilt on every render; the add-input's value/focus is preserved
  // across rebuilds so background renders never eat a half-typed name.
  function renderGuestPanel() {
    const host = dom.guestPanel;
    if (!host) return;
    const addInput = host.querySelector('#plGuestAddInput');
    const hadFocus = addInput && document.activeElement === addInput;
    const pendingVal = addInput ? addInput.value : '';

    const rows = tableDisplayList();
    const unassigned = unassignedGuests();
    const total = state.guests.length;
    if (dom.guestSummary) {
      dom.guestSummary.textContent = total === 0
        ? 'Guest list'
        : `Guest list (${total}${unassigned.length ? ` · ${unassigned.length} unseated` : ''})`;
    }

    const tableOpts = (sel) => `<option value=""${!sel ? ' selected' : ''}>Unseated</option>` +
      rows.map(r => `<option value="${r.table.id}"${sel === r.table.id ? ' selected' : ''}>Table ${r.num}</option>`).join('');
    const guestRow = (g) => `
      <div class="pl-guest-row" data-guest="${g.id}">
        <span class="pl-guest-nm">${escapeHtml(g.name)}</span>
        <select class="pl-guest-table" aria-label="Table for ${escapeHtml(g.name)}">${tableOpts(g.tableId && rows.some(r => r.table.id === g.tableId) ? g.tableId : null)}</select>
        <button type="button" class="pl-guest-del" aria-label="Remove ${escapeHtml(g.name)}">×</button>
      </div>`;

    let html = `
      <div class="pl-guest-add">
        <input id="plGuestAddInput" type="text" maxlength="400" placeholder="Add names — commas for several"/>
        <button type="button" class="pl-btn pl-btn-small" id="plGuestAddBtn">Add</button>
      </div>`;
    if (total > 0) {
      for (const r of rows) {
        if (!r.guests.length) continue;
        const over = r.guests.length > r.seats && r.seats > 0;
        html += `<div class="pl-guest-group${over ? ' pl-guest-over' : ''}">Table ${r.num} — ${r.guests.length}/${r.seats}${over ? ' (not enough seats)' : ''}</div>`;
        html += r.guests.map(guestRow).join('');
      }
      if (unassigned.length) {
        html += `<div class="pl-guest-group">Unseated — ${unassigned.length}</div>`;
        html += unassigned.map(guestRow).join('');
      }
      html += `
        <label class="pl-guest-toggle">
          <input type="checkbox" id="plGuestShowNames"${showGuestNames ? ' checked' : ''}/>
          Show names on the layout
        </label>`;
    } else {
      html += `<div class="pl-guest-empty">Type names to build a seating plan — assign each guest to a table and the names appear beside their chairs.</div>`;
    }
    host.innerHTML = html;

    const input = host.querySelector('#plGuestAddInput');
    const addBtn = host.querySelector('#plGuestAddBtn');
    if (input) {
      input.value = pendingVal;
      if (hadFocus) { input.focus(); try { input.setSelectionRange(pendingVal.length, pendingVal.length); } catch (e) {} }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (addGuestsFromText(input.value)) {
            const fresh = dom.guestPanel.querySelector('#plGuestAddInput');
            if (fresh) { fresh.value = ''; fresh.focus(); }
          }
        }
      });
    }
    if (addBtn) addBtn.addEventListener('click', () => {
      const inp = host.querySelector('#plGuestAddInput');
      if (inp && addGuestsFromText(inp.value)) {
        const fresh = dom.guestPanel.querySelector('#plGuestAddInput');
        if (fresh) { fresh.value = ''; fresh.focus(); }
      }
    });
    host.querySelectorAll('.pl-guest-row').forEach(rowEl => {
      const gid = rowEl.dataset.guest;
      const sel = rowEl.querySelector('.pl-guest-table');
      if (sel) sel.addEventListener('change', () => assignGuest(gid, sel.value || null));
      const del = rowEl.querySelector('.pl-guest-del');
      if (del) del.addEventListener('click', () => removeGuest(gid));
    });
    const show = host.querySelector('#plGuestShowNames');
    if (show) show.addEventListener('change', () => {
      showGuestNames = show.checked;
      try { localStorage.setItem('fpr-planner-guest-names', showGuestNames ? '1' : '0'); } catch (e) {}
      render();
    });
  }

  // ── Stats / tally ─────────────────────────────────────────────────────
  // Shared by renderStats (sidebar) and savePDF (summary page) so the
  // capacity numbers can never drift between the two surfaces.
  function computePlanStats() {
    let seated = 0, tents = 0, tables = 0, chairs = 0, df = 0;
    let tentArea = 0, tableArea = 0, dfArea = 0;
    const counts = {};

    // Seats rule: a table WITH chairs seats its chairs (each chair = 1);
    // a chairless table seats its catalog capacity. Counting both would
    // double-count every set table.
    const tablesWithChairs = new Set();
    for (const it of state.items) {
      const cat = byKey[it.key];
      if (cat && cat.key && cat.key.includes('chair') && it.parentId) {
        tablesWithChairs.add(it.parentId);
      }
    }

    for (const it of state.items) {
      const cat = byKey[it.key];
      if (!cat) continue;
      // Skip text labels in counts/area math — they aren't billable items
      // and don't consume venue area for capacity calc.
      if (cat.shape === 'text') continue;
      counts[it.key] = (counts[it.key] || 0) + 1;
      const sz = itemSize(cat);
      const area = sz.w * sz.d;
      if (cat.shape === 'tent') { tents++; tentArea += area; }
      else if (cat.shape === 'danceFloor') { df++; dfArea += area; }
      else if (cat.shape === 'customArea') {
        // Custom areas (stage, buffet…) consume floor space the same way
        // tables do for the standing-capacity heuristic. Use the item's
        // own dims, not the catalog defaults.
        const esz = itemSize(it);
        tableArea += esz.w * esz.d;
      }
      else if (cat.shape === 'planning') {
        // Stage / bar / DJ / buffet placeholders consume floor space the
        // same way tables do for the standing-capacity heuristic.
        const psz = effectiveSize(it);
        tableArea += psz.w * psz.d;
      }
      else if (cat.shape === 'lighting' || cat.shape === 'sidewall' || cat.shape === 'heater') {
        // Overhead / perimeter / point items — no meaningful floor-space
        // impact on the capacity heuristic.
      }
      else if (cat.key && cat.key.includes('chair')) { chairs++; seated += (cat.seats || 0); }
      else if (cat.key && cat.key.includes('table')) {
        tables++;
        if (!tablesWithChairs.has(it.id)) seated += (cat.seats || 0);
        tableArea += area;
      }
    }
    // Standing capacity rule of thumb: 8 sqft per standing guest in covered space,
    // minus footprint already taken by tables and dance floors.
    const usableArea = Math.max(0, tentArea - tableArea - dfArea);
    const standing = Math.floor(usableArea / 8);
    return { seated, standing, tents, tables, chairs, df, tentArea, tableArea, dfArea, counts };
  }

  function renderStats() {
    const { seated, standing, tents, tentArea, dfArea, counts } = computePlanStats();

    dom.statSeated.textContent = seated;
    dom.statStanding.textContent = standing;

    // Density indicator — sq ft per seated guest (industry standards: 8 = tight
    // cocktail, 10–12 = comfortable banquet, 15+ = ceremony with aisle).
    // Only show when there's both a tent and seated guests; otherwise hide.
    const guestArea = Math.max(0, tentArea - dfArea);
    if (tents > 0 && seated > 0 && guestArea > 0) {
      const sqFtPerGuest = guestArea / seated;
      let cls, msg;
      if (sqFtPerGuest < 8)        { cls = 'pl-density-bad';  msg = 'overcrowded — add tent space or reduce guests'; }
      else if (sqFtPerGuest < 10)  { cls = 'pl-density-warn'; msg = 'tight — okay for cocktail-style mingling'; }
      else if (sqFtPerGuest < 15)  { cls = 'pl-density-ok';   msg = 'comfortable banquet seating'; }
      else                          { cls = 'pl-density-ok';   msg = 'roomy — great for ceremony or dance floor'; }
      dom.density.className = 'pl-density-wrap ' + cls;
      dom.density.innerHTML = `<strong>${sqFtPerGuest.toFixed(1)} sq ft/guest</strong> — ${msg}`;
      dom.density.hidden = false;
    } else {
      dom.density.hidden = true;
    }

    // Tally rows. Labels become links to the SKU page on the main site
    // when a catalog entry has a `sku` field — drives PageRank to those
    // pages and gives users a navigation surface from the planner.
    // target="_top" breaks out of any iframe (own hub or 3rd-party embedder).
    if (Object.keys(counts).length === 0) {
      dom.tally.innerHTML = '<div class="pl-tally-empty">No items added yet — drag from the left.</div>';
    } else {
      dom.tally.innerHTML = Object.entries(counts).map(([k, n]) => {
        const cat = byKey[k];
        if (!cat) return `<div class="pl-tally-row"><span>${k}</span><strong>×${n}</strong></div>`;
        const labelHtml = cat.sku
          ? `<a class="pl-tally-link" href="${SITE_URL}/product-${cat.sku}" target="_top" rel="noopener">${cat.label} <span class="pl-tally-arrow" aria-hidden="true">→</span></a>`
          : cat.label;
        return `<div class="pl-tally-row"><span>${labelHtml}</span><strong>×${n}</strong></div>`;
      }).join('');
    }
  }

  // ── Cost estimator ────────────────────────────────────────────────────
  // Single source of truth for line-item data. Used by renderQuote()
  // (display) and the form-submit handler (pre-fill of hidden fields), so
  // they can never drift.
  function buildLineItems() {
    const counts = {};
    for (const it of state.items) counts[it.key] = (counts[it.key] || 0) + 1;
    const lines = [];
    for (const key of Object.keys(counts)) {
      const cat = byKey[key];
      if (!cat) continue;
      // Skip non-billable items (text labels, future drawing/note types).
      if (!cat.priceCAD || cat.shape === 'text') continue;
      const qty = counts[key];
      const unitPrice = cat.priceCAD;
      const unit = cat.priceUnit;     // 'day' | 'event' | undefined
      let subtotal = 0;
      if (unit === 'day')   subtotal = qty * unitPrice * state.eventDays;
      if (unit === 'event') subtotal = qty * unitPrice;
      lines.push({ key, label: cat.label, qty, unitPrice, unit, subtotal });
    }
    // Sort: tents first (largest visual + highest price), then tables,
    // chairs, floors, then tent add-ons (lighting/heater/sidewall) last.
    const order = { tent: 0, danceFloor: 1, circle: 2, rect: 3, lighting: 4, heater: 4, sidewall: 4 };
    lines.sort((a, b) => {
      const oa = order[byKey[a.key].shape] ?? 9;
      const ob = order[byKey[b.key].shape] ?? 9;
      if (oa !== ob) return oa - ob;
      return b.subtotal - a.subtotal;
    });
    return lines;
  }

  function fmtMoney(n) {
    return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderQuote() {
    if (!dom.quoteLines) return;
    const lines = buildLineItems();

    if (lines.length === 0) {
      dom.quoteLines.innerHTML = '<div class="pl-quote-empty">Add items to see an estimate.</div>';
      dom.quoteTotals.innerHTML = '';
      updateTotalsPill(0);
      return;
    }

    dom.quoteLines.innerHTML = lines.map(l => {
      const meta = l.unit === 'day'
        ? `${l.qty}× $${l.unitPrice.toFixed(2)} per rental`
        : `${l.qty}× ${fmtMoney(l.unitPrice)}/event`;
      return `
        <div class="pl-quote-line">
          <div class="pl-quote-line-main">
            ${l.qty}× ${l.label} ${availabilityBadge(l)}
            <span class="pl-quote-line-meta">${meta}</span>
          </div>
          <div class="pl-quote-line-sub">${fmtMoney(l.subtotal)}</div>
        </div>`;
    }).join('');

    let perDay = 0, perEvent = 0;
    for (const l of lines) {
      if (l.unit === 'day')   perDay   += l.subtotal;
      if (l.unit === 'event') perEvent += l.subtotal;
    }
    const grand = perDay + perEvent;

    const rows = [];
    if (perDay > 0)   rows.push(`<div class="pl-quote-totals-row"><span>Tables, chairs &amp; add-ons</span><span>${fmtMoney(perDay)}</span></div>`);
    if (perEvent > 0) rows.push(`<div class="pl-quote-totals-row"><span>Tents &amp; dance floors</span><span>${fmtMoney(perEvent)}</span></div>`);
    rows.push(`<div class="pl-quote-totals-row pl-grand"><span>Estimated total</span><span>${fmtMoney(grand)}</span></div>`);
    dom.quoteTotals.innerHTML = rows.join('');
    updateTotalsPill(grand);
  }

  // ── Live availability (RentKit) ───────────────────────────────────────
  // Pick an event date → every placed (priced) item is checked against
  // RentKit's real stock for that date and the cost lines get badges.
  // Direct browser call — the embedded-shop API is public, orgId-keyed,
  // and serves CORS for our origin (verified). Whole feature is inside
  // .pl-cost-block, so partner lite-mode never shows FPR stock.
  const RENTKIT_AVAIL_URL = 'https://api.rentkit.com/api/embedded-shop/getAvailableInventoryForIds';
  const RENTKIT_ORG_ID = 'LvrymFxex6oslWCxcrEg';
  let rentkitMap = null;     // planner item key -> RentKit inventory id
  let availability = null;   // { date, byKey: {key: {ok, stock}} }
  let availCheckSeq = 0;

  async function loadRentkitMap() {
    if (rentkitMap) return rentkitMap;
    try {
      const res = await fetch('planner/rentkit-map.json', { cache: 'no-cache' });
      const data = await res.json();
      rentkitMap = {};
      for (const k in data) {
        if (k.startsWith('_') || typeof data[k] !== 'string') continue;
        rentkitMap[k] = data[k];
      }
    } catch (e) {
      rentkitMap = {};
    }
    return rentkitMap;
  }

  async function checkAvailability() {
    const input = document.getElementById('plEventDate');
    const status = document.getElementById('plAvailStatus');
    if (!input || !input.value) {
      availability = null;
      if (status) status.hidden = true;
      render();
      return;
    }
    const dateStr = input.value;
    const seq = ++availCheckSeq;
    const map = await loadRentkitMap();
    const counts = {};
    for (const it of state.items) {
      const cat = byKey[it.key];
      if (!cat || !cat.priceCAD) continue;
      counts[it.key] = (counts[it.key] || 0) + 1;
    }
    const idToKeys = {};
    const ids = [];
    for (const k of Object.keys(counts)) {
      const id = map[k];
      if (!id) continue;
      (idToKeys[id] = idToKeys[id] || []).push(k);
      if (ids.indexOf(id) === -1) ids.push(id);
    }
    if (ids.length === 0) {
      availability = null;
      if (status) {
        status.hidden = false;
        status.textContent = 'Add items to your layout to check their availability.';
      }
      return;
    }
    if (status) {
      status.hidden = false;
      status.textContent = 'Checking live availability…';
    }
    try {
      const res = await fetch(RENTKIT_AVAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: RENTKIT_ORG_ID,
          rentalDateStart: dateStr,
          rentalDateEnd: dateStr,
          inventoryIds: ids,
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      if (seq !== availCheckSeq) return; // superseded by a newer check
      const byKeyAvail = {};
      for (const row of (Array.isArray(rows) ? rows : [])) {
        for (const k of (idToKeys[row.id] || [])) {
          byKeyAvail[k] = {
            ok: row.isAvailable !== false,
            stock: Number.isFinite(row.availableStock) ? row.availableStock : null,
          };
        }
      }
      availability = { date: dateStr, byKey: byKeyAvail };
      const daysOut = Math.round((new Date(dateStr + 'T12:00:00') - Date.now()) / 86400000);
      track('planner_availability_check', {
        days_out: daysOut <= 14 ? '0-14' : daysOut <= 45 ? '15-45' : daysOut <= 120 ? '46-120' : '120+',
      });
      if (status) status.textContent = `Live availability for ${dateStr} shown on each line below.`;
      render();
    } catch (e) {
      if (seq !== availCheckSeq) return;
      availability = null;
      if (status) status.textContent = "Couldn't check availability right now — your quote will confirm it.";
      render();
    }
  }

  function availabilityBadge(line) {
    if (!availability) return '';
    const a = availability.byKey[line.key];
    if (!a) return '';
    if (!a.ok || (a.stock != null && a.stock <= 0)) {
      return '<span class="pl-avail-badge pl-avail-no">not available</span>';
    }
    if (a.stock != null && a.stock < line.qty) {
      return `<span class="pl-avail-badge pl-avail-low">only ${a.stock} left</span>`;
    }
    return '<span class="pl-avail-badge pl-avail-ok">available</span>';
  }

  // ── Book / Call conversion ────────────────────────────────────────────
  // Partner embeds never deep-link to FPR checkout. View-only share
  // recipients still can — that's the sales handoff.
  const CHECKOUT_PATH = '/checkout';
  const FPR_PHONE = '778-990-7983';

  function goCheckout() {
    const dest = location.origin + CHECKOUT_PATH;
    try {
      if (window.top && window.top !== window) window.top.location.href = dest;
      else location.href = dest;
    } catch (e) {
      location.href = dest;
    }
  }

  function shortStockWarnings(payload) {
    if (!availability || !availability.byKey) return [];
    const out = [];
    for (const line of payload.lines) {
      const a = availability.byKey[line.key];
      if (!a) continue;
      if (!a.ok || (a.stock != null && a.stock <= 0)) {
        out.push(`${line.label} — not available on that date`);
      } else if (a.stock != null && a.stock < line.qty) {
        out.push(`${line.label} — only ${a.stock} left (layout has ${line.qty})`);
      }
    }
    return out;
  }

  function showCartFallback(payload, dateStr) {
    const rows = payload.lines.map(l => `${l.qty} × ${l.label}`).concat(
      payload.skipped.map(s => `${s.qty} × ${s.label} — ${s.message}`)
    );
    const body = [
      dateStr ? `Event date: ${dateStr}` : '',
      rows.join('\n') || 'No rentable items on the canvas yet.',
      '',
      'The online cart couldn’t be filled automatically. Call and we’ll build the order from this list.',
    ].filter(Boolean).join('\n');
    plConfirm(body, { okLabel: 'Call ' + FPR_PHONE, cancelLabel: 'Request a quote' }).then(ok => {
      if (ok) callWithLayout();
      else openQuoteForm();
    });
  }

  async function ensureEventDate() {
    let dateStr = getEventDate();
    if (dateStr) return dateStr;
    const picked = await plPrompt('What date is the event?', minDateStr(), {
      okLabel: 'Continue',
      inputType: 'date',
    });
    if (!picked) return '';
    setEventDate(picked);
    checkAvailability();
    return picked;
  }

  let bookInFlight = false;
  async function bookThisLayout() {
    if (isExternalEmbed) return;
    if (bookInFlight) return;
    bookInFlight = true;
    try {
      if (!window.FPRPlannerCart) {
        showToast('Booking isn’t available right now — call ' + FPR_PHONE + '.', 4000);
        return;
      }
      if (!state.items.length) {
        showToast('Add items to the layout first — or tap Plan for me.', 4000);
        return;
      }
      const dateStr = await ensureEventDate();
      if (!dateStr) return;
      await checkAvailability();
      const map = await loadRentkitMap();
      const payload = window.FPRPlannerCart.buildAdelieCartPayload(state.items, byKey, map);
      const warnings = shortStockWarnings(payload);
      if (warnings.length) {
        const ok = await plConfirm(
          'Some items are short for ' + dateStr + ':\n\n' + warnings.join('\n') +
          '\n\nYou can still pay a deposit or call and we’ll sort it.',
          { okLabel: 'Continue to checkout', cancelLabel: 'Call instead' }
        );
        if (!ok) { callWithLayout(); return; }
      }
      if (!Object.keys(payload.cart).length) {
        track('planner_book_click', { outcome: 'fallback_empty', item_count: state.items.length });
        showCartFallback(payload, dateStr);
        return;
      }
      const wrote = window.FPRPlannerCart.writeAdelieCart(payload.cart, dateStr);
      if (!wrote.ok) {
        track('planner_book_click', { outcome: 'fallback_' + wrote.error, item_count: state.items.length });
        showCartFallback(payload, dateStr);
        return;
      }
      track('planner_book_click', {
        outcome: 'checkout',
        item_count: state.items.length,
        skipped: payload.skipped.length,
        total_bucket: totalBucket(buildLineItems().reduce((s, l) => s + l.subtotal, 0)),
      });
      if (payload.skipped.length) {
        showToast(payload.skipped.map(s => s.message).join(' '), 5000);
      }
      goCheckout();
    } finally {
      bookInFlight = false;
    }
  }

  async function callWithLayout() {
    track('planner_call_click', {
      guests: computePlanStats().seated,
      tent: (state.items.find(it => byKey[it.key] && byKey[it.key].shape === 'tent') || {}).key || 'none',
      total_bucket: totalBucket(buildLineItems().reduce((s, l) => s + l.subtotal, 0)),
    });
    try {
      const url = await requestShortUrl();
      if (url && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
        showToast('Layout link copied — mention it when we pick up.', 3500);
      }
    } catch (e) { /* call still works without the link */ }
  }

  function openQuoteForm() {
    const el = document.querySelector('.pl-quote-block');
    if (!el) return;
    if (dom.sidebar) {
      dom.sidebar.classList.add('pl-sheet-open');
      if (dom.scrim) dom.scrim.classList.add('pl-scrim-show');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = el.querySelector('input:not([type=hidden])');
    if (first) first.focus();
  }

  function addCocktailCluster(count) {
    const key = 'cocktail-table';
    if (!byKey[key] || !(count > 0)) return;
    const sz = itemSize(byKey[key]);
    const pitch = 5;
    const tents = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'tent');
    let x1 = 2, x2 = (state.venue && state.venue.widthFt) || 40, y1 = 4;
    if (tents.length) {
      x1 = Infinity; x2 = -Infinity; y1 = Infinity;
      for (const t of tents) {
        const pts = _itemCorners(t);
        for (const p of pts) {
          if (p.x < x1) x1 = p.x;
          if (p.x > x2) x2 = p.x;
          if (p.y < y1) y1 = p.y;
        }
      }
    }
    // Row along the entrance (short/top edge), sitting in the yard so
    // cocktail hour doesn't steal dining space under the canvas.
    const cy = Math.max(sz.d / 2 + 0.25, y1 - 1);
    const occupied = (cx, cy0) => state.items.some(it => {
      const cat = byKey[it.key];
      if (!cat || cat.shape === 'tent' || cat.shape === 'text') return false;
      const os = effectiveSize(it);
      const ocx = it.x + os.w / 2, ocy = it.y + os.d / 2;
      return Math.abs(ocx - cx) < (os.w + sz.w) / 2 + 1 && Math.abs(ocy - cy0) < (os.d + sz.d) / 2 + 1;
    });
    commit();
    const ids = [];
    let x = x1 + sz.w / 2 + 0.5;
    let row = 0;
    while (ids.length < count && row < 3) {
      const y = cy + row * pitch;
      if (x + sz.w / 2 > x2 + 0.5) {
        row++;
        x = x1 + sz.w / 2 + 0.5;
        continue;
      }
      if (!occupied(x, y) && y + sz.d / 2 <= ((state.venue && state.venue.depthFt) || 200) - 0.25) {
        const it = makeItem(key, x, y);
        if (it) {
          state.items.push(it);
          ids.push(it.id);
        }
      }
      x += pitch;
    }
    if (ids.length) setSelection(ids);
    render();
    showToast('Added ' + ids.length + ' cocktail highboys along the entrance — drag to tweak.', 4000);
  }

  function maybeOfferCocktailHour(guestCount, seating) {
    if (seating !== 'round' && seating !== 'banquet') return;
    if (state.items.some(it => it.key === 'cocktail-table' || it.key === 'cocktail-table-28')) return;
    const n = Math.max(4, Math.min(12, Math.round((guestCount || 50) / 12)));
    plConfirm(
      'Add cocktail hour? ' + n + ' highboys is typical for ' + guestCount + ' guests. Spandex covers can be added at checkout.',
      { okLabel: 'Add highboys', cancelLabel: 'No thanks' }
    ).then(ok => { if (ok) addCocktailCluster(n); });
  }

  // Floating phone pill: "56 seats · $1,432". Lite/partner mode shows
  // seats only (no FPR pricing on partner sites — same rule as the cost
  // panel it opens).
  function updateTotalsPill(grand) {
    if (!dom.totalsPill) return;
    const seated = computePlanStats().seated;
    const seatTxt = `${seated} seat${seated === 1 ? '' : 's'}`;
    dom.totalsPill.textContent = (isExternalEmbed || !(grand > 0))
      ? seatTxt
      : `${seatTxt} · ${fmtMoney(grand)}`;
  }

  // ── Pointer interactions ──────────────────────────────────────────────
  function findItemAt(target) {
    let el = target;
    while (el && el !== dom.svg) {
      if (el.classList && el.classList.contains('pl-item-group')) return el;
      el = el.parentNode;
    }
    return null;
  }

  // ── Marquee overlay + intersection ────────────────────────────────────
  function drawMarqueeRect(x1, y1, x2, y2) {
    if (!marqueeEl) return;
    const left = Math.min(x1, x2), top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    marqueeEl.style.left   = left + 'px';
    marqueeEl.style.top    = top + 'px';
    marqueeEl.style.width  = w + 'px';
    marqueeEl.style.height = h + 'px';
    marqueeEl.hidden = false;
  }
  function hideMarqueeRect() {
    if (marqueeEl) marqueeEl.hidden = true;
  }
  // Returns ids of items whose axis-aligned bounding box (in WORLD coords,
  // ignoring rotation — adequate for selection intent) overlaps the
  // marquee rectangle (specified in canvas-relative pixel coords).
  function itemsIntersectingMarquee(cx1, cy1, cx2, cy2) {
    // Convert canvas-relative → world coords using inverse of the view
    // transform: world = (canvas - pan) / scale.
    const s = state.view.scale;
    const wx1 = (Math.min(cx1, cx2) - state.view.panX) / s;
    const wy1 = (Math.min(cy1, cy2) - state.view.panY) / s;
    const wx2 = (Math.max(cx1, cx2) - state.view.panX) / s;
    const wy2 = (Math.max(cy1, cy2) - state.view.panY) / s;
    const hits = [];
    for (const it of state.items) {
      const cat = byKey[it.key];
      if (!cat) continue;
      const sz = effectiveSize(it);
      // AABB of an item ignoring its own rotation. Slightly forgiving
      // (rotated items can poke outside this box) but it's the standard
      // marquee-select approximation and matches user expectations.
      const ix1 = it.x, iy1 = it.y;
      const ix2 = it.x + sz.w, iy2 = it.y + sz.d;
      if (ix2 < wx1 || ix1 > wx2 || iy2 < wy1 || iy1 > wy2) continue;
      hits.push(it.id);
    }
    return hits;
  }

  // ── Inspector (chair-count stepper) ───────────────────────────────────
  // Shown only when exactly one seated rect/circle table is selected.
  // Lets the user adjust how many chairs auto-place around it. Regenerates
  // children (with parentId) on change.
  function renderInspector() {
    const host = dom.inspector;
    if (!host) return;
    const item = firstSelected();
    const cat = item ? byKey[item.key] : null;
    const isSeatedTable = !!(cat && (cat.shape === 'circle' || cat.shape === 'rect') && cat.seats > 1 && !cat.key.includes('chair'));
    const isCustomArea = !!(cat && cat.shape === 'customArea');
    // Resizable planning items (stage, bar, DJ, buffet) share the custom-
    // area size panel — same per-item dims machinery, no name field.
    const isResizableArea = isCustomArea || !!(cat && cat.resizable);
    if (!item || (!isSeatedTable && !isResizableArea)) { host.hidden = true; return; }

    if (isResizableArea) {
      const sz = effectiveSize(item);
      host.hidden = false;
      const nameRow = isCustomArea ? `
        <div class="pl-inspector-row">
          <label class="pl-inspector-label" for="plInspAreaName">Name</label>
          <input class="pl-inspector-text" id="plInspAreaName" type="text" maxlength="40" value="${String(item.text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"/>
        </div>` : '';
      const hint = isCustomArea
        ? 'Stages, buffet runs, gift tables, pools — anything your layout flows around that isn\'t a rental item.'
        : `Not a rental item — a resizable placeholder so your layout flows around the ${cat.label.toLowerCase()}.`;
      host.innerHTML = `
        <div class="pl-inspector-title">${isCustomArea ? 'Custom Area' : cat.label}</div>
        ${nameRow}
        <div class="pl-inspector-row">
          <label class="pl-inspector-label" for="plInspAreaW">Size (ft)</label>
          <div class="pl-inspector-dims">
            <input class="pl-inspector-text" id="plInspAreaW" type="number" min="1" max="200" step="0.5" value="${sz.w}"/>
            <span class="pl-x">×</span>
            <input class="pl-inspector-text" id="plInspAreaD" type="number" min="1" max="200" step="0.5" value="${sz.d}"/>
          </div>
        </div>
        <button type="button" class="pl-inspector-btn" id="plInspAreaSave">Save as my default size</button>
        <div class="pl-inspector-hint">${hint}</div>
      `;
      const nameInp = host.querySelector('#plInspAreaName');
      if (nameInp) nameInp.addEventListener('change', () => {
        commit();
        item.text = nameInp.value.trim() || 'Custom area';
        render();
      });
      const wInp = host.querySelector('#plInspAreaW');
      const dInp = host.querySelector('#plInspAreaD');
      const applySize = () => {
        const w = parseFloat(wInp.value), d = parseFloat(dInp.value);
        if (!(w > 0) || !(d > 0)) return;
        commit();
        // Resize around the item's centre so it doesn't appear to jump.
        const cur = itemSize(item);
        item.x += (cur.w - w) / 2;
        item.y += (cur.d - d) / 2;
        item.widthFt = w;
        item.depthFt = d;
        render();
      };
      wInp.addEventListener('change', applySize);
      dInp.addEventListener('change', applySize);
      host.querySelector('#plInspAreaSave').addEventListener('click', () => {
        const cur = itemSize(item);
        customDims[item.key] = { widthFt: cur.w, depthFt: cur.d };
        saveCustomDims();
        showToast(`Saved — new custom areas start at ${cur.w}×${cur.d} ft`, 2600);
      });
      return;
    }
    const children = getChildren(item.id);
    // Source of truth for current chair count: explicit chairCount if the
    // user has set one, else the count of children currently around the
    // table. Drop time: children.length === cat.seats. Shift-drop: 0.
    const current = (item.chairCount != null) ? item.chairCount : children.length;

    // Tables eligible for the swap dropdown — seated tables only (rounds
    // and banquets), cocktails excluded. Sorted by catalog order so the
    // dropdown reads sensibly (5ft round, 6ft banquet, 8ft banquet).
    const tableOptions = [];
    for (const g of catalog.groups) {
      for (const t of g.items) {
        if ((t.shape === 'circle' || t.shape === 'rect') && t.seats > 1 && !t.key.includes('chair')) {
          tableOptions.push(t);
        }
      }
    }
    // Chair options — anything in the catalog that's a chair.
    const chairOptions = [];
    for (const g of catalog.groups) {
      for (const c of g.items) {
        if (c.key && c.key.includes('chair')) chairOptions.push(c);
      }
    }
    // What chair type is currently around this table? Read from the
    // existing children if any, else fall back to item.chairKey, else default.
    const currentChairKey = (children.length > 0 ? children[0].key : null)
      || item.chairKey
      || DEFAULT_CHAIR_KEY;

    const tableOptHtml = tableOptions.map(t =>
      `<option value="${t.key}"${t.key === item.key ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    const chairOptHtml = chairOptions.map(c =>
      `<option value="${c.key}"${c.key === currentChairKey ? ' selected' : ''}>${c.label}${isExternalEmbed ? '' : ` ($${c.priceCAD.toFixed(2)})`}</option>`
    ).join('');

    host.hidden = false;
    host.innerHTML = `
      <div class="pl-inspector-title">${cat.label}</div>
      <div class="pl-inspector-row">
        <label class="pl-inspector-label" for="plInspTable">Table</label>
        <select class="pl-inspector-select" id="plInspTable">${tableOptHtml}</select>
      </div>
      <div class="pl-inspector-row">
        <label class="pl-inspector-label" for="plInspChair">Chair type</label>
        <select class="pl-inspector-select" id="plInspChair">${chairOptHtml}</select>
      </div>
      <div class="pl-inspector-row">
        <label class="pl-inspector-label">Chairs</label>
        <div class="pl-stepper">
          <button type="button" class="pl-stepper-btn" data-step="-1" aria-label="Fewer chairs">−</button>
          <span class="pl-stepper-val">${current}</span>
          <button type="button" class="pl-stepper-btn" data-step="+1" aria-label="More chairs">+</button>
        </div>
      </div>
      <div class="pl-inspector-hint">Default ${cat.seats} for this table. Decreasing removes end chairs first; drag a chair to reposition it individually.</div>
    `;
    host.querySelectorAll('.pl-stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.step, 10) || 0;
        setChairCount(item.id, Math.max(0, Math.min(20, current + delta)));
      });
    });
    const tSel = host.querySelector('#plInspTable');
    if (tSel) tSel.addEventListener('change', () => setTableType(item.id, tSel.value));
    const cSel = host.querySelector('#plInspChair');
    if (cSel) cSel.addEventListener('change', () => setChairType(item.id, cSel.value));
  }

  // Resolve which chair to use for a given table — explicit per-table
  // override on item.chairKey, else any existing child's key, else default.
  function chairKeyForTable(table) {
    if (table.chairKey && byKey[table.chairKey]) return table.chairKey;
    const ch = state.items.find(it => it.parentId === table.id);
    if (ch && byKey[ch.key]) return ch.key;
    return DEFAULT_CHAIR_KEY;
  }

  function setChairCount(tableId, n) {
    const table = state.items.find(it => it.id === tableId);
    if (!table) return;
    const cat = byKey[table.key];
    if (!cat) return;
    commit();
    table.chairCount = n;
    const chairKey = chairKeyForTable(table);
    state.items = state.items.filter(it => it.parentId !== tableId);
    if (n > 0) {
      const chairs = placeChairsAround(table, chairKey, n);
      state.items.push(...chairs);
    }
    render();
  }

  // Swap chair type around a single table. Preserves count.
  function setChairType(tableId, chairKey) {
    const table = state.items.find(it => it.id === tableId);
    if (!table || !byKey[chairKey]) return;
    const children = getChildren(tableId);
    const count = (table.chairCount != null) ? table.chairCount : children.length;
    commit();
    table.chairKey = chairKey;
    state.items = state.items.filter(it => it.parentId !== tableId);
    if (count > 0) {
      const chairs = placeChairsAround(table, chairKey, count);
      state.items.push(...chairs);
    }
    render();
  }

  // Swap a table to a different table type (e.g. 5ft round → 6ft banquet).
  // Preserves the table's center position and orientation; regenerates
  // chairs (chair-count unchanged unless the new table type's default is
  // smaller and we're at the old default — in that case follow the new
  // default to avoid awkwardly tight rendering).
  function setTableType(tableId, newKey) {
    const table = state.items.find(it => it.id === tableId);
    const newCat = byKey[newKey];
    const oldCat = byKey[table.key];
    if (!table || !newCat || !oldCat) return;
    if (newKey === table.key) return;
    commit();
    // Center stays fixed; recompute top-left from new size.
    const oldSz = itemSize(oldCat);
    const newSz = itemSize(newCat);
    const cx = table.x + oldSz.w / 2, cy = table.y + oldSz.d / 2;
    table.key = newKey;
    table.x = cx - newSz.w / 2;
    table.y = cy - newSz.d / 2;
    // Resolve chair count: if user hadn't customized (chairCount unset)
    // and the old children count equals the OLD catalog default, snap to
    // NEW catalog default; otherwise preserve the explicit count.
    const children = getChildren(tableId);
    const wasExplicit = table.chairCount != null;
    const oldDefault = oldCat.seats || 0;
    const newDefault = newCat.seats || 0;
    let nextCount;
    if (wasExplicit) {
      nextCount = table.chairCount;
    } else if (children.length === oldDefault) {
      nextCount = newDefault;
    } else {
      nextCount = children.length;
    }
    const chairKey = chairKeyForTable(table);
    state.items = state.items.filter(it => it.parentId !== tableId);
    if (nextCount > 0) {
      const chairs = placeChairsAround(table, chairKey, nextCount);
      state.items.push(...chairs);
    }
    render();
  }

  function setupCanvasInteractions() {
    let panning = null;        // { startX, startY, panStartX, panStartY }
    let moving = null;         // { ids:Set<id>, startWX, startWY, starts:Map<id,{x,y}> }
    let rotating = null;       // { id, cx, cy, startAngle, itemStartRotation }
    let resizing = null;       // { id, corner, cx, cy, rot, startW, startD, startFs } — custom-area / label corner drag
    let marquee = null;        // { startCX, startCY, additive, didDrag, prevSelection }
    let pendingClick = null;   // { id, additive } — set on item-down to defer toggle to up if no drag occurred
    let backdropDrag = null;   // { startWX, startWY, startBX, startBY } — backdrop translate
    let vertexDrag = null;     // { idx, startWX, startWY, startVX, startVY } — polygon vertex drag

    // ── Touch gestures ────────────────────────────────────────────────
    // activePointers tracks every pointer currently down on the SVG so a
    // second finger can flip us into pinch-zoom mid-gesture. `pinch`
    // carries the running distance + midpoint between move frames.
    // Long-press (500ms, <8px travel) synthesizes the right-click menu.
    const activePointers = new Map();
    let pinch = null;          // { dPrev, midPrev }
    let longPressTimer = null;
    let longPressStart = null; // { x, y, target }
    const clearLongPress = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    };
    // Abandon any in-flight drag, restoring item positions. If the drag
    // had already moved (commit ran on first movement) the restore leaves
    // one no-op undo entry — harmless. Pre-movement cancels leave no trace.
    const cancelGestures = () => {
      if (moving) {
        for (const it of state.items) {
          const start = moving.starts.get(it.id);
          if (start) { it.x = start.x; it.y = start.y; }
        }
      }
      moving = null; rotating = null; resizing = null; panning = null; marquee = null; pendingClick = null;
      backdropDrag = null; vertexDrag = null;
      activeGuides = []; activeDims = [];
      hideMarqueeRect();
      dom.canvas.classList.remove('pl-panning');
      dom.canvas.classList.remove('pl-marqueeing');
    };

    // Pointerdown on the SVG: dispatches to rotation handle, item drag,
    // marquee select, or pan.
    dom.svg.addEventListener('pointerdown', e => {
      // Right-click → ignore (browser context menu)
      if (e.button !== 0 && e.button !== 1) return;

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType === 'touch') {
        // Capture on the SVG itself (never re-rendered away) so
        // pointerup/pointercancel always reach our listeners — otherwise a
        // finger lifted outside leaves pinch/long-press state stuck.
        try { dom.svg.setPointerCapture(e.pointerId); } catch (err) { /* already captured */ }
      }
      if (e.pointerType === 'touch' && activePointers.size === 2) {
        // Second finger lands: abandon the one-finger gesture, start pinch.
        clearLongPress();
        cancelGestures();
        const pts = Array.from(activePointers.values());
        pinch = {
          dPrev: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          midPrev: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        };
        render();
        e.preventDefault();
        return;
      }
      if (pinch) { e.preventDefault(); return; } // 3rd+ finger: ignore
      if (e.pointerType === 'touch' && !isReadonly &&
          !drawingPolygon && !calibrating && !measureMode) {
        clearLongPress();
        longPressStart = { x: e.clientX, y: e.clientY, target: e.target };
        longPressTimer = setTimeout(() => {
          if (!longPressStart) return;
          const at = longPressStart;
          clearLongPress();
          cancelGestures();
          contextMenuTouchGuardUntil = performance.now() + 400;
          openContextMenuAt(at.x, at.y, at.target);
        }, 500);
      }

      // Read-only mode: only allow pan — Space+drag, middle, Alt+drag,
      // and ANY touch drag (a phone viewer has no modifier keys, so touch
      // IS the pan gesture); suppress all editing pointerdown paths.
      if (isReadonly) {
        const wantsPan = e.button === 1 || spaceDown || e.altKey || e.pointerType === 'touch';
        if (!wantsPan) return;
        if (e.pointerType === 'touch') {
          e.preventDefault();
          panning = {
            startX: e.clientX, startY: e.clientY,
            panStartX: state.view.panX, panStartY: state.view.panY,
          };
          dom.canvas.classList.add('pl-panning');
          dom.svg.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Polygon-draw mode: every left-click adds a vertex (or closes if
      // it's near the first vertex with at least 3 already placed).
      if (drawingPolygon && e.button === 0) {
        e.preventDefault();
        const w = clientToWorld(e.clientX, e.clientY);
        if (isClickOnFirstVertex(w)) {
          finishDrawPolygon();
        } else {
          addPolygonVertex(w);
        }
        return;
      }

      // Polygon vertex handle (post-commit reshape): start a vertex drag.
      if (e.target.dataset && e.target.dataset.handle === 'poly-vertex') {
        e.preventDefault();
        const idx = parseInt(e.target.dataset.vertexIndex, 10);
        const v = state.venue.polygon && state.venue.polygon[idx];
        if (!v) return;
        const w = clientToWorld(e.clientX, e.clientY);
        vertexDrag = { idx, startWX: w.x, startWY: w.y, startVX: v.x, startVY: v.y };
        commit();
        dom.svg.setPointerCapture(e.pointerId);
        return;
      }

      // Calibration mode consumes left-clicks for the two scale points.
      if (calibrating && e.button === 0) {
        e.preventDefault();
        const w = clientToWorld(e.clientX, e.clientY);
        onCalibrationClick(w);
        return;
      }

      // Measure mode consumes left-clicks for distance measurements.
      if (measureMode && e.button === 0) {
        e.preventDefault();
        const w = clientToWorld(e.clientX, e.clientY);
        onMeasureClick(w);
        return;
      }

      // Backdrop edit mode: left-drag on the backdrop image translates it.
      // Drags elsewhere fall through to normal canvas behavior.
      if (backdropEditMode && hasBackdrop() && e.button === 0 && e.target && e.target.dataset && e.target.dataset.backdrop === '1') {
        e.preventDefault();
        const w = clientToWorld(e.clientX, e.clientY);
        const b = state.venue.backdrop;
        backdropDrag = {
          startWX: w.x, startWY: w.y,
          startBX: b.x, startBY: b.y,
        };
        commit();
        dom.svg.setPointerCapture(e.pointerId);
        return;
      }

      // Resize handle? (custom areas + text labels — single selection only)
      if (e.target.dataset && e.target.dataset.handle === 'resize') {
        e.preventDefault();
        const item = firstSelected();
        if (!item) return;
        const sz = effectiveSize(item);
        resizing = {
          id: item.id,
          corner: e.target.dataset.corner,
          cx: item.x + sz.w / 2,
          cy: item.y + sz.d / 2,
          rot: (item.rotation || 0) * Math.PI / 180,
          startW: sz.w,
          startD: sz.d,
          startFs: item.fontSize || 1.2,
          // Magnetic snap for the dragged corner point.
          snapIndex: buildSnapIndex(new Set([item.id])),
        };
        commit();
        dom.svg.setPointerCapture(e.pointerId);
        return;
      }

      // Rotation handle?
      if (e.target.dataset && e.target.dataset.handle === 'rotate') {
        e.preventDefault();
        const item = firstSelected();
        if (!item) return;
        const sz = effectiveSize(item);
        const cx = item.x + sz.w / 2, cy = item.y + sz.d / 2;
        const w = clientToWorld(e.clientX, e.clientY);
        const startAngle = Math.atan2(w.y - cy, w.x - cx) * 180 / Math.PI;
        rotating = { id: item.id, cx, cy, startAngle, itemStartRotation: item.rotation || 0 };
        commit();
        dom.svg.setPointerCapture(e.pointerId);
        return;
      }

      // Pan modifiers — Space+drag, middle-button drag, or Alt+drag — pan
      // anywhere on the canvas regardless of what's beneath the cursor.
      const wantsPan = e.button === 1 || spaceDown || e.altKey;

      const itemEl = findItemAt(e.target);
      if (itemEl && e.button === 0 && !wantsPan) {
        e.preventDefault();
        const id = itemEl.dataset.id;
        const item = state.items.find(it => it.id === id);
        if (!item) return;

        const additive = e.shiftKey;
        const alreadySelected = isSelected(id);

        // Selection rules:
        //   - Shift+click on selected item: defer to pointerup; if no drag,
        //     toggle off. (Otherwise dragging would feel like it un-selected
        //     the very item you're trying to drag.)
        //   - Shift+click on un-selected item: add to selection, drag the
        //     full multi-selection.
        //   - Plain click on selected item (multi-sel): keep selection,
        //     drag the whole group.
        //   - Plain click on un-selected item: select just it, drag it.
        if (additive && alreadySelected) {
          pendingClick = { id, additive: true };
        } else if (additive && !alreadySelected) {
          state.selectedIds.push(id);
        } else if (!additive && !alreadySelected) {
          setSelection([id]);
        }
        // else: plain click on already-selected → no selection change

        // Build the moving set: every selected item + every child whose
        // parent is selected (so chairs follow their table).
        const idsToMove = expandWithChildren(state.selectedIds);
        const w = clientToWorld(e.clientX, e.clientY);
        const starts = new Map();
        for (const it of state.items) {
          if (idsToMove.has(it.id)) starts.set(it.id, { x: it.x, y: it.y });
        }
        // Snapshot now, commit lazily on first real movement — plain
        // click-to-select must not burn an undo step.
        moving = { ids: idsToMove, startWX: w.x, startWY: w.y, starts, didDrag: false, pendingSnap: snapshot() };
        // Magnetic-snap context: candidate index built once per gesture
        // (static items don't move mid-drag) + the moving set's AABB.
        moving.snapIndex = buildSnapIndex(idsToMove);
        moving.startBox = _groupAabb(idsToMove);
        dom.svg.setPointerCapture(e.pointerId);
        // Bring touched items to top of z-order so they paint above peers
        // during the drag (purely cosmetic — render order is shape-grouped).
        const lifted = state.items.filter(it => idsToMove.has(it.id));
        state.items = state.items.filter(it => !idsToMove.has(it.id));
        state.items.push(...lifted);
        render();
        return;
      }

      // Empty canvas (or modifier wants pan):
      if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        if (wantsPan) {
          panning = {
            startX: e.clientX, startY: e.clientY,
            panStartX: state.view.panX, panStartY: state.view.panY,
          };
          dom.canvas.classList.add('pl-panning');
          dom.svg.setPointerCapture(e.pointerId);
          return;
        }
        // Plain left-drag on empty canvas → start marquee selection.
        const r = dom.canvas.getBoundingClientRect();
        marquee = {
          startCX: e.clientX - r.left,
          startCY: e.clientY - r.top,
          additive: e.shiftKey,
          didDrag: false,
          prevSelection: state.selectedIds.slice(),
        };
        dom.canvas.classList.add('pl-marqueeing');
        dom.svg.setPointerCapture(e.pointerId);
      }
    });

    dom.svg.addEventListener('pointermove', e => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinch && activePointers.size >= 2) {
        const pts = Array.from(activePointers.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        // Two-finger pan via midpoint delta, then cursor-anchored zoom via
        // distance ratio. zoomAt() renders, so this is one render per frame.
        state.view.panX += mid.x - pinch.midPrev.x;
        state.view.panY += mid.y - pinch.midPrev.y;
        if (pinch.dPrev > 0 && d > 0) zoomAt(mid.x, mid.y, d / pinch.dPrev);
        else render();
        pinch.dPrev = d;
        pinch.midPrev = mid;
        return;
      }
      if (longPressStart) {
        const travel = Math.abs(e.clientX - longPressStart.x) + Math.abs(e.clientY - longPressStart.y);
        if (travel > 8) clearLongPress();
      }
      // Measure-mode cursor preview — track the mouse so the in-progress
      // segment label updates live.
      if (measureMode && measureFirstPoint) {
        measureCursor = clientToWorld(e.clientX, e.clientY);
        render();
        return;
      }
      // Drawing-mode cursor preview — track the mouse so the live preview
      // line follows. Throttled implicitly by SVG re-render cost.
      if (drawingPolygon) {
        const w = clientToWorld(e.clientX, e.clientY);
        drawingPolygon.cursor = w;
        render();
        return;
      }
      if (vertexDrag && isPolygonVenue()) {
        const w = clientToWorld(e.clientX, e.clientY);
        const dx = w.x - vertexDrag.startWX;
        const dy = w.y - vertexDrag.startWY;
        const v = state.venue.polygon[vertexDrag.idx];
        v.x = vertexDrag.startVX + dx;
        v.y = vertexDrag.startVY + dy;
        // Snap to 0.25 ft when shift held (consistent with item-move snap).
        if (e.shiftKey) {
          v.x = Math.round(v.x * 4) / 4;
          v.y = Math.round(v.y * 4) / 4;
        }
        render();
        return;
      }
      if (backdropDrag && hasBackdrop()) {
        const w = clientToWorld(e.clientX, e.clientY);
        const dx = w.x - backdropDrag.startWX;
        const dy = w.y - backdropDrag.startWY;
        state.venue.backdrop.x = backdropDrag.startBX + dx;
        state.venue.backdrop.y = backdropDrag.startBY + dy;
        render();
        return;
      }
      if (resizing) {
        const item = state.items.find(it => it.id === resizing.id);
        if (!item) return;
        const cat = byKey[item.key];
        if (!cat) return;
        const w = clientToWorld(e.clientX, e.clientY);
        // Magnetic snap for the dragged CORNER point — snapping the world-
        // frame corner works for rotated items too, since the corner is
        // what visually aligns with neighbors.
        activeGuides = []; activeDims = [];
        if (snapEnabled && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && resizing.snapIndex) {
          const thr = SNAP_PX / state.view.scale;
          const hx = _nearestSnap(resizing.snapIndex.xs, w.x, thr);
          const hy = _nearestSnap(resizing.snapIndex.ys, w.y, thr);
          if (hx) {
            w.x = hx.c.v;
            activeGuides.push({ axis: 'v', at: hx.c.v, from: Math.min(w.y, hx.c.lo), to: Math.max(w.y, hx.c.hi) });
          }
          if (hy) {
            w.y = hy.c.v;
            activeGuides.push({ axis: 'h', at: hy.c.v, from: Math.min(w.x, hy.c.lo), to: Math.max(w.x, hy.c.hi) });
          }
        }
        // Pointer position in the item's LOCAL frame (origin = item center
        // at drag start, axes rotated with the item).
        const cos = Math.cos(-resizing.rot), sin = Math.sin(-resizing.rot);
        const dx = w.x - resizing.cx, dy = w.y - resizing.cy;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        // The dragged corner's sign pair; the OPPOSITE corner stays fixed.
        const sx = resizing.corner.includes('e') ? 1 : -1;
        const sy = resizing.corner.includes('s') ? 1 : -1;
        const ox = -sx * resizing.startW / 2;  // opposite corner, local
        const oy = -sy * resizing.startD / 2;

        let newW, newD;
        if (cat.shape === 'text') {
          // Labels scale uniformly via fontSize; bbox follows the text metrics.
          const startDiag = Math.hypot(resizing.startW, resizing.startD) || 1;
          const k = Math.hypot(lx - ox, ly - oy) / startDiag;
          const fs = Math.max(0.5, Math.min(6, resizing.startFs * k));
          item.fontSize = fs;
          const szL = approximateLabelSize(item.text, fs);
          newW = szL.widthFt; newD = szL.depthFt;
          item.widthFt = newW; item.depthFt = newD;
        } else {
          newW = Math.abs(lx - ox);
          newD = Math.abs(ly - oy);
          // Shift = snap dims to 0.5 ft (sibling of the move/rotate snaps).
          if (e.shiftKey) {
            newW = Math.round(newW * 2) / 2;
            newD = Math.round(newD * 2) / 2;
          }
          newW = Math.max(1, Math.min(200, newW));
          newD = Math.max(1, Math.min(200, newD));
          item.widthFt = newW; item.depthFt = newD;
        }
        // New center: midpoint of fixed corner → dragged corner, in local
        // frame, mapped back to world. Keeps the opposite corner pinned.
        const ncxL = ox + sx * newW / 2;
        const ncyL = oy + sy * newD / 2;
        const cosF = Math.cos(resizing.rot), sinF = Math.sin(resizing.rot);
        const ncx = resizing.cx + ncxL * cosF - ncyL * sinF;
        const ncy = resizing.cy + ncxL * sinF + ncyL * cosF;
        item.x = ncx - newW / 2;
        item.y = ncy - newD / 2;
        render();
      } else if (rotating) {
        const w = clientToWorld(e.clientX, e.clientY);
        const angle = Math.atan2(w.y - rotating.cy, w.x - rotating.cx) * 180 / Math.PI;
        let next = rotating.itemStartRotation + (angle - rotating.startAngle);
        // Rotation snap modifiers — coarsest wins:
        //   Cmd/Ctrl → 180° (flip), Alt → 90° (quarter-turn), Shift → 15° (fine)
        if (e.metaKey || e.ctrlKey)  next = Math.round(next / 180) * 180;
        else if (e.altKey)           next = Math.round(next / 90)  * 90;
        else if (e.shiftKey)         next = Math.round(next / 15)  * 15;
        const item = state.items.find(it => it.id === rotating.id);
        if (item) {
          const delta = next - (item.rotation || 0);
          // Cascade rotation to children so the table+chairs unit pivots
          // around the table center as one piece.
          rotateItemAndChildren(item, delta);
          render();
        }
      } else if (moving) {
        const w = clientToWorld(e.clientX, e.clientY);
        let dx = w.x - moving.startWX;
        let dy = w.y - moving.startWY;
        activeGuides = []; activeDims = [];
        // Snap delta when shift held — applies to whole selection at once
        // so relative spacing within the group is preserved. Shift keeps
        // its legacy grid meaning and skips the magnets entirely.
        if (e.shiftKey) {
          dx = Math.round(dx * 4) / 4;
          dy = Math.round(dy * 4) / 4;
        } else if (snapEnabled && !e.metaKey && !e.ctrlKey && !e.altKey
                   && moving.snapIndex && moving.startBox) {
          // Magnetic snap corrects the shared delta BEFORE it's applied,
          // so multi-selections and table+chair composites keep their
          // internal spacing and ride to the snapped position together.
          const snapped = applyMagneticSnap(moving, dx, dy);
          dx = snapped.dx; dy = snapped.dy;
        }
        if (!moving.didDrag && Math.abs(dx) + Math.abs(dy) > 0) {
          moving.didDrag = true;
          commit(moving.pendingSnap); // first real movement — now it's undoable
        }
        for (const it of state.items) {
          const start = moving.starts.get(it.id);
          if (!start) continue;
          it.x = start.x + dx;
          it.y = start.y + dy;
        }
        render();
      } else if (panning) {
        state.view.panX = panning.panStartX + (e.clientX - panning.startX);
        state.view.panY = panning.panStartY + (e.clientY - panning.startY);
        render();
      } else if (marquee) {
        const r = dom.canvas.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        if (Math.abs(cx - marquee.startCX) > 2 || Math.abs(cy - marquee.startCY) > 2) {
          marquee.didDrag = true;
        }
        // Live preview: what would be selected if we released right now.
        if (marquee.didDrag) {
          const hits = itemsIntersectingMarquee(marquee.startCX, marquee.startCY, cx, cy);
          state.selectedIds = marquee.additive
            ? Array.from(new Set([...marquee.prevSelection, ...hits]))
            : hits;
        }
        drawMarqueeRect(marquee.startCX, marquee.startCY, cx, cy);
        render();
      }
    });

    const endDrag = (e) => {
      // Alignment guides / gap labels are gesture-scoped — clear them and
      // repaint so they never linger after the pointer lifts.
      if (activeGuides.length || activeDims.length) {
        activeGuides = []; activeDims = [];
        render();
      }
      if (moving) {
        // Shift+click on already-selected item with no drag: toggle off.
        if (!moving.didDrag && pendingClick && pendingClick.additive) {
          toggleInSelection(pendingClick.id);
          render();
        }
        // If the user clicked an unselected item without shift, we already
        // single-selected it on pointerdown; on a click-without-drag this
        // is the "click to select" outcome, which is correct.
      }
      if (marquee && !marquee.didDrag) {
        // Plain click on empty canvas (no drag): clear selection (unless
        // shift was held — preserve existing).
        if (!marquee.additive) clearSelection();
        render();
      }
      // After a vertex drag, normalize the polygon (re-fit AABB, translate
      // so min vertex is at (0,0)) so the rest of the renderer stays sane.
      if (vertexDrag) {
        fitVenueToPolygon();
      }
      moving = null; rotating = null; resizing = null; panning = null; marquee = null; pendingClick = null;
      backdropDrag = null; vertexDrag = null;
      hideMarqueeRect();
      dom.canvas.classList.remove('pl-panning');
      dom.canvas.classList.remove('pl-marqueeing');
      if (e) {
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) pinch = null;
      }
      clearLongPress();
    };
    dom.svg.addEventListener('pointerup', endDrag);
    dom.svg.addEventListener('pointercancel', endDrag);

    // Context-menu routing — shared by right-click (mouse) and long-press
    // (touch): item menu when the press landed on an item, canvas menu
    // otherwise.
    const openContextMenuAt = (clientX, clientY, target) => {
      const world = clientToWorld(clientX, clientY);
      const itemEl = findItemAt(target);
      if (itemEl) {
        const id = itemEl.dataset.id;
        const item = state.items.find(it => it.id === id);
        if (item) {
          const menu = buildContextMenuForItem(id, world);
          render();   // selection may have changed
          showContextMenu(clientX, clientY, menu);
          return;
        }
      }
      showContextMenu(clientX, clientY, buildContextMenuForCanvas(world));
    };
    dom.svg.addEventListener('contextmenu', e => {
      if (isReadonly) { e.preventDefault(); return; }
      e.preventDefault();
      openContextMenuAt(e.clientX, e.clientY, e.target);
    });
    // Click anywhere outside the menu, or Esc, dismisses it.
    document.addEventListener('click', e => {
      if (!contextMenuEl || contextMenuEl.hidden) return;
      if (contextMenuEl.contains(e.target)) return;
      hideContextMenu();
    });

    // Double-click: closes an in-progress polygon, OR edits a text label.
    // Polygon-finish: native dblclick fires after the second pointerdown,
    // so the second click is already added as a vertex; drop it first.
    dom.svg.addEventListener('dblclick', e => {
      if (isReadonly) return;
      if (drawingPolygon) {
        e.preventDefault();
        if (drawingPolygon.vertices.length >= 4) {
          drawingPolygon.vertices.pop();
        }
        finishDrawPolygon();
        return;
      }
      // Label edit
      const itemEl = findItemAt(e.target);
      if (itemEl) {
        const id = itemEl.dataset.id;
        const item = state.items.find(it => it.id === id);
        if (item && item.key === 'text-label') {
          e.preventDefault();
          editLabel(id);
        }
      }
    });

    // Wheel zoom (cursor-anchored)
    dom.svg.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    // Drop zone
    dom.canvas.addEventListener('dragover', e => {
      const has = Array.from(e.dataTransfer.types || []).includes('text/x-planner-key');
      if (!has) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dom.canvas.classList.add('pl-dropping');
    });
    dom.canvas.addEventListener('dragleave', e => {
      // Only clear if we left the canvas itself
      if (e.target === dom.canvas) dom.canvas.classList.remove('pl-dropping');
    });
    dom.canvas.addEventListener('drop', e => {
      e.preventDefault();
      dom.canvas.classList.remove('pl-dropping');
      const key = e.dataTransfer.getData('text/x-planner-key');
      if (!key) return;
      const w = clientToWorld(e.clientX, e.clientY);
      const it = makeItem(key, w.x, w.y);
      if (!it) return;
      commit();
      state.items.push(it);
      trackFirstItem(it.key);
      // Auto-place chairs around tables on drop. Shift suppresses (matches
      // the existing Shift-modifier convention used for rotation snap & nudge).
      if (!e.shiftKey) {
        const chairs = placeChairsAround(it);
        if (chairs.length) state.items.push(...chairs);
      }
      setSelection([it.id]);
      render();
    });
  }

  function zoomAt(clientX, clientY, factor) {
    const r = dom.canvas.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const s = state.view.scale;
    const nextS = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
    const k = nextS / s;
    state.view.panX = px - (px - state.view.panX) * k;
    state.view.panY = py - (py - state.view.panY) * k;
    state.view.scale = nextS;
    render();
  }

  function zoomCentered(factor) {
    const r = dom.canvas.getBoundingClientRect();
    zoomAt(r.left + r.width/2, r.top + r.height/2, factor);
  }

  // ── Toolbar actions ───────────────────────────────────────────────────
  // All actions operate on the full selection set + cascaded children.
  function deleteSelected() {
    if (state.selectedIds.length === 0) return;
    commit();
    const toRemove = expandWithChildren(state.selectedIds);
    state.items = state.items.filter(it => !toRemove.has(it.id));
    clearSelection();
    render();
  }
  function duplicateSelected() {
    if (state.selectedIds.length === 0) return;
    commit();
    // Old-id → new-id map so we can re-link parentId on duplicated children.
    const idMap = {};
    const toCopy = [];
    const ids = expandWithChildren(state.selectedIds);
    for (const it of state.items) if (ids.has(it.id)) toCopy.push(it);
    for (const it of toCopy) idMap[it.id] = newId();
    const newItems = toCopy.map(it => ({
      ...it,
      id: idMap[it.id],
      // Re-link to the duplicated parent if it's also being duplicated;
      // otherwise drop parentId (orphan child becomes standalone).
      parentId: it.parentId && idMap[it.parentId] ? idMap[it.parentId] : undefined,
      x: it.x + 1,
      y: it.y + 1,
    }));
    state.items.push(...newItems);
    // Select only the originally-selected items' duplicates (not children),
    // matching the user's mental model: "I duplicated these N things".
    setSelection(state.selectedIds.map(id => idMap[id]).filter(Boolean));
    render();
  }
  function rotateSelected(deg) {
    if (state.selectedIds.length === 0) return;
    commit();
    // Each selected item rotates around its OWN center. If a table has
    // children, rotate the children around the table's center too so the
    // composite stays glued together.
    for (const id of state.selectedIds) {
      const item = state.items.find(it => it.id === id);
      if (!item) continue;
      rotateItemAndChildren(item, deg);
    }
    render();
  }
  // Rotate `item` by `deg` degrees, AND if it has children (chairs auto-
  // placed around a table), rotate them around `item`'s center too. Used
  // by the toolbar 90° buttons and by the rotate-handle drag.
  function rotateItemAndChildren(item, deg) {
    item.rotation = ((item.rotation || 0) + deg) % 360;
    const children = getChildren(item.id);
    if (children.length === 0) return;
    const cat = byKey[item.key];
    if (!cat) return;
    const sz = itemSize(cat);
    const cx = item.x + sz.w / 2, cy = item.y + sz.d / 2;
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (const ch of children) {
      const chCat = byKey[ch.key];
      if (!chCat) continue;
      const chSz = itemSize(chCat);
      const chCx = ch.x + chSz.w / 2, chCy = ch.y + chSz.d / 2;
      const dx = chCx - cx, dy = chCy - cy;
      const nx = cx + dx * cos - dy * sin;
      const ny = cy + dx * sin + dy * cos;
      ch.x = nx - chSz.w / 2;
      ch.y = ny - chSz.d / 2;
      ch.rotation = ((ch.rotation || 0) + deg) % 360;
    }
  }
  // ── Smart snapping ────────────────────────────────────────────────────
  // Magnetic alignment while dragging/resizing: the moving selection's
  // AABB edges and centers pull toward other items' edges/centers and the
  // venue boundary when within SNAP_PX screen pixels. Alignment guides +
  // gap labels render on top of the canvas during the gesture.
  // Modifier semantics (unchanged for Shift):
  //   Shift      → legacy 0.25 ft grid snap (magnets skipped)
  //   Cmd/Ctrl   → free move, no snapping at all
  //   (Alt at pointerdown starts a pan, so Cmd/Ctrl is the documented
  //    "disable snap" key; Alt pressed mid-drag also disables.)
  // The toolbar magnet button toggles the whole feature; preference
  // persists per browser.
  const SNAP_STORAGE_KEY = 'fpr-planner-snap-v1';
  let snapEnabled = (() => {
    try { return localStorage.getItem(SNAP_STORAGE_KEY) !== '0'; }
    catch (e) { return true; }
  })();
  let activeGuides = [];   // [{ axis:'v'|'h', at, from, to }] world ft
  let activeDims = [];     // [{ x, y, label }] gap labels, world ft

  function setSnapEnabled(on) {
    snapEnabled = !!on;
    try { localStorage.setItem(SNAP_STORAGE_KEY, snapEnabled ? '1' : '0'); }
    catch (e) { /* private mode — session-only toggle still works */ }
  }

  // World-frame AABB of one item (rotation folded in via its corners).
  function _aabbOf(it) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of _itemCorners(it)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  // Union AABB of a set of item ids (the moving selection + children).
  function _groupAabb(ids) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of state.items) {
      if (!ids.has(it.id)) continue;
      const b = _aabbOf(it);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }

  // Candidate lists for one gesture. Each entry: { v, kind, side, lo, hi }
  //   v    — the coordinate on this axis
  //   kind — 'edge' | 'center' (edges win distance ties)
  //   side — 'lo' (left/top edge) | 'hi' (right/bottom edge) | 'c'
  //   lo/hi — the item's extent on the PERPENDICULAR axis (guide spans,
  //           gap-label overlap tests)
  // Built once per gesture — static items don't move mid-drag — then
  // binary-searched per frame.
  function buildSnapIndex(excludeIds) {
    const xs = [], ys = [];
    for (const it of state.items) {
      if (excludeIds && excludeIds.has(it.id)) continue;
      const cat = byKey[it.key];
      if (!cat || cat.shape === 'text') continue;
      const b = _aabbOf(it);
      xs.push({ v: b.minX, kind: 'edge', side: 'lo', lo: b.minY, hi: b.maxY });
      xs.push({ v: (b.minX + b.maxX) / 2, kind: 'center', side: 'c', lo: b.minY, hi: b.maxY });
      xs.push({ v: b.maxX, kind: 'edge', side: 'hi', lo: b.minY, hi: b.maxY });
      ys.push({ v: b.minY, kind: 'edge', side: 'lo', lo: b.minX, hi: b.maxX });
      ys.push({ v: (b.minY + b.maxY) / 2, kind: 'center', side: 'c', lo: b.minX, hi: b.maxX });
      ys.push({ v: b.maxY, kind: 'edge', side: 'hi', lo: b.minX, hi: b.maxX });
    }
    // Venue boundary + centerlines participate too. Polygon venues snap
    // to their AABB (fitVenueToPolygon pins the min vertex at 0,0).
    const W = state.venue.widthFt, D = state.venue.depthFt;
    xs.push({ v: 0,     kind: 'edge',   side: 'venue', lo: 0, hi: D });
    xs.push({ v: W / 2, kind: 'center', side: 'venue', lo: 0, hi: D });
    xs.push({ v: W,     kind: 'edge',   side: 'venue', lo: 0, hi: D });
    ys.push({ v: 0,     kind: 'edge',   side: 'venue', lo: 0, hi: W });
    ys.push({ v: D / 2, kind: 'center', side: 'venue', lo: 0, hi: W });
    ys.push({ v: D,     kind: 'edge',   side: 'venue', lo: 0, hi: W });
    xs.sort((a, b) => a.v - b.v);
    ys.sort((a, b) => a.v - b.v);
    return { xs, ys };
  }

  // Closest candidate to `v` within maxDist. Smallest |Δ| wins; on a
  // near-tie an edge beats a center (edge alignment is what users mean).
  function _nearestSnap(sorted, v, maxDist) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].v < v) lo = mid + 1; else hi = mid;
    }
    let best = null;
    const consider = (c) => {
      const d = Math.abs(c.v - v);
      if (d > maxDist) return false;   // sorted → everything further is worse
      if (!best
          || d < best.d - 1e-9
          || (d - best.d <= 1e-9 && c.kind === 'edge' && best.c.kind !== 'edge')) {
        best = { d, c };
      }
      return true;
    };
    for (let i = lo; i < sorted.length && consider(sorted[i]); i++) { /* walk right */ }
    for (let i = lo - 1; i >= 0 && consider(sorted[i]); i--) { /* walk left */ }
    return best;
  }

  // Nearest gap neighbor for distance labels: walking from `edgeV` in
  // `dir`, the first item edge FACING the moving box (side 'hi' when
  // looking left/up, 'lo' when looking right/down; venue WALLS count,
  // the invisible venue centerline never does) whose perpendicular range
  // overlaps [pLo, pHi].
  function _nearestGapNeighbor(sorted, edgeV, dir, pLo, pHi) {
    const facing = dir < 0 ? 'hi' : 'lo';
    const accepts = (c) =>
      c.side === facing || (c.side === 'venue' && c.kind === 'edge');
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].v < edgeV) lo = mid + 1; else hi = mid;
    }
    const eps = 0.01;
    if (dir < 0) {
      for (let i = lo - 1; i >= 0; i--) {
        const c = sorted[i];
        if (c.v > edgeV - eps) continue;
        if (!accepts(c)) continue;
        if (c.lo < pHi && c.hi > pLo) return c;
      }
    } else {
      for (let i = lo; i < sorted.length; i++) {
        const c = sorted[i];
        if (c.v < edgeV + eps) continue;
        if (!accepts(c)) continue;
        if (c.lo < pHi && c.hi > pLo) return c;
      }
    }
    return null;
  }

  // Apply magnetic snapping to a move gesture's (dx, dy). Returns the
  // corrected delta and fills activeGuides/activeDims for this frame.
  function applyMagneticSnap(mv, dx, dy) {
    const thr = SNAP_PX / state.view.scale;
    const b = mv.startBox;
    const idx = mv.snapIndex;

    const probe = (arr, vals) => {
      let best = null;
      for (const p of vals) {
        const hit = _nearestSnap(arr, p.v, thr);
        if (hit && (!best || hit.d < best.hit.d)) best = { hit, at: p };
      }
      return best;
    };

    const bx = probe(idx.xs, [
      { v: b.minX + dx },
      { v: (b.minX + b.maxX) / 2 + dx },
      { v: b.maxX + dx },
    ]);
    if (bx) dx += bx.hit.c.v - bx.at.v;

    const by = probe(idx.ys, [
      { v: b.minY + dy },
      { v: (b.minY + b.maxY) / 2 + dy },
      { v: b.maxY + dy },
    ]);
    if (by) dy += by.hit.c.v - by.at.v;

    // Equal-spacing: when the gaps to the nearest left/right (or top/
    // bottom) neighbors are almost equal, settle exactly between them.
    // Only when no edge snap already claimed that axis.
    const minX = b.minX + dx, maxX = b.maxX + dx;
    const minY = b.minY + dy, maxY = b.maxY + dy;
    let spacingX = null, spacingY = null;
    if (!bx) {
      const L = _nearestGapNeighbor(idx.xs, minX, -1, minY, maxY);
      const R = _nearestGapNeighbor(idx.xs, maxX, +1, minY, maxY);
      if (L && R) {
        const gL = minX - L.v, gR = R.v - maxX;
        if (gL > 0.05 && gR > 0.05 && Math.abs(gL - gR) <= thr * 2) {
          const adj = (gR - gL) / 2;
          dx += adj;
          spacingX = { L, R, gap: (gL + gR) / 2 };
        }
      }
    }
    if (!by) {
      const T = _nearestGapNeighbor(idx.ys, minY, -1, minX, maxX);
      const B = _nearestGapNeighbor(idx.ys, maxY, +1, minX, maxX);
      if (T && B) {
        const gT = minY - T.v, gB = B.v - maxY;
        if (gT > 0.05 && gB > 0.05 && Math.abs(gT - gB) <= thr * 2) {
          const adj = (gB - gT) / 2;
          dy += adj;
          spacingY = { T, B, gap: (gT + gB) / 2 };
        }
      }
    }

    // Build the visual feedback from the FINAL deltas.
    const fMinX = b.minX + dx, fMaxX = b.maxX + dx;
    const fMinY = b.minY + dy, fMaxY = b.maxY + dy;
    if (bx) {
      activeGuides.push({
        axis: 'v', at: bx.hit.c.v,
        from: Math.min(fMinY, bx.hit.c.lo), to: Math.max(fMaxY, bx.hit.c.hi),
      });
    }
    if (by) {
      activeGuides.push({
        axis: 'h', at: by.hit.c.v,
        from: Math.min(fMinX, by.hit.c.lo), to: Math.max(fMaxX, by.hit.c.hi),
      });
    }
    const fmtFt = (n) => (Math.round(n * 100) / 100) + ' ft';
    const cy = (fMinY + fMaxY) / 2, cx = (fMinX + fMaxX) / 2;
    if (spacingX) {
      activeDims.push({ x: (spacingX.L.v + fMinX) / 2, y: cy, label: fmtFt(spacingX.gap) });
      activeDims.push({ x: (fMaxX + spacingX.R.v) / 2, y: cy, label: fmtFt(spacingX.gap) });
    }
    if (spacingY) {
      activeDims.push({ x: cx, y: (spacingY.T.v + fMinY) / 2, label: fmtFt(spacingY.gap) });
      activeDims.push({ x: cx, y: (fMaxY + spacingY.B.v) / 2, label: fmtFt(spacingY.gap) });
    }
    // Plain distance labels to the nearest neighbors — skipped on very
    // large layouts (the labels, not the snapping) and when the same
    // axis already shows spacing labels.
    if (state.items.length <= 300) {
      const MAX_GAP = 25;
      if (!spacingX) {
        const L = _nearestGapNeighbor(idx.xs, fMinX, -1, fMinY, fMaxY);
        if (L && fMinX - L.v > 0.1 && fMinX - L.v <= MAX_GAP) {
          activeDims.push({ x: (L.v + fMinX) / 2, y: cy, label: fmtFt(fMinX - L.v) });
        }
        const R = _nearestGapNeighbor(idx.xs, fMaxX, +1, fMinY, fMaxY);
        if (R && R.v - fMaxX > 0.1 && R.v - fMaxX <= MAX_GAP) {
          activeDims.push({ x: (fMaxX + R.v) / 2, y: cy, label: fmtFt(R.v - fMaxX) });
        }
      }
      if (!spacingY) {
        const T = _nearestGapNeighbor(idx.ys, fMinY, -1, fMinX, fMaxX);
        if (T && fMinY - T.v > 0.1 && fMinY - T.v <= MAX_GAP) {
          activeDims.push({ x: cx, y: (T.v + fMinY) / 2, label: fmtFt(fMinY - T.v) });
        }
        const B = _nearestGapNeighbor(idx.ys, fMaxY, +1, fMinX, fMaxX);
        if (B && B.v - fMaxY > 0.1 && B.v - fMaxY <= MAX_GAP) {
          activeDims.push({ x: cx, y: (fMaxY + B.v) / 2, label: fmtFt(B.v - fMaxY) });
        }
      }
    }
    return { dx, dy };
  }

  // Guide + gap-label layer, drawn on top of everything during a gesture.
  function drawSnapGuides(root) {
    const g = svg('g', { 'pointer-events': 'none' }, root);
    for (const gd of activeGuides) {
      svg('line', {
        x1: gd.axis === 'v' ? gd.at : gd.from,
        y1: gd.axis === 'v' ? gd.from : gd.at,
        x2: gd.axis === 'v' ? gd.at : gd.to,
        y2: gd.axis === 'v' ? gd.to : gd.at,
        class: 'pl-snap-guide', 'vector-effect': 'non-scaling-stroke',
      }, g);
    }
    const fs = 12 / state.view.scale;   // ~12 px tall at any zoom
    for (const dm of activeDims) {
      svg('text', {
        x: dm.x, y: dm.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        class: 'pl-snap-dim', 'font-size': fs,
        'font-family': 'Jost, sans-serif',
      }, g).textContent = dm.label;
    }
  }

  // ── Align / distribute ────────────────────────────────────────────────
  // Operates on "units": selected items minus any whose parent is also
  // selected (chairs ride along with their table). Each unit's bounding
  // box includes its children and its rotation, so a table+chair ring
  // aligns by the envelope a guest actually experiences, not the bare
  // tabletop. Reachable from the right-click menu on a multi-selection.
  function _selectionUnits() {
    return selectedItems().filter(it => !(it.parentId && isSelected(it.parentId)));
  }
  // World-frame AABB of an item + its children, rotation included.
  function _unitAabb(item) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (it) => {
      for (const p of _itemCorners(it)) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    };
    eat(item);
    for (const ch of getChildren(item.id)) eat(ch);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  function _moveUnit(item, dx, dy) {
    if (!dx && !dy) return;
    item.x += dx; item.y += dy;
    for (const ch of getChildren(item.id)) { ch.x += dx; ch.y += dy; }
  }
  function alignSelected(mode) {
    const units = _selectionUnits();
    if (units.length < 2) return;
    const boxes = units.map(u => ({ u, b: _unitAabb(u) }));
    commit();
    // Targets: edges use the selection's extremes; centers use the
    // selection bbox midpoint.
    const minX = Math.min(...boxes.map(x => x.b.minX));
    const maxX = Math.max(...boxes.map(x => x.b.maxX));
    const minY = Math.min(...boxes.map(x => x.b.minY));
    const maxY = Math.max(...boxes.map(x => x.b.maxY));
    for (const { u, b } of boxes) {
      let dx = 0, dy = 0;
      if (mode === 'left')    dx = minX - b.minX;
      if (mode === 'right')   dx = maxX - b.maxX;
      if (mode === 'centerH') dx = (minX + maxX) / 2 - (b.minX + b.maxX) / 2;
      if (mode === 'top')     dy = minY - b.minY;
      if (mode === 'bottom')  dy = maxY - b.maxY;
      if (mode === 'centerV') dy = (minY + maxY) / 2 - (b.minY + b.maxY) / 2;
      _moveUnit(u, dx, dy);
    }
    render();
  }
  // Equal gaps between unit bboxes along one axis; first and last stay put.
  function distributeSelected(axis) {
    const units = _selectionUnits();
    if (units.length < 3) return;
    const horiz = axis === 'h';
    const boxes = units.map(u => ({ u, b: _unitAabb(u) }))
      .sort((a, z) => horiz
        ? (a.b.minX + a.b.maxX) - (z.b.minX + z.b.maxX)
        : (a.b.minY + a.b.maxY) - (z.b.minY + z.b.maxY));
    const first = boxes[0].b, last = boxes[boxes.length - 1].b;
    const span = horiz ? (last.maxX - first.minX) : (last.maxY - first.minY);
    const total = boxes.reduce((s, x) => s + (horiz ? x.b.w : x.b.h), 0);
    const gap = (span - total) / (boxes.length - 1);
    commit();
    let cursor = horiz ? first.minX : first.minY;
    for (const { u, b } of boxes) {
      const d = cursor - (horiz ? b.minX : b.minY);
      _moveUnit(u, horiz ? d : 0, horiz ? 0 : d);
      cursor += (horiz ? b.w : b.h) + gap;
    }
    render();
  }

  function clearAll() {
    if (state.items.length === 0) return;
    plConfirm('Clear the entire layout? (Undo will restore it.)', { okLabel: 'Clear', danger: true }).then(ok => {
      if (!ok) return;
      commit();
      state.items = [];
      clearSelection();
      render();
    });
  }

  // ── Z-order ───────────────────────────────────────────────────────────
  // Items are drawn in state.items order; later = on top. Bring/send
  // helpers move the selection (or single id) to the top/bottom of the
  // array. Cascading children move with their parent so a table+chairs
  // unit stays glued.
  function bringToFront(idsArg) {
    const ids = Array.isArray(idsArg) ? idsArg : [idsArg];
    const set = expandWithChildren(ids);
    const lifted = state.items.filter(it => set.has(it.id));
    if (!lifted.length) return;
    commit();
    state.items = state.items.filter(it => !set.has(it.id));
    state.items.push(...lifted);
    render();
  }
  function sendToBack(idsArg) {
    const ids = Array.isArray(idsArg) ? idsArg : [idsArg];
    const set = expandWithChildren(ids);
    const sunken = state.items.filter(it => set.has(it.id));
    if (!sunken.length) return;
    commit();
    state.items = state.items.filter(it => !set.has(it.id));
    state.items = sunken.concat(state.items);
    render();
  }

  // Paste the in-app clipboard. If `worldPos` is given, items land at
  // that world coordinate (the right-click "Paste Here" path); otherwise
  // they offset 1ft from the originals (the Cmd+V default).
  function pasteClipboard(worldPos) {
    if (!clipboard.length) return;
    commit();
    const idMap = {};
    for (const it of clipboard) idMap[it.id] = newId();
    let dx, dy;
    if (worldPos) {
      // Translate the clipboard's bbox center to the requested world point.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of clipboard) {
        const sz = effectiveSize(it);
        if (it.x < minX) minX = it.x;
        if (it.y < minY) minY = it.y;
        if (it.x + sz.w > maxX) maxX = it.x + sz.w;
        if (it.y + sz.d > maxY) maxY = it.y + sz.d;
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      dx = worldPos.x - cx;
      dy = worldPos.y - cy;
    } else {
      dx = 1; dy = 1;
    }
    const newItems = clipboard.map(it => ({
      ...it,
      id: idMap[it.id],
      parentId: it.parentId && idMap[it.parentId] ? idMap[it.parentId] : undefined,
      x: it.x + dx,
      y: it.y + dy,
    }));
    state.items.push(...newItems);
    const topLevel = clipboard.filter(it => !(it.parentId && idMap[it.parentId]));
    setSelection(topLevel.map(it => idMap[it.id]));
    render();
  }

  // Copy the current selection (with cascaded children) to the in-app
  // clipboard. Used by Cmd+C and the right-click Copy action.
  function copySelectionToClipboard() {
    if (state.selectedIds.length === 0) return false;
    const ids = expandWithChildren(state.selectedIds);
    clipboard = state.items.filter(it => ids.has(it.id)).map(it => ({ ...it }));
    return true;
  }

  // ── Right-click context menu ──────────────────────────────────────────
  // Shown on contextmenu over the canvas. Two flavors of menu depending
  // on whether the click landed on an item or empty canvas.
  function ensureContextMenuEl() {
    if (contextMenuEl) return contextMenuEl;
    contextMenuEl = document.createElement('div');
    contextMenuEl.className = 'pl-context-menu';
    contextMenuEl.hidden = true;
    document.body.appendChild(contextMenuEl);
    return contextMenuEl;
  }
  function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.hidden = true;
  }
  function showContextMenu(clientX, clientY, items) {
    const el = ensureContextMenuEl();
    el.innerHTML = items.map((it, idx) =>
      it === '-'
        ? `<div class="pl-context-divider"></div>`
        : `<button type="button" class="pl-context-item${it.disabled ? ' pl-context-disabled' : ''}" data-idx="${idx}" ${it.disabled ? 'disabled' : ''}>${escapeHtml(it.label)}</button>`
    ).join('');
    el.style.left = clientX + 'px';
    el.style.top  = clientY + 'px';
    el.hidden = false;
    // Re-position if it overflows the viewport.
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth)  el.style.left = (window.innerWidth - r.width - 8) + 'px';
    if (r.bottom > window.innerHeight) el.style.top  = (window.innerHeight - r.height - 8) + 'px';
    // One-shot click handler.
    el.onclick = (e) => {
      if (performance.now() < contextMenuTouchGuardUntil) return; // long-press ghost click
      const btn = e.target.closest('.pl-context-item');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const action = items[idx] && items[idx].action;
      hideContextMenu();
      if (typeof action === 'function') action();
    };
  }

  function buildContextMenuForItem(itemId, world) {
    const inSel = isSelected(itemId);
    // If the clicked item isn't currently selected, select just it so all
    // actions operate on a sensible target. (Mirrors Figma's behavior.)
    if (!inSel) setSelection([itemId]);
    const menu = [
      { label: 'Bring to front', action: () => bringToFront(state.selectedIds) },
      { label: 'Send to back',   action: () => sendToBack(state.selectedIds) },
      '-',
      { label: 'Rotate 90° left',  action: () => rotateSelected(-90) },
      { label: 'Rotate 90° right', action: () => rotateSelected(90) },
      '-',
    ];
    // Tent annotations — single-selected tents only. Each side cycles
    // open → sidewall → entrance; sides are named in the tent's own
    // (pre-rotation) frame. Plus the stake/ballast clearance toggle.
    const tentSel = firstSelected();
    const tentCat = tentSel && byKey[tentSel.key];
    if (tentSel && tentCat && tentCat.shape === 'tent') {
      const sideNames = ['Top', 'Right', 'Bottom', 'Left'];
      const wordFor = { o: 'open', w: 'sidewall', d: 'entrance' };
      const nextOf  = { o: 'w', w: 'd', d: 'o' };
      const cur = (typeof tentSel.walls === 'string' && /^[owd]{4}$/.test(tentSel.walls))
        ? tentSel.walls : 'oooo';
      for (let i = 0; i < 4; i++) {
        menu.push({
          label: `${sideNames[i]} side: ${wordFor[cur[i]]} → ${wordFor[nextOf[cur[i]]]}`,
          action: () => {
            commit();
            const arr = cur.split('');
            arr[i] = nextOf[cur[i]];
            const w = arr.join('');
            if (w === 'oooo') delete tentSel.walls;
            else tentSel.walls = w;
            render();
          },
        });
      }
      menu.push({
        label: tentSel.clearance
          ? 'Hide stake/ballast zone'
          : `Show stake/ballast zone (${TENT_CLEARANCE_FT} ft)`,
        action: () => {
          commit();
          if (tentSel.clearance) delete tentSel.clearance;
          else tentSel.clearance = true;
          render();
        },
      });
      menu.push('-');
    }
    // Align / distribute — only meaningful on a multi-selection. Units
    // exclude chairs whose table is also selected (they ride along).
    const nUnits = _selectionUnits().length;
    if (nUnits >= 2) {
      menu.push(
        { label: 'Align left',   action: () => alignSelected('left') },
        { label: 'Align center', action: () => alignSelected('centerH') },
        { label: 'Align right',  action: () => alignSelected('right') },
        { label: 'Align top',    action: () => alignSelected('top') },
        { label: 'Align middle', action: () => alignSelected('centerV') },
        { label: 'Align bottom', action: () => alignSelected('bottom') },
      );
      if (nUnits >= 3) {
        menu.push(
          { label: 'Distribute horizontally', action: () => distributeSelected('h') },
          { label: 'Distribute vertically',   action: () => distributeSelected('v') },
        );
      }
      menu.push('-');
    }
    menu.push(
      { label: 'Copy',      action: () => copySelectionToClipboard() },
      { label: 'Duplicate', action: duplicateSelected },
      { label: 'Delete',    action: deleteSelected },
    );
    return menu;
  }

  function buildContextMenuForCanvas(world) {
    return [
      { label: 'Add label here',
        action: () => {
          plPrompt('Label text:', '', { okLabel: 'Add' }).then(text => {
            if (text == null || !text.trim()) return;
            commit();
            const item = makeLabelItem(text.trim(), world.x, world.y);
            state.items.push(item);
            setSelection([item.id]);
            render();
          });
        }},
      { label: clipboard.length ? `Paste here (${clipboard.length})` : 'Paste here',
        disabled: !clipboard.length,
        action: () => pasteClipboard(world) },
      '-',
      { label: 'Fit to view', action: () => { fitToVenue(); render(); } },
      { label: 'Select all',  action: () => { setSelection(state.items.map(it => it.id)); render(); } },
    ];
  }

  // Drop a text label at the venue center. Prompts for content; the user
  // can later double-click the label to edit text.
  function addLabel() {
    plPrompt('Label text (e.g., DJ, Bar, Caterer):', '', { okLabel: 'Add' }).then(text => {
      if (text == null) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const wx = state.venue.widthFt / 2;
      const wy = state.venue.depthFt / 2;
      commit();
      const item = makeLabelItem(trimmed, wx, wy);
      state.items.push(item);
      setSelection([item.id]);
      render();
    });
  }

  // Edit an existing label's text. Recomputes the per-instance bbox so
  // selection halos / drag math stay accurate.
  function editLabel(id) {
    if (isReadonly) return;
    const item = state.items.find(it => it.id === id);
    if (!item || item.key !== 'text-label') return;
    plPrompt('Edit label:', item.text || '', { okLabel: 'Save' }).then(next => {
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      commit();
      const sz = approximateLabelSize(trimmed, item.fontSize || 1.2);
      // Keep the center fixed so the label doesn't visually jump when the
      // text grows/shrinks.
      const cx = item.x + (item.widthFt || sz.widthFt) / 2;
      const cy = item.y + (item.depthFt || sz.depthFt) / 2;
      item.text = trimmed;
      item.widthFt = sz.widthFt;
      item.depthFt = sz.depthFt;
      item.x = cx - sz.widthFt / 2;
      item.y = cy - sz.depthFt / 2;
      render();
    });
  }

  // ── Shareable URL ─────────────────────────────────────────────────────
  // State encodes into a URL hash (#s=...) so users can share their
  // layout. Backdrop images are NOT encoded — even a downscaled JPEG
  // would push past typical URL limits. shareLink() warns the user and
  // points them at "Save File" for full-fidelity sharing.
  //
  // Schema v2 (current): "2*KEYS*V*N*I" — compact CSV-like format using
  // only URL-safe delimiters (* _ ~ .) so encodeURIComponent is mostly a
  // no-op. Yields roughly 5–10× shorter URLs than v1 for typical layouts:
  //   • KEYS = unique catalog keys joined by `.` (item refs are integer
  //     indices into this list, killing key-name repetition).
  //   • V = "widthFt~depthFt".
  //   • N = event name, with our 5 delimiters back-escaped (`! 0–4`).
  //   • I = items joined by `_`. Each item is "keyIdx~x~y~r[~p[~c[~t~w~d~fs]]]"
  //     with trailing default fields stripped. Tents reuse slots 6–7 as
  //     [~walls[~clearance]] (walls = 4 chars of o/w/d, clearance = "1");
  //     resizable planning items ride the label tail with empty text.
  //
  // Schema v1 (legacy): "%7B...%7D" — raw URL-encoded JSON. Old share
  // links keep working because decodeStateFromHash falls back to JSON.parse
  // when the body doesn't start with the v2 discriminator.
  //
  // When the embed page sees no hash on its own URL but is iframed by a
  // SAME-ORIGIN parent, it reads the parent's hash too — that's how
  // hub-page share links work without manual hash propagation.

  function _formatNum(n) {
    if (!Number.isFinite(n)) return '0';
    return parseFloat(n.toFixed(2)).toString();
  }
  // Escape our 5 layer delimiters (`* . _ ~ !`) inside text labels and
  // event names so they survive a round-trip. `!` is the escape char and
  // is itself URL-safe, so the encoded form costs no extra URL bytes.
  function _escapeText(s) {
    return String(s)
      .replace(/!/g, '!0')
      .replace(/~/g, '!1')
      .replace(/_/g, '!2')
      .replace(/\*/g, '!3')
      .replace(/\./g, '!4');
  }
  function _unescapeText(s) {
    return String(s)
      .replace(/!4/g, '.')
      .replace(/!3/g, '*')
      .replace(/!2/g, '_')
      .replace(/!1/g, '~')
      .replace(/!0/g, '!');
  }

  function encodeStateForUrl() {
    const s = serializeState();
    // Build catalog-key → index dedup table (in order of first appearance).
    const keyTable = [];
    const keyIdx = new Map();
    for (const it of s.items) {
      if (!keyIdx.has(it.key)) {
        keyIdx.set(it.key, keyTable.length);
        keyTable.push(it.key);
      }
    }
    // Item ord index for parent refs (compact integer indices).
    const itemIdx = new Map();
    s.items.forEach((it, i) => itemIdx.set(it.id, i));

    const itemEncs = s.items.map(it => {
      const fields = [
        keyIdx.get(it.key),
        _formatNum(it.x),
        _formatNum(it.y),
        _formatNum(it.rotation || 0),
      ];
      // Optional positional fields, in order: parentIdx, chairCount, then
      // per-key extras. Empty slots are emitted as bare `~~` so positions
      // stay aligned.
      //   • text-label / custom-area / resizable planning items reuse the
      //     label tail: text, widthFt, depthFt, fontSize (planning items
      //     emit empty text; fontSize is only ever set on labels).
      //   • tents use slots 6–7 for walls / clearance. Old planners only
      //     read slots 6+ for label-ish keys, so a pre-annotation build
      //     opening a new link silently drops the annotations instead of
      //     breaking — deliberate v2-compatible extension, no v3.
      const hasParent = it.parentId && itemIdx.has(it.parentId);
      const hasCount  = it.chairCount != null;
      const cat       = byKey[it.key];
      const isLabel   = it.key === 'text-label' || it.key === 'custom-area'
                        || !!(cat && cat.resizable);
      const isTent    = !!(cat && cat.shape === 'tent');
      const tail = [];
      if (hasParent || hasCount || isLabel || isTent) tail.push(hasParent ? String(itemIdx.get(it.parentId)) : '');
      if (hasCount  || isLabel  || isTent)            tail.push(hasCount ? String(it.chairCount) : '');
      if (isLabel) {
        tail.push(_escapeText(it.text || ''));
        tail.push(it.widthFt  != null ? _formatNum(it.widthFt)  : '');
        tail.push(it.depthFt  != null ? _formatNum(it.depthFt)  : '');
        tail.push(it.fontSize != null ? _formatNum(it.fontSize) : '');
      } else if (isTent) {
        tail.push((typeof it.walls === 'string' && /^[owd]{4}$/.test(it.walls)) ? it.walls : '');
        tail.push(it.clearance ? '1' : '');
      }
      // Strip trailing empties so non-special items don't pay for unused slots.
      while (tail.length && tail[tail.length - 1] === '') tail.pop();
      return fields.concat(tail).join('~');
    });

    const venue = _formatNum(s.venue.widthFt) + '~' + _formatNum(s.venue.depthFt);
    const name  = _escapeText(s.eventName || '');
    const keys  = keyTable.join('.');
    const items = itemEncs.join('_');
    let raw     = '2*' + keys + '*' + venue + '*' + name + '*' + items;
    // Optional 6th segment: guest list, "name~tableItemIdx" joined by `_`.
    // Only appended when guests exist, so guest-free links are byte-identical
    // to the previous schema. Older cached planners opening a guest-bearing
    // link still parse items correctly: the extra "*G…" glues onto the LAST
    // item's final numeric field, where parseFloat/parseInt stop at `*`.
    if (s.guests && s.guests.length) {
      const guestEncs = s.guests.map(g => {
        const tIdx = g.tableId && itemIdx.has(g.tableId) ? String(itemIdx.get(g.tableId)) : '';
        return _escapeText(g.name) + (tIdx ? '~' + tIdx : '');
      });
      raw += '*' + guestEncs.join('_');
    }
    return encodeURIComponent(raw);
  }

  function decodeStateFromHash(hash) {
    if (!hash || !hash.startsWith('#s=')) return null;
    let raw;
    try { raw = decodeURIComponent(hash.substring(3)); }
    catch (e) { return null; }

    // v2 discriminator
    if (raw.startsWith('2*')) return _decodeV2(raw);

    // v1 legacy: raw URL-encoded JSON
    try {
      const compact = JSON.parse(raw);
      return _decodeV1(compact);
    } catch (e) { return null; }
  }

  function _decodeV2(raw) {
    // Parts split on '*'. Note: '*' inside text/name is escaped to '!3'
    // by _escapeText, so a naive split on '*' is safe here.
    const parts = raw.split('*');
    if (parts.length < 5 || parts[0] !== '2') return null;
    const keys = parts[1] ? parts[1].split('.') : [];
    const v    = parts[2].split('~');
    const w    = parseFloat(v[0]);
    const d    = parseFloat(v[1]);
    if (!Number.isFinite(w) || !Number.isFinite(d)) return null;
    const eventName = _unescapeText(parts[3] || '');
    // parts[4] = items; parts[5] (optional, newer links) = guest list.
    // `*` inside text fields is always escaped to `!3`, so a plain split
    // on '*' cleanly separates the two segments.
    const itemsStr = parts[4] || '';
    const guestsStr = parts[5] || '';
    const itemStrs = itemsStr ? itemsStr.split('_') : [];
    const ids = itemStrs.map((_, idx) => 'i' + (idx + 1));
    try {
      const items = itemStrs.map((str, idx) => {
        const f = str.split('~');
        const k = keys[parseInt(f[0], 10)];
        if (!k) throw new Error('bad-key');
        const out = {
          id: ids[idx],
          key: k,
          x: parseFloat(f[1]),
          y: parseFloat(f[2]),
          rotation: parseFloat(f[3]) || 0,
        };
        if (f.length > 4 && f[4] !== '') {
          const pIdx = parseInt(f[4], 10);
          if (Number.isFinite(pIdx) && ids[pIdx]) out.parentId = ids[pIdx];
        }
        if (f.length > 5 && f[5] !== '') {
          const c = parseInt(f[5], 10);
          if (Number.isFinite(c)) out.chairCount = c;
        }
        const kCat = byKey[k];
        if (k === 'text-label' || k === 'custom-area' || (kCat && kCat.resizable)) {
          // Planning items ride the label tail for their dims but carry
          // no text of their own.
          if (k === 'text-label')      out.text = _unescapeText(f[6] || '') || 'Label';
          else if (k === 'custom-area') out.text = _unescapeText(f[6] || '') || 'Custom area';
          if (f[7]) { const n = parseFloat(f[7]); if (Number.isFinite(n)) out.widthFt  = n; }
          if (f[8]) { const n = parseFloat(f[8]); if (Number.isFinite(n)) out.depthFt  = n; }
          if (f[9] && k === 'text-label') { const n = parseFloat(f[9]); if (Number.isFinite(n)) out.fontSize = n; }
        } else if (kCat && kCat.shape === 'tent') {
          if (f.length > 6 && /^[owd]{4}$/.test(f[6] || '')) out.walls = f[6];
          if (f.length > 7 && f[7] === '1') out.clearance = true;
        }
        return out;
      });
      const guests = !guestsStr ? [] : guestsStr.split('_').map((str, i) => {
        const f = str.split('~');
        const g = { id: 'g' + (i + 1), name: _unescapeText(f[0] || '').slice(0, 60), tableId: null };
        if (f[1] !== undefined && f[1] !== '') {
          const tIdx = parseInt(f[1], 10);
          if (Number.isFinite(tIdx) && ids[tIdx]) g.tableId = ids[tIdx];
        }
        return g;
      }).filter(g => g.name);
      return {
        eventName,
        venue: { widthFt: w, depthFt: d },
        items,
        guests,
        eventDays: 1,
      };
    } catch (e) { return null; }
  }

  function _decodeV1(compact) {
    if (!compact || !compact.v || !Array.isArray(compact.i)) return null;
    const ids = compact.i.map((_, idx) => 'i' + (idx + 1));
    return {
      eventName: compact.n || '',
      venue: { widthFt: compact.v[0], depthFt: compact.v[1] },
      items: compact.i.map((c, idx) => {
        const out = {
          id: ids[idx],
          key: c.k,
          x: c.x,
          y: c.y,
          rotation: c.r || 0,
        };
        if (c.p != null && ids[c.p]) out.parentId = ids[c.p];
        if (c.c != null) out.chairCount = c.c;
        if (c.k === 'text-label') {
          out.text = c.t || 'Label';
          if (c.w  != null) out.widthFt  = c.w;
          if (c.d  != null) out.depthFt  = c.d;
          if (c.fs != null) out.fontSize = c.fs;
        }
        return out;
      }),
      eventDays: 1,
    };
  }

  // Returns the URL hash to use when restoring state on load. Prefers the
  // iframe's own hash; falls back to the parent's hash for same-origin
  // hub embedding (so hub-page share links Just Work).
  function getRestoreHash() {
    if (location.hash && location.hash.startsWith('#s=')) return location.hash;
    try {
      if (window.parent && window.parent !== window &&
          window.parent.location.origin === window.location.origin &&
          window.parent.location.hash &&
          window.parent.location.hash.startsWith('#s=')) {
        return window.parent.location.hash;
      }
    } catch (e) { /* cross-origin denial */ }
    return null;
  }

  function plannerHubBase() {
    try {
      if (window.parent && window.parent !== window &&
          window.parent.location.origin === window.location.origin) {
        const path = window.parent.location.pathname;
        if (path.indexOf('/p/') === 0) return window.parent.location.origin + '/event-layout-planner';
        return window.parent.location.origin + path;
      }
    } catch (e) { /* cross-origin */ }
    return location.origin + '/event-layout-planner';
  }

  function withViewFlag(url, readonly) {
    const stripped = String(url || '').replace(/[?&]view=readonly/, '').replace(/\?$/, '');
    if (!readonly) return stripped;
    const hash = stripped.indexOf('#');
    const base = hash === -1 ? stripped : stripped.slice(0, hash);
    const tail = hash === -1 ? '' : stripped.slice(hash);
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'view=readonly' + tail;
  }

  async function requestShortUrl(readonly) {
    const encoded = encodeStateForUrl();
    const hashUrl = withViewFlag(plannerHubBase(), readonly) + '#s=' + encoded;
    try { window.history.replaceState(null, '', '#s=' + encoded); } catch (e) {}
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: encoded,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return hashUrl;
      const data = await res.json();
      if (!data || !data.url) return hashUrl;
      return readonly ? data.url + '?view=readonly' : data.url;
    } catch (e) {
      if (timer) clearTimeout(timer);
      return hashUrl;
    }
  }

  function shareLink(options) {
    options = options || {};
    if (hasBackdrop()) {
      showToast('Background photos can’t fit in a share link — use Save File instead. Link will share the layout without the photo.', 6000);
    }
    const encoded = encodeStateForUrl();
    const query = options.readonly ? '?view=readonly' : '';
    const url = plannerHubBase() + query + '#s=' + encoded;
    try { window.history.replaceState(null, '', '#s=' + encoded); } catch (e) {}
    try {
      if (window.parent && window.parent !== window &&
          window.parent.location.origin === window.location.origin) {
        window.parent.history.replaceState(null, '', query + '#s=' + encoded);
      }
    } catch (e) { /* cross-origin denial */ }

    const successMsg = url.length > 8000
      ? 'Share link copied (long — for big layouts, Save File is more reliable)'
      : 'Share link copied — paste anywhere';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast(successMsg, url.length > 8000 ? 5000 : 2500),
        () => fallbackCopy(url)
      );
    } else {
      fallbackCopy(url);
    }

    track('planner_share', { method: 'hash', readonly: !!options.readonly });
    requestShortUrl(!!options.readonly).then(shortUrl => {
      if (shortUrl.indexOf('/p/') !== -1) {
        track('planner_share', { method: 'short', readonly: !!options.readonly });
      }
      showShareSheet(shortUrl, { readonly: !!options.readonly });
    });
  }

  function emailLayoutToMe(url) {
    plPrompt('Send this layout to which email?', '', {
      okLabel: 'Open email',
      inputType: 'email',
    }).then(addr => {
      if (!addr) return;
      const subject = encodeURIComponent('Your Forever Party Rentals layout');
      const body = encodeURIComponent(
        'Here’s your layout:\n' + url + '\n\nOpen the link to keep editing, or tap Book this layout to pay a 25% deposit. Call 778-990-7983 anytime.\n'
      );
      location.href = 'mailto:' + encodeURIComponent(addr.trim()) + '?subject=' + subject + '&body=' + body;
      track('planner_email_layout', { method: 'mailto' });
    });
  }

  // Share sheet — shown when a short (or fallback hash) link is ready.
  function showShareSheet(shortUrl, options) {
    options = options || {};
    let readonly = !!options.readonly;
    let currentUrl = withViewFlag(shortUrl, readonly);
    const existing = document.getElementById('plShareSheet');
    if (existing) existing.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'pl-modal-backdrop';
    backdrop.id = 'plShareSheet';
    backdrop.innerHTML = `
      <div class="pl-modal pl-share-modal" role="dialog" aria-modal="true" aria-label="Share your layout">
        <div class="pl-modal-body">
          <div class="pl-share-title">Your layout link</div>
          <div class="pl-share-toggle">
            <button type="button" class="pl-btn" data-act="edit">Anyone can edit</button>
            <button type="button" class="pl-btn" data-act="view">View only</button>
          </div>
          <div class="pl-share-url"></div>
          <div class="pl-share-qr" aria-label="QR code for this layout link"></div>
          <p class="pl-share-hint">Scan with a phone, or email it to finish on a laptop.</p>
        </div>
        <div class="pl-modal-footer">
          <button type="button" class="pl-btn" data-act="email">Email me this layout</button>
          <button type="button" class="pl-btn" data-act="close">Done</button>
          <button type="button" class="pl-btn pl-btn-gold" data-act="copy">Copy link</button>
        </div>
      </div>
    `;
    const urlEl = backdrop.querySelector('.pl-share-url');
    const paintToggle = () => {
      backdrop.querySelector('[data-act="edit"]').classList.toggle('pl-btn-active', !readonly);
      backdrop.querySelector('[data-act="view"]').classList.toggle('pl-btn-active', readonly);
      currentUrl = withViewFlag(shortUrl, readonly);
      urlEl.textContent = currentUrl;
    };
    const drawQr = () => {
      loadQrLib().then(() => {
        try {
          const qr = window.qrcode(0, 'M');
          qr.addData(currentUrl);
          qr.make();
          const host = backdrop.querySelector('.pl-share-qr');
          if (host) host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
        } catch (e) { /* QR is decorative */ }
      }).catch(() => {});
    };
    paintToggle();
    const onShareKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    const close = () => {
      document.removeEventListener('keydown', onShareKey, true);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };
    document.addEventListener('keydown', onShareKey, true);
    backdrop.addEventListener('click', e => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === backdrop) close();
      else if (act === 'edit') { readonly = false; paintToggle(); drawQr(); }
      else if (act === 'view') { readonly = true; paintToggle(); drawQr(); }
      else if (act === 'email') emailLayoutToMe(currentUrl);
      else if (act === 'copy') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(currentUrl).then(
            () => {
              const btn = backdrop.querySelector('[data-act="copy"]');
              if (btn) btn.textContent = 'Copied!';
            },
            () => fallbackCopy(currentUrl)
          );
        } else {
          fallbackCopy(currentUrl);
        }
      }
    });
    document.body.appendChild(backdrop);
    drawQr();
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    showToast(success ? 'Share link copied' : 'Press Ctrl+C to copy', 4000);
  }

  // ── localStorage auto-save ────────────────────────────────────────────
  // Saves the user's working state on every commit (debounced 500ms) so a
  // page refresh, a closed tab, or a navigation away doesn't lose work.
  // Restore happens at init AFTER URL hash / ?template= are checked, so
  // shared links and templates always win over the previous session.
  const STORAGE_KEY = 'fpr-planner-state-v2';
  let autoSaveTimer = null;
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveToStorage, 500);
  }
  let warnedAutosave = false;
  function saveToStorage() {
    try {
      const payload = JSON.stringify({
        ...serializeState(),
        version: SAVE_VERSION,
        timestamp: Date.now(),
      });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
      // Quota full or storage disabled — warn ONCE so the user knows to
      // Save File / Share instead of trusting silent auto-save.
      if (!warnedAutosave) {
        warnedAutosave = true;
        showToast("Auto-save isn't working in this browser (storage full or blocked) — use Save File or Share to keep your layout.", 6000);
      }
    }
  }
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.venue || !Array.isArray(parsed.items)) return null;
      // Ignore empty-canvas snapshots — no value in restoring "nothing"
      if (parsed.items.length === 0) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Toast ─────────────────────────────────────────────────────────────
  function showToast(message, durationMs = 2500) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { dom.toast.hidden = true; }, durationMs);
  }

  // ── In-DOM confirm dialog ─────────────────────────────────────────────
  // Replacement for window.confirm() that works inside the Fullscreen API.
  // Native confirm() is suppressed by Chrome/Edge in fullscreen (page goes
  // black until dismissed). This builds a real DOM modal, so it lives
  // inside the fullscreened element and renders normally.
  function plConfirm(message, opts) {
    opts = opts || {};
    const okLabel     = opts.okLabel     || 'OK';
    const cancelLabel = opts.cancelLabel || 'Cancel';
    const danger      = !!opts.danger;
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'pl-modal-backdrop';
      backdrop.innerHTML = `
        <div class="pl-modal pl-confirm-modal" role="alertdialog" aria-modal="true">
          <div class="pl-modal-body">
            <p class="pl-confirm-message"></p>
          </div>
          <div class="pl-modal-footer">
            <button type="button" class="pl-btn" data-act="cancel"></button>
            <button type="button" class="pl-btn ${danger ? 'pl-btn-danger' : 'pl-btn-gold'}" data-act="ok"></button>
          </div>
        </div>
      `;
      backdrop.querySelector('.pl-confirm-message').textContent = message;
      backdrop.querySelector('[data-act="cancel"]').textContent = cancelLabel;
      backdrop.querySelector('[data-act="ok"]').textContent = okLabel;

      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
      };
      backdrop.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'ok') close(true);
        else if (act === 'cancel' || e.target === backdrop) close(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(backdrop);
      const okBtn = backdrop.querySelector('[data-act="ok"]');
      if (okBtn) okBtn.focus();
    });
  }

  // In-DOM prompt dialog — same fullscreen-safety reasoning as plConfirm.
  // Returns Promise<string|null>; null = cancelled, '' = empty submit.
  function plPrompt(message, defaultValue, opts) {
    opts = opts || {};
    const okLabel     = opts.okLabel     || 'OK';
    const cancelLabel = opts.cancelLabel || 'Cancel';
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'pl-modal-backdrop';
      backdrop.innerHTML = `
        <div class="pl-modal pl-confirm-modal" role="dialog" aria-modal="true">
          <div class="pl-modal-body">
            <p class="pl-confirm-message"></p>
            <input type="text" class="pl-confirm-input" />
          </div>
          <div class="pl-modal-footer">
            <button type="button" class="pl-btn" data-act="cancel"></button>
            <button type="button" class="pl-btn pl-btn-gold" data-act="ok"></button>
          </div>
        </div>
      `;
      backdrop.querySelector('.pl-confirm-message').textContent = message;
      const input = backdrop.querySelector('.pl-confirm-input');
      if (opts.inputType) input.type = opts.inputType;
      if (opts.inputType === 'date') input.min = minDateStr();
      input.value = defaultValue || '';
      backdrop.querySelector('[data-act="cancel"]').textContent = cancelLabel;
      backdrop.querySelector('[data-act="ok"]').textContent = okLabel;

      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && document.activeElement === input) {
          e.preventDefault(); e.stopPropagation(); close(input.value);
        }
      };
      backdrop.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'ok') close(input.value);
        else if (act === 'cancel' || e.target === backdrop) close(null);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(backdrop);
      input.focus();
      input.select();
    });
  }

  // ── Save / Load ───────────────────────────────────────────────────────
  function saveJSON() {
    track('planner_export', { format: 'json' });
    const out = serializeState({ withMeta: true });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const fname = (state.eventName.trim() || 'event-layout').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() + '.json';
    triggerDownload(blob, fname);
    showToast('Saved — check your Downloads folder for ' + fname, 4000);
  }
  function loadJSON() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (err) {
          showToast('That file does not look like a saved layout.', 4000);
          return;
        }
        // Validate shape BEFORE committing so a bad file doesn't leave a
        // spurious history entry that Undo would have to walk past.
        if (!parsed || !parsed.venue || !Array.isArray(parsed.items)) {
          showToast('That file does not look like a saved layout.', 4000);
          return;
        }
        try {
          commit();
          applyState(parsed);
          fitToVenue();
          render();
        } catch (err) {
          // applyState only throws on the same shape check we did above,
          // but pop the history entry just in case for symmetry.
          history.pop();
          showToast('That file does not look like a saved layout.', 4000);
        }
      };
      reader.readAsText(f);
    };
    inp.click();
  }

  // Build a chrome-free SVG of the current layout, suitable for PNG raster
  // export OR direct insertion into the print page. Returns { svg, width,
  // height } in pixels. Handles backdrop image AND polygon venues.
  // includeFooter=true draws the FPR brand strip; the print page sets
  // false because it has its own header/footer.
  function buildExportSVG({ includeFooter = true, includeFooterBrand = true, dimensions = false, scaleBar = false } = {}) {
    const PX_PER_FT = 24;
    // Permit-style exports draw dimension lines outside the venue, so the
    // page needs a wider margin to fit them.
    const margin = dimensions ? 72 : 36;
    const W = state.venue.widthFt * PX_PER_FT + margin * 2;
    const H = state.venue.depthFt * PX_PER_FT + margin * 2;

    const out = document.createElementNS(SVGNS, 'svg');
    out.setAttribute('xmlns', SVGNS);
    out.setAttribute('width', W);
    out.setAttribute('height', H);
    out.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // Defs + clipPath so the grid stays inside the polygon (or rectangle).
    const exportClipId = 'pl-export-clip-' + Math.floor(Math.random() * 1e9);
    const defs = document.createElementNS(SVGNS, 'defs');
    out.appendChild(defs);
    const clip = document.createElementNS(SVGNS, 'clipPath');
    clip.setAttribute('id', exportClipId);
    defs.appendChild(clip);
    if (isPolygonVenue()) {
      const cp = document.createElementNS(SVGNS, 'polygon');
      cp.setAttribute('points', state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '));
      clip.appendChild(cp);
    } else {
      const cr = document.createElementNS(SVGNS, 'rect');
      cr.setAttribute('x', 0); cr.setAttribute('y', 0);
      cr.setAttribute('width', state.venue.widthFt);
      cr.setAttribute('height', state.venue.depthFt);
      clip.appendChild(cr);
    }

    // White background (so transparent SVG areas turn white in PNG)
    const bg = document.createElementNS(SVGNS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', W); bg.setAttribute('height', H);
    bg.setAttribute('fill', '#fff');
    out.appendChild(bg);

    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `translate(${margin}, ${margin}) scale(${PX_PER_FT})`);
    out.appendChild(g);

    // Page-fill (white venue area) — drawn first, so the backdrop sits
    // ABOVE it and the photo is visible. Stroke comes later, on top of
    // grid + backdrop, so the boundary stays crisp.
    if (isPolygonVenue()) {
      const pf = document.createElementNS(SVGNS, 'polygon');
      pf.setAttribute('points', state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '));
      pf.setAttribute('fill', '#fff');
      pf.setAttribute('stroke', 'none');
      g.appendChild(pf);
    } else {
      const pf = document.createElementNS(SVGNS, 'rect');
      pf.setAttribute('x', 0); pf.setAttribute('y', 0);
      pf.setAttribute('width', state.venue.widthFt);
      pf.setAttribute('height', state.venue.depthFt);
      pf.setAttribute('fill', '#fff');
      pf.setAttribute('stroke', 'none');
      g.appendChild(pf);
    }

    // Backdrop on top of the white page-fill
    if (hasBackdrop()) {
      const b = state.venue.backdrop;
      const cx = b.x + b.widthFt / 2, cy = b.y + b.heightFt / 2;
      const bgGroup = document.createElementNS(SVGNS, 'g');
      bgGroup.setAttribute('transform', `translate(${cx}, ${cy}) rotate(${b.rotation || 0}) translate(${-cx}, ${-cy})`);
      g.appendChild(bgGroup);
      const img = document.createElementNS(SVGNS, 'image');
      img.setAttribute('x', b.x); img.setAttribute('y', b.y);
      img.setAttribute('width', b.widthFt); img.setAttribute('height', b.heightFt);
      img.setAttribute('opacity', (b.opacity != null) ? b.opacity : BACKDROP_DEFAULT_OPACITY);
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('href', b.src);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', b.src);
      bgGroup.appendChild(img);
    }

    // Grid (clipped to venue shape)
    const gridG = document.createElementNS(SVGNS, 'g');
    gridG.setAttribute('clip-path', `url(#${exportClipId})`);
    g.appendChild(gridG);
    drawGridInto(gridG);

    // Venue boundary — rect or polygon. Drawn AFTER backdrop + grid so
    // the boundary stroke is on top of both.
    if (isPolygonVenue()) {
      const vp = document.createElementNS(SVGNS, 'polygon');
      vp.setAttribute('points', state.venue.polygon.map(p => `${p.x},${p.y}`).join(' '));
      vp.setAttribute('fill', 'none');
      vp.setAttribute('stroke', '#1E3A2F');
      vp.setAttribute('stroke-width', 2 / PX_PER_FT);
      g.appendChild(vp);
    } else {
      const venueRect = document.createElementNS(SVGNS, 'rect');
      venueRect.setAttribute('x', 0); venueRect.setAttribute('y', 0);
      venueRect.setAttribute('width', state.venue.widthFt);
      venueRect.setAttribute('height', state.venue.depthFt);
      venueRect.setAttribute('fill', 'none');
      venueRect.setAttribute('stroke', '#1E3A2F');
      venueRect.setAttribute('stroke-width', 2 / PX_PER_FT);
      g.appendChild(venueRect);
    }

    // Dimension lines for permit-style exports — venue width above, depth
    // to the left, with end ticks and a centred measurement label. Drawn
    // in feet coordinates (the export <g> is already scaled).
    if (dimensions) {
      const drawDim = (x1, y1, x2, y2, label) => {
        const grp = document.createElementNS(SVGNS, 'g');
        g.appendChild(grp);
        const line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#5a5a5a');
        line.setAttribute('stroke-width', 1.2 / PX_PER_FT);
        grp.appendChild(line);
        // End ticks perpendicular to the line
        const horiz = (y1 === y2);
        for (const [tx, ty] of [[x1, y1], [x2, y2]]) {
          const t = document.createElementNS(SVGNS, 'line');
          if (horiz) {
            t.setAttribute('x1', tx); t.setAttribute('y1', ty - 0.45);
            t.setAttribute('x2', tx); t.setAttribute('y2', ty + 0.45);
          } else {
            t.setAttribute('x1', tx - 0.45); t.setAttribute('y1', ty);
            t.setAttribute('x2', tx + 0.45); t.setAttribute('y2', ty);
          }
          t.setAttribute('stroke', '#5a5a5a');
          t.setAttribute('stroke-width', 1.2 / PX_PER_FT);
          grp.appendChild(t);
        }
        const txt = document.createElementNS(SVGNS, 'text');
        if (horiz) {
          txt.setAttribute('x', (x1 + x2) / 2);
          txt.setAttribute('y', y1 - 0.5);
          txt.setAttribute('text-anchor', 'middle');
        } else {
          txt.setAttribute('x', x1 - 0.5);
          txt.setAttribute('y', (y1 + y2) / 2);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('transform', `rotate(-90 ${x1 - 0.5} ${(y1 + y2) / 2})`);
        }
        txt.setAttribute('font-size', 1.1);
        txt.setAttribute('font-family', 'Jost, sans-serif');
        txt.setAttribute('fill', '#5a5a5a');
        txt.textContent = label;
        grp.appendChild(txt);
      };
      drawDim(0, -1.6, state.venue.widthFt, -1.6, `${state.venue.widthFt} ft`);
      drawDim(-1.6, 0, -1.6, state.venue.depthFt, `${state.venue.depthFt} ft`);
    }

    // Same z-order as the live canvas: tents → others → labels last.
    const xtents  = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'tent');
    const xlabels = state.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'text');
    const xothers = state.items.filter(it => byKey[it.key] && byKey[it.key].shape !== 'tent' && byKey[it.key].shape !== 'text');
    for (const it of xtents)  drawItemInto(g, it, true);
    for (const it of xothers) drawItemInto(g, it, true);
    for (const it of xlabels) drawItemInto(g, it, true);

    if (includeFooter) {
      if (includeFooterBrand) {
        const brLeft = document.createElementNS(SVGNS, 'text');
        brLeft.setAttribute('x', 12);
        brLeft.setAttribute('y', H - 18);
        brLeft.setAttribute('font-family', 'Jost, sans-serif');
        brLeft.setAttribute('font-weight', '600');
        brLeft.setAttribute('font-size', '11');
        brLeft.setAttribute('fill', 'rgba(30,58,47,.85)');
        // Lite-mode export: just "Powered by FPR" + planner URL — no
        // phone/email so partner-site customers see the embedder's contact
        // info, not ours.
        brLeft.textContent = isExternalEmbed ? 'Layout Plan' : 'Forever Party Rentals';
        out.appendChild(brLeft);
        const brContact = document.createElementNS(SVGNS, 'text');
        brContact.setAttribute('x', 12);
        brContact.setAttribute('y', H - 6);
        brContact.setAttribute('font-family', 'Jost, sans-serif');
        brContact.setAttribute('font-size', '10');
        brContact.setAttribute('fill', 'rgba(30,58,47,.55)');
        brContact.textContent = isExternalEmbed
          ? 'Powered by Forever Party Rentals  ·  foreverpartyrentals.com/event-layout-planner'
          : '778-990-7983  ·  welcome@foreverpartyrentals.com  ·  foreverpartyrentals.com';
        out.appendChild(brContact);
      }
      const brRight = document.createElementNS(SVGNS, 'text');
      brRight.setAttribute('x', W - 12);
      brRight.setAttribute('y', H - 8);
      brRight.setAttribute('text-anchor', 'end');
      brRight.setAttribute('font-family', 'Jost, sans-serif');
      brRight.setAttribute('font-size', '10');
      brRight.setAttribute('fill', 'rgba(30,58,47,.55)');
      brRight.textContent = `${state.venue.widthFt}×${state.venue.depthFt} ft layout${state.eventName ? ' — ' + state.eventName : ''}`;
      out.appendChild(brRight);
    }

    // Graphic scale bar, centred in the bottom margin — the drawing is
    // dimensionally true (PX_PER_FT), so a ruler makes printed copies
    // measurable even after arbitrary resizing.
    if (scaleBar) {
      const barFt = state.venue.widthFt >= 24 ? 10 : 5;
      const barPx = barFt * PX_PER_FT;
      const bx = (W - barPx) / 2;
      const by = H - 14;
      const mkLine = (x1, y1, x2, y2) => {
        const l = document.createElementNS(SVGNS, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('stroke', '#5a5a5a');
        l.setAttribute('stroke-width', 1.2);
        out.appendChild(l);
      };
      mkLine(bx, by, bx + barPx, by);
      mkLine(bx, by - 5, bx, by + 5);
      mkLine(bx + barPx / 2, by - 3, bx + barPx / 2, by + 3);
      mkLine(bx + barPx, by - 5, bx + barPx, by + 5);
      const lbl = document.createElementNS(SVGNS, 'text');
      lbl.setAttribute('x', bx + barPx / 2);
      lbl.setAttribute('y', by - 8);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-family', 'Jost, sans-serif');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', '#5a5a5a');
      lbl.textContent = `${barFt} ft`;
      out.appendChild(lbl);
    }

    return { svg: out, width: W, height: H };
  }

  function savePNG() {
    track('planner_export', { format: 'png' });
    const { svg: out, width: W, height: H } = buildExportSVG({ scaleBar: true });
    const xml = new XMLSerializer().serializeToString(out);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      const canv = document.createElement('canvas');
      canv.width = W * 2; canv.height = H * 2;  // 2x for crispness
      const ctx = canv.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canv.toBlob(blob => {
        const fname = (state.eventName.trim() || 'event-layout').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() + '.png';
        triggerDownload(blob, fname);
      }, 'image/png');
    };
    img.onerror = () => showToast('Could not export PNG. Try saving the JSON instead.', 4000);
    img.src = url;
  }

  // ── One-click PDF export ──────────────────────────────────────────────
  // jsPDF + svg2pdf are vendored under planner/vendor/ (the embed CSP is
  // script-src 'self', so no CDN) and lazy-loaded on first use to keep the
  // initial payload unchanged. Falls back to printPlan() if loading or
  // rendering fails. Vector text in the SVG maps to Helvetica — fine for a
  // working drawing; the print path keeps the web fonts.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  let pdfLibsPromise = null;
  function loadPdfLibs() {
    if (pdfLibsPromise) return pdfLibsPromise;
    pdfLibsPromise = loadScript('planner/vendor/jspdf.umd.min.js?v=1')
      .then(() => loadScript('planner/vendor/svg2pdf.umd.min.js?v=1'))
      .catch(err => { pdfLibsPromise = null; throw err; });
    return pdfLibsPromise;
  }
  let qrLibPromise = null;
  function loadQrLib() {
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = loadScript('planner/vendor/qrcode.min.js?v=1')
      .catch(err => { qrLibPromise = null; throw err; });
    return qrLibPromise;
  }

  async function savePDF() {
    track('planner_export', { format: 'pdf' });
    showToast('Preparing your PDF…', 2500);
    try {
      await loadPdfLibs();
      const { jsPDF } = window.jspdf;
      // Permit-style drawing: dimension lines on the venue boundary.
      const { svg: out, width: W, height: H } = buildExportSVG({ dimensions: true, scaleBar: true });
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;
      const headerH = 48;
      const footerH = 16;

      // Page 1 — drawn title block + the dimensioned layout drawing.
      const title = state.eventName.trim() || 'Event Layout';
      const venueStr = isPolygonVenue()
        ? `Venue ${state.venue.widthFt} × ${state.venue.depthFt} ft (custom shape, ${Math.round(venueAreaFt2()).toLocaleString()} sq ft)`
        : `Venue ${state.venue.widthFt} × ${state.venue.depthFt} ft (${Math.round(venueAreaFt2()).toLocaleString()} sq ft)`;
      const pdfStats = computePlanStats();
      const eventDateVal = (document.getElementById('plEventDate') || {}).value || '';

      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2 - headerH - footerH;
      const k = Math.min(availW / W, availH / H);
      // True drawing scale: the export renders 24 px per foot, jsPDF uses
      // 72 pt per inch — so feet-per-inch on paper = 72 / (24 · k).
      const ftPerInch = 72 / (24 * k);

      // Bordered title block: event info left, scale/date/brand right.
      const tbTop = margin - 10;
      const tbH = 42;
      const divX = pageW - margin - 200;
      doc.setDrawColor(120);
      doc.setLineWidth(0.75);
      doc.rect(margin, tbTop, pageW - margin * 2, tbH);
      doc.line(divX, tbTop, divX, tbTop + tbH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, margin + 8, tbTop + 17);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(110);
      doc.text(
        `${venueStr}  ·  Seated ${pdfStats.seated} / Standing ${pdfStats.standing}` +
        (eventDateVal ? `  ·  Event date ${eventDateVal}` : ''),
        margin + 8, tbTop + 32
      );
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(isExternalEmbed ? 'Layout Plan' : 'Forever Party Rentals', divX + 8, tbTop + 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Scale ≈ 1 in : ${ftPerInch.toFixed(1)} ft`, divX + 8, tbTop + 24);
      doc.text(`Prepared ${new Date().toLocaleDateString('en-CA')}`, divX + 8, tbTop + 35);
      doc.setTextColor(0);

      await doc.svg(out, {
        x: margin + (availW - W * k) / 2,
        y: margin + headerH,
        width: W * k,
        height: H * k,
      });

      // Permit footer — dimensions are stated on the drawing itself.
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text(
        isExternalEmbed
          ? 'All dimensions in feet. Verify site measurements before submission.'
          : 'All dimensions in feet. Verify site measurements before permit submission. Prepared with the Forever Party Rentals Event Layout Planner — foreverpartyrentals.com/event-layout-planner',
        margin, pageH - margin + 14
      );
      doc.setTextColor(0);

      // Page 2 — itemized summary (portrait). Lite/partner mode mirrors the
      // print page: quantities only, no FPR pricing.
      doc.addPage('letter', 'portrait');
      const pw = doc.internal.pageSize.getWidth();
      let y = margin + 6;
      const writeLine = (text, { size = 10, bold = false, color = 0, gap = 15 } = {}) => {
        if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage('letter', 'portrait'); y = margin + 6; }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(color);
        doc.text(String(text), margin, y);
        y += gap;
      };

      writeLine(title, { size: 14, bold: true, gap: 18 });
      writeLine(venueStr, { size: 9, color: 110, gap: 20 });

      const stats = computePlanStats();
      writeLine('CAPACITY', { size: 10, bold: true });
      writeLine(`Seated: ${stats.seated}    Standing (covered): ${stats.standing}`, { gap: 22 });

      writeLine('ITEMS', { size: 10, bold: true });
      const entries = Object.entries(stats.counts);
      if (entries.length === 0) writeLine('(no items placed)', { color: 110 });
      for (const [key, qty] of entries) {
        const cat = byKey[key];
        // Mark non-rental placeholders so the list can't read as an order.
        const suffix = (cat && (cat.shape === 'planning' || cat.shape === 'customArea'))
          ? '   (planning placeholder — not a rental)' : '';
        writeLine(`${qty} ×  ${cat ? cat.label : key}${suffix}`);
      }
      const hasTentAnnotations = state.items.some(it => {
        const c = byKey[it.key];
        return c && c.shape === 'tent' && (it.walls || it.clearance);
      });
      if (hasTentAnnotations) {
        writeLine(
          `Tent annotations: sidewalls/entrances as drawn; stake/ballast zone extends ~${TENT_CLEARANCE_FT} ft beyond the canopy.`,
          { size: 8, color: 110 }
        );
      }
      y += 8;

      // Seating chart — only when a guest list exists. Long name lists
      // wrap via splitTextToSize so a 12-top doesn't run off the page.
      if (state.guests.length > 0) {
        const wrapWidth = pw - margin * 2;
        const writeWrapped = (text, opts) => {
          for (const ln of doc.splitTextToSize(String(text), wrapWidth)) writeLine(ln, opts);
        };
        writeLine('SEATING', { size: 10, bold: true });
        for (const r of tableDisplayList()) {
          if (!r.guests.length) continue;
          writeWrapped(
            `Table ${r.num} (${r.guests.length}/${r.seats}):  ${r.guests.map(g => g.name).join(', ')}`
          );
        }
        const un = unassignedGuests();
        if (un.length) {
          writeWrapped(`Unseated (${un.length}):  ${un.map(g => g.name).join(', ')}`, { color: 110 });
        }
        y += 8;
      }

      if (!isExternalEmbed) {
        const lines = buildLineItems();
        if (lines.length) {
          writeLine('ESTIMATED COST', { size: 10, bold: true });
          // Aligned columns: qty×label left, unit price + subtotal right.
          const colUnit = pw - margin - 90;
          const colSub  = pw - margin;
          let grand = 0;
          doc.setFontSize(8);
          doc.setTextColor(110);
          doc.text('unit', colUnit, y - 2, { align: 'right' });
          doc.text('subtotal', colSub, y - 2, { align: 'right' });
          doc.setDrawColor(190);
          doc.setLineWidth(0.5);
          doc.line(margin, y + 1, colSub, y + 1);
          y += 12;
          doc.setTextColor(0);
          for (const l of lines) {
            grand += l.subtotal;
            if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage('letter', 'portrait'); y = margin + 6; }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`${l.qty} ×  ${l.label}`, margin, y);
            const unitLabel = l.unit === 'day' ? `${fmtMoney(l.unitPrice)}/rental` : `${fmtMoney(l.unitPrice)}/event`;
            doc.text(unitLabel, colUnit, y, { align: 'right' });
            doc.text(fmtMoney(l.subtotal), colSub, y, { align: 'right' });
            y += 15;
          }
          doc.line(margin, y - 9, colSub, y - 9);
          writeLine(`Estimated total: ${fmtMoney(grand)} CAD`, { bold: true, gap: 13 });
          writeLine('(List prices, pre-tax, before delivery & setup. Final quote reflects package discounts.)', { size: 8, color: 110, gap: 22 });
        }
        writeLine('Forever Party Rentals  ·  778-990-7983  ·  welcome@foreverpartyrentals.com', { size: 9, color: 110 });
        writeLine(PLANNER_HUB_URL, { size: 9, color: 110 });
      }

      const fname = (state.eventName.trim() || 'event-layout').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() + '.pdf';
      doc.save(fname);
    } catch (err) {
      showToast('PDF export hit a snag — opening Print instead (choose "Save as PDF").', 4000);
      printPlan();
    }
  }

  // ── Print / Save as PDF ──────────────────────────────────────────────
  // Builds a print-only DOM page (title block + layout SVG + legend +
  // scale bar + footer) and triggers window.print(). The user can then
  // pick "Save as PDF" in the browser's print dialog. No external libs.
  function printPlan() {
    track('planner_export', { format: 'print' });
    // Remove any leftover print page from a previous attempt
    const existing = document.getElementById('plPrintPage');
    if (existing) existing.remove();

    const pp = buildPrintPage();
    document.body.appendChild(pp);
    document.body.classList.add('pl-printing');

    const cleanup = () => {
      document.body.classList.remove('pl-printing');
      const node = document.getElementById('plPrintPage');
      if (node) node.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    // Browsers handle window.print() inconsistently inside fullscreen
    // (Safari/Firefox sometimes blank out the preview). Exit fullscreen
    // first, wait for the transition, then print.
    const doPrint = () => setTimeout(() => window.print(), 60);
    if (isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      const result = exit ? exit.call(document) : null;
      if (result && typeof result.then === 'function') {
        result.then(doPrint, doPrint);
      } else {
        setTimeout(doPrint, 200);
      }
    } else {
      doPrint();
    }
  }

  function buildPrintPage() {
    const pp = document.createElement('div');
    pp.id = 'plPrintPage';
    pp.className = 'pl-print-page';

    // Header / title block
    const header = document.createElement('header');
    header.className = 'pl-print-header';
    const eventLine = state.eventName.trim()
      ? `<div class="pl-print-event">${escapeHtml(state.eventName.trim())}</div>` : '';
    const dateStr = (new Date()).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    const lines = buildLineItems();
    let seatedTotal = 0;
    for (const it of state.items) {
      const cat = byKey[it.key];
      if (!cat) continue;
      if (cat.key && cat.key.includes('chair')) seatedTotal += (cat.seats || 0);
    }
    const venueStr = isPolygonVenue()
      ? `${state.venue.widthFt.toFixed(1)} × ${state.venue.depthFt.toFixed(1)} ft (custom shape, ${Math.round(venueAreaFt2()).toLocaleString()} sq ft)`
      : `${state.venue.widthFt} × ${state.venue.depthFt} ft`;
    // In lite mode (third-party embedders) the print page is "powered by"
    // FPR but does NOT carry our phone/email — partner sites expect their
    // own contact info to be the only one their customer sees.
    const brandHTML = isExternalEmbed
      ? `<div class="pl-print-brand-name">Layout Plan</div>
         <div class="pl-print-brand-contact">Powered by <strong>Forever Party Rentals</strong> · foreverpartyrentals.com/event-layout-planner</div>`
      : `<div class="pl-print-brand-name">Forever Party Rentals</div>
         <div class="pl-print-brand-contact">778-990-7983 &nbsp;·&nbsp; welcome@foreverpartyrentals.com &nbsp;·&nbsp; foreverpartyrentals.com</div>`;
    header.innerHTML = `
      <div class="pl-print-brand">
        ${brandHTML}
      </div>
      <div class="pl-print-meta">
        ${eventLine}
        <div class="pl-print-meta-row">${venueStr}</div>
        <div class="pl-print-meta-row">${seatedTotal} seated · printed ${dateStr}</div>
      </div>
    `;
    pp.appendChild(header);

    // Layout SVG — use the export builder, no footer (header is above)
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'pl-print-canvas';
    const { svg: layoutSvg } = buildExportSVG({ includeFooter: false, scaleBar: true });
    // Force responsive sizing for print: drop fixed width/height so CSS controls it
    layoutSvg.removeAttribute('width');
    layoutSvg.removeAttribute('height');
    layoutSvg.style.width = '100%';
    layoutSvg.style.height = 'auto';
    layoutSvg.style.maxHeight = '6.5in';
    canvasWrap.appendChild(layoutSvg);
    pp.appendChild(canvasWrap);

    // Legend — line-items + cost. Reuses buildLineItems so the print copy
    // matches the live cost panel exactly. Unpriced planning placeholders
    // (stage, bar, custom areas…) get their own quantity rows, clearly
    // marked as non-rentals so the legend can't read as an order form.
    const planningRows = (() => {
      const counts = {};
      for (const it of state.items) {
        const c = byKey[it.key];
        if (c && (c.shape === 'planning' || c.shape === 'customArea')) {
          counts[c.label] = (counts[c.label] || 0) + 1;
        }
      }
      return Object.entries(counts).map(([label, n]) =>
        `<tr class="pl-print-planning-row"><td>${n}× ${escapeHtml(label)}</td><td class="pl-print-meta-cell" colspan="2">planning placeholder — not a rental</td></tr>`
      ).join('');
    })();
    const legend = document.createElement('section');
    legend.className = 'pl-print-legend';
    if (lines.length === 0 && !planningRows) {
      legend.innerHTML = `<div class="pl-print-legend-title">Items</div><div class="pl-print-empty">No items added.</div>`;
    } else if (isExternalEmbed) {
      // Lite-mode: show items + quantities only — no prices, no totals,
      // no FPR disclaimer. Partner sites use their own pricing.
      const rows = lines.map(l =>
        `<tr><td>${l.qty}× ${escapeHtml(l.label)}</td></tr>`
      ).join('');
      legend.innerHTML = `
        <div class="pl-print-legend-title">Items</div>
        <table class="pl-print-table pl-print-table-lite">
          <tbody>${rows}${planningRows}</tbody>
        </table>
      `;
    } else {
      let perDay = 0, perEvent = 0;
      for (const l of lines) {
        if (l.unit === 'day')   perDay   += l.subtotal;
        if (l.unit === 'event') perEvent += l.subtotal;
      }
      const grand = perDay + perEvent;
      const rows = lines.map(l => {
        const meta = l.unit === 'day'
          ? `${l.qty}× $${l.unitPrice.toFixed(2)} per rental`
          : `${l.qty}× ${fmtMoney(l.unitPrice)}/event`;
        return `<tr><td>${l.qty}× ${escapeHtml(l.label)}</td><td class="pl-print-meta-cell">${meta}</td><td class="pl-print-money">${fmtMoney(l.subtotal)}</td></tr>`;
      }).join('');
      legend.innerHTML = `
        <div class="pl-print-legend-title">Items &amp; Estimated Cost</div>
        <table class="pl-print-table">
          <tbody>${rows}${planningRows}</tbody>
          <tfoot>
            <tr class="pl-print-grand"><td colspan="2">Estimated total</td><td class="pl-print-money">${fmtMoney(grand)}</td></tr>
          </tfoot>
        </table>
        <div class="pl-print-disclaimer">Forever Party Rentals starting prices for a standard event rental (Fri–Sun pickup). Final quote includes delivery, setup, and any package discounts.</div>
      `;
    }
    pp.appendChild(legend);

    // Footer — scale note + url
    const footer = document.createElement('footer');
    footer.className = 'pl-print-footer';
    footer.innerHTML = `
      <span>Plan to scale · 5 ft grid (major), 1 ft grid (minor)</span>
      <span>foreverpartyrentals.com/event-layout-planner</span>
    `;
    pp.appendChild(footer);

    return pp;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // Variants of drawGrid/drawItem that accept any parent (for PNG export
  // SVG, which has its own root).
  function drawGridInto(parent) {
    const w = state.venue.widthFt, d = state.venue.depthFt;
    const PX = 24;
    const sw    = 0.5 / PX;   // 1ft minor in world units → 0.5 px on export
    const swMaj = 1   / PX;   // 5ft major in world units → 1 px on export
    // 1-ft minor lines (skip 5-ft positions; majors drawn next)
    for (let x = 1; x < w; x++) {
      if (x % 5 === 0) continue;
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', x); ln.setAttribute('y1', 0);
      ln.setAttribute('x2', x); ln.setAttribute('y2', d);
      ln.setAttribute('stroke', 'rgba(30,58,47,.05)');
      ln.setAttribute('stroke-width', sw);
      parent.appendChild(ln);
    }
    for (let y = 1; y < d; y++) {
      if (y % 5 === 0) continue;
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('y1', y);
      ln.setAttribute('x2', w); ln.setAttribute('y2', y);
      ln.setAttribute('stroke', 'rgba(30,58,47,.05)');
      ln.setAttribute('stroke-width', sw);
      parent.appendChild(ln);
    }
    // 5-ft major lines
    for (let x = 0; x <= w; x += 5) {
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', x); ln.setAttribute('y1', 0);
      ln.setAttribute('x2', x); ln.setAttribute('y2', d);
      ln.setAttribute('stroke', 'rgba(30,58,47,.28)');
      ln.setAttribute('stroke-width', swMaj);
      parent.appendChild(ln);
    }
    for (let y = 0; y <= d; y += 5) {
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('y1', y);
      ln.setAttribute('x2', w); ln.setAttribute('y2', y);
      ln.setAttribute('stroke', 'rgba(30,58,47,.28)');
      ln.setAttribute('stroke-width', swMaj);
      parent.appendChild(ln);
    }
    // Foot tick labels — every 5 ft on top + left edges, outside the venue
    for (let x = 5; x <= w; x += 5) {
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', -0.4);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'auto');
      t.setAttribute('font-family', 'Jost, sans-serif');
      t.setAttribute('font-weight', '500');
      t.setAttribute('font-size', 0.6);
      t.setAttribute('fill', 'rgba(30,58,47,.55)');
      t.textContent = x + "'";
      parent.appendChild(t);
    }
    for (let y = 5; y <= d; y += 5) {
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', -0.4); t.setAttribute('y', y);
      t.setAttribute('text-anchor', 'end');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-family', 'Jost, sans-serif');
      t.setAttribute('font-weight', '500');
      t.setAttribute('font-size', 0.6);
      t.setAttribute('fill', 'rgba(30,58,47,.55)');
      t.textContent = y + "'";
      parent.appendChild(t);
    }
  }
  // Export draw — same sprite functions as drawItem so PNG/Print output
  // matches the live canvas exactly. The svg() helper works on any parent
  // (it just appendChild's), so we can hand it the export's <g> directly.
  function drawItemInto(parent, item, _forExport) {
    const cat = byKey[item.key];
    if (!cat) return;
    // effectiveSize, same as the live canvas — a resized custom area or
    // planning item must export at its per-item dims, not catalog defaults.
    const sz = effectiveSize(item);
    const cx = item.x + sz.w / 2;
    const cy = item.y + sz.d / 2;
    const g = svg('g', {
      transform: `translate(${cx}, ${cy}) rotate(${item.rotation || 0})`,
    }, parent);
    drawSprite(g, cat, item, sz);
    if (cat.shape === 'tent') {
      const fontFt = Math.min(sz.w, sz.d) * 0.08;
      svg('text', {
        x: 0, y: 0, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
        'font-size': fontFt, fill: 'rgba(30,58,47,.55)',
        'font-family': 'Jost, sans-serif',
      }, g).textContent = `${cat.widthFt}×${cat.depthFt}`;
    }
    // Table numbers print too — caterers and delivery crews work off them.
    drawTableNumberBadge(g, item);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    // Prefer the top frame's document for the click so the download isn't
    // subject to iframe-specific browser restrictions (Safari + some Chrome
    // policies block or silently drop downloads triggered from iframes).
    // Falls back to our own document for cross-origin parents.
    let doc = document;
    try {
      if (window.top && window.top !== window &&
          window.top.location.origin === window.location.origin &&
          window.top.document) {
        doc = window.top.document;
      }
    } catch (e) { /* cross-origin parent — stay in our iframe */ }
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
  }

  // ── Ceremony seating generator ────────────────────────────────────────
  // Generates rows of chairs facing the altar. The block is:
  //   sections × seatsPerSection × rows
  // Sections are split by aisles (1 = theatre, 2 = traditional single
  // aisle, 3 = double aisle). Block is centered horizontally on the venue
  // and placed in the upper portion vertically (leaves room for an altar
  // in front). Adds to current state — does NOT replace existing items.
  function ceremonyDimensions(opts) {
    const cat = byKey[opts.chairKey];
    if (!cat) return { width: 0, depth: 0, total: 0 };
    const cw = cat.widthFt, cd = cat.depthFt;
    const sectionWidth = opts.seatsPerSection * cw + Math.max(0, opts.seatsPerSection - 1) * opts.chairSpacing;
    const totalWidth = opts.sections * sectionWidth + Math.max(0, opts.sections - 1) * opts.aisleWidth;
    const totalDepth = opts.rows * cd + Math.max(0, opts.rows - 1) * opts.rowSpacing;
    const total = opts.sections * opts.seatsPerSection * opts.rows;
    return { width: totalWidth, depth: totalDepth, total, sectionWidth };
  }

  function generateCeremonyChairs(opts) {
    const cat = byKey[opts.chairKey];
    if (!cat) return [];
    const cw = cat.widthFt, cd = cat.depthFt;
    const dims = ceremonyDimensions(opts);
    if (dims.total === 0) return [];

    // Center the block horizontally on the venue.
    // Place vertically so the front of the block sits roughly 1/5 from the
    // top — leaves room for an altar/arbor in front, and a few feet of
    // photographer/processional space behind the back row.
    const offsetX = Math.max(0, (state.venue.widthFt - dims.width) / 2);
    const altarSpace = Math.min(6, state.venue.depthFt * 0.15);
    const offsetY = Math.max(0, altarSpace);

    const chairs = [];
    for (let s = 0; s < opts.sections; s++) {
      const sectionLeft = offsetX + s * (dims.sectionWidth + opts.aisleWidth);
      for (let r = 0; r < opts.rows; r++) {
        const rowY = offsetY + r * (cd + opts.rowSpacing);
        for (let n = 0; n < opts.seatsPerSection; n++) {
          const chairX = sectionLeft + n * (cw + opts.chairSpacing);
          chairs.push({
            id: newId(),
            key: opts.chairKey,
            x: chairX,
            y: rowY,
            rotation: 0,
          });
        }
      }
    }
    return chairs;
  }

  function readCeremonyForm() {
    const sectionsInput = document.querySelector('input[name="cerSections"]:checked');
    return {
      chairKey:        document.getElementById('plCerChair').value,
      sections:        sectionsInput ? parseInt(sectionsInput.value, 10) : 2,
      seatsPerSection: parseInt(document.getElementById('plCerSeats').value, 10) || 1,
      rows:            parseInt(document.getElementById('plCerRows').value, 10) || 1,
      aisleWidth:      parseFloat(document.getElementById('plCerAisle').value) || 0,
      chairSpacing:    parseFloat(document.getElementById('plCerChairSpace').value) || 0,
      rowSpacing:      parseFloat(document.getElementById('plCerRowSpace').value) || 0,
    };
  }

  function updateCeremonyPreview() {
    const opts = readCeremonyForm();
    const dims = ceremonyDimensions(opts);
    document.getElementById('plCerTotal').textContent = dims.total;
    document.getElementById('plCerWidth').textContent = dims.width.toFixed(1);
    document.getElementById('plCerDepth').textContent = dims.depth.toFixed(1);
  }

  function applyCeremony() {
    const opts = readCeremonyForm();
    const chairs = generateCeremonyChairs(opts);
    if (chairs.length === 0) return;
    commit();
    state.items.push(...chairs);
    clearSelection();
    render();
    closeCeremonyModal();
    showToast(`Added ${chairs.length} ceremony chairs`, 2200);
  }

  function openCeremonyModal() {
    const m = document.getElementById('plCeremonyModal');
    if (!m) return;
    updateCeremonyPreview();
    m.hidden = false;
    // Focus first input for keyboard users
    const firstField = document.getElementById('plCerChair');
    if (firstField) setTimeout(() => firstField.focus(), 50);
  }
  function closeCeremonyModal() {
    const m = document.getElementById('plCeremonyModal');
    if (m) m.hidden = true;
  }

  // ── Guest-count wizard ────────────────────────────────────────────────
  // "How many guests?" → seating style + options → preview with tent
  // recommendation and live price → one tap builds the whole layout.
  // Generation lives in layout-gen.js (FPRLayoutGen); recipes come back in
  // templates.json shape so applyState(expandRecipeToState(...)) just works.
  function estimateRecipeCost(recipe) {
    let total = 0;
    for (const r of recipe.items) {
      const cat = byKey[r.key];
      if (cat && cat.priceCAD) total += cat.priceCAD;
      if (r.withChairs && r.chairCount) {
        const ch = byKey[r.chairKey || DEFAULT_CHAIR_KEY];
        if (ch && ch.priceCAD) total += ch.priceCAD * r.chairCount;
      }
    }
    return total;
  }

  let wizardEl = null;
  function closeWizard() {
    if (wizardEl) { wizardEl.remove(); wizardEl = null; }
  }
  function openWizard(source) {
    if (isReadonly) return;
    if (!window.FPRLayoutGen) {
      showToast('Auto-planner unavailable right now — try a template instead.', 3000);
      return;
    }
    track('planner_wizard_start', { source: source || 'toolbar' });
    closeWizard();
    const opts = {
      guests: 50, seating: 'round',
      danceFloor: true, headTable: false, buffet: false, bar: false,
      chairKey: DEFAULT_CHAIR_KEY,
      date: getEventDate(),
      pack: 'efficient',
    };
    let step = 1;

    wizardEl = document.createElement('div');
    wizardEl.className = 'pl-modal-backdrop';
    document.body.appendChild(wizardEl);

    const chairOptions = [];
    for (const g of catalog.groups) {
      for (const c of g.items) if (c.key && c.key.includes('chair')) chairOptions.push(c);
    }

    const renderStep = () => {
      if (step === 1) {
        wizardEl.innerHTML = `
          <div class="pl-modal pl-wizard-modal" role="dialog" aria-modal="true" aria-label="Plan my event">
            <div class="pl-modal-body">
              <div class="pl-wizard-step">Step 1 of 4</div>
              <label class="pl-wizard-date-label" for="plWizDate">Event date</label>
              <input type="date" id="plWizDate" class="pl-wizard-date" min="${minDateStr()}" value="${opts.date || ''}"/>
              <div class="pl-wizard-title">How many guests?</div>
              <input type="number" id="plWizGuests" class="pl-wizard-guests" min="1" max="300" inputmode="numeric" value="${opts.guests}"/>
              <div class="pl-wizard-chips">
                ${[20, 50, 100, 150, 200].map(n => `<button type="button" class="pl-wizard-chip" data-guests="${n}">${n}</button>`).join('')}
              </div>
            </div>
            <div class="pl-modal-footer">
              <button type="button" class="pl-btn" data-act="cancel">Cancel</button>
              <button type="button" class="pl-btn pl-btn-gold" data-act="next">Next</button>
            </div>
          </div>`;
        const inp = wizardEl.querySelector('#plWizGuests');
        inp.focus();
        inp.select();
        wizardEl.querySelectorAll('.pl-wizard-chip').forEach(ch => {
          ch.addEventListener('click', () => { inp.value = ch.dataset.guests; });
        });
      } else if (step === 2) {
        const styles = [
          { key: 'round', label: 'Round tables', hint: 'classic wedding & gala' },
          { key: 'banquet', label: 'Long tables', hint: 'family-style dining' },
          { key: 'cocktail', label: 'Cocktail', hint: 'standing + highboys' },
          { key: 'ceremony', label: 'Ceremony', hint: 'chair rows + aisle' },
        ];
        wizardEl.innerHTML = `
          <div class="pl-modal pl-wizard-modal" role="dialog" aria-modal="true" aria-label="Plan my event">
            <div class="pl-modal-body">
              <div class="pl-wizard-step">Step 2 of 4</div>
              <div class="pl-wizard-title">What style of event?</div>
              <div class="pl-wizard-styles">
                ${styles.map(s => `
                  <button type="button" class="pl-wizard-style${opts.seating === s.key ? ' pl-wizard-style-on' : ''}" data-style="${s.key}">
                    <strong>${s.label}</strong><span>${s.hint}</span>
                  </button>`).join('')}
              </div>
              <div class="pl-wizard-opts">
                <label><input type="checkbox" id="plWizDance" ${opts.danceFloor ? 'checked' : ''}/> Dance floor</label>
                <label><input type="checkbox" id="plWizHead" ${opts.headTable ? 'checked' : ''}/> Head table</label>
                <label><input type="checkbox" id="plWizBuffet" ${opts.buffet ? 'checked' : ''}/> Buffet tables</label>
                <label><input type="checkbox" id="plWizBar" ${opts.bar ? 'checked' : ''}/> Bar station</label>
              </div>
              <div class="pl-wizard-chair-row">
                <label for="plWizChair">Chairs</label>
                <select id="plWizChair" class="pl-inspector-select">
                  ${chairOptions.map(c => `<option value="${c.key}"${c.key === opts.chairKey ? ' selected' : ''}>${c.label}${isExternalEmbed ? '' : ` ($${c.priceCAD.toFixed(2)})`}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="pl-modal-footer">
              <button type="button" class="pl-btn" data-act="back">Back</button>
              <button type="button" class="pl-btn pl-btn-gold" data-act="next">Next</button>
            </div>
          </div>`;
        wizardEl.querySelectorAll('.pl-wizard-style').forEach(btn => {
          btn.addEventListener('click', () => {
            opts.seating = btn.dataset.style;
            wizardEl.querySelectorAll('.pl-wizard-style').forEach(b => b.classList.toggle('pl-wizard-style-on', b === btn));
          });
        });
      } else if (step === 3) {
        const packs = [
          { key: 'efficient', label: 'Most cost-efficient', hint: 'Smallest tent that fits · tighter aisles · lower rental' },
          { key: 'spacious', label: 'Spacious', hint: 'Room to mingle · 4–6 ft aisles · extra space goes between tables' },
        ];
        wizardEl.innerHTML = `
          <div class="pl-modal pl-wizard-modal" role="dialog" aria-modal="true" aria-label="Plan my event">
            <div class="pl-modal-body">
              <div class="pl-wizard-step">Step 3 of 4</div>
              <div class="pl-wizard-title">How should we use the space?</div>
              <div class="pl-wizard-styles pl-wizard-pack">
                ${packs.map(p => `
                  <button type="button" class="pl-wizard-style${opts.pack === p.key ? ' pl-wizard-style-on' : ''}" data-pack="${p.key}">
                    <strong>${p.label}</strong><span>${p.hint}</span>
                  </button>`).join('')}
              </div>
            </div>
            <div class="pl-modal-footer">
              <button type="button" class="pl-btn" data-act="back">Back</button>
              <button type="button" class="pl-btn pl-btn-gold" data-act="next">Preview</button>
            </div>
          </div>`;
        wizardEl.querySelectorAll('[data-pack]').forEach(btn => {
          btn.addEventListener('click', () => {
            opts.pack = btn.dataset.pack;
            wizardEl.querySelectorAll('[data-pack]').forEach(b => b.classList.toggle('pl-wizard-style-on', b === btn));
          });
        });
      } else {
        const recipe = window.FPRLayoutGen.generateLayout(opts);
        const rec = window.FPRLayoutGen.recommendTent(opts);
        if (!recipe) {
          wizardEl.innerHTML = `
            <div class="pl-modal pl-wizard-modal" role="dialog" aria-modal="true">
              <div class="pl-modal-body">
                <div class="pl-wizard-title">That's a big event!</div>
                <p class="pl-wizard-summary">${(rec.notes && rec.notes[0]) || "We couldn't auto-fit that combination."} ${isExternalEmbed ? 'Try fewer guests or a different style.' : "Call us at 778-990-7983 and we'll plan it with you."}</p>
              </div>
              <div class="pl-modal-footer">
                <button type="button" class="pl-btn" data-act="back">Back</button>
                <button type="button" class="pl-btn pl-btn-gold" data-act="cancel">Close</button>
              </div>
            </div>`;
          return;
        }
        wizardEl._recipe = recipe;
        const cost = estimateRecipeCost(recipe);
        let tentLine = '';
        if (rec.fits && rec.tentKeys.length) {
          const tentCounts = {};
          rec.tentKeys.forEach(k => { tentCounts[k] = (tentCounts[k] || 0) + 1; });
          const tentLabel = Object.entries(tentCounts)
            .map(([k, n]) => `${n > 1 ? n + '× ' : ''}${(byKey[k] || {}).label || 'marquee'}`)
            .join(' + ') + (rec.tentKeys.length > 1 ? ' joined' : '');
          tentLine = `${tentLabel} · ${rec.totalSqft.toLocaleString()} sq ft (${rec.sqftPerGuest} sq ft/guest)`;
        }
        wizardEl.innerHTML = `
          <div class="pl-modal pl-wizard-modal" role="dialog" aria-modal="true" aria-label="Plan my event">
            <div class="pl-modal-body">
              <div class="pl-wizard-step">Step 4 of 4</div>
              <div class="pl-wizard-title">${recipe.label}</div>
              <p class="pl-wizard-summary">${recipe.summary}</p>
              ${tentLine ? `<p class="pl-wizard-tent">${tentLine}</p>` : ''}
              ${isExternalEmbed ? '' : `<div class="pl-wizard-cost">Estimated ${fmtMoney(cost)} <span>list prices, before delivery &amp; setup</span></div>`}
              <p class="pl-wizard-note">You can move, add, or remove anything after it's built.</p>
            </div>
            <div class="pl-modal-footer">
              <button type="button" class="pl-btn" data-act="back">Back</button>
              <button type="button" class="pl-btn pl-btn-gold" data-act="apply">Build this layout</button>
            </div>
          </div>`;
      }
    };

    wizardEl.addEventListener('click', e => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'cancel' || e.target === wizardEl) { closeWizard(); return; }
      if (act === 'back') { step = Math.max(1, step - 1); renderStep(); return; }
      if (act === 'next') {
        if (step === 1) {
          const v = parseInt(wizardEl.querySelector('#plWizGuests').value, 10);
          if (!Number.isFinite(v) || v < 1) return;
          opts.guests = Math.min(300, v);
          const d = (wizardEl.querySelector('#plWizDate') || {}).value || '';
          if (d) { opts.date = d; setEventDate(d); }
        } else if (step === 2) {
          opts.danceFloor = wizardEl.querySelector('#plWizDance').checked;
          opts.headTable = wizardEl.querySelector('#plWizHead').checked;
          opts.buffet = wizardEl.querySelector('#plWizBuffet').checked;
          opts.bar = wizardEl.querySelector('#plWizBar').checked;
          opts.chairKey = wizardEl.querySelector('#plWizChair').value;
        }
        step++;
        renderStep();
        return;
      }
      if (act === 'apply') {
        const recipe = wizardEl._recipe;
        const doApply = () => {
          commit();
          applyState(expandRecipeToState(recipe));
          fitToVenue();
          render();
          track('planner_wizard_complete', {
            guests: opts.guests,
            style: opts.seating,
            pack: opts.pack || 'efficient',
            tent_key: (recipe.items.find(i => byKey[i.key] && byKey[i.key].shape === 'tent') || {}).key || 'none',
          });
          closeWizard();
          showToast('Built! Drag anything to fine-tune, then Book this layout or Call.', 3500);
          if (opts.date) { setEventDate(opts.date); checkAvailability(); }
          maybeOfferCocktailHour(opts.guests, opts.seating);
        };
        if (state.items.length > 0) {
          plConfirm('Replace your current layout with this plan?', { okLabel: 'Replace' })
            .then(ok => { if (ok) doApply(); });
        } else {
          doApply();
        }
      }
    });
    document.addEventListener('keydown', function onWizKey(e) {
      if (!wizardEl) { document.removeEventListener('keydown', onWizKey, true); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeWizard(); }
    }, true);

    renderStep();
  }

  function setupCeremonyModal() {
    const btn = document.getElementById('plBtnCeremony');
    const modal = document.getElementById('plCeremonyModal');
    if (!btn || !modal) return;

    btn.addEventListener('click', openCeremonyModal);
    document.getElementById('plCerClose').addEventListener('click', closeCeremonyModal);
    document.getElementById('plCerCancel').addEventListener('click', closeCeremonyModal);
    document.getElementById('plCerApply').addEventListener('click', applyCeremony);

    // Backdrop click closes (but only when clicked outside the dialog)
    modal.addEventListener('click', e => { if (e.target === modal) closeCeremonyModal(); });

    // Escape key closes
    document.addEventListener('keydown', e => {
      if (!modal.hidden && e.key === 'Escape') { e.preventDefault(); closeCeremonyModal(); }
    });

    // Live-preview: rebind on every input change
    const fields = ['plCerChair', 'plCerSeats', 'plCerRows', 'plCerAisle', 'plCerChairSpace', 'plCerRowSpace'];
    for (const id of fields) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateCeremonyPreview);
    }
    document.querySelectorAll('input[name="cerSections"]').forEach(el => el.addEventListener('change', updateCeremonyPreview));
  }

  // ── Templates menu ────────────────────────────────────────────────────
  // ── User-saved templates ──────────────────────────────────────────────
  // Persisted to localStorage under USER_TEMPLATES_KEY. The Templates
  // dropdown lists built-ins first, then a divider, then the user's own
  // saved layouts (with a small × delete button). "Save current" lives
  // at the bottom and prompts for a name.
  const USER_TEMPLATES_KEY = 'fpr-planner-user-templates-v1';

  function loadUserTemplates() {
    try {
      const raw = localStorage.getItem(USER_TEMPLATES_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveUserTemplates(arr) {
    try {
      localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(arr));
    } catch (e) { /* quota — silent */ }
  }

  function summarizeCurrentLayout() {
    const counts = { tent: 0, table: 0, chair: 0, df: 0, label: 0 };
    let seats = 0;
    for (const it of state.items) {
      const cat = byKey[it.key];
      if (!cat) continue;
      if (cat.shape === 'tent') counts.tent++;
      else if (cat.shape === 'danceFloor') counts.df++;
      else if (cat.shape === 'text') counts.label++;
      else if (cat.key && cat.key.includes('chair')) { counts.chair++; seats += cat.seats || 0; }
      else if (cat.key && cat.key.includes('table')) counts.table++;
    }
    const parts = [];
    parts.push(`${state.venue.widthFt}×${state.venue.depthFt} ft`);
    if (counts.tent)  parts.push(`${counts.tent} tent${counts.tent === 1 ? '' : 's'}`);
    if (counts.table) parts.push(`${counts.table} table${counts.table === 1 ? '' : 's'}`);
    if (seats)        parts.push(`${seats} seat${seats === 1 ? '' : 's'}`);
    if (counts.df)    parts.push(`dance floor`);
    return parts.join(' · ');
  }

  function saveCurrentAsUserTemplate() {
    if (state.items.length === 0) {
      showToast('Add some items first, then save as a template.', 3500);
      return;
    }
    const defaultName = state.eventName.trim() || 'My layout';
    plPrompt('Name this template (e.g., "Aunt Mary\'s backyard 50"):', defaultName, { okLabel: 'Save template' }).then(name => {
      if (name == null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const list = loadUserTemplates();
      list.push({
        id: 'user-' + Date.now(),
        label: trimmed,
        summary: summarizeCurrentLayout(),
        savedAt: Date.now(),
        state: serializeState(),
      });
      saveUserTemplates(list);
      showToast('Saved — find it under Templates ▼', 3000);
      // Re-render the menu so the new template shows up immediately.
      rebuildTemplatesMenu();
    });
  }

  function deleteUserTemplate(id) {
    const list = loadUserTemplates();
    const next = list.filter(t => t.id !== id);
    saveUserTemplates(next);
    rebuildTemplatesMenu();
    showToast('Template deleted.', 2000);
  }

  function applyUserTemplate(id) {
    const list = loadUserTemplates();
    const t = list.find(x => x.id === id);
    if (!t) return;
    const doApply = () => {
      commit();
      applyState(t.state);
      fitToVenue();
      render();
    };
    if (state.items.length === 0) { doApply(); return; }
    plConfirm(`Replace your current layout with "${t.label}"?`, { okLabel: 'Replace' })
      .then(ok => { if (ok) doApply(); });
  }

  // Rebuild the Templates dropdown contents — called on init AND whenever
  // user-saved templates change. Kept as a separate function so save/delete
  // handlers can refresh it without touching the rest of the menu logic.
  let templatesMenuWiredUp = false;
  function rebuildTemplatesMenu() {
    const menu = document.getElementById('plTemplatesMenu');
    if (!menu) return;
    const userTemplates = loadUserTemplates();
    let html = '';
    if (templates.length) {
      html += '<div class="pl-menu-section">Built-in templates</div>';
      html += templates.map(t => `
        <button type="button" class="pl-menu-item" data-template-id="${t.id}" data-kind="builtin">
          <span class="pl-menu-label">${escapeHtml(t.label)}</span>
          <span class="pl-menu-summary">${escapeHtml(t.summary)}</span>
        </button>
      `).join('');
    }
    if (userTemplates.length) {
      html += '<div class="pl-menu-section">Your templates</div>';
      html += userTemplates.map(t => `
        <div class="pl-menu-item-wrap">
          <button type="button" class="pl-menu-item" data-user-template-id="${t.id}" data-kind="user">
            <span class="pl-menu-label">${escapeHtml(t.label)}</span>
            <span class="pl-menu-summary">${escapeHtml(t.summary || '')}</span>
          </button>
          <button type="button" class="pl-menu-delete" data-delete-template-id="${t.id}" title="Delete this template" aria-label="Delete">×</button>
        </div>
      `).join('');
    }
    html += `
      <div class="pl-menu-divider"></div>
      <button type="button" class="pl-menu-item pl-menu-save" data-action="save-template">
        <span class="pl-menu-label">+ Save current as template</span>
        <span class="pl-menu-summary">Stored in this browser. Useful for repeat venues.</span>
      </button>
    `;
    menu.innerHTML = html;
  }

  function setupTemplatesMenu() {
    const btn  = document.getElementById('plBtnTemplates');
    const menu = document.getElementById('plTemplatesMenu');
    if (!btn || !menu) return;
    rebuildTemplatesMenu();

    if (templatesMenuWiredUp) return;
    templatesMenuWiredUp = true;

    const closeMenu = () => { menu.hidden = true; };
    const openMenu = () => {
      const r = btn.getBoundingClientRect();
      menu.style.top  = (r.bottom + 4) + 'px';
      menu.style.left = r.left + 'px';
      menu.hidden = false;
      // Clamp inside the viewport (small screens: the toolbar scrolls
      // horizontally, so the button can sit near either edge).
      const mr = menu.getBoundingClientRect();
      if (mr.right > window.innerWidth) {
        menu.style.left = Math.max(8, window.innerWidth - mr.width - 8) + 'px';
      }
      if (mr.bottom > window.innerHeight) {
        menu.style.top = Math.max(8, window.innerHeight - mr.height - 8) + 'px';
      }
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', e => {
      if (menu.hidden) return;
      if (menu.contains(e.target) || e.target === btn) return;
      closeMenu();
    });
    menu.addEventListener('click', e => {
      // Delete button on a user template — handled before the row click so
      // the click doesn't double as "apply this template I'm deleting".
      const del = e.target.closest('[data-delete-template-id]');
      if (del) {
        e.stopPropagation();
        const id = del.dataset.deleteTemplateId;
        const t = loadUserTemplates().find(x => x.id === id);
        if (!t) return;
        plConfirm(`Delete the template "${t.label}"?`, { okLabel: 'Delete', danger: true })
          .then(ok => { if (ok) deleteUserTemplate(id); });
        return;
      }
      const saveBtn = e.target.closest('[data-action="save-template"]');
      if (saveBtn) {
        closeMenu();
        saveCurrentAsUserTemplate();
        return;
      }
      const builtin = e.target.closest('[data-template-id]');
      if (builtin) {
        const recipe = templates.find(t => t.id === builtin.dataset.templateId);
        if (recipe) applyTemplate(recipe);
        closeMenu();
        return;
      }
      const userT = e.target.closest('[data-user-template-id]');
      if (userT) {
        applyUserTemplate(userT.dataset.userTemplateId);
        closeMenu();
        return;
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });
  }

  // ── Quote form ────────────────────────────────────────────────────────
  // Generate a PNG Blob of the current layout. Reuses buildExportSVG +
  // canvas raster the same way savePNG does — so the attached image is
  // identical to what the customer sees when they click Print/PDF or
  // Save Image. Returns Promise<Blob | null>.
  function generateLayoutImageBlob() {
    return new Promise((resolve) => {
      try {
        const { svg: out, width: W, height: H } = buildExportSVG();
        const xml = new XMLSerializer().serializeToString(out);
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        const img = new Image();
        img.onload = () => {
          const canv = document.createElement('canvas');
          canv.width = W * 2; canv.height = H * 2;
          const ctx = canv.getContext('2d');
          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0);
          canv.toBlob(blob => resolve(blob || null), 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = url;
      } catch (err) {
        resolve(null);
      }
    });
  }

  function setupQuoteForm() {
    const f = dom.quoteForm;
    if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      // Honeypot
      const honey = f.querySelector('[name="bot-field"]');
      if (honey && honey.value) { dom.quoteStatus.textContent = "Thanks — we'll be in touch."; return; }
      // Pre-fill hidden fields so the Netlify auto-email reads as a real
      // quote request rather than a free-form message.
      const layoutInput = f.querySelector('[name="layout"]');
      layoutInput.value = JSON.stringify({
        version: SAVE_VERSION, eventName: state.eventName,
        venue: state.venue, items: state.items, eventDays: state.eventDays,
      });

      // Build the inquiry body in two sections that mirror the right-rail
      // panel the customer was just looking at:
      //   ITEMS — quantity tally per SKU (also lists labels for context)
      //   ESTIMATED COST — line items with per-rental price + subtotal,
      //                    subtotals split by per-day vs per-event,
      //                    and a grand total
      const lines = buildLineItems();
      let perDay = 0, perEvent = 0;
      for (const l of lines) {
        if (l.unit === 'day')   perDay   += l.subtotal;
        if (l.unit === 'event') perEvent += l.subtotal;
      }
      const grand = perDay + perEvent;

      // ITEMS section — simple count by SKU. Includes labels so FPR sees
      // what the customer wrote on them (DJ, Bar, etc.) even though they
      // have no price.
      const itemCounts = {};
      const labelTexts = [];
      for (const it of state.items) {
        const cat = byKey[it.key];
        if (!cat) continue;
        if (cat.shape === 'text') {
          if (it.text && it.text.trim()) labelTexts.push(it.text.trim());
          continue;
        }
        itemCounts[cat.label] = (itemCounts[cat.label] || 0) + 1;
      }
      const itemRows = Object.entries(itemCounts).map(([label, qty]) => `  ${label.padEnd(28)}  ×${qty}`);
      const itemsBlock = itemRows.length === 0
        ? '  (no items added yet)'
        : itemRows.join('\n');

      // ESTIMATED COST section — line items, subtotals by category, grand total.
      const costRows = lines.length === 0
        ? '  (no priced items added)'
        : lines.map(l => {
            const unitLabel = l.unit === 'day'
              ? `$${l.unitPrice.toFixed(2)} per rental`
              : `${fmtMoney(l.unitPrice)}/event`;
            const left = `  ${l.qty}× ${l.label}`.padEnd(38);
            return `${left}  ${unitLabel}  =  ${fmtMoney(l.subtotal)}`;
          }).join('\n');
      const subtotalLines = [];
      if (perDay > 0)   subtotalLines.push(`  Tables, chairs & add-ons   ${fmtMoney(perDay)}`);
      if (perEvent > 0) subtotalLines.push(`  Tents & dance floors            ${fmtMoney(perEvent)}`);
      subtotalLines.push(`  ─────────────────────────────────────────────`);
      subtotalLines.push(`  Estimated total                 ${fmtMoney(grand)} CAD`);

      const venueStr = isPolygonVenue()
        ? `${state.venue.widthFt} × ${state.venue.depthFt} ft (custom shape, ${Math.round(venueAreaFt2()).toLocaleString()} sq ft)`
        : `${state.venue.widthFt} × ${state.venue.depthFt} ft`;
      const headerLine = `Venue: ${venueStr}${state.eventName ? '  ·  ' + state.eventName : ''}`;
      const labelsLine = labelTexts.length
        ? `\nLabels on plan: ${labelTexts.map(t => '"' + t + '"').join(', ')}`
        : '';

      const itemizedFull = [
        headerLine + labelsLine,
        '',
        'ITEMS',
        itemsBlock,
        '',
        'ESTIMATED COST',
        costRows,
        '',
        subtotalLines.join('\n'),
        '',
        '(List prices, pre-tax, before delivery & setup. Final quote will reflect package discounts and any custom requests.)',
      ].join('\n');

      f.querySelector('[name="itemized_list"]').value = itemizedFull;
      f.querySelector('[name="estimated_total"]').value =
        `${fmtMoney(grand)} CAD (list prices, pre-tax, before delivery & setup)`;
      const dateField = f.querySelector('[name="event_date"]');
      const dateInput = document.getElementById('plEventDate');
      if (dateField) dateField.value = (dateInput && dateInput.value) || '';

      const submitBtn = f.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Rendering layout…'; }
      dom.quoteStatus.textContent = 'Rendering your layout…';

      // Generate the layout PNG and attach it under the layout_image
      // file input so Netlify Forms receives it as an actual attachment
      // (rather than embedded in the body). The email FPR receives will
      // show the design exactly as the customer designed it.
      const layoutBlob = await generateLayoutImageBlob();
      const fnameBase = (state.eventName.trim() || 'event-layout').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      if (layoutBlob) {
        const fileInput = f.querySelector('[name="layout_image"]');
        if (fileInput) {
          // Set the file via DataTransfer so FormData(form) picks it up.
          // Browsers shipped this in Chrome/Safari/Firefox years ago.
          try {
            const dt = new DataTransfer();
            dt.items.add(new File([layoutBlob], fnameBase + '.png', { type: 'image/png' }));
            fileInput.files = dt.files;
          } catch (err) { /* DataTransfer unsupported — fall through; we'll append to FormData below */ }
        }
      }

      // Build FormData from the form (includes the file we just attached).
      const fd = new FormData(f);
      // Belt-and-braces: ensure the file is in the FormData even if
      // setting fileInput.files failed.
      if (layoutBlob && !(fd.get('layout_image') instanceof File && fd.get('layout_image').size > 0)) {
        fd.set('layout_image', layoutBlob, fnameBase + '.png');
      }

      if (submitBtn) submitBtn.textContent = 'Sending…';
      dom.quoteStatus.textContent = 'Sending your layout…';
      try {
        // Submit as multipart/form-data — DON'T set Content-Type ourselves,
        // the browser fills in the boundary parameter when body is FormData.
        const res = await fetch('/', { method: 'POST', body: fd });
        if (res.ok) {
          track('planner_quote_submit', {
            outcome: 'netlify',
            item_count: state.items.length,
            total_bucket: totalBucket(grand),
          });
          dom.quoteStatus.style.color = 'var(--pl-green)';
          dom.quoteStatus.textContent = "Got it — we'll email a quote within 24 hours.";
          f.reset();
        } else {
          throw new Error('HTTP ' + res.status);
        }
      } catch (err) {
        track('planner_quote_submit', {
          outcome: 'mailto_fallback',
          item_count: state.items.length,
          total_bucket: totalBucket(grand),
        });
        // Mailto fallback — can't carry a real attachment, but it carries
        // the itemized list and links the customer to upload the PNG
        // they just generated (we trigger a download of the image so they
        // can drag it into their email manually).
        if (layoutBlob) {
          const dlUrl = URL.createObjectURL(layoutBlob);
          const a = document.createElement('a');
          a.href = dlUrl; a.download = fnameBase + '.png';
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(dlUrl); a.remove(); }, 1000);
        }
        const data = {};
        fd.forEach((v, k) => { if (typeof v === 'string') data[k] = v; });
        const subject = `Layout Planner Quote — ${data.first_name || ''} ${data.last_name || ''}`.trim();
        const body = [
          `Name: ${data.first_name || ''} ${data.last_name || ''}`.trim(),
          `Email: ${data.email || ''}`,
          data.phone ? `Phone: ${data.phone}` : null,
          '',
          data.itemized_list || '',
          '',
          `Estimated total: ${data.estimated_total || ''}`,
          '',
          data.message ? `Notes: ${data.message}` : null,
          '',
          '(Layout PNG was downloaded to your computer — please attach it to this email so we can see your design.)',
        ].filter(l => l !== null).join('\n');
        const url = `mailto:welcome@foreverpartyrentals.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        dom.quoteStatus.style.color = 'var(--pl-muted)';
        dom.quoteStatus.textContent = 'Opening your email app — please attach the layout PNG that just downloaded.';
        window.location.href = url;
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Layout for Quote'; }
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────
  async function init() {
    dom.app = document.getElementById('plannerApp');
    dom.toolbar = document.getElementById('plToolbar');
    dom.canvas = document.getElementById('plCanvas');
    dom.svg = document.getElementById('plSvg');
    dom.emptyHint = document.getElementById('plEmptyHint');
    dom.paletteGroups = document.getElementById('plPaletteGroups');

    dom.venueW = document.getElementById('plVenueW');
    dom.venueD = document.getElementById('plVenueD');
    dom.eventName = document.getElementById('plEventName');

    dom.statSeated = document.getElementById('plStatSeated');
    dom.statStanding = document.getElementById('plStatStanding');
    dom.density = document.getElementById('plDensity');
    dom.tally = document.getElementById('plTally');
    dom.zoomReadout = document.getElementById('plZoomReadout');

    dom.quoteLines  = document.getElementById('plQuoteLines');
    dom.quoteTotals = document.getElementById('plQuoteTotals');

    dom.btnUndo = document.getElementById('plBtnUndo');
    dom.btnRedo = document.getElementById('plBtnRedo');
    dom.btnRotateLeft = document.getElementById('plBtnRotateLeft');
    dom.btnRotateRight = document.getElementById('plBtnRotateRight');
    dom.btnDuplicate = document.getElementById('plBtnDuplicate');
    dom.btnDelete = document.getElementById('plBtnDelete');

    dom.quoteForm = document.getElementById('plQuoteForm');
    dom.quoteStatus = document.getElementById('plQuoteStatus');
    dom.toast = document.getElementById('plToast');
    dom.inspector = document.getElementById('plInspector');
    dom.guestPanel = document.getElementById('plGuestPanel');
    dom.guestSummary = document.getElementById('plGuestSummary');

    dom.venueSizeRow        = document.getElementById('plVenueSizeRow');
    dom.venueUnits          = document.getElementById('plVenueUnits');
    dom.venuePolyInfo       = document.getElementById('plVenuePolyInfo');
    dom.venuePolyAabb       = document.getElementById('plVenuePolyAabb');
    dom.venuePolyArea       = document.getElementById('plVenuePolyArea');
    dom.btnVenueDraw        = document.getElementById('plBtnVenueDraw');
    dom.btnVenueResetRect   = document.getElementById('plBtnVenueResetRect');
    dom.btnAddBackdrop      = document.getElementById('plBtnAddBackdrop');
    dom.backdropFile        = document.getElementById('plBackdropFile');
    dom.backdropPanel       = document.getElementById('plBackdropPanel');
    dom.backdropOpacity     = document.getElementById('plBackdropOpacity');
    dom.btnBackdropMove     = document.getElementById('plBtnBackdropMove');
    dom.btnBackdropCalibrate= document.getElementById('plBtnBackdropCalibrate');
    dom.btnBackdropRemove   = document.getElementById('plBtnBackdropRemove');
    dom.calibrationHint     = document.getElementById('plCalibrationHint');

    dom.tourOverlay   = document.getElementById('plTourOverlay');
    dom.tourSpotlight = document.getElementById('plTourSpotlight');
    dom.tourCard      = document.getElementById('plTourCard');
    dom.tourStep      = document.getElementById('plTourStep');
    dom.tourTitle     = document.getElementById('plTourTitle');
    dom.tourBody      = document.getElementById('plTourBody');
    dom.tourSkip      = document.getElementById('plTourSkip');
    dom.tourNext      = document.getElementById('plTourNext');

    // Marquee selection rectangle: a single absolute-positioned div over
    // the canvas, shown/hidden during empty-canvas drags.
    marqueeEl = document.createElement('div');
    marqueeEl.className = 'pl-marquee-rect';
    marqueeEl.hidden = true;
    dom.canvas.appendChild(marqueeEl);

    // Read-only mode: tag the body so CSS can hide toolbar / palette /
    // sidebar / quote form. The canvas remains visible and pan/zoom work.
    if (isReadonly) {
      document.body.classList.add('pl-readonly');
      const convertBar = document.getElementById('plConvertBar');
      if (convertBar && !isExternalEmbed) convertBar.hidden = false;
    }

    // Third-party-embed "lite" mode: hide our pricing + quote form via CSS
    // so partner rental sites don't show FPR prices or compete with their
    // own quote forms. The "Powered by" backlink stays — that's the deal.
    if (isExternalEmbed) {
      document.body.classList.add('pl-lite');
      // The ceremony modal's chair <option> labels carry FPR prices in the
      // static HTML — CSS can't redact option text, so strip them here.
      document.querySelectorAll('#plCerChair option').forEach(o => {
        o.textContent = o.textContent.replace(/\s*\(\$[^)]*\)/, '');
      });
    }

    // Embed-mode chrome: render the powered-by badge. Allowlisted partners
    // (?partner=<slug> against planner/partners.json) get a co-branded
    // line — the FPR credit always stays, that's the embed deal.
    if (isEmbed) {
      const badge = document.createElement('a');
      badge.className = 'pl-powered';
      badge.href = PLANNER_HUB_URL;
      badge.target = '_top';
      badge.rel = 'noopener';
      badge.innerHTML = 'Powered by <strong>Forever Party Rentals</strong> &nbsp;·&nbsp; Lower Mainland, BC';
      dom.canvas.appendChild(badge);
      if (isExternalEmbed && PARTNER_SLUG && /^[a-z0-9-]+$/.test(PARTNER_SLUG)) {
        fetch('planner/partners.json', { cache: 'no-cache' })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            const p = data && data.partners && data.partners[PARTNER_SLUG];
            if (!p || !p.name) return;
            const strong = document.createElement('strong');
            strong.textContent = p.name; // textContent — partner names never run as HTML
            badge.innerHTML = '';
            badge.append('Built for ');
            badge.appendChild(strong);
            badge.append(' · Powered by Forever Party Rentals');
          })
          .catch(() => { /* allowlist missing → standard badge */ });
      }
    }

    await Promise.all([loadCatalog(), loadTemplates()]);
    if (window.FPRLayoutGen) window.FPRLayoutGen.init(catalog);
    renderPalette();
    setupCanvasInteractions();
    setupMobileChrome();
    setupQuoteForm();
    setupTemplatesMenu();
    setupCeremonyModal();
    setupTour();

    // Restore precedence: URL hash > ?template= query > localStorage > default.
    // Hash and template = explicit user intent (clicked a link), so they win
    // over a stale localStorage snapshot. localStorage = silent recovery.
    const restoreHash = getRestoreHash();
    let restored = false;
    let restoredFrom = 'none';
    if (restoreHash) {
      const decoded = decodeStateFromHash(restoreHash);
      if (decoded) {
        applyState(decoded);
        showToast('Loaded shared layout', 2000);
        restored = true;
        restoredFrom = 'share_link';
      }
    }
    if (!restored) {
      const tParam = new URLSearchParams(location.search).get('template');
      if (tParam) {
        const recipe = templates.find(t => t.id === tParam);
        if (recipe) {
          applyState(expandRecipeToState(recipe));
          restored = true;
          restoredFrom = 'template_link';
        }
      }
    }
    if (!restored) {
      // ?gen= deep link — the tent-size calculator page passes generator
      // options so "open this exact layout in the planner" Just Works.
      const genParam = new URLSearchParams(location.search).get('gen');
      if (genParam && window.FPRLayoutGen) {
        try {
          const gOpts = JSON.parse(genParam);
          const recipe = window.FPRLayoutGen.generateLayout(gOpts);
          if (recipe) {
            applyState(expandRecipeToState(recipe));
            restored = true;
            restoredFrom = 'calculator_link';
          }
        } catch (e) { /* malformed param → fall through */ }
      }
    }
    if (!restored) {
      const stored = loadFromStorage();
      if (stored) {
        applyState(stored);
        showToast('Restored your last session — Clear to start fresh', 4000);
        restored = true;
        restoredFrom = 'autosave';
      }
    }

    fitToVenue();
    render();

    track('planner_open', {
      readonly: isReadonly,
      viewport: window.matchMedia && window.matchMedia('(max-width: 720px)').matches ? 'phone' : 'desktop',
      restored: restoredFrom,
    });

    // Phone-first landing: a fresh phone visit opens the wizard — a
    // guest-count keypad is a far better first touch than a blank canvas.
    // "Cancel" is one tap to start blank. Desktop keeps the spotlight tour.
    const wizardFirst = !restored && !isReadonly &&
      window.matchMedia && window.matchMedia('(max-width: 720px)').matches &&
      state.items.length === 0 && window.FPRLayoutGen;
    if (wizardFirst) {
      openWizard('mobile_landing');
    } else {
      // Tour kicks off on first visit (when state is empty + flag not set).
      maybeStartTour();
    }

    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || !e.data.type) return;
      if (e.data.type === 'fpr-open-quote') openQuoteForm();
      else if (e.data.type === 'fpr-book-layout') bookThisLayout();
      else if (e.data.type === 'fpr-call-layout') callWithLayout();
    });

    // Venue dimension inputs
    const onVenueInput = () => {
      const w = parseFloat(dom.venueW.value);
      const d = parseFloat(dom.venueD.value);
      if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return;
      commit();
      state.venue.widthFt = w;
      state.venue.depthFt = d;
      fitToVenue();
      render();
    };
    dom.venueW.addEventListener('change', onVenueInput);
    dom.venueD.addEventListener('change', onVenueInput);

    dom.eventName.addEventListener('input', () => { state.eventName = dom.eventName.value; });

    // Live availability date picker (own-site mode; lite-mode CSS hides it)
    const eventDateInput = document.getElementById('plEventDate');
    if (eventDateInput) {
      eventDateInput.min = minDateStr();
      eventDateInput.addEventListener('change', checkAvailability);
      if (eventDateInput.value) checkAvailability();
    }

    // Toolbar buttons
    document.getElementById('plBtnZoomIn').addEventListener('click', () => zoomCentered(1.2));
    document.getElementById('plBtnZoomOut').addEventListener('click', () => zoomCentered(1 / 1.2));
    document.getElementById('plBtnZoomFit').addEventListener('click', () => { fitToVenue(); render(); });
    dom.btnRotateLeft.addEventListener('click',  () => rotateSelected(-90));
    dom.btnRotateRight.addEventListener('click', () => rotateSelected(90));
    dom.btnDuplicate.addEventListener('click', duplicateSelected);
    dom.btnDelete.addEventListener('click', deleteSelected);
    dom.btnUndo.addEventListener('click', undo);
    dom.btnRedo.addEventListener('click', redo);
    document.getElementById('plBtnClear').addEventListener('click', clearAll);
    const btnLabel = document.getElementById('plBtnAddLabel');
    if (btnLabel) btnLabel.addEventListener('click', addLabel);
    const btnMeasure = document.getElementById('plBtnMeasure');
    if (btnMeasure) btnMeasure.addEventListener('click', toggleMeasureMode);
    // Magnetic-snap toggle — reflects + persists the preference.
    const btnSnap = document.getElementById('plBtnSnap');
    if (btnSnap) {
      const reflectSnap = () => {
        btnSnap.classList.toggle('pl-btn-active', snapEnabled);
        btnSnap.setAttribute('aria-pressed', String(snapEnabled));
      };
      reflectSnap();
      btnSnap.addEventListener('click', () => {
        setSnapEnabled(!snapEnabled);
        reflectSnap();
        showToast(snapEnabled
          ? 'Magnetic snapping on — hold ⌘/Ctrl while dragging to move freely'
          : 'Magnetic snapping off — hold Shift for grid snap', 2600);
        track('planner_snap_toggle', { enabled: snapEnabled ? 1 : 0 });
      });
    }
    const btnFullscreen = document.getElementById('plBtnFullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    const btnPrint = document.getElementById('plBtnPrint');
    if (btnPrint) btnPrint.addEventListener('click', printPlan);
    const btnPdf = document.getElementById('plBtnPdf');
    if (btnPdf) btnPdf.addEventListener('click', savePDF);
    const btnWizard = document.getElementById('plBtnWizard');
    if (btnWizard) btnWizard.addEventListener('click', () => openWizard('toolbar'));
    const btnEmptyWizard = document.getElementById('plEmptyWizardBtn');
    if (btnEmptyWizard) btnEmptyWizard.addEventListener('click', () => openWizard('empty_state'));
    // savePNG is still defined and reachable internally (used as the
    // export path under the hood — no UI surface). Keep the function
    // so the printPlan SVG-builder stays compatible if we ever want
    // a "save as image" toggle again.
    document.getElementById('plBtnSaveJson').addEventListener('click', saveJSON);
    document.getElementById('plBtnLoadJson').addEventListener('click', loadJSON);
    document.getElementById('plBtnShare').addEventListener('click', e => shareLink({ readonly: !!e.shiftKey }));
    const bindBook = (id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => bookThisLayout());
    };
    const bindCall = (id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => callWithLayout());
    };
    bindBook('plBtnBook');
    bindBook('plBtnBookRail');
    bindBook('plBtnBookBar');
    bindCall('plBtnCall');
    bindCall('plBtnCallRail');
    bindCall('plBtnCallBar');
    const btnEmail = document.getElementById('plBtnEmailLayout');
    if (btnEmail) {
      btnEmail.addEventListener('click', async () => {
        const url = await requestShortUrl(false);
        emailLayoutToMe(url);
      });
    }

    // Polygon venue wiring — draw button + reset-to-rect button.
    if (dom.btnVenueDraw)      dom.btnVenueDraw.addEventListener('click', startDrawPolygon);
    if (dom.btnVenueResetRect) dom.btnVenueResetRect.addEventListener('click', resetVenueToRect);

    // Backdrop wiring — upload + control panel.
    if (dom.btnAddBackdrop && dom.backdropFile) {
      dom.btnAddBackdrop.addEventListener('click', () => dom.backdropFile.click());
      dom.backdropFile.addEventListener('change', () => {
        const f = dom.backdropFile.files && dom.backdropFile.files[0];
        if (f) uploadBackdropFile(f);
        // Reset so re-uploading the same file fires change again.
        dom.backdropFile.value = '';
      });
    }
    if (dom.btnBackdropMove)      dom.btnBackdropMove.addEventListener('click', toggleBackdropMove);
    if (dom.btnBackdropCalibrate) dom.btnBackdropCalibrate.addEventListener('click', startCalibration);
    if (dom.btnBackdropRemove)    dom.btnBackdropRemove.addEventListener('click', removeBackdrop);
    if (dom.backdropOpacity) {
      dom.backdropOpacity.addEventListener('input', () => setBackdropOpacity(dom.backdropOpacity.value));
    }

    // (clipboard variable lifted to module scope so the context menu can
    // see it too — see top of file. Both Ctrl/Cmd+C/V and right-click
    // Paste Here use the same array.)

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      const t0 = e.target;
      const inFieldEarly = t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.isContentEditable);
      // F toggles fullscreen — works in every mode (incl. read-only) so
      // a view-only viewer can still go edge-to-edge. Skip when typing.
      if ((e.key === 'f' || e.key === 'F') && !inFieldEarly && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      // Read-only: still let Space pan, swallow everything else.
      if (isReadonly) {
        if (e.key === ' ' || e.code === 'Space') {
          const t = e.target;
          const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
          if (!inField) {
            spaceDown = true;
            dom.canvas.classList.add('pl-space-down');
            e.preventDefault();
          }
        }
        return;
      }
      // Track Space for pan-mode toggle. Don't preventDefault unless we're
      // outside a text field — otherwise typing space in an input is broken.
      if (e.key === ' ' || e.code === 'Space') {
        const t = e.target;
        const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!inField) {
          spaceDown = true;
          dom.canvas.classList.add('pl-space-down');
          e.preventDefault();
        }
        return;
      }
      // Skip if user is typing in an input/textarea
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const cmd = e.metaKey || e.ctrlKey;
      const key = e.key;
      const lower = key.toLowerCase();

      if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (key === 'Escape') {
        // Esc precedence: dismiss context menu → close mobile sheets →
        // exit measure mode → cancel polygon draw → cancel calibration →
        // exit backdrop move mode → clear selection.
        if (contextMenuEl && !contextMenuEl.hidden) { hideContextMenu(); return; }
        if ((dom.palette && dom.palette.classList.contains('pl-sheet-open')) ||
            (dom.sidebar && dom.sidebar.classList.contains('pl-sheet-open'))) {
          closeMobileSheets();
          return;
        }
        if (measureMode) { exitMeasureMode(); return; }
        if (drawingPolygon) { cancelDrawPolygon(); return; }
        if (calibrating) { cancelCalibration(); render(); return; }
        if (backdropEditMode) { backdropEditMode = false; render(); return; }
        clearSelection(); render();
      }
      else if (cmd && lower === 'a') {
        // Select all
        e.preventDefault();
        setSelection(state.items.map(it => it.id));
        render();
      }
      else if (cmd && lower === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (cmd && lower === 'd') { e.preventDefault(); duplicateSelected(); }
      else if (cmd && lower === 'c') {
        if (copySelectionToClipboard()) e.preventDefault();
      }
      else if (cmd && lower === 'v') {
        if (clipboard.length > 0) {
          e.preventDefault();
          pasteClipboard();   // no worldPos → 1ft offset from originals
        }
      }
      // Arrow nudge: 0.25 ft default, 1 ft with Shift. Commits every press so
      // each nudge is undoable. Operates on the full selection + children.
      else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        if (state.selectedIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.25;
        let dx = 0, dy = 0;
        if (key === 'ArrowLeft')  dx = -step;
        if (key === 'ArrowRight') dx = step;
        if (key === 'ArrowUp')    dy = -step;
        if (key === 'ArrowDown')  dy = step;
        commit();
        const ids = expandWithChildren(state.selectedIds);
        for (const it of state.items) {
          if (!ids.has(it.id)) continue;
          it.x += dx; it.y += dy;
        }
        render();
      }
    });
    document.addEventListener('keyup', e => {
      if (e.key === ' ' || e.code === 'Space') {
        spaceDown = false;
        dom.canvas.classList.remove('pl-space-down');
      }
    });

    // Re-fit on window resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(), 100);
    });
  }

  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
