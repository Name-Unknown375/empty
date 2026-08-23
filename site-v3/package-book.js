/* Forever Party Rentals — package instant book.
 *
 * Reads the baked Adelie cart JSON on each .js-pkg-book button, writes the
 * same localStorage keys as the layout planner, then sends the shopper to
 * /checkout?coupon=BUNDLE10. Coupons are not stored by Adelie — checkout
 * applies the code after the widget renders.
 *
 * RentKit ops: enable embedded-checkout coupons and create active coupon
 * BUNDLE10 at 10% off (code is case-sensitive). See DEPLOY_CHECKLIST.md section 8.
 */
(function (root) {
  'use strict';

  const COUPON = 'BUNDLE10';
  const CHECKOUT_PATH = '/checkout';
  const ORG_ID = 'LvrymFxex6oslWCxcrEg';
  const AVAIL_URL = 'https://api.rentkit.com/api/embedded-shop/getAvailableInventoryForIds';
  const PHONE = '778-990-7983';
  const COUPON_KEY = 'fprCoupon';

  function minDateStr(now) {
    const d = now || new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function parseCart(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let cart;
    try {
      cart = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return null;
    const keys = Object.keys(cart);
    if (!keys.length) return null;
    for (let i = 0; i < keys.length; i++) {
      const qty = Number(cart[keys[i]]);
      if (!Number.isFinite(qty) || qty < 1) return null;
      cart[keys[i]] = qty;
    }
    return cart;
  }

  function checkoutUrl(origin, coupon) {
    const base = (origin || '') + CHECKOUT_PATH;
    const code = String(coupon || COUPON).trim().toUpperCase() || COUPON;
    return base + '?coupon=' + encodeURIComponent(code);
  }

  function persistCoupon(store, coupon) {
    if (!store) return;
    try {
      store.setItem(COUPON_KEY, String(coupon || COUPON).trim().toUpperCase() || COUPON);
    } catch (e) { /* private mode */ }
  }

  function stockWarnings(cart, rows) {
    const out = [];
    const byId = {};
    const list = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) byId[list[i].id] = list[i];
    }
    const ids = Object.keys(cart);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const qty = cart[id];
      const row = byId[id];
      if (!row) continue;
      const stock = Number(row.availableStock);
      const short =
        row.isAvailable === false ||
        (Number.isFinite(stock) && stock < qty);
      if (short) {
        const left = Number.isFinite(stock) ? stock : 0;
        out.push('Need ' + qty + ' of a package item — ' + left + ' left for that date.');
      }
    }
    return out;
  }

  async function checkStock(cart, dateStr, fetchFn) {
    const doFetch = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return [];
    try {
      const res = await doFetch(AVAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: ORG_ID,
          rentalDateStart: dateStr,
          rentalDateEnd: dateStr,
          inventoryIds: Object.keys(cart),
        }),
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return stockWarnings(cart, rows);
    } catch (e) {
      return [];
    }
  }

  function setStatus(msg) {
    const el = document.getElementById('pkgBookStatus');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function requireDate() {
    const input = document.getElementById('pkgEventDate');
    const wrap = document.getElementById('pkg-book');
    if (!input) return '';
    const value = (input.value || '').trim();
    if (value) {
      if (wrap) wrap.classList.remove('is-missing');
      return value;
    }
    if (wrap) wrap.classList.add('is-missing');
    setStatus('Pick an event date first, then instant-book a tier.');
    try {
      input.focus();
      if (typeof input.showPicker === 'function') input.showPicker();
    } catch (e) { /* showPicker is optional */ }
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return '';
  }

  async function bookFromButton(btn) {
    if (!btn || btn.disabled) return;
    const dateStr = requireDate();
    if (!dateStr) return;
    const cart = parseCart(btn.getAttribute('data-cart'));
    if (!cart) {
      setStatus('Couldn’t build this package cart — call ' + PHONE + ' and we’ll book it.');
      return;
    }
    if (!root.FPRPlannerCart || typeof root.FPRPlannerCart.writeAdelieCart !== 'function') {
      setStatus('Booking isn’t available right now — call ' + PHONE + '.');
      return;
    }
    btn.disabled = true;
    setStatus('Checking availability…');
    const warnings = await checkStock(cart, dateStr);
    if (warnings.length) {
      const ok = window.confirm(
        'Some items are short for ' + dateStr + ':\n\n' +
        warnings.join('\n') +
        '\n\nContinue to checkout, or cancel and call ' + PHONE + '.'
      );
      if (!ok) {
        btn.disabled = false;
        setStatus('');
        return;
      }
    }
    const wrote = root.FPRPlannerCart.writeAdelieCart(cart, dateStr);
    if (!wrote || !wrote.ok) {
      btn.disabled = false;
      setStatus('The online cart couldn’t be filled — call ' + PHONE + ' and we’ll take the booking.');
      return;
    }
    const coupon = (btn.getAttribute('data-coupon') || COUPON).trim() || COUPON;
    persistCoupon(root.sessionStorage, coupon);
    setStatus('Opening checkout…');
    root.location.href = checkoutUrl(root.location.origin, coupon);
  }

  function boot(doc) {
    const page = doc || document;
    const dateInput = page.getElementById('pkgEventDate');
    if (dateInput) {
      dateInput.min = minDateStr();
      dateInput.addEventListener('change', function () {
        const wrap = page.getElementById('pkg-book');
        if (wrap) wrap.classList.remove('is-missing');
        if (dateInput.value) setStatus('');
      });
    }
    const buttons = page.querySelectorAll('.js-pkg-book');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        e.preventDefault();
        bookFromButton(buttons[i]);
      });
    }
  }

  root.FPRPackageBook = {
    COUPON: COUPON,
    minDateStr: minDateStr,
    parseCart: parseCart,
    checkoutUrl: checkoutUrl,
    persistCoupon: persistCoupon,
    stockWarnings: stockWarnings,
    checkStock: checkStock,
    bookFromButton: bookFromButton,
    boot: boot,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { boot(document); });
    } else {
      boot(document);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
