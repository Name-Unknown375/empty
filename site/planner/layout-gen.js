/* Forever Party Rentals — auto-layout generator.
 *
 * Pure functions, no DOM: turns "120 guests, banquet style, dance floor"
 * into a recipe in the exact templates.json shape, so the planner's
 * applyTemplate()/expandRecipeToState() consume it unchanged. Loaded by
 * the planner (guest-count wizard) AND standalone by the tent-size
 * calculator page — keep it dependency-free.
 *
 * Grounding rules (in priority order):
 *   1. STOCK — never recommend tents FPR can't physically deliver
 *      (fleet counts below, verified against RentKit).
 *   2. PRICE — among configurations that fit, recommend the cheapest;
 *      the single 30×60 carries a bias penalty so 20-ft-wide stock is
 *      preferred unless the 30×60 is meaningfully cheaper.
 *   3. SPACING — industry catering pitch (5ft rounds on ~10.75 ft
 *      centres ≈ 13 sq ft/guest; banquet runs per the hand-built
 *      templates; ceremony rows per the ceremony modal defaults).
 *   4. The dance floor shares width with seating (corner band) whenever
 *      the tent is wide enough — a full-width dance strip is what used
 *      to inflate tent sizes. Falls back to a strip, then to "on the
 *      lawn beside the tent" before giving up.
 */
(function () {
  'use strict';

  let byKey = {};
  let danceFloors = [];  // catalog dance floors sorted by area asc

  const INSET_FT = 2;          // keep furniture this far inside tent walls
  const ROUND_PITCH = 10.75;   // industry banquet pitch for 5ft rounds (~13 sq ft/guest)
  const COCKTAIL_PITCH = 8;
  const ROW_PITCH = 2.5;       // ceremony row spacing (= ceremony modal default)
  const CEREMONY_CHAIR_GAP = 0.25; // in-row chair gap (= ceremony modal default)
  const CEREMONY_AISLE = 4;
  const CEREMONY_INSET = 1.5;  // ceremony rows sit closer to the walls than dining
  const ALTAR_FT = 5;          // ceremony head zone (arch/officiant), at the front
  const CHAIR_ENV = 1.83 + 0.25; // chair depth + pull-out gap, each side of a table
  // Banquet runs — the convention from the hand-built templates
  // (wedding-50, corporate-seated-60-rect): tables rotate 90°, join
  // end-to-end in runs of two (12 ft), 6 chairs per table on the long
  // sides, columns on a 10 ft pitch, 4 ft walk gap between run-rows.
  const BANQUET_COL_PITCH = 10;
  const BANQUET_RUN_GAP = 4;
  const BANQUET_RUN_LEN = 12;  // 2 × 6ft tables end-to-end
  const BANQUET_EDGE_INSET = 1.65;
  const DANCE_GAP = 2;         // clearance between dance floor and seating

  // Footprint envelopes (table + tucked chairs) — the last row/column of a
  // grid only needs its envelope, not a full pitch.
  const ENV = {
    round:    { x: 5 + CHAIR_ENV * 2,   y: 5 + CHAIR_ENV * 2 },     // 9.16
    banquet:  { x: 6 + CHAIR_ENV * 2,   y: 2.5 + CHAIR_ENV * 2 },   // 10.16 × 6.66
    cocktail: { x: 2.5,                 y: 2.5 },
  };

  // Real fleet counts (verified against RentKit inventory, 2026-06-10).
  // A recommendation that needs three 20×60s when FPR owns two is a lie —
  // update these when the fleet changes.
  const TENT_STOCK = {
    'marquee-tent-20x20': 4,
    'marquee-tent-20x30': 4,
    'marquee-tent-20x40': 2,
    'marquee-tent-20x60': 2,
    'marquee-tent-30x60': 1,
  };

  function init(catalog) {
    byKey = {};
    for (const g of catalog.groups) {
      for (const it of g.items) byKey[it.key] = it;
    }
    danceFloors = Object.values(byKey)
      .filter(it => it.shape === 'danceFloor')
      .sort((a, b) => a.widthFt * a.depthFt - b.widthFt * b.depthFt);
  }

  // Tent configurations, every one deliverable from stock:
  //   • singles
  //   • same-model side-by-side pairs (joined along the long edge)
  //   • the 30×60 joined with one/both 20×60s (lengths match at 60 ft)
  // Normalized so depth ≥ width; a combo wider than deep gets rotated
  // whole (each unit takes rotation 90 in the recipe).
  function tentConfigs() {
    const configs = [];
    const stocked = (k, n) => byKey[k] && (TENT_STOCK[k] || 0) >= n;

    for (const key of Object.keys(TENT_STOCK)) {
      if (!stocked(key, 1)) continue;
      const t = byKey[key];
      const w = Math.min(t.widthFt, t.depthFt);
      const d = Math.max(t.widthFt, t.depthFt);
      configs.push({ keys: [key], w, d, placements: [{ key, cx: w / 2, cy: d / 2 }] });
      if (stocked(key, 2)) {
        let cfg = {
          keys: [key, key],
          w: w * 2, d,
          placements: [{ key, cx: w / 2, cy: d / 2 }, { key, cx: w * 1.5, cy: d / 2 }],
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

    // 30×60 + n×20×60, joined along the shared 60 ft edge → 50×60 / 70×60.
    if (stocked('marquee-tent-30x60', 1) && stocked('marquee-tent-20x60', 1)) {
      configs.push({
        keys: ['marquee-tent-30x60', 'marquee-tent-20x60'],
        w: 50, d: 60,
        placements: [
          { key: 'marquee-tent-30x60', cx: 15, cy: 30 },
          { key: 'marquee-tent-20x60', cx: 40, cy: 30 },
        ],
      });
    }
    if (stocked('marquee-tent-30x60', 1) && stocked('marquee-tent-20x60', 2)) {
      configs.push({
        keys: ['marquee-tent-30x60', 'marquee-tent-20x60', 'marquee-tent-20x60'],
        w: 70, d: 60,
        placements: [
          { key: 'marquee-tent-30x60', cx: 15, cy: 30 },
          { key: 'marquee-tent-20x60', cx: 40, cy: 30 },
          { key: 'marquee-tent-20x60', cx: 60, cy: 30 },
        ],
      });
    }

    // Cheapest deliverable option first. Long thin ribbons carry a soft
    // penalty; anything using the single 30×60 carries a hard one — FPR
    // stocks five 20-ft-wide sizes, so the big tent is only recommended
    // when it's meaningfully cheaper than the 20x route.
    const price = (c) => c.keys.reduce((s, k) => s + ((byKey[k] && byKey[k].priceCAD) || 0), 0);
    const score = (c) => {
      let s = price(c) * (1 + Math.max(0, c.d / c.w - 2.2) * 0.15);
      // Each join is extra rigging labour — at equal price, one tent
      // beats two (and keeps the long processional aisle for ceremonies).
      s *= 1 + 0.15 * (c.keys.length - 1);
      // Hard 30×60 bias (owner preference: lean on the five 20-ft-wide
      // sizes; the single 30×60 is reserved for events nothing else can
      // hold). At 1.6 it only ever wins when no 20x config fits; drop
      // toward ~1.3 to let it win mid-size events where it's cheaper.
      if (c.keys.indexOf('marquee-tent-30x60') !== -1) s *= 1.6;
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

  // ── Seating-band math ────────────────────────────────────────────────
  // Both layouts reduce to: how deep is a block of N units at width W,
  // and how many units fit in a band of fixed width × depth. That's what
  // lets the dance floor share width with seating instead of demanding a
  // full-width strip.
  function gridCols(plan, width) {
    return Math.max(0, Math.floor((width - plan.envX) / plan.pitchX) + 1);
  }
  function gridDepthFor(plan, units, width) {
    const cols = gridCols(plan, width);
    if (cols < 1) return null;
    const rows = Math.ceil(units / cols);
    return { cols, rows, depth: (rows - 1) * plan.pitchY + plan.envY };
  }
  function gridUnitsInBand(plan, width, depth) {
    const cols = gridCols(plan, width);
    if (cols < 1 || depth < plan.envY) return 0;
    const rows = Math.floor((depth - plan.envY) / plan.pitchY) + 1;
    return cols * rows;
  }
  function runCols(width) {
    return Math.max(0, Math.floor((width - ENV.banquet.y) / BANQUET_COL_PITCH) + 1);
  }
  function runDepthFor(units, width) {
    const cols = runCols(width);
    if (cols < 1) return null;
    const runs = Math.ceil(units / 2);
    const rows = Math.ceil(runs / cols);
    return { cols, rows, runs, depth: rows * BANQUET_RUN_LEN + (rows - 1) * BANQUET_RUN_GAP };
  }
  function runUnitsInBand(width, depth) {
    const cols = runCols(width);
    if (cols < 1 || depth < BANQUET_RUN_LEN) return 0;
    const rows = Math.floor((depth + BANQUET_RUN_GAP) / (BANQUET_RUN_LEN + BANQUET_RUN_GAP));
    return cols * rows * 2;
  }

  // Fit `plan` into a footprint w×dMax. Returns zone layout or null.
  function fitInWidth(plan, opts, w, dMax) {
    const usableW = w - INSET_FT * 2;
    if (usableW <= 0) return null;
    let depthNeeded = INSET_FT * 2;
    const zones = {};
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
      if (dMax != null && depthNeeded > dMax) return null;
      return { depthNeeded, zones };
    }

    const isRuns = plan.style === 'banquet';
    const seatW = usableW - buffetW - (isRuns ? (BANQUET_EDGE_INSET - INSET_FT) * 2 : 0);
    const df = (opts.danceFloor)
      ? ((opts._df === 'min') ? danceFloors[0] : snapDanceFloor(plan.guests))
      : null;

    const blockFor = (units) => (isRuns ? runDepthFor(units, seatW) : gridDepthFor(plan, units, seatW));
    const bandUnits = (width, depth) => (isRuns ? runUnitsInBand(width, depth) : gridUnitsInBand(plan, width, depth));

    let best = null; // { extraDepth, zones-additions }
    if (df && !opts._danceOutside) {
      // Option A: dance floor in a corner band, seating beside then below.
      const bandW = seatW - df.widthFt - DANCE_GAP;
      if (bandW > 0) {
        const inBand = bandUnits(bandW, df.depthFt);
        const remaining = Math.max(0, plan.units - inBand);
        const below = remaining > 0 ? blockFor(remaining) : null;
        if (remaining === 0 || below) {
          const depth = df.depthFt + (remaining > 0 ? DANCE_GAP + below.depth : 0);
          best = {
            depth,
            zones: {
              danceBand: { key: df.key, w: df.widthFt, d: df.depthFt, bandW, inBand },
              block: below,
            },
          };
        }
      }
      // Option B: classic full-width strip (kept when it's shallower).
      const block = blockFor(plan.units);
      if (block && df.widthFt <= seatW) {
        const depth = block.depth + DANCE_GAP + df.depthFt;
        if (!best || depth < best.depth) {
          best = { depth, zones: { block, danceStrip: { key: df.key, w: df.widthFt, d: df.depthFt } } };
        }
      }
    } else {
      const block = blockFor(plan.units);
      if (block) best = { depth: block.depth, zones: { block } };
      if (df && opts._danceOutside) zones.danceOutside = { key: df.key, w: df.widthFt, d: df.depthFt };
    }
    if (!best) return null;

    Object.assign(zones, best.zones);
    zones.seatW = seatW;
    depthNeeded += best.depth;
    if (buffetW > 0) {
      if (usableW - buffetW < 8) return null;
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
    for (const variant of [opts, { ...opts, _danceOutside: true }]) {
      if (variant._danceOutside && (!opts.danceFloor || plan.style === 'ceremony')) continue;
      for (const cfg of tentConfigs()) {
        const fit = fitInWidth(plan, variant, cfg.w, cfg.d);
        if (!fit) continue;
        const totalSqft = cfg.w * cfg.d;
        const notes = [];
        if (cfg.keys.length > 1) notes.push(`${cfg.keys.length} marquees joined (${cfg.w}×${cfg.d} ft combined)`);
        if (variant._danceOutside) notes.push('dance floor on the lawn beside the tent');
        return {
          tentKeys: cfg.keys,
          sqftNeeded,
          totalSqft,
          sqftPerGuest: Math.round((totalSqft / plan.guests) * 10) / 10,
          fits: true,
          notes,
        };
      }
    }
    return { tentKeys: [], sqftNeeded, totalSqft: 0, sqftPerGuest: 0, fits: false, notes: ['Bigger than our largest deliverable tent combination — contact us for a custom multi-tent plan.'] };
  }

  function generateLayout(opts) {
    const plan = seatingPlan(opts);
    const chairKey = opts.chairKey || 'resin-garden-chair';
    const items = [];
    let W, D, originX, originY, usableW;
    let cfg = null;
    let fit = null;
    let compromise = null;
    let danceOutside = false;

    if (opts.venue && opts.venue.widthFt > 0 && opts.venue.depthFt > 0) {
      W = opts.venue.widthFt; D = opts.venue.depthFt;
      const variants = [
        [opts, null],
        [{ ...opts, _df: 'min' }, 'smaller-dance'],
        [{ ...opts, danceFloor: false }, 'no-dance'],
      ];
      for (const [vOpts, vComp] of variants) {
        if (vComp && !opts.danceFloor) continue;
        fit = fitInWidth(plan, vOpts, W, D);
        if (!fit) {
          fit = fitInWidth(plan, vOpts, D, W);
          if (fit) { const t = W; W = D; D = t; }
        }
        if (fit) { compromise = vComp; break; }
      }
      if (!fit) return null;
      originX = INSET_FT;
      originY = INSET_FT + Math.max(0, (D - fit.depthNeeded) / 2);
      usableW = W - INSET_FT * 2;
    } else {
      outer:
      for (const variant of [opts, { ...opts, _danceOutside: true }]) {
        if (variant._danceOutside && (!opts.danceFloor || plan.style === 'ceremony')) continue;
        for (const c of tentConfigs()) {
          const f = fitInWidth(plan, variant, c.w, c.d);
          if (f) { cfg = c; fit = f; danceOutside = !!variant._danceOutside; break outer; }
        }
      }
      if (!cfg) return null;
      const lawnDance = danceOutside ? snapDanceFloor(plan.guests) : null;
      // Venue = tent footprint + 4 ft of working room on every side, plus
      // room below the tent when the dance floor lives on the lawn.
      W = cfg.w + 8;
      D = cfg.d + 8 + (lawnDance ? lawnDance.depthFt + DANCE_GAP + 2 : 0);
      originX = 4 + INSET_FT;
      originY = 4 + INSET_FT + Math.max(0, (cfg.d - fit.depthNeeded) / 2);
      usableW = cfg.w - INSET_FT * 2;
      for (const p of cfg.placements) {
        const tentItem = { key: p.key, cx: 4 + p.cx, cy: 4 + p.cy };
        if (p.rotation) tentItem.rotation = p.rotation;
        items.push(tentItem);
      }
      if (lawnDance) {
        items.push({ key: lawnDance.key, cx: 4 + cfg.w / 2, cy: 4 + cfg.d + DANCE_GAP + lawnDance.depthFt / 2 });
        compromise = 'dance-outside';
      }
    }

    let cursorY = originY;
    const centerX = originX + usableW / 2;
    const seatW = fit.zones.seatW != null ? fit.zones.seatW : usableW;
    // Seating block centres within its own lane (left of any buffet).
    const furnitureCX = fit.zones.buffet ? originX + seatW / 2 : centerX;

    if (fit.zones.head) {
      items.push(
        { key: 'banquet-table-6ft', cx: furnitureCX - 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey },
        { key: 'banquet-table-6ft', cx: furnitureCX + 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey }
      );
      cursorY += fit.zones.head;
    }

    const placeGrid = (block, units, cx0, width, startY, skip) => {
      // cx0 = centre of the available width; envelope-aligned rows.
      const rowWidth = (n) => (n - 1) * plan.pitchX + plan.envX;
      let placed = skip || 0;
      const startUnit = placed;
      for (let r = 0; r < block.rows && placed < units; r++) {
        const inRow = Math.min(block.cols, units - placed);
        const rowLeft = cx0 - rowWidth(inRow) / 2;
        for (let c = 0; c < inRow; c++) {
          const item = {
            key: plan.unitKey,
            cx: rowLeft + plan.envX / 2 + c * plan.pitchX,
            cy: startY + r * plan.pitchY + plan.envY / 2,
          };
          if (plan.seatsPerUnit > 0) {
            item.withChairs = true;
            item.chairCount = plan.seatsPerUnit;
            item.chairKey = chairKey;
          }
          items.push(item);
          placed++;
        }
      }
      return placed - startUnit;
    };
    const placeRuns = (block, units, cx0, startY, skip) => {
      const gridW = (block.cols - 1) * BANQUET_COL_PITCH + ENV.banquet.y;
      const firstCol = cx0 - gridW / 2 + ENV.banquet.y / 2;
      let placed = skip || 0;
      const startUnit = placed;
      for (let r = 0; r < block.rows && placed < units; r++) {
        const rowY = startY + r * (BANQUET_RUN_LEN + BANQUET_RUN_GAP);
        for (let c = 0; c < block.cols && placed < units; c++) {
          const cx = firstCol + c * BANQUET_COL_PITCH;
          for (let t = 0; t < 2 && placed < units; t++) {
            items.push({
              key: plan.unitKey, cx, cy: rowY + 3 + t * 6, rotation: 90,
              withChairs: true, chairCount: plan.seatsPerUnit, chairKey,
            });
            placed++;
          }
        }
      }
      return placed - startUnit;
    };

    if (plan.style === 'ceremony') {
      const z = fit.zones.rows;
      const chair = byKey[plan.unitKey];
      const chairW = chair ? chair.widthFt : 1.5;
      cursorY += ALTAR_FT; // arch/officiant zone at the front
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
    } else {
      const isRuns = plan.style === 'banquet';
      let placedSoFar = 0;
      if (fit.zones.danceBand) {
        const z = fit.zones.danceBand;
        // Dance floor in the right corner of the band; seating fills the left.
        items.push({
          key: z.key,
          cx: furnitureCX + seatW / 2 - z.w / 2,
          cy: cursorY + z.d / 2,
        });
        if (z.inBand > 0) {
          const bandCX = furnitureCX - seatW / 2 + z.bandW / 2;
          const bandBlock = isRuns
            ? runDepthFor(Math.min(z.inBand, plan.units), z.bandW)
            : gridDepthFor(plan, Math.min(z.inBand, plan.units), z.bandW);
          if (bandBlock) {
            placedSoFar += isRuns
              ? placeRuns(bandBlock, Math.min(z.inBand, plan.units), bandCX, cursorY)
              : placeGrid(bandBlock, Math.min(z.inBand, plan.units), bandCX, z.bandW, cursorY);
          }
        }
        cursorY += z.d + (plan.units > placedSoFar ? DANCE_GAP : 0);
      }
      if (fit.zones.block && plan.units > placedSoFar) {
        if (isRuns) placeRuns(fit.zones.block, plan.units, furnitureCX, cursorY, placedSoFar);
        else placeGrid(fit.zones.block, plan.units, furnitureCX, seatW, cursorY, placedSoFar);
        cursorY += fit.zones.block.depth;
      }
      if (fit.zones.danceStrip) {
        const z = fit.zones.danceStrip;
        items.push({ key: z.key, cx: furnitureCX, cy: cursorY + DANCE_GAP + z.d / 2 });
        cursorY += z.d + DANCE_GAP;
      }
    }

    if (fit.zones.buffet) {
      const bx = originX + usableW - 1.5;
      items.push(
        { key: 'banquet-table-8ft', cx: bx, cy: originY + 10, rotation: 90 },
        { key: 'banquet-table-8ft', cx: bx, cy: originY + 19, rotation: 90 }
      );
    }

    if (opts.bar && plan.style !== 'ceremony' && plan.style !== 'cocktail') {
      items.push({ key: 'cocktail-table', cx: originX + 3, cy: originY + 3 });
    }

    const styleLabel = { round: 'round tables', banquet: 'banquet tables', cocktail: 'cocktail', ceremony: 'ceremony' }[plan.style];
    const label = `${plan.guests}-Guest ${plan.style === 'ceremony' ? 'Ceremony' : 'Event'}`;
    const summaryBits = [];
    if (cfg) {
      const names = {};
      cfg.keys.forEach(k => { names[k] = (names[k] || 0) + 1; });
      summaryBits.push(Object.entries(names)
        .map(([k, n]) => `${n > 1 ? n + '× ' : ''}${(byKey[k] || {}).label || k}`)
        .join(' + ') + (cfg.keys.length > 1 ? ' joined' : ''));
    }
    if (plan.style === 'ceremony') summaryBits.push(`${plan.guests} chairs in rows · ${CEREMONY_AISLE} ft aisle`);
    else summaryBits.push(`${plan.units} ${styleLabel}`);
    const dz = fit.zones.danceBand || fit.zones.danceStrip;
    if (dz) summaryBits.push(`${dz.w}×${dz.d} dance floor`);
    if (compromise === 'smaller-dance') summaryBits.push('dance floor sized down to fit your space');
    if (compromise === 'no-dance') summaryBits.push('no room for a dance floor in this space');
    if (compromise === 'dance-outside') summaryBits.push('dance floor on the lawn beside the tent');

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
