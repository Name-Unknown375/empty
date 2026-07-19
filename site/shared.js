// ── Forever Party Rentals — Shared JS ──
// As of v=13 the nav and footer are pre-rendered into every HTML file at build
// time (see _build/partials/ + _build/render_partials.py). This file only
// hydrates the existing DOM (dropdown handlers, mobile toggle, active-link
// highlight) and runs page-level helpers (FAQ accordion, contact form, etc.).
// FPR brand constants and the CITIES array were removed — they live in
// _build/site_constants.json and _build/city_data.json now.


// Hydrate the static (or just-built) nav: attaches dropdown click/hover/Escape
// handlers and the mobile hamburger toggle. Safe to call against either the
// JS-built DOM (legacy path) or the pre-rendered partial.
function hydrateNav() {
  document.querySelectorAll('#nav .nav-trigger').forEach(btn => {
    const parent = btn.parentElement;
    const menu = parent.querySelector('.dropdown, .mega-dropdown');
    if (!menu) return;
    const open = () => { btn.setAttribute('aria-expanded', 'true'); parent.classList.add('is-open'); };
    const close = () => { btn.setAttribute('aria-expanded', 'false'); parent.classList.remove('is-open'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('#nav .nav-trigger[aria-expanded="true"]').forEach(b => {
        if (b !== btn) { b.setAttribute('aria-expanded','false'); b.parentElement.classList.remove('is-open'); }
      });
      expanded ? close() : open();
    });
    parent.addEventListener('mouseenter', open);
    parent.addEventListener('mouseleave', close);
    parent.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nav .nav-link')) {
      document.querySelectorAll('#nav .nav-trigger[aria-expanded="true"]').forEach(b => {
        b.setAttribute('aria-expanded','false'); b.parentElement.classList.remove('is-open');
      });
    }
  });
  // V2: hover-less devices (iPads at desktop widths) can't reach the nested
  // flyout via :hover — first tap opens it, second tap follows the link.
  if (window.matchMedia('(hover: none)').matches) {
    document.querySelectorAll('#nav .dropdown-sub > a').forEach(a => {
      a.addEventListener('click', (e) => {
        const sub = a.parentElement;
        if (!sub.classList.contains('is-open')) {
          e.preventDefault();
          document.querySelectorAll('#nav .dropdown-sub.is-open').forEach(s => {
            if (s !== sub) s.classList.remove('is-open');
          });
          sub.classList.add('is-open');
        }
      });
    });
  }
  const toggle = document.getElementById('navToggle');
  const mobile = document.getElementById('navMobile');
  if (toggle && mobile) {
    // V2: the panel is always rendered; CSS visibility owns concealment (and
    // keeps closed links out of the tab order), so the [hidden] attr retires.
    mobile.removeAttribute('hidden');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute('aria-label', expanded ? 'Open navigation menu' : 'Close navigation menu');
      if (!expanded) {
        // Nav is sticky: at scroll-top the 40px topbar still sits above it,
        // so anchor the panel to the nav's real bottom edge, not a fixed 72px.
        const nav = document.getElementById('nav');
        if (nav) mobile.style.top = Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) + 'px';
      }
      mobile.classList.toggle('open', !expanded);
      document.body.style.overflow = expanded ? '' : 'hidden';
    });
    mobile.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { toggle.click(); toggle.focus(); }
    });
  }
}

// ── V2: text states swap (transitions.dev 04) ──
// Swap an element's text with a blurred up-and-out / in-from-below transition.
// Safe under rapid calls: a pending swap is cancelled and replaced.
function swapText(el, next) {
  if (!el) return;
  if (el.textContent === next) return;
  if (!el.classList.contains('t-text-swap')) { el.textContent = next; return; }
  const dur = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--text-swap-dur')
  ) || 150;
  if (el._swapTimer) clearTimeout(el._swapTimer);
  el.classList.add('is-exit');
  el._swapTimer = setTimeout(() => {
    el._swapTimer = null;
    el.textContent = next;
    el.classList.remove('is-exit');
    el.classList.add('is-enter-start');
    void el.offsetHeight; // force reflow so the enter transition plays
    el.classList.remove('is-enter-start');
  }, dur);
}


// ── FAQ accordion ──
function initFAQ() {
  document.querySelectorAll('.faq-item').forEach((item, idx) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (!q || !a) return;
    // Upgrade question to button semantics if it's a div/span
    if (q.tagName !== 'BUTTON') {
      q.setAttribute('role', 'button');
      q.setAttribute('tabindex', '0');
    }
    // V2: wrap answer content for the grid-rows accordion (overflow clipping
    // and padding must live on the inner element, never the 0fr track) and
    // mark the item animation-ready; no-JS keeps the legacy hidden answers.
    if (!a.querySelector('.faq-a-inner')) {
      const inner = document.createElement('div');
      inner.className = 'faq-a-inner';
      while (a.firstChild) inner.appendChild(a.firstChild);
      a.appendChild(inner);
    }
    item.classList.add('faq-ready');
    const qid = q.id || `faq-q-${idx}`;
    const aid = a.id || `faq-a-${idx}`;
    q.id = qid; a.id = aid;
    q.setAttribute('aria-expanded', 'false');
    q.setAttribute('aria-controls', aid);
    a.setAttribute('role', 'region');
    a.setAttribute('aria-labelledby', qid);
    const toggle = () => {
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('open');
        const qq = i.querySelector('.faq-q');
        if (qq) qq.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

// ── Contact form handler ──
// Submits to Netlify Forms (the form has data-netlify="true"). On Netlify
// the POST is intercepted by their build-time form handler and a notification
// email is sent to welcome@foreverpartyrentals.com. On non-Netlify hosts (or
// network failure), we fall back to opening the user's mailto: client so the
// message is never lost.
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = document.getElementById('contactFormStatus');
  const button = form.querySelector('button[type="submit"]');

  // V2: status + button label swap in place instead of popping (04-text-swap)
  if (status) status.classList.add('t-text-swap');
  let buttonLabel = null;
  if (button && !button.querySelector('.t-text-swap')) {
    buttonLabel = document.createElement('span');
    buttonLabel.className = 't-text-swap';
    buttonLabel.textContent = button.textContent.trim();
    button.textContent = '';
    button.appendChild(buttonLabel);
  }

  const setStatus = (text, kind) => {
    if (!status) return;
    status.style.color = kind === 'error' ? '#b3261e'
                       : kind === 'success' ? 'var(--green)'
                       : 'var(--muted)';
    swapText(status, text || '');
  };

  // V2: error-state shake (12) on failed validation. .is-error (border +
  // message) and .is-shaking stay orthogonal so repeat submits re-shake
  // without flickering the error treatment. Inline message appears on blur
  // (not per keystroke) and clears as soon as the user starts correcting.
  const groupOf = (field) => field.closest('.form-group');
  const showFieldError = (field, shake) => {
    const g = groupOf(field);
    if (!g) return;
    let msg = g.querySelector('.t-error-msg');
    if (!msg) {
      msg = document.createElement('span');
      msg.className = 't-error-msg';
      g.appendChild(msg);
    }
    msg.textContent = field.validationMessage || 'Please check this field.';
    g.classList.add('is-error');
    if (shake) {
      g.classList.remove('is-shaking');
      void g.offsetWidth; // reflow so the shake replays from rest
      g.classList.add('is-shaking');
      setTimeout(() => g.classList.remove('is-shaking'), 300);
    }
  };
  const clearFieldError = (field) => {
    const g = groupOf(field);
    if (g) g.classList.remove('is-error');
  };
  form.addEventListener('invalid', (e) => showFieldError(e.target, true), true);
  form.querySelectorAll('input, textarea, select').forEach(f => {
    f.addEventListener('blur', () => { if (f.value && !f.checkValidity()) showFieldError(f, false); });
    f.addEventListener('input', () => clearFieldError(f));
    f.addEventListener('change', () => clearFieldError(f));
  });

  const buildMailto = (data) => {
    const fn = data.first_name || '';
    const ln = data.last_name || '';
    const body = [
      `Name: ${fn} ${ln}`.trim(),
      `Email: ${data.email || ''}`,
      data.phone              ? `Phone: ${data.phone}`                          : null,
      data.delivery_or_pickup ? `Delivery or Pickup: ${data.delivery_or_pickup}`: null,
      data.guest_count        ? `Guest Count: ${data.guest_count}`              : null,
      data.delivery_address   ? `Delivery Address: ${data.delivery_address}`    : null,
      data.event_date         ? `Event Date: ${data.event_date}`                : null,
      data.rental_type        ? `Rental Type: ${data.rental_type}`              : null,
      '',
      data.message || '',
    ].filter(l => l !== null).join('\n');
    const subject = `Event Rental Enquiry — ${fn} ${ln}`.trim();
    return `mailto:welcome@foreverpartyrentals.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Past dates make no sense for an event enquiry
  const dateInput = form.querySelector('#event-date');
  if (dateInput) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    dateInput.min = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }

  // Address is only mandatory when we're delivering
  const fulfilment = form.querySelector('#fulfilment');
  const address = form.querySelector('#delivery-address');
  const addressLabel = form.querySelector('#delivery-address-label');
  const addressHint = form.querySelector('#delivery-address-hint');
  if (fulfilment && address) {
    fulfilment.addEventListener('change', () => {
      const pickup = fulfilment.value.indexOf('Pickup') === 0;
      address.required = !pickup;
      if (addressLabel) addressLabel.textContent = pickup ? 'Delivery Address (Not Needed for Pickup)' : 'Delivery Address';
      if (addressHint) addressHint.textContent = pickup
        ? 'Pickup is from 9317 188 St, Surrey — we’ll confirm a time with you.'
        : 'An exact address gets you an exact delivery quote — a city or venue name works too.';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot — if filled, silently drop (looks like success to the bot)
    const honey = form.querySelector('[name="bot-field"]');
    if (honey && honey.value) {
      setStatus("Thanks — we'll be in touch shortly.", 'success');
      form.reset();
      return;
    }

    // Collect data once, used for both Netlify and mailto paths
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    if (button) { button.disabled = true; swapText(buttonLabel, 'Sending…'); }
    setStatus('Sending your message…');

    // Try Netlify Forms (POST to current page with form-encoded body)
    const params = new URLSearchParams();
    fd.forEach((v, k) => params.append(k, v));
    try {
      const res = await fetch(form.getAttribute('action') || '/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (res.ok) {
        // Netlify accepted the submission — record the conversion, then go to
        // the thank-you page. The short delay gives GTM a chance to dispatch;
        // the /thank-you pageview remains the backstop trigger.
        const guests = parseInt(data.guest_count, 10);
        trackEvent({
          event: 'quote_form_submit',
          fulfilment: data.delivery_or_pickup || '(not set)',
          rental_type: data.rental_type || '(not set)',
          guest_bucket: !guests ? '(not set)'
                      : guests < 50 ? 'under_50'
                      : guests < 100 ? '50_99'
                      : guests < 150 ? '100_149' : '150_plus',
        });
        setTimeout(() => {
          window.location.href = form.getAttribute('action') || '/thank-you';
        }, 300);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Fallback: open the user's email client with everything prefilled
      setStatus("Opening your email app — please review and click Send.", 'success');
      window.location.href = buildMailto(data);
    } finally {
      if (button) { button.disabled = false; swapText(buttonLabel, 'Send Message'); }
    }
  });
}

// ── Conversion tracking (dataLayer → GTM, mirrored to Meta Pixel) ──
// Pushes named events for GTM to turn into GA4 key events. GTM container
// config (triggers/tags for quote_form_submit / phone_click / book_now_click)
// is a one-time setup in GTM-KC35GGRQ — see DEPLOY_CHECKLIST.md.
// Events named in META_EVENT_NAMES also fire as Meta standard events so Meta
// ads can optimize on real conversions. fbq is the head-snippet stub and
// queues safely before fbevents.js loads; book_now_click is deliberately
// unmapped (browsing intent, too weak a signal to train ad delivery on).
const META_EVENT_NAMES = { quote_form_submit: 'Lead', phone_click: 'Contact' };
function trackEvent(payload) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  const metaName = META_EVENT_NAMES[payload.event];
  if (metaName && typeof window.fbq === 'function') {
    const props = Object.assign({}, payload);
    delete props.event;
    window.fbq('track', metaName, props);
  }
}

function initConversionTracking() {
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      trackEvent({
        event: 'phone_click',
        link_location: a.closest('.mobile-cta-bar') ? 'mobile_cta_bar'
                     : a.closest('#topbar') ? 'topbar' : 'page',
        page_path: location.pathname,
      });
    } else if (a.classList.contains('nav-cta') || a.classList.contains('mcb-book')
               || (a.classList.contains('btn') && /^\/rentals\/?$/.test(href))) {
      trackEvent({
        event: 'book_now_click',
        link_location: a.closest('.mobile-cta-bar') ? 'mobile_cta_bar'
                     : a.closest('#nav') ? 'nav' : 'page',
        page_path: location.pathname,
      });
    }
  }, { capture: true });
}

// ── Shared testimonials data ──
const TESTIMONIALS = [
  { name: 'Stacey Sarris', event: 'Google Review · Local Guide', text: 'Forever Party Rentals was absolutely spectacular! Devon was amazing to work with from start to finish. Extremely supportive, flexible, and accommodating throughout the entire process. Everything was seamless, professional, and stress-free. Highly recommend Forever Party Rentals for any event — outstanding service all around!' },
  { name: 'Chelsea Thompson', event: 'Wedding', text: 'Devon was so easy to coordinate with. Very professional, friendly and reliable. His tent set up team was amazing too! Would definitely recommend.' },
  { name: 'Rutendo Chitungo', event: 'Private Event', text: 'Rented the white Chiavari chairs — the most comfortable chairs. Cushions were very soft and well maintained. Highly recommend 100%.' },
  { name: 'Amber Schmidt', event: 'Celebration', text: 'Forever Party Rentals was amazing. Incredibly accommodating, the tables were brand new in the plastic, and they made drop off super flexible.' },
];

// Client list sourced from RentKit customer records (June 2026).
// Entries with `src` render as logo images; entries without render as
// styled text wordmarks (.logo-word). To upgrade a wordmark to a real
// logo, drop the file in /images/partners/ and add a `src` here.
const CLIENTS = [
  { name: 'lululemon', src: '/images/partners/lululemon.png' },
  { name: 'Canadian Cancer Society' },
  { name: 'CIBC Run for the Cure', src: '/images/partners/cibc-run-for-the-cure.png' },
  { name: 'KPMG' },
  { name: 'Scotiabank' },
  { name: 'Inclusion Langley', src: '/images/partners/inclusion-langley.png' },
  { name: 'PwC' },
  { name: 'BC Hydro' },
  { name: 'Softball BC', src: '/images/partners/softball-bc.jpg' },
  { name: 'Arc\'teryx' },
  { name: 'MEC' },
  { name: 'Vancouver Auto Show', src: '/images/partners/vancouver-auto-show.png' },
  { name: 'L\'Oréal' },
  { name: '7-Eleven' },
  { name: 'EllisDon' },
  { name: 'Aecon' },
  { name: 'CBRE' },
  { name: 'Colliers' },
  { name: 'QuadReal' },
  { name: 'Trans Mountain' },
  { name: 'Sherwin-Williams' },
  { name: 'Benjamin Moore' },
  { name: 'Fraser Health' },
  { name: 'First Nations Health Authority' },
  { name: 'BCIT' },
  { name: 'Justice Institute of BC' },
  { name: 'Trinity Western University' },
  { name: 'YMCA BC' },
  { name: 'YWCA Metro Vancouver' },
  { name: 'Big Brothers Big Sisters' },
  { name: 'KidSport' },
  { name: 'Vancouver Foundation' },
];

// Render testimonial cards into a container.
// No-op if the container is already pre-rendered (preferred — avoids CLS).
function renderTestimonials(containerId, data = TESTIMONIALS) {
  const el = document.getElementById(containerId);
  if (!el || el.childElementCount > 0) return;
  el.innerHTML = data.map(t => `
    <div class="testimonial-card">
      <div class="stars" role="img" aria-label="5 out of 5 stars"><span aria-hidden="true">★★★★★</span></div>
      <blockquote>"${t.text}"</blockquote>
      <div class="tc-name">${t.name}</div>
      <div class="tc-event">${t.event}</div>
    </div>`).join('');
}

// Render client logos — duplicated for seamless infinite scroll.
// No-op if the container is already pre-rendered.
function renderLogos(containerId, data = CLIENTS) {
  const el = document.getElementById(containerId);
  if (!el || el.childElementCount > 0) return;
  const item = (c, hidden) => {
    const hide = hidden ? ' aria-hidden="true"' : '';
    return c.src
      ? `<img src="${c.src}" alt="${hidden ? '' : c.name}"${hide} loading="lazy" decoding="async">`
      : `<span class="logo-word"${hide}>${c.name}</span>`;
  };
  // Second copy is decorative — it exists only for the seamless loop.
  el.innerHTML = data.map(c => item(c, false)).join('') + data.map(c => item(c, true)).join('');
}

// ── Active-link hydration ──
// Adds `.active` to the top-level nav <a> whose href matches the current page.
// Data-driven against the static partial — no per-link list to maintain.
function hydrateActiveLink() {
  const path = window.location.pathname;
  // Normalize: '/' stays '/', strip trailing slash and .html elsewhere.
  const slug = path === '/' ? '/' : path.replace(/\.html$/, '').replace(/\/$/, '');
  document.querySelectorAll('#nav .nav-link > a[href]').forEach(a => {
    const href = (a.getAttribute('href') || '').replace(/\/$/, '');
    if (href === slug) a.classList.add('active');
  });
}

// ── Share buttons (blog post .post-share) ──
// Wires up the four social/share anchors using the page's canonical URL
// (or location.href as fallback) and document.title.
function initShareButtons() {
  const container = document.querySelector('.post-share');
  if (!container) return;
  const canonical = document.querySelector('link[rel="canonical"]');
  const url = (canonical && canonical.href) || window.location.href;
  const title = document.title;
  const enc = encodeURIComponent;

  container.querySelectorAll('a').forEach(a => {
    const label = (a.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('facebook')) {
      a.href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else if (label.includes('twitter')) {
      a.href = `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else if (label.includes('email')) {
      a.href = `mailto:?subject=${enc(title)}&body=${enc(url)}`;
    } else if (label.includes('copy')) {
      a.href = url;
      // V2: "Copy Link → Copied!" swaps in place (04-text-swap)
      const swap = document.createElement('span');
      swap.className = 't-text-swap';
      swap.textContent = a.textContent.trim();
      a.textContent = '';
      a.appendChild(swap);
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(url);
          const original = swap.textContent;
          swapText(swap, 'Copied!');
          setTimeout(() => swapText(swap, original), 1500);
        } catch {
          window.prompt('Copy this link:', url);
        }
      });
    }
  });
}

// ── V2: card-link "learn more" arrow (transitions.dev 24) ──
// Swaps the literal trailing "→" on .card-link anchors for the two-arm SVG
// chevron that slides and spreads into an arrow on hover. Markup untouched
// at build time — this is a progressive enhancement over ~40 templates.
function initCardLinkArrows() {
  const chevron =
    '<span class="t-learn-chevron" aria-hidden="true"><svg viewBox="0 0 16 16">' +
    '<path class="t-learn-arm t-learn-arm-top" d="M6 4L10 8"/>' +
    '<path class="t-learn-arm t-learn-arm-bot" d="M10 8L6 12"/>' +
    '</svg></span>';
  document.querySelectorAll('.card-link').forEach(a => {
    if (a.querySelector('.t-learn-chevron')) return;
    if (!/→\s*$/.test(a.textContent)) return;
    a.textContent = a.textContent.replace(/\s*→\s*$/, '');
    a.insertAdjacentHTML('beforeend', chevron);
  });
}

// ── V2: stat number pop-in (transitions.dev 02) ──
// Splits stat text into per-character spans and pops them in with blur the
// first time they're seen (immediately for the homepage hero stats, on
// scroll for any below-fold band). The container stays static — the digits
// are the animated element. The planner's .pl-stat-num counters are
// deliberately excluded: the planner rewrites their textContent live.
// Without IO or with reduced motion, numbers just render normally.
function initStatPopIns() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  const nums = document.querySelectorAll('.stat-num, .hero-stat-num');
  if (!nums.length) return;
  nums.forEach(el => {
    const chars = el.textContent.split('');
    el.textContent = '';
    el.classList.add('t-digit-group');
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 't-digit';
      span.textContent = ch;
      if (i === chars.length - 2) span.dataset.stagger = '1';
      else if (i === chars.length - 1) span.dataset.stagger = '2';
      el.appendChild(span);
    });
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-animating'); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  nums.forEach(el => io.observe(el));
}

// ── V2: Adelie widget skeleton (transitions.dev 14, adapted) ──
// The reserved-space boxes ([data-adelie]) pulse until Adelie injects its
// UI, then the placeholder treatment stops. We only watch for children —
// Adelie's own DOM is never touched or styled.
function initAdelieSkeleton() {
  document.querySelectorAll('[data-adelie]').forEach(box => {
    if (box.childElementCount > 0) { box.classList.add('adelie-ready'); return; }
    const mo = new MutationObserver(() => {
      if (box.childElementCount > 0) { box.classList.add('adelie-ready'); mo.disconnect(); }
    });
    mo.observe(box, { childList: true });
  });
}

// ── V2: hero texts reveal (transitions.dev 18) ──
// Pages opt in with .t-stagger markup plus an inline html.js gate (homepage
// only) — everywhere else this is a no-op. Double rAF so first paint lands
// in the hidden state before the entrance runs.
function initTextsReveal() {
  const blocks = document.querySelectorAll('.t-stagger');
  if (!blocks.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    blocks.forEach(b => b.classList.add('is-shown'));
  }));
}

// ── Init on load ──
// Every page is pre-rendered with static #nav and #footer (see _build/partials/),
// so init is pure hydration: attach event handlers + apply per-page state.
document.addEventListener('DOMContentLoaded', () => {
  hydrateNav();
  hydrateActiveLink();
  initFAQ();
  initContactForm();
  initConversionTracking();
  initShareButtons();
  injectFavicon();
  setMainId();
  initCardLinkArrows();
  initStatPopIns();
  initAdelieSkeleton();
  initTextsReveal();
  // Render dynamic content if containers exist
  renderTestimonials('testimonialCards');
  renderLogos('clientLogos');
});

// ── Favicon ──
function injectFavicon() {
  if (document.querySelector('link[rel="icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = '/favicon.svg';
  document.head.appendChild(link);
}

// ── Skip-link target: give the first main content block id="main" ──
function setMainId() {
  const target = document.querySelector('.hero, .page-hero, main, [role="main"]');
  if (target && !target.id) target.id = 'main';
}

// ── V2: light scroll-reveal layer ────────────────────────────────────────
// Fades/rises cards, steps, stats and guarantees on first view. Transform+
// opacity only (no layout, no CLS). Gated on prefers-reduced-motion and on
// IntersectionObserver support — without either, everything stays visible.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  // .stat-item intentionally absent: its digits pop in via initStatPopIns()
  // and stacking a rise on the same element would double the motion.
  var SELECTOR = '.card, .step, .guarantee-item, .blog-card, .testimonial-card, .testimonial-hero, .area-region, .book-choice .bc-opt';
  function init() {
    var els = document.querySelectorAll(SELECTOR);
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el, i) {
      // Skip anything already in the initial viewport to protect LCP/no-flash
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;
      el.classList.add('reveal');
      // Small per-sibling stagger via transition-delay (30ms steps, capped)
      el.style.transitionDelay = Math.min((i % 4) * 45, 135) + 'ms';
      io.observe(el);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
