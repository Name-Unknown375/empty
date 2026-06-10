/* Forever Party Rentals — auto-layout generator.
 *
 * Pure functions, no DOM: turns "120 guests, banquet style, dance floor"
 * into a recipe in the exact templates.json shape, so the planner's
 * applyTemplate()/expandRecipeToState() consume it unchanged. Loaded by
 * the planner (guest-count wizard) AND standalone by the tent-size
 * calculator page — keep it dependency-free.
 *
 * Spacing math mirrors the hand-authored templates and the planner's
 * validation thresholds (validateLayout in planner.js):
 *   • 5ft round + chairs ≈ 9.2 ft envelope → 12.5 ft pitch (≥3 ft aisles)
 *   • 6ft banquet rows: 13.5 ft side pitch, 10 ft row pitch
 *   • standing 8 sq ft/guest · seated 12–15 · ceremony rows 3 ft apart
 *   • dance floor ≈ 3 sq ft × 40% of guests, snapped up to catalog sizes
 */
(function () {
  'use strict';

  let byKey = {};
  let tents = [];        // catalog tents sorted by area asc
  let danceFloors = [];  // catalog dance floors sorted by area asc

  const INSET_FT = 2;          // keep furniture this far inside tent walls
  const ROUND_PITCH = 12.5;
  const COCKTAIL_PITCH = 8;
  const ROW_PITCH = 2.5;       // ceremony row spacing (= ceremony modal default)
  const CEREMONY_CHAIR_GAP = 0.25; // in-row chair gap (= ceremony modal default)
  const CEREMONY_AISLE = 4;
  const CEREMONY_INSET = 1.5;  // ceremony rows sit closer to the walls than dining
  const ALTAR_FT = 5;          // ceremony head zone (arch/officiant), at the front
  // Banquet runs — the convention from the hand-built templates
  // (wedding-50, corporate-seated-60-rect): tables rotate 90°, join
  // end-to-end in runs of two (12 ft), 6 chairs per table on the long
  // sides, columns on a 10 ft pitch, 4 ft walk gap between run-rows.
  const BANQUET_COL_PITCH = 10;
  const BANQUET_RUN_GAP = 4;
  const BANQUET_RUN_LEN = 12;  // 2 × 6ft tables end-to-end
  const BANQUET_EDGE_INSET = 1.65;
  const CHAIR_ENV = 1.83 + 0.25; // chair depth + pull-out gap, each side of a table
  // Footprint envelopes (table + tucked chairs) — the last row/column of a
  // grid only needs its envelope, not a full pitch. Charging full pitch for
  // every row is what used to bump layouts into the next tent size up.
  const ENV = {
    round:    { x: 5 + CHAIR_ENV * 2,   y: 5 + CHAIR_ENV * 2 },     // 9.16
    banquet:  { x: 6 + CHAIR_ENV * 2,   y: 2.5 + CHAIR_ENV * 2 },   // 10.16 × 6.66
    cocktail: { x: 2.5,                 y: 2.5 },
  };

  function init(catalog) {
    byKey = {};
    for (const g of catalog.groups) {
      for (const it of g.items) byKey[it.key] = it;
    }
    tents = Object.values(byKey)
      .filter(it => it.shape === 'tent' && it.key !== 'popup-tent-10x10')
      .sort((a, b) => a.widthFt * a.depthFt - b.widthFt * b.depthFt);
    danceFloors = Object.values(byKey)
      .filter(it => it.shape === 'danceFloor')
      .sort((a, b) => a.widthFt * a.depthFt - b.widthFt * b.depthFt);
  }

  // Tent configurations: every single marquee, then the joined-marquee
  // combos the hand-authored templates use. Normalized so depth >= width
  // (the long axis runs down the layout). placements are center offsets
  // from the config's own top-left, in feet.
  function tentConfigs() {
    const configs = [];
    for (const t of tents) {
      const w = Math.min(t.widthFt, t.depthFt);
      const d = Math.max(t.widthFt, t.depthFt);
      configs.push({
        keys: [t.key], w, d,
        rotated: t.widthFt > t.depthFt,
        placements: [{ key: t.key, cx: w / 2, cy: d / 2 }],
      });
    }
    // Joined-marquee combos (2/3/4 side-by-side along the long edge),
    // exactly like the 100–200 guest templates. Normalized so depth ≥
    // width; a combo wider than deep gets rotated whole (each unit takes
    // rotation 90 in the recipe).
    for (const key of ['marquee-tent-20x60', 'marquee-tent-30x60']) {
      const t = byKey[key];
      if (!t) continue;
      const uw = Math.min(t.widthFt, t.depthFt);
      const ud = Math.max(t.widthFt, t.depthFt);
      for (const n of [2, 3, 4]) {
        let cfg = {
          keys: Array(n).fill(key),
          w: uw * n, d: ud,
          placements: Array.from({ length: n }, (_, i) => ({ key, cx: uw * i + uw / 2, cy: ud / 2 })),
        };
        if (cfg.w > cfg.d) {
          cfg = {
            keys: cfg.keys, w: cfg.d, d: cfg.w,
            placements: cfg.placements.map(p => ({ key: p.key, cx: p.cy, cy: p.cx, rotation: 90 })),
          };
        }
        configs.push(cfg);
      }
    }
    // Smallest first; long thin ribbons (aspect > ~2.2) carry a soft
    // penalty so a squarer combo of similar area wins — nicer layouts,
    // saner dance-floor placement. The 30×60 carries a hard bias penalty:
    // FPR stocks five 20-ft-wide marquee sizes and a single 30×60, so the
    // big tent should only be recommended when no 20x option fits within
    // ~35% more area.
    const score = (c) => {
      let s = c.w * c.d * (1 + Math.max(0, c.d / c.w - 2.2) * 0.3);
      if (c.keys.indexOf('marquee-tent-30x60') !== -1) s *= 1.35;
      return s;
    };
    return configs.sort((a, b) => score(a) - score(b));
  }

  function snapDanceFloor(guests) {
    const targetSqft = 3 * Math.ceil(guests * 0.4);
    for (const df of danceFloors) {
      if (df.widthFt * df.depthFt >= targetSqft) return df;
    }
    return danceFloors[danceFloors.length - 1] || null;
  }

  // What the seating style needs, before tent selection.
  function seatingPlan(opts) {
    const guests = Math.max(1, Math.min(300, Math.round(opts.guests || 0)));
    const style = opts.seating || 'round';
    if (style === 'cocktail') {
      const n = Math.ceil(guests / 6);
      return { style, guests, units: n, unitKey: 'cocktail-table', pitchX: COCKTAIL_PITCH, pitchY: COCKTAIL_PITCH, envX: ENV.cocktail.x, envY: ENV.cocktail.y, seatsPerUnit: 0 };
    }
    if (style === 'ceremony') {
      return { style, guests, units: guests, unitKey: opts.chairKey || 'resin-garden-chair' };
    }
    if (style === 'banquet') {
      // 6 seats per table (3 per long side) — matches the templates' runs.
      return { style, guests, units: Math.ceil(guests / 6), unitKey: 'banquet-table-6ft', seatsPerUnit: 6 };
    }
    return { style: 'round', guests, units: Math.ceil(guests / 8), unitKey: 'round-table-5ft', pitchX: ROUND_PITCH, pitchY: ROUND_PITCH, envX: ENV.round.x, envY: ENV.round.y, seatsPerUnit: 8 };
  }

  // Required floor zones (in feet, along the long axis) for a given plan
  // inside a width `w`: returns null if it can't fit, else the zone math.
  function fitInWidth(plan, opts, w, dMax) {
    const usableW = w - INSET_FT * 2;
    if (usableW <= 0) return null;
    let depthNeeded = INSET_FT * 2;
    const zones = {};
    // Buffet banquets run along the right wall — reserve their lane so
    // the seating block can't collide with them. (Ceremony rows are
    // centred on the aisle and don't share width with a buffet.)
    const buffetW = (opts.buffet && plan.style !== 'ceremony') ? 6 : 0;

    if (opts.headTable) { zones.head = 8; depthNeeded += 8; }

    if (plan.style === 'ceremony') {
      const chair = byKey[plan.unitKey];
      const perChair = (chair ? chair.widthFt : 1.5) + CEREMONY_CHAIR_GAP;
      const chairDepth = chair ? chair.depthFt : 1.83;
      const sideW = (usableW - CEREMONY_AISLE) / 2;
      const perSide = Math.floor(sideW / perChair);
      if (perSide < 1) return null;
      const perRow = perSide * 2;
      const rows = Math.ceil(plan.guests / perRow);
      const depth = (rows - 1) * ROW_PITCH + chairDepth;
      zones.rows = { rows, perSide, perChair, chairDepth, depth };
      // Ceremony rows sit closer to the walls than dining tables do.
      depthNeeded += depth + ALTAR_FT - (INSET_FT - CEREMONY_INSET) * 2;
    } else if (plan.style === 'banquet') {
      const usable = w - BANQUET_EDGE_INSET * 2 - buffetW;
      const envW = ENV.banquet.y; // rotated: table width 2.5 + chairs both sides
      const cols = Math.max(1, Math.floor((usable - envW) / BANQUET_COL_PITCH) + 1);
      const runs = Math.ceil(plan.units / 2);
      const rows = Math.ceil(runs / cols);
      const depth = rows * BANQUET_RUN_LEN + (rows - 1) * BANQUET_RUN_GAP;
      zones.runs = { cols, rows, runs, envW, depth };
      depthNeeded += depth;
    } else {
      // Last column/row only needs its envelope, not a full pitch.
      const cols = Math.max(1, Math.floor((usableW - buffetW - plan.envX) / plan.pitchX) + 1);
      const rows = Math.ceil(plan.units / cols);
      const depth = (rows - 1) * plan.pitchY + plan.envY;
      zones.grid = { cols, rows, depth };
      depthNeeded += depth;
    }

    if (opts.danceFloor && plan.style !== 'ceremony') {
      const df = (opts._df === 'min') ? danceFloors[0] : snapDanceFloor(plan.guests);
      if (df) {
        if (df.widthFt > usableW) return null;
        zones.dance = { key: df.key, w: df.widthFt, d: df.depthFt };
        depthNeeded += df.depthFt + 3;
      }
    }
    if (buffetW > 0) {
      if (usableW - buffetW < 8) return null; // no room left to seat anyone
      zones.buffet = true;
    }
    if (dMax != null && depthNeeded > dMax) return null;
    return { depthNeeded, zones };
  }

  function recommendTent(opts) {
    const plan = seatingPlan(opts);
    const perGuest = plan.style === 'cocktail' ? 8 : plan.style === 'ceremony' ? 8 : 13;
    const df = (opts.danceFloor && plan.style !== 'ceremony') ? snapDanceFloor(plan.guests) : null;
    const sqftNeeded = plan.guests * perGuest + (df ? df.widthFt * df.depthFt : 0) + (opts.headTable ? 120 : 0) + (opts.buffet ? 100 : 0);
    for (const cfg of tentConfigs()) {
      const fit = fitInWidth(plan, opts, cfg.w, cfg.d);
      if (!fit) continue;
      const totalSqft = cfg.w * cfg.d;
      return {
        tentKeys: cfg.keys,
        sqftNeeded,
        totalSqft,
        sqftPerGuest: Math.round((totalSqft / plan.guests) * 10) / 10,
        fits: true,
        notes: cfg.keys.length > 1
          ? [`${cfg.keys.length} marquees joined side-by-side (${cfg.w}×${cfg.d} ft combined)`]
          : [],
      };
    }
    return { tentKeys: [], sqftNeeded, totalSqft: 0, sqftPerGuest: 0, fits: false, notes: ['Too many guests for our largest tent combination — contact us for a custom plan.'] };
  }

  function generateLayout(opts) {
    const plan = seatingPlan(opts);
    const chairKey = opts.chairKey || 'resin-garden-chair';
    const items = [];
    let W, D;          // venue dims
    let originX, originY, usableW; // furniture zone inside tent/venue
    let cfg = null;
    let fit = null;

    let compromise = null;
    if (opts.venue && opts.venue.widthFt > 0 && opts.venue.depthFt > 0) {
      W = opts.venue.widthFt; D = opts.venue.depthFt;
      // Fixed venue: degrade gracefully before giving up — try both venue
      // orientations, then a smaller dance floor, then no dance floor.
      const variants = [
        [opts, null],
        [{ ...opts, _df: 'min' }, 'smaller-dance'],
        [{ ...opts, danceFloor: false }, 'no-dance'],
      ];
      for (const [vOpts, vComp] of variants) {
        if (vComp === 'smaller-dance' && !opts.danceFloor) continue;
        if (vComp === 'no-dance' && !opts.danceFloor) continue;
        fit = fitInWidth(plan, vOpts, W, D);
        if (!fit) {
          fit = fitInWidth(plan, vOpts, D, W);
          if (fit) { const t = W; W = D; D = t; }
        }
        if (fit) { compromise = vComp; break; }
      }
      if (!fit) return null;
      originX = INSET_FT;
      // Centre the furniture block vertically instead of top-loading it.
      originY = INSET_FT + Math.max(0, (D - fit.depthNeeded) / 2);
      usableW = W - INSET_FT * 2;
    } else {
      for (const c of tentConfigs()) {
        const f = fitInWidth(plan, opts, c.w, c.d);
        if (f) { cfg = c; fit = f; break; }
      }
      if (!cfg) return null;
      // Venue = tent footprint + 4 ft of working room on every side.
      W = cfg.w + 8; D = cfg.d + 8;
      originX = 4 + INSET_FT;
      // Centre the furniture block in the tent instead of top-loading it.
      originY = 4 + INSET_FT + Math.max(0, (cfg.d - fit.depthNeeded) / 2);
      usableW = cfg.w - INSET_FT * 2;
      for (const p of cfg.placements) {
        const tentItem = { key: p.key, cx: 4 + p.cx, cy: 4 + p.cy };
        if (p.rotation) tentItem.rotation = p.rotation;
        items.push(tentItem);
      }
    }

    let cursorY = originY;
    const centerX = originX + usableW / 2;
    // The buffet lane sits on the right wall — shift everything else left
    // so seating and buffet can't collide. Ceremony keeps the true centre
    // (rows align on the aisle; no buffet lane is reserved for it).
    const furnitureCX = fit.zones.buffet ? centerX - 3 : centerX;

    // Head table across the top (two 6ft banquets end-to-end, chairs on
    // the far side only is beyond recipe vocabulary — give it chairs and
    // let the user trim; matches existing template style).
    if (fit.zones.head) {
      items.push(
        { key: 'banquet-table-6ft', cx: furnitureCX - 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey },
        { key: 'banquet-table-6ft', cx: furnitureCX + 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey }
      );
      cursorY += fit.zones.head;
    }

    if (plan.style === 'ceremony') {
      const z = fit.zones.rows;
      const chair = byKey[plan.unitKey];
      const chairW = chair ? chair.widthFt : 1.5;
      // Altar/arch zone at the FRONT (top of the plan); rows face it.
      cursorY += ALTAR_FT;
      let placed = 0;
      for (let r = 0; r < z.rows && placed < plan.guests; r++) {
        const cy = cursorY + r * ROW_PITCH + z.chairDepth / 2;
        for (const side of [-1, 1]) {
          for (let s = 0; s < z.perSide && placed < plan.guests; s++) {
            const offset = CEREMONY_AISLE / 2 + s * z.perChair + chairW / 2;
            items.push({ key: plan.unitKey, cx: centerX + side * offset, cy });
            placed++;
          }
        }
      }
      cursorY += z.depth;
    } else if (plan.style === 'banquet') {
      const z = fit.zones.runs;
      const gridW = (z.cols - 1) * BANQUET_COL_PITCH + z.envW;
      const firstCol = furnitureCX - gridW / 2 + z.envW / 2;
      let placed = 0;
      for (let r = 0; r < z.rows && placed < plan.units; r++) {
        const rowY = cursorY + r * (BANQUET_RUN_LEN + BANQUET_RUN_GAP);
        for (let c = 0; c < z.cols && placed < plan.units; c++) {
          const cx = firstCol + c * BANQUET_COL_PITCH;
          for (let t = 0; t < 2 && placed < plan.units; t++) {
            items.push({
              key: plan.unitKey,
              cx,
              cy: rowY + 3 + t * 6, // two 6ft tables end-to-end per run
              rotation: 90,
              withChairs: true,
              chairCount: plan.seatsPerUnit,
              chairKey,
            });
            placed++;
          }
        }
      }
      cursorY += z.depth;
    } else {
      const z = fit.zones.grid;
      // Rows/columns are envelope-aligned: a row's centre sits envY/2 into
      // its pitch cell, so the grid ends exactly at the last chair edge.
      const rowWidth = (n) => (n - 1) * plan.pitchX + plan.envX;
      const left = furnitureCX - rowWidth(z.cols) / 2;
      let placed = 0;
      for (let r = 0; r < z.rows && placed < plan.units; r++) {
        // Center a final partial row so layouts look intentional.
        const inRow = Math.min(z.cols, plan.units - placed);
        const rowLeft = inRow === z.cols ? left : furnitureCX - rowWidth(inRow) / 2;
        for (let c = 0; c < inRow; c++) {
          const cx = rowLeft + plan.envX / 2 + c * plan.pitchX;
          const cy = cursorY + r * plan.pitchY + plan.envY / 2;
          const item = { key: plan.unitKey, cx, cy };
          if (plan.seatsPerUnit > 0) {
            item.withChairs = true;
            item.chairCount = plan.seatsPerUnit;
            item.chairKey = chairKey;
          }
          if (plan.unitKey === 'banquet-table-6ft') item.rotation = 0;
          items.push(item);
          placed++;
        }
      }
      cursorY += z.depth;
    }

    if (fit.zones.dance) {
      const z = fit.zones.dance;
      items.push({ key: z.key, cx: furnitureCX, cy: cursorY + 3 + z.d / 2 });
      cursorY += z.d + 3;
    }

    if (fit.zones.buffet) {
      // Two 8ft banquets end-to-end along the right wall, no chairs.
      const bx = originX + usableW - 1.5;
      items.push(
        { key: 'banquet-table-8ft', cx: bx, cy: originY + 10, rotation: 90 },
        { key: 'banquet-table-8ft', cx: bx, cy: originY + 19, rotation: 90 }
      );
    }

    // Bar highboy near the entrance corner — pointless in cocktail style
    // (the room is already highboys) and overlaps its grid.
    if (opts.bar && plan.style !== 'ceremony' && plan.style !== 'cocktail') {
      items.push({ key: 'cocktail-table', cx: originX + 3, cy: originY + 3 });
    }

    const styleLabel = { round: 'round tables', banquet: 'banquet tables', cocktail: 'cocktail', ceremony: 'ceremony' }[plan.style];
    const label = `${plan.guests}-Guest ${plan.style === 'ceremony' ? 'Ceremony' : 'Event'}`;
    const summaryBits = [];
    if (cfg) summaryBits.push(cfg.keys.length > 1 ? `${cfg.keys.length}× joined marquees` : (byKey[cfg.keys[0]] || {}).label);
    if (plan.style === 'ceremony') summaryBits.push(`${plan.guests} chairs in rows · ${CEREMONY_AISLE} ft aisle`);
    else summaryBits.push(`${plan.units} ${styleLabel}`);
    if (fit.zones.dance) summaryBits.push(`${fit.zones.dance.w}×${fit.zones.dance.d} dance floor`);
    if (compromise === 'smaller-dance') summaryBits.push('dance floor sized down to fit your space');
    if (compromise === 'no-dance') summaryBits.push('no room for a dance floor in this space');

    return {
      id: `gen-${plan.guests}-${plan.style}${opts.danceFloor ? '-dance' : ''}`,
      label,
      summary: summaryBits.join(' · '),
      venue: { widthFt: W, depthFt: D },
      items,
      compromise,
    };
  }

  const api = { init, recommendTent, generateLayout };
  if (typeof window !== 'undefined') window.FPRLayoutGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
