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
 *   2. INSTALL — among configs the furniture fits in, pick the fewest
 *      marquees first (a 3-tent join for 50 guests looks wrong). Cost-
 *      efficient then takes the smallest footprint; spacious takes the
 *      next size up when it buys real walking room (and still the fewest
 *      marquees).
 *   3. PACKING — rounds and highboys honeycomb (staggered rows) so walk
 *      paths zigzag the way a crew actually fills a marquee. Dance sits
 *      in a corner and tables flow around it. Banquet stays in runs;
 *      ceremony stays in rows.
 *   4. SPACING — cost-efficient tries 4 ft aisles, then 3.5 / 2.5 to save
 *      a marquee; chairs may kiss the valance. Spacious tries 6 / 5 / 4 ft
 *      (never tighter), keeps chairs under the canvas, and spends leftover
 *      width on aisles between tables — not empty side yards.
 */
(function () {
  'use strict';

  let byKey = {};
  let danceFloors = [];  // catalog dance floors sorted by area asc

  const INSET_FT = 2;          // keep chair-backs this far inside tent walls
  // Chair-back to chair-back. 4 ft is FPR's premium walk aisle (templates
  // comment + crew standard). We try 4 first, then 3.5 / 2.5 so a layout
  // still fits a real tent instead of inventing a 3-marquee join.
  const AISLE_PREFS = [4, 3.5, 2.5];
  const AISLE_PREFS_SPACIOUS = [6, 5, 4, 3.5];
  const AISLE_CAP = 6;          // never stretch chair-back aisles past this
  function isSpacious(opts) { return !!(opts && opts.pack === 'spacious'); }
  function aislePrefs(opts) { return isSpacious(opts) ? AISLE_PREFS_SPACIOUS : AISLE_PREFS; }
  const ROW_PITCH = 2.5;       // ceremony row spacing (= ceremony modal default)
  const CEREMONY_CHAIR_GAP = 0.25; // in-row chair gap (= ceremony modal default)
  const CEREMONY_AISLE = 4;
  const CEREMONY_INSET = 1.5;  // ceremony rows sit closer to the walls than dining
  const ALTAR_FT = 5;          // ceremony head zone (arch/officiant), at the front
  const BANQUET_RUN_LEN = 12;  // 2 × 6ft tables end-to-end
  const BANQUET_EDGE_INSET = 1.65;
  const DANCE_GAP = 2;         // clearance between dance floor and seating
  const SLOT_ROW_CAP = 24;     // L-pack row search limit (covers 300 guests)
  const HEX_RATIO = Math.sqrt(3) / 2;

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
    cachedConfigs = null;
    for (const g of catalog.groups) {
      for (const it of g.items) byKey[it.key] = it;
    }
    danceFloors = Object.values(byKey)
      .filter(it => it.shape === 'danceFloor')
      .sort((a, b) => a.widthFt * a.depthFt - b.widthFt * b.depthFt);
  }

  // Tent configurations, every one deliverable from stock, capped at
  // MAX_TENTS marquees per event:
  //   • singles
  //   • 20-ft-wide "columns" — one tent, or two joined end-to-end (≤60 ft)
  //   • 1–3 equal-length columns joined side-by-side
  //   • the 30×60 joined with 60-ft columns along the shared 60 ft edge
  // Both orientations of every footprint are emitted so the fitter can
  // pack furniture across the wide side when that uses the tent better.
  const MAX_TENTS = 4;
  let cachedConfigs = null;

  function tentConfigs() {
    if (cachedConfigs) return cachedConfigs;
    const configs = [];
    const seen = new Set();

    const inStock = (keys) => {
      const need = {};
      for (const k of keys) {
        if (!byKey[k]) return false;
        need[k] = (need[k] || 0) + 1;
        if (need[k] > (TENT_STOCK[k] || 0)) return false;
      }
      return true;
    };
    // Emit a config plus its 90°-rotated twin (deduped by keys+footprint).
    const pushBoth = (cfg) => {
      const variants = [cfg];
      if (cfg.w !== cfg.d) {
        variants.push({
          keys: cfg.keys, w: cfg.d, d: cfg.w,
          placements: cfg.placements.map(p => {
            const t = byKey[p.key];
            const q = { key: p.key, cx: p.cy, cy: p.cx };
            if (t && t.widthFt !== t.depthFt && !p.rotation) q.rotation = 90;
            return q;
          }),
        });
      }
      for (const v of variants) {
        const sig = v.keys.slice().sort().join(',') + '|' + v.w + 'x' + v.d;
        if (!seen.has(sig)) { seen.add(sig); configs.push(v); }
      }
    };

    // 20-ft-wide columns: single tents, or two joined end-to-end (≤60 ft —
    // e.g. two 20×30s standing in for a 20×60 when those are booked out).
    const models = Object.keys(TENT_STOCK)
      .filter(k => byKey[k] && Math.min(byKey[k].widthFt, byKey[k].depthFt) === 20);
    const colLen = (k) => Math.max(byKey[k].widthFt, byKey[k].depthFt);
    const columns = models.map(k => ({ keys: [k], len: colLen(k) }));
    for (let i = 0; i < models.length; i++) {
      for (let j = i; j < models.length; j++) {
        const len = colLen(models[i]) + colLen(models[j]);
        if (len <= 60) columns.push({ keys: [models[i], models[j]], len });
      }
    }

    // Lay out chosen columns left-to-right; `lead` is the 30×60 when the
    // combo joins it along the shared 60 ft edge.
    const emit = (cols, len, lead) => {
      const keys = cols.reduce((a, c) => a.concat(c.keys), lead ? [lead] : []);
      if (keys.length > MAX_TENTS || !inStock(keys)) return;
      const leadW = lead ? Math.min(byKey[lead].widthFt, byKey[lead].depthFt) : 0;
      const placements = [];
      if (lead) placements.push({ key: lead, cx: leadW / 2, cy: len / 2 });
      cols.forEach((c, ci) => {
        const cx = leadW + ci * 20 + 10;
        let cy = 0;
        for (const k of c.keys) {
          const l = colLen(k);
          placements.push({ key: k, cx, cy: cy + l / 2 });
          cy += l;
        }
      });
      pushBoth({ keys, w: leadW + cols.length * 20, d: len, placements });
    };

    // 1–3 equal-length columns side-by-side (multisets, with repetition).
    const byLen = {};
    for (const c of columns) (byLen[c.len] = byLen[c.len] || []).push(c);
    for (const lenKey of Object.keys(byLen)) {
      const pool = byLen[lenKey];
      const len = Number(lenKey);
      const pick = (start, chosen) => {
        if (chosen.length) {
          emit(chosen, len, null);
          if (len === 60) emit(chosen, len, 'marquee-tent-30x60');
        }
        if (chosen.length >= 3) return;
        for (let i = start; i < pool.length; i++) {
          chosen.push(pool[i]);
          pick(i, chosen);
          chosen.pop();
        }
      };
      pick(0, []);
    }
    if ((TENT_STOCK['marquee-tent-30x60'] || 0) > 0 && byKey['marquee-tent-30x60']) {
      pushBoth({
        keys: ['marquee-tent-30x60'], w: 30, d: 60,
        placements: [{ key: 'marquee-tent-30x60', cx: 15, cy: 30 }],
      });
    }
    cachedConfigs = configs;
    return configs;
  }

  // Shared edges between joined marquees — keep table TOPS off the pole
  // line so a 5ft round doesn't sit on the seam.
  function tentSeams(cfg) {
    if (!cfg || !cfg.placements || cfg.placements.length < 2) return [];
    const rects = cfg.placements.map(p => {
      const t = byKey[p.key];
      const rot = !!(p.rotation);
      const w = rot ? t.depthFt : t.widthFt;
      const d = rot ? t.widthFt : t.depthFt;
      return { x1: p.cx - w / 2, y1: p.cy - d / 2, x2: p.cx + w / 2, y2: p.cy + d / 2 };
    });
    const boxes = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        if (overlapY > 1 && Math.abs(a.x2 - b.x1) < 0.3) {
          boxes.push({ x1: a.x2 - 0.3, y1: Math.max(a.y1, b.y1), x2: a.x2 + 0.3, y2: Math.min(a.y2, b.y2), r: 2.6 });
        } else if (overlapY > 1 && Math.abs(a.x1 - b.x2) < 0.3) {
          boxes.push({ x1: a.x1 - 0.3, y1: Math.max(a.y1, b.y1), x2: a.x1 + 0.3, y2: Math.min(a.y2, b.y2), r: 2.6 });
        } else if (overlapX > 1 && Math.abs(a.y2 - b.y1) < 0.3) {
          boxes.push({ x1: Math.max(a.x1, b.x1), y1: a.y2 - 0.3, x2: Math.min(a.x2, b.x2), y2: a.y2 + 0.3, r: 2.6 });
        } else if (overlapX > 1 && Math.abs(a.y1 - b.y2) < 0.3) {
          boxes.push({ x1: Math.max(a.x1, b.x1), y1: a.y1 - 0.3, x2: Math.min(a.x2, b.x2), y2: a.y1 + 0.3, r: 2.6 });
        }
      }
    }
    return boxes;
  }

  // ── Tent selection ───────────────────────────────────────────────────
  // Cost-efficient: fewest marquees, smallest footprint, then aisle.
  // Spacious: dance stays inside, fewest marquees, widest aisle, then a
  // footprint that actually uses the width (2+ table columns) so leftover
  // square footage becomes walking room instead of empty side yards.
  function comboPrice(cfg) {
    return cfg.keys.reduce((s, k) => s + ((byKey[k] && byKey[k].priceCAD) || 0), 0);
  }
  function packCols(c) {
    const z = c.fit && c.fit.zones;
    if (!z) return 0;
    if (z.cols != null) return z.cols;
    if (z.block && z.block.cols) return z.block.cols;
    if (z.sideCols) return z.sideCols;
    return 0;
  }
  function chooseTentConfig(opts) {
    const cands = [];
    const prefs = aislePrefs(opts);
    const spacious = isSpacious(opts);
    for (let a = 0; a < prefs.length; a++) {
      const aisle = prefs[a];
      const plan = seatingPlan({ ...opts, _aisle: aisle });
      for (const danceOutside of [false, true]) {
        if (danceOutside && (!opts.danceFloor || plan.style === 'ceremony')) continue;
        const variant = { ...opts, _aisle: aisle, _danceOutside: danceOutside };
        for (const cfg of tentConfigs()) {
          const fit = fitInWidth(plan, { ...variant, _seams: tentSeams(cfg) }, cfg.w, cfg.d);
          if (!fit) continue;
          cands.push({
            cfg, fit, plan, aisle, danceOutside,
            tents: cfg.keys.length,
            area: cfg.w * cfg.d,
            price: comboPrice(cfg),
          });
        }
      }
    }
    if (!cands.length) {
      if (spacious && !opts._spaciousFallback) {
        return chooseTentConfig({ ...opts, pack: 'efficient', _spaciousFallback: true });
      }
      return null;
    }
    const twoCol = (c) => (c.plan.units >= 5 && packCols(c) >= 2) ? 1 : 0;
    const hexScore = (c) => (c.fit.zones && c.fit.zones.pack === 'hex') ? 1 : 0;
    if (spacious) {
      cands.sort((a, b) =>
        ((a.danceOutside ? 1 : 0) - (b.danceOutside ? 1 : 0)) ||
        (a.tents - b.tents) ||
        (hexScore(b) - hexScore(a)) ||
        (b.aisle - a.aisle) ||
        (twoCol(b) - twoCol(a)) ||
        (a.area - b.area) ||
        (a.price - b.price) ||
        (a.fit.depthNeeded - b.fit.depthNeeded)
      );
    } else {
      cands.sort((a, b) =>
        (a.tents - b.tents) ||
        ((a.danceOutside ? 1 : 0) - (b.danceOutside ? 1 : 0)) ||
        (a.area - b.area) ||
        (b.aisle - a.aisle) ||
        (a.price - b.price) ||
        (a.fit.depthNeeded - b.fit.depthNeeded)
      );
    }
    return cands[0];
  }

  function snapDanceFloor(guests) {
    const targetSqft = 3 * Math.ceil(guests * 0.4);
    for (const df of danceFloors) {
      if (df.widthFt * df.depthFt >= targetSqft) return df;
    }
    return danceFloors[danceFloors.length - 1] || null;
  }

  function chairClearance(chairKey) {
    const ch = byKey[chairKey] || byKey['resin-garden-chair'];
    return ((ch && ch.depthFt) || 1.83) + 0.25;
  }

  function seatingPlan(opts) {
    const guests = Math.max(1, Math.min(300, Math.round(opts.guests || 0)));
    const style = opts.seating || 'round';
    const aisle = opts._aisle != null ? opts._aisle : aislePrefs(opts)[0];
    const chairKey = opts.chairKey || 'resin-garden-chair';
    const cc = chairClearance(chairKey);
    if (style === 'cocktail') {
      const n = Math.ceil(guests / 6);
      const env = 2.5;
      return {
        style, guests, units: n, unitKey: 'cocktail-table', aisle,
        pitchX: env + aisle, pitchY: env + aisle, envX: env, envY: env, seatsPerUnit: 0,
      };
    }
    if (style === 'ceremony') {
      return {
        style, guests, units: guests, unitKey: chairKey,
        aisle: isSpacious(opts) ? 6 : CEREMONY_AISLE,
        rowPitch: isSpacious(opts) ? 3.25 : ROW_PITCH,
      };
    }
    if (style === 'banquet') {
      const envY = 2.5 + cc * 2;
      const headSeats = opts.headTable ? 8 : 0;
      return {
        style, guests, units: Math.ceil(Math.max(0, guests - headSeats) / 6), unitKey: 'banquet-table-6ft',
        seatsPerUnit: 6, aisle, envX: 6, envY,
        colPitch: envY + aisle, runGap: aisle, runLen: BANQUET_RUN_LEN,
      };
    }
    const env = 5 + cc * 2;
    const headSeats = opts.headTable ? 8 : 0;
    return {
      style: 'round', guests, units: Math.ceil(Math.max(0, guests - headSeats) / 8), unitKey: 'round-table-5ft',
      pitchX: env + aisle, pitchY: env + aisle, envX: env, envY: env,
      seatsPerUnit: 8, aisle,
    };
  }

  // ── Seating-band math ────────────────────────────────────────────────
  function gridCols(plan, width) {
    return Math.max(0, Math.floor((width - plan.envX) / plan.pitchX) + 1);
  }
  function gridDepthFor(plan, units, width) {
    const cols = gridCols(plan, width);
    if (cols < 1) return null;
    if (units <= 0) return { cols, rows: 0, depth: 0 };
    const rows = Math.ceil(units / cols);
    return { cols, rows, depth: (rows - 1) * plan.pitchY + plan.envY };
  }
  function gridUnitsInBand(plan, width, depth) {
    const cols = gridCols(plan, width);
    if (cols < 1 || depth < plan.envY) return 0;
    const rows = Math.floor((depth - plan.envY) / plan.pitchY) + 1;
    return cols * rows;
  }
  function runCols(plan, width) {
    return Math.max(0, Math.floor((width - plan.envY) / plan.colPitch) + 1);
  }
  function runDepthFor(plan, units, width) {
    const cols = runCols(plan, width);
    if (cols < 1) return null;
    if (units <= 0) return { cols, rows: 0, runs: 0, depth: 0 };
    const runs = Math.ceil(units / 2);
    const rows = Math.ceil(runs / cols);
    return { cols, rows, runs, depth: rows * plan.runLen + (rows - 1) * plan.runGap };
  }
  function runUnitsInBand(plan, width, depth) {
    const cols = runCols(plan, width);
    if (cols < 1 || depth < plan.runLen) return 0;
    const rows = Math.floor((depth + plan.runGap) / (plan.runLen + plan.runGap));
    return cols * rows * 2;
  }

  // Honeycomb (staggered) packing for rounds — the way a crew actually
  // fills a 20×30/20×40: offset every other row so walk paths zigzag
  // instead of forming cafeteria aisles. Cost-efficient centres sit so the
  // TABLE stays in the tent; chairs may kiss the valance. Spacious keeps
  // chairs under the canvas and spends leftover width on aisles between
  // tables (capped at AISLE_CAP) instead of empty side yards.
  function packHex(plan, W, D, df, spread, extraBoxes) {
    if (spread) return packHexSpread(plan, W, D, df, extraBoxes);
    const pitch = plan.pitchX;
    const r = plan.envX / 2;
    if (!(W > 0) || !(D > 0) || !(pitch > 0)) return null;
    const margin = Math.min(r, Math.max(2.5, (W - pitch) / 2));
    if (margin * 2 > W + 0.05) return null;
    const obstacles = hexObstacles(W, D, df, extraBoxes);
    if (df && !obstacles) return null;
    const dance = obstacles && obstacles.dance;
    const rowH = pitch * HEX_RATIO;
    const slots = [];
    let row = 0;
    let evenCols = 0;
    for (let y = margin; y <= D - margin + 0.05; y += rowH, row++) {
      const xStart = margin + ((row % 2) ? pitch / 2 : 0);
      let inRow = 0;
      for (let x = xStart; x <= W - margin + 0.05; x += pitch) {
        if (hexHits(x, y, r, obstacles && obstacles.boxes)) continue;
        slots.push({ cx: Math.round(x * 100) / 100, cy: Math.round(y * 100) / 100 });
        inRow++;
      }
      if (row === 0) evenCols = inRow;
    }
    if (slots.length < plan.units) return null;
    const taken = slots.slice(0, plan.units);
    return hexResult(taken, dance, df, r, W, evenCols);
  }

  function hexObstacles(W, D, df, extra) {
    const boxes = extra ? extra.slice() : [];
    if (!df) return { dance: null, boxes };
    const dw = df.widthFt, dh = df.depthFt;
    if (dw > W || dh > D) return null;
    const dance = { key: df.key, w: dw, d: dh, cx: W - dw / 2, cy: dh / 2 };
    boxes.push({
      x1: dance.cx - dw / 2 - DANCE_GAP,
      y1: dance.cy - dh / 2 - DANCE_GAP,
      x2: dance.cx + dw / 2 + DANCE_GAP,
      y2: dance.cy + dh / 2 + DANCE_GAP,
    });
    return { dance, boxes };
  }
  function hexHits(x, y, r, boxes) {
    if (!boxes || !boxes.length) return false;
    return boxes.some(o => {
      const rr = o.r != null ? o.r : r;
      return x + rr > o.x1 && x - rr < o.x2 && y + rr > o.y1 && y - rr < o.y2;
    });
  }
  function hexResult(taken, dance, df, r, W, cols) {
    let maxY = dance ? df.depthFt : 0;
    for (let i = 0; i < taken.length; i++) {
      const bottom = taken[i].cy + r;
      if (bottom > maxY) maxY = bottom;
    }
    return { type: 'hex', depth: maxY, slots: taken, dance, packW: W, cols: cols || 1 };
  }

  // Spacious honeycomb: chairs stay inside the tent; extra width becomes
  // aisle between columns (capped), extra depth becomes aisle between rows.
  function packHexSpread(plan, W, D, df, extraBoxes) {
    const minPitch = plan.pitchX;
    const r = plan.envX / 2;
    const maxPitch = plan.envX + AISLE_CAP;
    if (!(W > 0) || !(D > 0) || !(minPitch > 0)) return null;
    const wall = r;
    if (wall * 2 > W + 0.05) return null;
    const obstacles = hexObstacles(W, D, df, extraBoxes);
    if (df && !obstacles) return null;
    const dance = obstacles && obstacles.dance;

    const cols = Math.max(1, Math.floor((W - 2 * wall + 0.05) / minPitch) + 1);
    const pitch = minPitch;
    const evenSpan = Math.max(0, (cols - 1) * pitch);
    const margin = cols > 1 ? (W - evenSpan) / 2 : W / 2;
    if (margin < wall - 0.05) return null;

    const rowH = pitch * HEX_RATIO;
    const slots = [];
    let row = 0;
    let evenCols = 0;
    for (let y = wall; y <= D - wall + 0.05; y += rowH, row++) {
      const xStart = (cols > 1 ? margin : W / 2) + ((row % 2) ? pitch / 2 : 0);
      if (cols === 1 && row % 2 === 1) continue;
      let inRow = 0;
      for (let x = xStart; x <= W - Math.min(margin, wall) + 0.05; x += pitch) {
        if (x < wall - 0.05 || x > W - wall + 0.05) continue;
        if (hexHits(x, y, r, obstacles && obstacles.boxes)) continue;
        slots.push({ cx: Math.round(x * 100) / 100, cy: Math.round(y * 100) / 100 });
        inRow++;
      }
      if (row === 0) evenCols = inRow || cols;
    }
    if (slots.length < plan.units) return null;
    let taken = slots.slice(0, plan.units);
    taken = spreadHexSlots(taken, W, D, wall, maxPitch, extraBoxes);
    return hexResult(taken, dance, df, r, W, evenCols);
  }

  // Push leftover tent width/depth into aisles between tables (capped),
  // keeping the lattice shape. Extra beyond AISLE_CAP stays as equal margins.
  function spreadHexSlots(taken, W, D, wall, maxPitch, extraBoxes) {
    if (taken.length < 2) return taken;
    const uniq = (vals) => [...new Set(vals.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);
    const remap = (vals, lo, hi, cap, anchor) => {
      const u = uniq(vals);
      if (u.length <= 1) return (v) => v;
      const span = u[u.length - 1] - u[0];
      if (span < 0.2) return (v) => v;
      const maxSpan = Math.min(hi - lo, (u.length - 1) * cap);
      const nativeGap = span / (u.length - 1);
      const scale = Math.min(maxSpan / span, cap / nativeGap);
      if (!(scale > 1.02)) return (v) => v;
      if (anchor === 'min') {
        return (v) => Math.round((u[0] + (v - u[0]) * scale) * 100) / 100;
      }
      const mid = (u[0] + u[u.length - 1]) / 2;
      const newMid = (lo + hi) / 2;
      return (v) => Math.round((newMid + (v - mid) * scale) * 100) / 100;
    };
    const vCuts = [0];
    for (const s of extraBoxes || []) {
      if ((s.x2 - s.x1) < (s.y2 - s.y1)) vCuts.push((s.x1 + s.x2) / 2);
    }
    vCuts.push(W);
    vCuts.sort((a, b) => a - b);
    const cuts = [];
    for (let i = 0; i < vCuts.length; i++) {
      if (!cuts.length || vCuts[i] - cuts[cuts.length - 1] > 1) cuts.push(vCuts[i]);
    }
    const mapY = remap(taken.map(s => s.cy), wall, D - wall, maxPitch * HEX_RATIO, 'min');
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i], hi = cuts[i + 1];
      const group = taken.filter(s => s.cx >= lo - 0.05 && s.cx <= hi + 0.05);
      if (!group.length) continue;
      const mapX = remap(group.map(s => s.cx), lo + wall, hi - wall, maxPitch, 'center');
      for (const s of group) out.push({ cx: mapX(s.cx), cy: mapY(s.cy) });
    }
    return out.length ? out : taken;
  }

  // L-pack: dance in the top-right corner; seating fills the left full-depth
  // and the pocket under the dance floor. Slots are sorted top-to-bottom.
  function lPackSeating(plan, seatW, df, isRuns) {
    const minW = isRuns ? plan.envY : plan.envX;
    const sideW = seatW - df.widthFt - DANCE_GAP;
    if (sideW < minW) return null;
    const sideCols = isRuns ? runCols(plan, sideW) : gridCols(plan, sideW);
    if (sideCols < 1) return null;
    const underCols = df.widthFt >= minW
      ? (isRuns ? runCols(plan, df.widthFt) : gridCols(plan, df.widthFt))
      : 0;
    const pitch = isRuns ? (plan.runLen + plan.runGap) : plan.pitchY;
    const unitH = isRuns ? plan.runLen : plan.envY;
    const perSideRow = isRuns ? sideCols * 2 : sideCols;
    const perUnderRow = underCols > 0 ? (isRuns ? underCols * 2 : underCols) : 0;
    const slots = [];
    for (let r = 0; r < SLOT_ROW_CAP; r++) {
      for (let i = 0; i < perSideRow; i++) slots.push({ region: 'side', r, i, y: r * pitch });
      if (perUnderRow > 0) {
        for (let i = 0; i < perUnderRow; i++) {
          slots.push({ region: 'under', r, i, y: df.depthFt + DANCE_GAP + r * pitch });
        }
      }
    }
    slots.sort((a, b) => a.y - b.y || (a.region === 'side' ? -1 : 1));
    const taken = slots.slice(0, plan.units);
    if (taken.length < plan.units) return null;
    const last = taken[taken.length - 1];
    const depth = Math.max(df.depthFt, last.y + unitH);
    return {
      type: 'L', depth, sideW, sideCols, underCols, df, taken,
      pitch, unitH, perSideRow, perUnderRow,
    };
  }

  function pickDancePack(plan, seatW, df, isRuns) {
    const packs = [];
    const blockFor = (units, width) => isRuns
      ? runDepthFor(plan, units, width)
      : gridDepthFor(plan, units, width);
    const bandUnits = (width, depth) => isRuns
      ? runUnitsInBand(plan, width, depth)
      : gridUnitsInBand(plan, width, depth);

    // Corner band: one row of tables beside the dance floor (band height is
    // at least a furniture envelope — an 8×8 floor is shallower than a
    // 5ft round + chairs, so using the floor's own depth used to yield 0).
    const bandH = Math.max(df.depthFt, isRuns ? plan.runLen : plan.envY);
    const bandW = seatW - df.widthFt - DANCE_GAP;
    if (bandW > 0) {
      const inBand = bandUnits(bandW, bandH);
      const remaining = Math.max(0, plan.units - inBand);
      const below = remaining > 0 ? blockFor(remaining, seatW) : { depth: 0, cols: 0, rows: 0 };
      if (remaining === 0 || below) {
        packs.push({
          type: 'band',
          depth: bandH + (remaining > 0 ? DANCE_GAP + below.depth : 0),
          dance: { key: df.key, w: df.widthFt, d: df.depthFt, bandW, bandH, inBand },
          block: below,
        });
      }
    }

    const L = lPackSeating(plan, seatW, df, isRuns);
    if (L) packs.push({ ...L, dance: { key: df.key, w: df.widthFt, d: df.depthFt } });

    const block = blockFor(plan.units, seatW);
    if (block && df.widthFt <= seatW) {
      packs.push({
        type: 'strip',
        depth: block.depth + DANCE_GAP + df.depthFt,
        block,
        dance: { key: df.key, w: df.widthFt, d: df.depthFt },
      });
    }
    if (!packs.length) return null;
    packs.sort((a, b) => a.depth - b.depth);
    return packs[0];
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
      const aisleW = plan.aisle || CEREMONY_AISLE;
      const rowPitch = plan.rowPitch || ROW_PITCH;
      const sideW = (usableW - aisleW) / 2;
      const perSide = Math.floor(sideW / perChair);
      if (perSide < 1) return null;
      const rows = Math.ceil(plan.guests / (perSide * 2));
      const depth = (rows - 1) * rowPitch + chairDepth;
      zones.rows = { rows, perSide, perChair, chairDepth, depth, aisleW, rowPitch };
      depthNeeded += depth + ALTAR_FT - (INSET_FT - CEREMONY_INSET) * 2;
      if (dMax != null && depthNeeded > dMax) return null;
      return { depthNeeded, zones };
    }

    const isRuns = plan.style === 'banquet';
    const isHex = plan.style === 'round' || plan.style === 'cocktail';
    const seatW = usableW - buffetW - (isRuns ? (BANQUET_EDGE_INSET - INSET_FT) * 2 : 0);
    const df = (opts.danceFloor)
      ? ((opts._df === 'min') ? danceFloors[0] : snapDanceFloor(plan.guests))
      : null;

    const head = opts.headTable ? 8 : 0;
    const hexD = (dMax != null ? dMax : 240) - head;
    let best = null;
    if (isHex) {
      const hexDf = (df && !opts._danceOutside) ? df : null;
      const hex = packHex(plan, w - buffetW, hexD, hexDf, isSpacious(opts), opts._seams);
      if (hex) best = hex;
    }
    if (!best && df && !opts._danceOutside) {
      best = pickDancePack(plan, seatW, df, isRuns);
    }
    if (!best) {
      const block = isRuns ? runDepthFor(plan, plan.units, seatW) : gridDepthFor(plan, plan.units, seatW);
      if (block) best = { type: 'grid', depth: block.depth, block };
      if (df && opts._danceOutside) zones.danceOutside = { key: df.key, w: df.widthFt, d: df.depthFt };
    }
    if (!best) return null;

    Object.assign(zones, best);
    zones.seatW = best.packW || seatW;
    zones.pack = best.type;
    if (best.type === 'hex') depthNeeded = (opts.headTable ? 8 : 0) + best.depth;
    else depthNeeded += best.depth;
    if (buffetW > 0) {
      if (usableW - buffetW < 8) return null;
      zones.buffet = true;
    }
    if (df && !opts._danceOutside && !zones.dance) return null;
    if (dMax != null && depthNeeded > dMax) return null;
    return { depthNeeded, zones };
  }

  function recommendTent(opts) {
    const plan0 = seatingPlan(opts);
    const perGuest = plan0.style === 'cocktail' ? 8 : plan0.style === 'ceremony' ? 8 : 13;
    const df = (opts.danceFloor && plan0.style !== 'ceremony') ? snapDanceFloor(plan0.guests) : null;
    const sqftNeeded = plan0.guests * perGuest + (df ? df.widthFt * df.depthFt : 0) + (opts.headTable ? 120 : 0) + (opts.buffet ? 100 : 0);
    const pick = chooseTentConfig(opts);
    if (pick) {
      const cfg = pick.cfg;
      const totalSqft = cfg.w * cfg.d;
      const notes = [];
      if (cfg.keys.length > 1) notes.push(`${cfg.keys.length} marquees joined (${cfg.w}×${cfg.d} ft combined)`);
      if (pick.danceOutside) notes.push('dance floor on the lawn beside the tent');
      if (pick.aisle) notes.push(`${pick.aisle} ft aisles`);
      return {
        tentKeys: cfg.keys,
        sqftNeeded,
        totalSqft,
        sqftPerGuest: Math.round((totalSqft / plan0.guests) * 10) / 10,
        fits: true,
        notes,
        aisle: pick.aisle,
      };
    }
    return { tentKeys: [], sqftNeeded, totalSqft: 0, sqftPerGuest: 0, fits: false, notes: ['Bigger than our largest deliverable tent combination — contact us for a custom multi-tent plan.'] };
  }

  function generateLayout(opts) {
    const chairKey = opts.chairKey || 'resin-garden-chair';
    const items = [];
    let W, D, originX, originY, usableW;
    let cfg = null;
    let fit = null;
    let plan = null;
    let compromise = null;
    let danceOutside = false;
      let aisle = aislePrefs(opts)[0];

    if (opts.venue && opts.venue.widthFt > 0 && opts.venue.depthFt > 0) {
      W = opts.venue.widthFt; D = opts.venue.depthFt;
      outer:
      for (let a = 0, prefs = aislePrefs(opts); a < prefs.length; a++) {
        aisle = prefs[a];
        plan = seatingPlan({ ...opts, _aisle: aisle });
        const variants = [
          [{ ...opts, _aisle: aisle }, null],
          [{ ...opts, _aisle: aisle, _df: 'min' }, 'smaller-dance'],
          [{ ...opts, _aisle: aisle, danceFloor: false }, 'no-dance'],
        ];
        for (const [vOpts, vComp] of variants) {
          if (vComp && !opts.danceFloor) continue;
          fit = fitInWidth(plan, vOpts, W, D);
          if (!fit) {
            fit = fitInWidth(plan, vOpts, D, W);
            if (fit) { const t = W; W = D; D = t; }
          }
          if (fit) { compromise = vComp; break outer; }
        }
      }
      if (!fit) return null;
      originX = INSET_FT;
      const packFromTop = fit.zones.pack === 'hex';
      originY = INSET_FT + (packFromTop ? 0 : Math.max(0, (D - fit.depthNeeded) / 2));
      usableW = W - INSET_FT * 2;
    } else {
      const pick = chooseTentConfig(opts);
      if (!pick) return null;
      cfg = pick.cfg; fit = pick.fit; plan = pick.plan;
      danceOutside = pick.danceOutside; aisle = pick.aisle;
      const lawnDance = danceOutside ? snapDanceFloor(plan.guests) : null;
      W = cfg.w + 8;
      D = cfg.d + 8 + (lawnDance ? lawnDance.depthFt + DANCE_GAP + 2 : 0);
      originX = 4 + INSET_FT;
      const packFromTop = fit.zones.pack === 'hex';
      originY = 4 + INSET_FT + (packFromTop ? 0 : Math.max(0, (cfg.d - fit.depthNeeded) / 2));
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
    const furnitureCX = fit.zones.buffet ? originX + seatW / 2 : centerX;

    if (fit.zones.head) {
      items.push(
        { key: 'banquet-table-6ft', cx: furnitureCX - 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey },
        { key: 'banquet-table-6ft', cx: furnitureCX + 3, cy: cursorY + 3, withChairs: true, chairCount: 4, chairKey }
      );
      cursorY += fit.zones.head;
    }

    const tableItem = (cx, cy) => {
      let x = cx;
      if (plan.style === 'banquet' && cfg && cfg.placements.length > 1) {
        const tentLeft = 4;
        for (const s of tentSeams(cfg)) {
          const sx = tentLeft + (s.x1 + s.x2) / 2;
          if (Math.abs(x - sx) < 1.7) x = x < sx ? sx - 1.7 : sx + 1.7;
        }
      }
      const item = { key: plan.unitKey, cx: x, cy };
      if (plan.seatsPerUnit > 0) {
        item.withChairs = true;
        item.chairCount = plan.seatsPerUnit;
        item.chairKey = chairKey;
      }
      if (plan.style === 'banquet') item.rotation = 90;
      return item;
    };
    const placeGrid = (block, units, cx0, startY, skip) => {
      const rowWidth = (n) => (n - 1) * plan.pitchX + plan.envX;
      let placed = skip || 0;
      const startUnit = placed;
      for (let r = 0; r < block.rows && placed < units; r++) {
        const inRow = Math.min(block.cols, units - placed);
        const rowLeft = cx0 - rowWidth(inRow) / 2;
        for (let c = 0; c < inRow; c++) {
          items.push(tableItem(
            rowLeft + plan.envX / 2 + c * plan.pitchX,
            startY + r * plan.pitchY + plan.envY / 2
          ));
          placed++;
        }
      }
      return placed - startUnit;
    };
    const placeRuns = (block, units, cx0, startY, skip) => {
      const gridW = (block.cols - 1) * plan.colPitch + plan.envY;
      const firstCol = cx0 - gridW / 2 + plan.envY / 2;
      let placed = skip || 0;
      const startUnit = placed;
      for (let r = 0; r < block.rows && placed < units; r++) {
        const rowY = startY + r * (plan.runLen + plan.runGap);
        for (let c = 0; c < block.cols && placed < units; c++) {
          const cx = firstCol + c * plan.colPitch;
          for (let t = 0; t < 2 && placed < units; t++) {
            items.push(tableItem(cx, rowY + 3 + t * 6));
            placed++;
          }
        }
      }
      return placed - startUnit;
    };
    const placeL = (z) => {
      const isRuns = plan.style === 'banquet';
      const sideLeft = furnitureCX - seatW / 2;
      const sideCX = sideLeft + z.sideW / 2;
      const danceCX = sideLeft + z.sideW + DANCE_GAP + z.dance.w / 2;
      items.push({ key: z.dance.key, cx: danceCX, cy: cursorY + z.dance.d / 2 });
      const rowWidth = (cols, pitch, env) => (cols - 1) * pitch + env;
      for (const s of z.taken) {
        if (s.region === 'side') {
          if (isRuns) {
            const cols = z.sideCols;
            const c = Math.floor(s.i / 2);
            const t = s.i % 2;
            const gridW = rowWidth(cols, plan.colPitch, plan.envY);
            const firstCol = sideCX - gridW / 2 + plan.envY / 2;
            items.push(tableItem(firstCol + c * plan.colPitch, cursorY + s.y + 3 + t * 6));
          } else {
            const cols = z.sideCols;
            const gridW = rowWidth(cols, plan.pitchX, plan.envX);
            const rowLeft = sideCX - gridW / 2;
            items.push(tableItem(
              rowLeft + plan.envX / 2 + s.i * plan.pitchX,
              cursorY + s.y + plan.envY / 2
            ));
          }
        } else if (isRuns) {
          const cols = z.underCols;
          const c = Math.floor(s.i / 2);
          const t = s.i % 2;
          const gridW = rowWidth(cols, plan.colPitch, plan.envY);
          const firstCol = danceCX - gridW / 2 + plan.envY / 2;
          items.push(tableItem(firstCol + c * plan.colPitch, cursorY + s.y + 3 + t * 6));
        } else {
          const cols = z.underCols;
          const gridW = rowWidth(cols, plan.pitchX, plan.envX);
          const rowLeft = danceCX - gridW / 2;
          items.push(tableItem(
            rowLeft + plan.envX / 2 + s.i * plan.pitchX,
            cursorY + s.y + plan.envY / 2
          ));
        }
      }
    };

    if (plan.style === 'ceremony') {
      const z = fit.zones.rows;
      const chair = byKey[plan.unitKey];
      const chairW = chair ? chair.widthFt : 1.5;
      cursorY += ALTAR_FT;
      let placed = 0;
      for (let r = 0; r < z.rows && placed < plan.guests; r++) {
        const cy = cursorY + r * (z.rowPitch || ROW_PITCH) + z.chairDepth / 2;
        for (const side of [-1, 1]) {
          for (let s = 0; s < z.perSide && placed < plan.guests; s++) {
            const offset = (z.aisleW || CEREMONY_AISLE) / 2 + s * z.perChair + chairW / 2;
            items.push({ key: plan.unitKey, cx: centerX + side * offset, cy });
            placed++;
          }
        }
      }
    } else {
      const isRuns = plan.style === 'banquet';
      const pack = fit.zones.pack;
      if (pack === 'hex' && fit.zones.slots) {
        const tentLeft = originX - INSET_FT;
        const tentTop = originY - INSET_FT;
        const head = fit.zones.head || 0;
        if (fit.zones.dance) {
          items.push({
            key: fit.zones.dance.key,
            cx: tentLeft + fit.zones.dance.cx,
            cy: tentTop + head + fit.zones.dance.cy,
          });
        }
        for (const s of fit.zones.slots) {
          items.push(tableItem(tentLeft + s.cx, tentTop + head + s.cy));
        }
      } else if (pack === 'L' && fit.zones.taken) {
        placeL(fit.zones);
      } else {
        let placedSoFar = 0;
        if (pack === 'band' && fit.zones.dance) {
          const z = fit.zones.dance;
          items.push({
            key: z.key,
            cx: furnitureCX + seatW / 2 - z.w / 2,
            cy: cursorY + z.d / 2,
          });
          if (z.inBand > 0) {
            const bandCX = furnitureCX - seatW / 2 + z.bandW / 2;
            const bandBlock = isRuns
              ? runDepthFor(plan, Math.min(z.inBand, plan.units), z.bandW)
              : gridDepthFor(plan, Math.min(z.inBand, plan.units), z.bandW);
            if (bandBlock) {
              placedSoFar += isRuns
                ? placeRuns(bandBlock, Math.min(z.inBand, plan.units), bandCX, cursorY)
                : placeGrid(bandBlock, Math.min(z.inBand, plan.units), bandCX, cursorY);
            }
          }
          cursorY += z.bandH + (plan.units > placedSoFar ? DANCE_GAP : 0);
        }
        if (fit.zones.block && plan.units > placedSoFar) {
          const left = plan.units - placedSoFar;
          if (isRuns) placeRuns(fit.zones.block, left, furnitureCX, cursorY, 0);
          else placeGrid(fit.zones.block, left, furnitureCX, cursorY, 0);
          cursorY += fit.zones.block.depth || 0;
        }
        if (pack === 'strip' && fit.zones.dance) {
          const z = fit.zones.dance;
          items.push({ key: z.key, cx: furnitureCX, cy: cursorY + DANCE_GAP + z.d / 2 });
        }
      }
    }

    if (fit.zones.buffet) {
      const bx = originX + usableW - 2;
      const innerTop = originY + 4;
      const innerBot = (cfg ? 4 + cfg.d - INSET_FT : D - INSET_FT) - 4;
      const cy1 = innerTop + 4;
      const cy2 = Math.min(innerTop + 12, innerBot - 4);
      items.push({ key: 'banquet-table-8ft', cx: bx, cy: cy1, rotation: 90 });
      if (cy2 - cy1 >= 8) items.push({ key: 'banquet-table-8ft', cx: bx, cy: cy2, rotation: 90 });
    }

    if (opts.bar && plan.style !== 'ceremony' && plan.style !== 'cocktail') {
      const bar = { cx: originX + usableW - 3, cy: originY + 3 };
      const clash = items.some(it => Math.hypot(it.cx - bar.cx, it.cy - bar.cy) < 5);
      if (!clash) items.push({ key: 'cocktail-table', cx: bar.cx, cy: bar.cy });
      else items.push({ key: 'cocktail-table', cx: originX + 3, cy: originY + (cfg ? cfg.d : D - 8) - 1 });
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
    if (plan.style === 'ceremony') summaryBits.push(`${plan.guests} chairs in rows · ${plan.aisle || CEREMONY_AISLE} ft aisle`);
    else summaryBits.push(`${plan.units} ${styleLabel}${fit.zones.pack === 'hex' ? ' (staggered)' : ''}`);
    const dz = fit.zones.dance;
    if (dz) summaryBits.push(`${dz.w}×${dz.d} dance floor`);
    if (plan.aisle && plan.style !== 'ceremony') summaryBits.push(`${plan.aisle} ft aisles`);
    if (isSpacious(opts)) summaryBits.push('spacious');
    else if (opts.pack === 'efficient') summaryBits.push('cost-efficient');
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
      aisle: plan.aisle,
      pack: isSpacious(opts) ? 'spacious' : 'efficient',
    };
  }

  const api = { init, recommendTent, generateLayout };
  if (typeof window !== 'undefined') window.FPRLayoutGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
