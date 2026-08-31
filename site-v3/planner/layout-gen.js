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
 *   3. PACKING — rooms, not algorithms. Head table at one end, even
 *      dining rows or two equal banquet runs in the middle, dance floor
 *      as its own zone at the far end. Rounds sit on a regular grid at
 *      catering pitch (10.75 ft efficient / 12 ft spacious) with a
 *      centre aisle — not a zipper honeycomb. Banquet is two long
 *      family-style runs, never four short cafeteria columns.
 *   4. SPACING — table pitch and aisle width stay at catering numbers.
 *      Leftover tent becomes equal side margins plus one lounge/entrance
 *      gap. Never stretch table gaps to fill the canvas.
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
  const ROUND_PITCH_EFF = 10.75; // FPR catering density, centre to centre
  const ROUND_PITCH_SPA = 12;    // roomier rounds when the tent allows
  function isSpacious(opts) { return !!(opts && opts.pack === 'spacious'); }
  function aislePrefs(opts) {
    const style = opts && opts.seating;
    if (style === 'cocktail') {
      return isSpacious(opts) ? [9, 8] : [8];
    }
    if (style === 'round' || !style) {
      return isSpacious(opts) ? [ROUND_PITCH_SPA, 11, ROUND_PITCH_EFF] : [ROUND_PITCH_EFF];
    }
    return isSpacious(opts) ? AISLE_PREFS_SPACIOUS : AISLE_PREFS;
  }
  const ROW_PITCH = 2.5;       // ceremony row spacing (= ceremony modal default)
  const CEREMONY_CHAIR_GAP = 0.25; // in-row chair gap (= ceremony modal default)
  const CEREMONY_AISLE = 4;
  const CEREMONY_INSET = 1.5;  // ceremony rows sit closer to the walls than dining
  const ALTAR_FT = 5;          // ceremony head zone (arch/officiant), at the front
  const BANQUET_TABLE_FT = 6;  // 6ft banquet, joined end-to-end in a run
  const BANQUET_EDGE_INSET = 1.65;
  const DANCE_GAP = 4;         // zone gap between dining and the dance floor

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
  // Spacious: same tent as efficient whenever the wider aisles still fit.
  // Never add marquees or jump a size just to buy empty side yards.
  function comboPrice(cfg) {
    return cfg.keys.reduce((s, k) => s + ((byKey[k] && byKey[k].priceCAD) || 0), 0);
  }
  function chooseTentConfig(opts) {
    const spacious = isSpacious(opts);
    if (spacious) {
      const home = chooseTentConfig({ ...opts, pack: 'efficient' });
      if (home) {
        const inPlace = fitSpaciousInCfg(opts, home.cfg, home.danceOutside);
        if (inPlace) return inPlace;
      }
    }
    const cands = [];
    const prefs = aislePrefs(opts);
    for (let a = 0; a < prefs.length; a++) {
      const aisle = prefs[a];
      const plan = seatingPlan({ ...opts, _aisle: aisle });
      for (const danceOutside of [false, true]) {
        if (danceOutside && (!opts.danceFloor || plan.style === 'ceremony')) continue;
        const variant = { ...opts, _aisle: aisle, _danceOutside: danceOutside };
        for (const cfg of tentConfigs()) {
          if (opts.maxW > 0 && opts.maxD > 0 &&
              (cfg.w > opts.maxW + 0.05 || cfg.d > opts.maxD + 0.05)) continue;
          const fit = fitInWidth(plan, { ...variant, _seams: tentSeams(cfg) }, cfg.w, cfg.d);
          if (!fit) continue;
          cands.push({
            cfg, fit, plan, aisle: plan.aisle, danceOutside,
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
    cands.sort((a, b) =>
      (a.tents - b.tents) ||
      ((a.danceOutside ? 1 : 0) - (b.danceOutside ? 1 : 0)) ||
      (a.area - b.area) ||
      (b.aisle - a.aisle) ||
      (a.price - b.price) ||
      (a.fit.depthNeeded - b.fit.depthNeeded)
    );
    return cands[0];
  }

  function fitSpaciousInCfg(opts, cfg, allowDanceOutside) {
    const prefs = aislePrefs({ ...opts, pack: 'spacious' });
    for (let a = 0; a < prefs.length; a++) {
      const aisle = prefs[a];
      const plan = seatingPlan({ ...opts, pack: 'spacious', _aisle: aisle });
      for (const danceOutside of [false, true]) {
        if (danceOutside && (!opts.danceFloor || plan.style === 'ceremony')) continue;
        if (danceOutside && !allowDanceOutside) continue;
        const fit = fitInWidth(plan, {
          ...opts, pack: 'spacious', _aisle: aisle, _danceOutside: danceOutside, _seams: tentSeams(cfg),
        }, cfg.w, cfg.d);
        if (!fit) continue;
        return {
          cfg, fit, plan, aisle: plan.aisle, danceOutside,
          tents: cfg.keys.length,
          area: cfg.w * cfg.d,
          price: comboPrice(cfg),
        };
      }
    }
    return null;
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
      const pitch = (opts._aisle != null && opts._aisle >= 6) ? opts._aisle : 8;
      return {
        style, guests, units: n, unitKey: 'cocktail-table',
        aisle: Math.round((pitch - env) * 10) / 10,
        pitchX: pitch, pitchY: pitch, envX: env, envY: env, seatsPerUnit: 0,
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
        colPitch: envY + aisle, runGap: 0, runLen: BANQUET_TABLE_FT,
      };
    }
    const env = 5 + cc * 2;
    const headSeats = opts.headTable ? 8 : 0;
    const pitch = (opts._aisle != null && opts._aisle >= 8) ? opts._aisle : (isSpacious(opts) ? ROUND_PITCH_SPA : ROUND_PITCH_EFF);
    return {
      style: 'round', guests, units: Math.ceil(Math.max(0, guests - headSeats) / 8), unitKey: 'round-table-5ft',
      pitchX: pitch, pitchY: pitch, envX: env, envY: env,
      seatsPerUnit: 8, aisle: Math.round((pitch - env) * 10) / 10,
    };
  }


  function banquetColCounts(units, cols) {
    const base = Math.floor(units / cols);
    const extra = units % cols;
    return Array.from({ length: cols }, (_, i) => base + (i < extra ? 1 : 0));
  }

  // Regular dining grid — even rows, last leftover row centred. Pitch is
  // centre-to-centre (10.75 / 12 for rounds) and never stretched to fill
  // tent width. Extra width becomes equal side aisles; extra length stays
  // as one lounge/dance zone.
  function packDiningGrid(plan, W, H, spacious) {
    const env = plan.envX;
    const pitch = plan.pitchX;
    const tableR = plan.style === 'cocktail' ? 1.25 : 2.5;
    const wallClear = env / 2;
    const colClear = spacious ? tableR + 0.25 : wallClear;
    if (W < 2 * colClear - 0.05) return null;
    const inner = W - 2 * colClear;
    let cols = Math.max(1, Math.floor(inner / pitch + 1.001));
    while (cols > 1 && (cols - 1) * pitch > inner + 0.05) cols--;
    const rows = Math.ceil(plan.units / cols);
    let rowPitch = pitch;
    const yInner = H - 2 * wallClear;
    if (rows > 1 && (rows - 1) * rowPitch > yInner + 0.05) {
      rowPitch = yInner / (rows - 1);
      if (rowPitch < env - 0.08) return null;
    }
    const slots = [];
    let placed = 0;
    for (let r = 0; r < rows && placed < plan.units; r++) {
      const n = Math.min(cols, plan.units - placed);
      const rowSpan = n === 1 ? 0 : (n - 1) * pitch;
      const x0 = (W - rowSpan) / 2;
      const cy = wallClear + r * rowPitch;
      if (cy + tableR > H + 0.08) return null;
      for (let c = 0; c < n; c++) {
        slots.push({
          cx: Math.round((x0 + c * pitch) * 100) / 100,
          cy: Math.round(cy * 100) / 100,
        });
        placed++;
      }
    }
    if (slots.length < plan.units) return null;
    const last = slots[slots.length - 1];
    return { slots, cols, rows, depth: last.cy + env / 2, pitch };
  }

  // Two (sometimes three) equal family-style runs. Never four short columns.
  // An odd leftover table becomes a head table across the top (or a
  // sweetheart by the dance if the user already asked for a head table)
  // so both runs stay the same length.
  function packBanquetEven(plan, W, H, spacious, opts) {
    const envY = plan.envY;
    const minAisle = spacious ? Math.max(4, plan.aisle || 6) : Math.max(2.5, plan.aisle || 4);
    const minCenter = envY / 2;
    if (W < 2 * minCenter - 0.05) return null;
    const inner = W - 2 * minCenter;
    const maxFit = Math.max(1, Math.floor(inner / (envY + minAisle) + 1.001));
    let cols = Math.min(maxFit, 2);
    if (W >= 38 && plan.units >= 12 && maxFit >= 3) cols = 3;
    if (W >= 48 && plan.units >= 24 && maxFit >= 4) cols = Math.min(maxFit, 4);
    if (cols < 1) return null;
    const oddSpare = cols === 2 && plan.units % 2 === 1 && plan.units >= 5;
    const asHead = oddSpare && !opts.headTable;
    const asSweet = oddSpare && !!opts.headTable;
    const diningUnits = oddSpare ? plan.units - 1 : plan.units;
    const counts = banquetColCounts(diningUnits, cols);
    const maxN = Math.max.apply(null, counts);
    const headBand = asHead ? 2.5 + 4.5 : 0;
    const sweetBand = asSweet ? 4 + 2.5 : 0;
    const runLen = maxN * BANQUET_TABLE_FT;
    if (headBand + runLen + sweetBand > H + 0.08) return null;
    let colPitch = envY + minAisle;
    if (cols > 1 && colPitch > inner + 0.05) return null;
    if (cols > 1 && colPitch < envY + (spacious ? 4 : 2.5) - 0.05) return null;
    const xSpan = cols === 1 ? 0 : (cols - 1) * colPitch;
    const x0 = (W - xSpan) / 2;
    const slots = [];
    if (asHead) {
      slots.push({
        cx: Math.round((W / 2) * 100) / 100,
        cy: Math.round(1.25 * 100) / 100,
        rotation: 0,
      });
    }
    for (let c = 0; c < cols; c++) {
      const cx = x0 + c * colPitch;
      for (let t = 0; t < counts[c]; t++) {
        slots.push({
          cx: Math.round(cx * 100) / 100,
          cy: Math.round((headBand + BANQUET_TABLE_FT / 2 + t * BANQUET_TABLE_FT) * 100) / 100,
          rotation: 90,
        });
      }
    }
    if (asSweet) {
      slots.push({
        cx: Math.round((W / 2) * 100) / 100,
        cy: Math.round((headBand + runLen + 4 + 1.25) * 100) / 100,
        rotation: 0,
      });
    }
    return { slots, cols, depth: headBand + runLen + sweetBand, colPitch };
  }

  // Head table → dining block → dance floor as its own zone at the far end.
  function packZoned(plan, opts, tentW, tentD) {
    const spacious = isSpacious(opts);
    const buffetW = (opts.buffet && plan.style !== 'ceremony') ? 6 : 0;
    const headH = opts.headTable ? 8 : 0;
    const df = (opts.danceFloor)
      ? ((opts._df === 'min') ? danceFloors[0] : snapDanceFloor(plan.guests))
      : null;
    const danceInside = !!(df && !opts._danceOutside);
    if (df && df.widthFt > tentW + 0.05) return null;
    const danceBand = danceInside ? df.depthFt + DANCE_GAP : 0;
    const diningW = tentW - buffetW;
    const diningH = tentD - INSET_FT * 2 - headH - danceBand;
    if (diningW < 6 || diningH < 4) return null;
    const dining = plan.style === 'banquet'
      ? packBanquetEven(plan, diningW, diningH, spacious, opts)
      : packDiningGrid(plan, diningW, diningH, spacious);
    if (!dining) return null;
    const xOff = 0;
    const leftover = Math.max(0, diningH - dining.depth);
    const yPad = (!danceInside && !headH) ? leftover / 2 : 0;
    const entrance = (danceInside && !headH) ? leftover : 0;
    const yOff = INSET_FT + headH + yPad + entrance;
    const slots = dining.slots.map(s => ({
      cx: Math.round((xOff + s.cx) * 100) / 100,
      cy: Math.round((yOff + s.cy) * 100) / 100,
      rotation: s.rotation,
    }));
    let dance = null;
    if (danceInside) {
      const diningBottom = yOff + dining.depth;
      const cy = tentD - INSET_FT - df.depthFt / 2;
      const top = cy - df.depthFt / 2;
      if (top < diningBottom + DANCE_GAP - 0.08) {
        const pushed = diningBottom + DANCE_GAP + df.depthFt / 2;
        if (pushed + df.depthFt / 2 > tentD - INSET_FT + 0.08) return null;
        dance = { key: df.key, w: df.widthFt, d: df.depthFt, cx: tentW / 2, cy: Math.round(pushed * 100) / 100 };
      } else {
        dance = { key: df.key, w: df.widthFt, d: df.depthFt, cx: tentW / 2, cy: Math.round(cy * 100) / 100 };
      }
    }
    const compact = INSET_FT * 2 + headH + dining.depth + danceBand;
    return {
      type: 'zoned',
      depth: compact,
      depthNeeded: compact,
      slots,
      dance,
      cols: dining.cols,
      packW: diningW,
      head: headH || undefined,
      buffet: buffetW > 0 || undefined,
    };
  }

  function fitInWidth(plan, opts, w, dMax) {
    if (w <= 0) return null;
    if (plan.style === 'ceremony') {
      const usableW = w - INSET_FT * 2;
      if (usableW <= 0) return null;
      let depthNeeded = INSET_FT * 2;
      const zones = {};
      if (opts.headTable) { zones.head = 8; depthNeeded += 8; }
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
    const tentD = dMax != null ? dMax : 240;
    const zoned = packZoned(plan, opts, w, tentD);
    if (!zoned) return null;
    if (dMax != null && zoned.depthNeeded > dMax + 0.05) return null;
    if (opts._danceOutside) {
      const df = snapDanceFloor(plan.guests);
      if (df) zoned.danceOutside = { key: df.key, w: df.widthFt, d: df.depthFt };
    }
    zoned.pack = 'zoned';
    return { depthNeeded: zoned.depthNeeded, zones: zoned };
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

  const STAKE_FT = 5; // matches planner.js TENT_CLEARANCE_FT — stake/ballast band

  function pushTentItems(items, cfg, ox, oy) {
    for (const p of cfg.placements) {
      const tentItem = { key: p.key, cx: ox + p.cx, cy: oy + p.cy, clearance: true };
      if (p.rotation) tentItem.rotation = p.rotation;
      items.push(tentItem);
    }
  }

  function packFurnitureInVenue(opts) {
    const W = opts.venue.widthFt, D = opts.venue.depthFt;
    let aisle, plan, fit, compromise = null;
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
          if (!opts.keepYard) {
            fit = fitInWidth(plan, vOpts, D, W);
            if (fit) return { W: D, D: W, plan, fit, aisle, compromise: vComp, rotated: true };
          }
        }
        if (fit) { compromise = vComp; break outer; }
      }
    }
    if (!fit) return null;
    return { W, D, plan, fit, aisle, compromise, rotated: false };
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
    let tentOx = 0, tentOy = 0;
    const keepVenue = !!(opts.venue && opts.venue.widthFt > 0 && opts.venue.depthFt > 0);

    if (keepVenue && !opts.noTent) {
      const maxW = opts.venue.widthFt - STAKE_FT * 2;
      const maxD = opts.venue.depthFt - STAKE_FT * 2;
      if (maxW >= 10 && maxD >= 10) {
        const pick = chooseTentConfig({ ...opts, maxW, maxD });
        if (pick) {
          cfg = pick.cfg; fit = pick.fit; plan = pick.plan;
          danceOutside = pick.danceOutside; aisle = pick.aisle;
          W = opts.venue.widthFt; D = opts.venue.depthFt;
          tentOx = (W - cfg.w) / 2;
          tentOy = (D - cfg.d) / 2;
          originX = tentOx + INSET_FT;
          originY = tentOy + INSET_FT;
          usableW = cfg.w - INSET_FT * 2;
          pushTentItems(items, cfg, tentOx, tentOy);
          if (danceOutside) {
            const lawnDance = snapDanceFloor(plan.guests);
            if (lawnDance) {
              const cy = tentOy + cfg.d + DANCE_GAP + lawnDance.depthFt / 2;
              if (cy + lawnDance.depthFt / 2 <= D + 0.05) {
                items.push({ key: lawnDance.key, cx: tentOx + cfg.w / 2, cy });
                compromise = 'dance-outside';
              }
            }
          }
        }
      }
    }

    if (!fit && keepVenue) {
      const packed = packFurnitureInVenue({ ...opts, keepYard: true });
      if (!packed) return null;
      W = packed.W; D = packed.D; plan = packed.plan; fit = packed.fit;
      aisle = packed.aisle; compromise = packed.compromise;
      originX = INSET_FT;
      originY = INSET_FT;
      usableW = W - INSET_FT * 2;
      tentOx = 0; tentOy = 0;
    } else if (!fit) {
      const pick = chooseTentConfig(opts);
      if (!pick) return null;
      cfg = pick.cfg; fit = pick.fit; plan = pick.plan;
      danceOutside = pick.danceOutside; aisle = pick.aisle;
      const lawnDance = danceOutside ? snapDanceFloor(plan.guests) : null;
      tentOx = 4; tentOy = 4;
      W = cfg.w + 8;
      D = cfg.d + 8 + (lawnDance ? lawnDance.depthFt + DANCE_GAP + 2 : 0);
      originX = tentOx + INSET_FT;
      originY = tentOy + INSET_FT;
      usableW = cfg.w - INSET_FT * 2;
      pushTentItems(items, cfg, tentOx, tentOy);
      if (lawnDance) {
        items.push({ key: lawnDance.key, cx: tentOx + cfg.w / 2, cy: tentOy + cfg.d + DANCE_GAP + lawnDance.depthFt / 2 });
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

    const tableItem = (cx, cy, rotation) => {
      let x = cx;
      if (plan.style === 'banquet' && cfg && cfg.placements.length > 1) {
        const tentLeft = tentOx;
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
      if (plan.style === 'banquet') item.rotation = rotation != null ? rotation : 90;
      return item;
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
      const tentLeft = cfg ? tentOx : 0;
      const tentTop = cfg ? tentOy : 0;
      if (fit.zones.dance) {
        items.push({
          key: fit.zones.dance.key,
          cx: tentLeft + fit.zones.dance.cx,
          cy: tentTop + fit.zones.dance.cy,
        });
      }
      if (fit.zones.slots) {
        for (const s of fit.zones.slots) {
          items.push(tableItem(tentLeft + s.cx, tentTop + s.cy, s.rotation));
        }
      }
    }

    if (fit.zones.buffet) {
      const bx = originX + usableW - 2;
      const innerTop = originY + 4;
      const innerBot = (cfg ? tentOy + cfg.d - INSET_FT : D - INSET_FT) - 4;
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
    else summaryBits.push(`${plan.units} ${styleLabel}${plan.style === 'banquet' ? ' (joined runs)' : ''}`);
    const dz = fit.zones.dance;
    if (dz) summaryBits.push(`${dz.w}×${dz.d} dance floor`);
    if (plan.style === 'round' && plan.pitchX) summaryBits.push(`${plan.pitchX} ft table pitch`);
    else if (plan.aisle && plan.style !== 'ceremony') summaryBits.push(`${plan.aisle} ft aisles`);
    if (isSpacious(opts)) summaryBits.push('spacious');
    else if (opts.pack === 'efficient') summaryBits.push('cost-efficient');
    if (compromise === 'smaller-dance') summaryBits.push('dance floor sized down to fit your space');
    if (compromise === 'no-dance') summaryBits.push('no room for a dance floor in this space');
    if (compromise === 'dance-outside') summaryBits.push('dance floor on the lawn beside the tent');
    if (keepVenue && cfg) summaryBits.push(`fitted in your ${opts.venue.widthFt}×${opts.venue.depthFt} ft space`);
    if (keepVenue && !cfg) summaryBits.push('no tent fits with a 5 ft stake band — furniture only');

    return {
      id: `gen-${plan.guests}-${plan.style}${opts.danceFloor ? '-dance' : ''}`,
      label,
      summary: summaryBits.join(' · '),
      venue: { widthFt: W, depthFt: D },
      items,
      compromise,
      aisle: plan.aisle,
      pack: isSpacious(opts) ? 'spacious' : 'efficient',
      keepVenue: keepVenue || undefined,
    };
  }

  function tentAabbFromItems(items) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    let n = 0;
    for (const t of items) {
      const spec = byKey[t.key];
      if (!spec || spec.shape !== 'tent') continue;
      n++;
      const rot = !!(t.rotation);
      const w = rot ? spec.depthFt : spec.widthFt;
      const d = rot ? spec.widthFt : spec.depthFt;
      x1 = Math.min(x1, t.cx - w / 2);
      y1 = Math.min(y1, t.cy - d / 2);
      x2 = Math.max(x2, t.cx + w / 2);
      y2 = Math.max(y2, t.cy + d / 2);
    }
    if (!n) return null;
    return { x1, y1, x2, y2, w: x2 - x1, d: y2 - y1 };
  }

  // Ceremony + dinner in the same tent. Dinner owns tent pick; ceremony
  // furniture is packed into that canopy and offset onto the dinner tents.
  function generateFlipLayouts(opts) {
    const dinnerSeating = (opts.seating && opts.seating !== 'ceremony') ? opts.seating : 'round';
    const dinner = generateLayout({ ...opts, seating: dinnerSeating });
    if (!dinner) return null;
    const tents = dinner.items.filter(it => byKey[it.key] && byKey[it.key].shape === 'tent');
    const aabb = tentAabbFromItems(dinner.items);
    let ceremony;
    if (aabb) {
      const inner = generateLayout({
        ...opts,
        seating: 'ceremony',
        danceFloor: false,
        headTable: false,
        buffet: false,
        bar: false,
        noTent: true,
        venue: { widthFt: aabb.w, depthFt: aabb.d },
      });
      if (!inner) return { dinner, ceremony: null };
      const furniture = inner.items.filter(it => !(byKey[it.key] && byKey[it.key].shape === 'tent'));
      ceremony = {
        ...inner,
        label: `${opts.guests}-Guest Ceremony`,
        venue: dinner.venue,
        items: tents.map(t => Object.assign({}, t)).concat(
          furniture.map(it => Object.assign({}, it, { cx: it.cx + aabb.x1, cy: it.cy + aabb.y1 }))
        ),
      };
    } else {
      ceremony = generateLayout({
        ...opts, seating: 'ceremony', danceFloor: false, headTable: false,
        buffet: false, bar: false, noTent: true, venue: dinner.venue,
      });
    }
    return { dinner, ceremony };
  }

  const api = { init, recommendTent, generateLayout, generateFlipLayouts };
  if (typeof window !== 'undefined') window.FPRLayoutGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
