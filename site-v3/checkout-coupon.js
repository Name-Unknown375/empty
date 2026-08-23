/* Forever Party Rentals — auto-apply an Adelie checkout coupon.
 *
 * Adelie stores coupons in widget memory only (not localStorage). Package
 * instant book lands on /checkout?coupon=BUNDLE10 and this script fills
 * #adelie_coupon_input then clicks Apply once the widget renders.
 * RentKit coupon codes are case-sensitive; we always send uppercase.
 */
(function (root) {
  'use strict';

  const COUPON_KEY = 'fprCoupon';
  const DEFAULT_CODE = 'BUNDLE10';
  const WAIT_MS = 20000;

  function normalizeCoupon(code) {
    return String(code || '').trim().toUpperCase();
  }

  function setInputValue(input, value) {
    if (!input) return;
    let setter = null;
    try {
      const proto = Object.getPrototypeOf(input);
      setter = proto && Object.getOwnPropertyDescriptor(proto, 'value');
      if ((!setter || !setter.set) && typeof HTMLInputElement !== 'undefined') {
        setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      }
    } catch (e) {
      setter = null;
    }
    if (setter && setter.set) setter.set.call(input, value);
    else input.value = value;
    try {
      if (typeof Event === 'function' && typeof input.dispatchEvent === 'function') {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (e) { /* tests / old browsers */ }
  }

  function queryParam(search, name) {
    const raw = String(search || '');
    const q = raw.charAt(0) === '?' ? raw.slice(1) : raw;
    if (!q) return '';
    const parts = q.split('&');
    for (let i = 0; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      const key = decodeURIComponent(eq < 0 ? parts[i] : parts[i].slice(0, eq)).replace(/\+/g, ' ');
      if (key !== name) continue;
      return decodeURIComponent((eq < 0 ? '' : parts[i].slice(eq + 1)).replace(/\+/g, ' '));
    }
    return '';
  }

  function resolveCoupon(search, store) {
    const q = queryParam(search, 'coupon');
    if (q && q.trim()) return q.trim();
    try {
      const s = store && store.getItem(COUPON_KEY);
      if (s && String(s).trim()) return String(s).trim();
    } catch (e) { /* ignore */ }
    return '';
  }

  function showBanner(doc, code) {
    const el = doc.getElementById('fprCouponBanner');
    if (!el) return;
    el.hidden = false;
    const codeEl = el.querySelector('[data-coupon-code]');
    if (codeEl) codeEl.textContent = code.toUpperCase();
  }

  let appliedCode = '';

  function fillAndApply(doc, code) {
    const normalized = normalizeCoupon(code);
    if (!normalized) return false;
    if (appliedCode && appliedCode === normalized) return true;
    const input = doc.getElementById('adelie_coupon_input');
    const btn = doc.getElementById('adelie_apply_coupon_btn');
    if (!input || !btn) return false;
    if (input.disabled || btn.disabled) return false;
    try { input.focus(); } catch (e) { /* ignore */ }
    setInputValue(input, normalized);
    appliedCode = normalized;
    btn.click();
    return true;
  }

  function applyWhenReady(doc, code, opts) {
    const page = doc || document;
    const options = opts || {};
    const waitMs = options.waitMs != null ? options.waitMs : WAIT_MS;
    if (!code) return { ok: false, reason: 'no-code' };
    showBanner(page, code);
    if (fillAndApply(page, code)) return { ok: true, reason: 'immediate' };

    const root = page.getElementById('adelie-checkout') || page.body;
    if (!root || typeof MutationObserver !== 'function') {
      return { ok: false, reason: 'no-observer' };
    }
    const started = Date.now();
    const observer = new MutationObserver(function () {
      if (fillAndApply(page, code)) {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(function () {
      observer.disconnect();
    }, waitMs);
    return { ok: true, reason: 'watching', started: started };
  }

  function boot(doc) {
    const page = doc || document;
    const loc = root.location || {};
    const resolved = normalizeCoupon(resolveCoupon(loc.search || '', root.sessionStorage));
    if (!resolved) return;
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(COUPON_KEY, resolved);
    } catch (e) { /* ignore */ }
    applyWhenReady(page, resolved);
  }

  root.FPRCheckoutCoupon = {
    DEFAULT_CODE: DEFAULT_CODE,
    queryParam: queryParam,
    resolveCoupon: resolveCoupon,
    normalizeCoupon: normalizeCoupon,
    fillAndApply: fillAndApply,
    applyWhenReady: applyWhenReady,
    showBanner: showBanner,
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
