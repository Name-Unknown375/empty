/* Forever Party Rentals — Adelie cart bridge for the layout planner.
 *
 * Pure helpers, no DOM. The Adelie widget (adelie-cart.js) persists the
 * shop as:
 *   localStorage.cart           = JSON { [inventoryId]: qty }
 *   localStorage.startDateTime  = ISO string
 *   localStorage.endDateTime    = ISO string
 * Writing those keys then sending the user to /checkout is how "Book this
 * layout" fills the closed widget without replacing it.
 *
 * Loaded by event-layout-planner-embed.html before planner.js, and by the
 * cart-bridge unit test with no browser.
 */
(function (root) {
  'use strict';

  const SKIP_INCLUDED = {
    'tent-sidewall':
      'Sidewalls are included with marquee tents. Extra panels are quoted on the call.',
  };
  const SKIP_UNMAPPED = {
    'banquet-table-8ft':
      '8ft banquet tables aren’t in the online cart yet — we’ll add them on the call or quote.',
    'tent-sidewall':
      'Sidewall panels aren’t in the online cart yet — we’ll add them on the call.',
  };

  function isBillable(cat) {
    if (!cat || !cat.priceCAD) return false;
    const shape = cat.shape;
    if (shape === 'planning' || shape === 'customArea' || shape === 'text') return false;
    return true;
  }

  function hasMarquee(items, byKey) {
    for (let i = 0; i < items.length; i++) {
      const cat = byKey[items[i].key];
      if (cat && cat.shape === 'tent' && String(items[i].key).indexOf('marquee') === 0) return true;
    }
    return false;
  }

  function buildAdelieCartPayload(items, byKey, rentkitMap) {
    const counts = {};
    for (let i = 0; i < items.length; i++) {
      const key = items[i].key;
      counts[key] = (counts[key] || 0) + 1;
    }
    const marqueeOnPlan = hasMarquee(items, byKey);
    const cart = {};
    const lines = [];
    const skipped = [];

    const keys = Object.keys(counts);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const cat = byKey[key];
      const qty = counts[key];
      if (!isBillable(cat)) continue;

      if (key === 'tent-sidewall') {
        skipped.push({
          key: key,
          qty: qty,
          label: cat.label,
          reason: marqueeOnPlan ? 'included' : 'unmapped',
          message: marqueeOnPlan ? SKIP_INCLUDED[key] : SKIP_UNMAPPED[key],
        });
        continue;
      }
      if (SKIP_UNMAPPED[key] && key !== 'tent-sidewall') {
        skipped.push({
          key: key,
          qty: qty,
          label: cat.label,
          reason: 'unmapped',
          message: SKIP_UNMAPPED[key],
        });
        continue;
      }

      const id = rentkitMap && rentkitMap[key];
      if (!id || typeof id !== 'string') {
        skipped.push({
          key: key,
          qty: qty,
          label: cat.label,
          reason: 'unmapped',
          message: (cat.label || key) + ' isn’t in the online cart yet — we’ll add it on the call.',
        });
        continue;
      }
      cart[id] = (cart[id] || 0) + qty;
      lines.push({ key: key, id: id, qty: qty, label: cat.label });
    }
    return { cart: cart, lines: lines, skipped: skipped };
  }

  function adelieDateToIso(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return null;
    // Local noon so a Pacific afternoon doesn't roll the UTC calendar day.
    const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function writeAdelieCart(cart, dateStr, storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return { ok: false, error: 'no-storage' };
    const iso = adelieDateToIso(dateStr);
    if (!iso) return { ok: false, error: 'bad-date' };
    if (!cart || typeof cart !== 'object' || !Object.keys(cart).length) {
      return { ok: false, error: 'empty-cart' };
    }
    try {
      store.setItem('cart', JSON.stringify(cart));
      store.setItem('startDateTime', iso);
      store.setItem('endDateTime', iso);
      return { ok: true, iso: iso };
    } catch (e) {
      return { ok: false, error: 'storage-blocked' };
    }
  }

  root.FPRPlannerCart = {
    buildAdelieCartPayload: buildAdelieCartPayload,
    adelieDateToIso: adelieDateToIso,
    writeAdelieCart: writeAdelieCart,
  };
})(typeof window !== 'undefined' ? window : globalThis);
