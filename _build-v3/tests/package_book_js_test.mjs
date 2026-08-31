import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = fileURLToPath(new URL('../../site-v3', import.meta.url));

function load(name) {
  const src = readFileSync(`${ROOT}/${name}`, 'utf8');
  const sandbox = { console, globalThis: {}, window: undefined, document: undefined, fetch: undefined };
  vm.createContext(sandbox);
  sandbox.globalThis = sandbox;
  vm.runInContext(src, sandbox);
  return sandbox;
}

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (cond, msg) => cond ? console.log('ok –', msg) : fail(msg);

const cartSrc = readFileSync(`${ROOT}/planner/planner-cart.js`, 'utf8');
const pkgSrc = readFileSync(`${ROOT}/package-book.js`, 'utf8');
const couponSrc = readFileSync(`${ROOT}/checkout-coupon.js`, 'utf8');
const sandbox = {
  console,
  globalThis: {},
  location: { origin: 'https://www.foreverpartyrentals.com', href: '' },
  document: undefined,
  sessionStorage: undefined,
  fetch: undefined,
};
vm.createContext(sandbox);
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInContext(cartSrc, sandbox);
vm.runInContext(pkgSrc, sandbox);
vm.runInContext(couponSrc, sandbox);

const { FPRPlannerCart, FPRPackageBook, FPRCheckoutCoupon } = sandbox;

ok(!!FPRPackageBook, 'FPRPackageBook defined');
ok(FPRPackageBook.COUPON === 'BUNDLE10', 'coupon is BUNDLE10');
ok(FPRPackageBook.BOOK_HASH === '#pkg-book', 'book CTAs target #pkg-book');
ok(FPRPackageBook.parseCart('{"abc":2}') && FPRPackageBook.parseCart('{"abc":2}').abc === 2, 'parseCart reads qty');
ok(FPRPackageBook.parseCart('') === null, 'empty cart string rejected');
ok(FPRPackageBook.parseCart('{"abc":0}') === null, 'zero qty rejected');
ok(FPRPackageBook.parseCart('[1]') === null, 'array rejected');
ok(
  FPRPackageBook.checkoutUrl('https://www.foreverpartyrentals.com', 'bundle10') ===
    'https://www.foreverpartyrentals.com/checkout?coupon=BUNDLE10',
  'checkout URL uppercases coupon'
);

const warnings = FPRPackageBook.stockWarnings(
  { tent: 1, chairs: 55 },
  [
    { id: 'tent', isAvailable: true, availableStock: 2 },
    { id: 'chairs', isAvailable: true, availableStock: 10 },
  ]
);
ok(warnings.length === 1 && /Need 55/.test(warnings[0]), 'short chairs warn');
ok(FPRPackageBook.stockWarnings({ tent: 1 }, [{ id: 'tent', isAvailable: true, availableStock: 1 }]).length === 0, 'enough stock is quiet');

const mem = { data: {}, setItem(k, v) { this.data[k] = String(v); }, getItem(k) { return this.data[k] || null; } };
const wrote = FPRPlannerCart.writeAdelieCart({ gRjUQXUVljE9KwOqHHzL: 1, rpWISwoRgbwhy31LL4RO: 55 }, '2026-09-15', mem);
ok(wrote.ok, 'writeAdelieCart succeeds for a package-shaped cart');
ok(JSON.parse(mem.data.cart).rpWISwoRgbwhy31LL4RO === 55, 'stored chair qty');
ok(mem.data.startDateTime === mem.data.endDateTime, 'start and end dates match');

const comboCart = { xzFDs0DrIYdzyG0PEP9F: 3 };
const comboWrote = FPRPlannerCart.writeAdelieCart(comboCart, '2026-09-15', mem);
ok(comboWrote.ok && JSON.parse(mem.data.cart).xzFDs0DrIYdzyG0PEP9F === 3, 'combo product writes');

ok(FPRCheckoutCoupon.resolveCoupon('?coupon=bundle10', mem) === 'bundle10', 'coupon from query');
ok(FPRCheckoutCoupon.resolveCoupon('', { getItem: () => 'bundle10' }) === 'bundle10', 'coupon from session');
ok(FPRCheckoutCoupon.resolveCoupon('', { getItem: () => null }) === '', 'no coupon');

const fakeDoc = {
  els: {
    adelie_coupon_input: { value: '', disabled: false },
    adelie_apply_coupon_btn: { disabled: false, clicked: 0, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, click() { this.clicked += 1; } },
  },
  getElementById(id) { return this.els[id] || null; },
};
ok(FPRCheckoutCoupon.normalizeCoupon('bundle10') === 'BUNDLE10', 'normalize uppercases');
ok(FPRCheckoutCoupon.fillAndApply(fakeDoc, 'bundle10') === true, 'fillAndApply clicks Apply');
ok(fakeDoc.els.adelie_coupon_input.value === 'BUNDLE10', 'input filled uppercase');
ok(fakeDoc.els.adelie_apply_coupon_btn.clicked === 1, 'Apply clicked once');

if (process.exitCode) process.exit(process.exitCode);
console.log('all package-book js tests passed');
