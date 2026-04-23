// ── Forever Party Rentals — Shared JS ──
const FPR = {
  phone: '778-990-7983',
  email: 'welcome@foreverpartyrentals.com',
  address: '9317 188 St, Surrey BC V4N 3V1',
  hours: 'Mon–Sun 9:30AM–6PM',
  logo: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/993255ee-d7bd-41ba-a9dc-659d794941af/Forever+Party+Rentals+Logo.png?format=1500w',
  bookingUrl: 'rentals.html',
  checkoutUrl: 'checkout.html',
};

// ── City data ──
const CITIES = [
  { city: 'Surrey', slug: 'surrey' },
  { city: 'Langley', slug: 'langley' },
  { city: 'Abbotsford', slug: 'abbotsford' },
  { city: 'White Rock', slug: 'white-rock' },
  { city: 'Delta', slug: 'delta' },
  { city: 'Burnaby', slug: 'burnaby' },
  { city: 'Coquitlam', slug: 'coquitlam' },
  { city: 'Maple Ridge', slug: 'maple-ridge' },
  { city: 'Vancouver', slug: 'vancouver' },
  { city: 'North Vancouver', slug: 'north-vancouver' },
  { city: 'Richmond', slug: 'richmond' },
  { city: 'Pitt Meadows', slug: 'pitt-meadows' },
  { city: 'Port Moody', slug: 'port-moody' },
  { city: 'New Westminster', slug: 'new-westminster' },
  { city: 'Langley Township', slug: 'langley-township' },
  { city: 'Fort Langley', slug: 'fort-langley' },
  { city: 'Willoughby', slug: 'willoughby' },
  { city: 'Aldergrove', slug: 'aldergrove' },
  { city: 'Carvolth', slug: 'carvolth' },
  { city: 'Chilliwack', slug: 'chilliwack' },
  { city: 'East Clayton', slug: 'east-clayton' },
  { city: 'East Newton North', slug: 'east-newton-north' },
  { city: 'Harrison Hot Springs', slug: 'harrison-hot-springs' },
  { city: 'Ladner', slug: 'ladner' },
  { city: 'Mission', slug: 'mission' },
  { city: 'Port Kells', slug: 'port-kells' },
  { city: 'Tsawwassen', slug: 'tsawwassen' },
  { city: 'Walnut Grove', slug: 'walnut-grove' },
];

// ── Inject top bar + nav ──
function buildNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const active = (pg) => path === pg ? ' active' : '';

  // Build city dropdown columns (split into 2 cols of ~9)
  const col1 = CITIES.slice(0, 9);
  const col2 = CITIES.slice(9);

  const cityDropdownStyle = `
    .mega-dropdown { display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); background:#fff; border:1px solid var(--border); border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,.12); padding:20px; z-index:200; min-width:520px; }
    .nav-link:hover .mega-dropdown, .nav-link.is-open .mega-dropdown { display:block; }
    .mega-dropdown-inner { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
    .mega-col-title { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--gold); font-weight:700; padding:4px 12px 8px; }
    .mega-dropdown a { display:block; padding:6px 12px; font-size:13px; color:#444; border-radius:4px; white-space:nowrap; }
    .mega-dropdown a:hover { background:var(--light); color:var(--green); }
    .mega-dropdown .mega-divider { border-top:1px solid var(--border); margin:8px 0; }
    .mega-dropdown .mega-all { color:var(--green) !important; font-weight:600 !important; }
  `;

  const style = document.createElement('style');
  style.textContent = cityDropdownStyle;
  document.head.appendChild(style);

  // Skip-to-content link (first focusable element)
  const skip = document.createElement('a');
  skip.href = '#main';
  skip.className = 'skip-link';
  skip.textContent = 'Skip to main content';

  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.setAttribute('role', 'complementary');
  topbar.setAttribute('aria-label', 'Contact information');
  topbar.innerHTML = `
    <div class="container">
      <a class="tb-item" href="tel:${FPR.phone}" aria-label="Call us at ${FPR.phone}"><span class="tb-ico" aria-hidden="true">✆</span>${FPR.phone}</a>
      <a class="tb-item" href="mailto:${FPR.email}" aria-label="Email us at ${FPR.email}"><span class="tb-ico" aria-hidden="true">✉</span>${FPR.email}</a>
      <span class="tb-item tb-muted" aria-hidden="true">${FPR.hours}</span>
    </div>`;

  const tentCityLinks = CITIES.map(c => `<a href="tent-rental-${c.slug}.html">${c.city}</a>`).join('');
  const chairCityLinks = CITIES.map(c => `<a href="chair-rentals-${c.slug}.html">${c.city}</a>`).join('');
  const tableCityLinks = CITIES.map(c => `<a href="table-rentals-${c.slug}.html">${c.city}</a>`).join('');
  const danceCityLinks = CITIES.map(c => `<a href="dance-floor-rental-${c.slug}.html">${c.city}</a>`).join('');
  const partyCityLinks = CITIES.map(c => `<a href="${c.slug}-party-rentals.html">${c.city}</a>`).join('');

  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = `
    <div class="container nav-inner">
      <a class="nav-logo" href="/" aria-label="Forever Party Rentals — home"><img src="${FPR.logo}" alt="Forever Party Rentals" width="150" height="125"/></a>
      <div class="nav-links" role="menubar">

        <div class="nav-link">
          <button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="dd-tents">Tent Rentals <span aria-hidden="true">▾</span></button>
          <div class="dropdown" id="dd-tents" role="menu" aria-label="Tent Rentals">
            <a role="menuitem" href="tents.html">All Tent Rentals</a>
            <div class="dropdown-sub">
              <a role="menuitem" href="marquee-tent-rental-lowermainland-surrey-langley-vancouver.html" aria-haspopup="true">Marquee Tent Rental Lower Mainland <span class="dropdown-sub-caret" aria-hidden="true">▸</span></a>
              <div class="subdropdown" role="menu" aria-label="Marquee Tent Sizes">
                <a role="menuitem" href="product-marquee-tent-20x20.html">20×20 Marquee Tent</a>
                <a role="menuitem" href="product-marquee-tent-20x30.html">20×30 Marquee Tent</a>
                <a role="menuitem" href="product-marquee-tent-20x40.html">20×40 Marquee Tent</a>
                <a role="menuitem" href="product-marquee-tent-20x60.html">20×60 Marquee Tent</a>
                <a role="menuitem" href="product-marquee-tent-40x80.html">40×80 Marquee Tent</a>
              </div>
            </div>
            <a role="menuitem" href="product-popup-tent-10x10.html">10×10 Popup Tent</a>
            <a role="menuitem" href="product-tent-sidewall.html">Tent Sidewalls</a>
            <a role="menuitem" href="product-tent-heater.html">Tent Heaters</a>
          </div>
        </div>

        <div class="nav-link">
          <button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="dd-chairs">Chair Rentals <span aria-hidden="true">▾</span></button>
          <div class="dropdown" id="dd-chairs" role="menu" aria-label="Chair Rentals">
            <a role="menuitem" href="chairs.html">All Chair Rentals</a>
            <a role="menuitem" href="product-white-chiavari-chair.html">Chiavari Chairs</a>
            <a role="menuitem" href="product-fanback-garden-chair.html">Fanback Chairs</a>
            <a role="menuitem" href="product-resin-garden-chair.html">Resin Garden Chairs</a>
          </div>
        </div>

        <div class="nav-link">
          <button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="dd-tables">Table Rentals <span aria-hidden="true">▾</span></button>
          <div class="dropdown" id="dd-tables" role="menu" aria-label="Table Rentals">
            <a role="menuitem" href="tables.html">All Table Rentals</a>
            <a role="menuitem" href="product-banquet-table-8ft.html">8ft Banquet Tables</a>
            <a role="menuitem" href="product-banquet-table-6ft.html">6ft Banquet Tables</a>
            <a role="menuitem" href="product-round-table-5ft.html">5ft Round Tables</a>
            <a role="menuitem" href="product-cocktail-table.html">Cocktail Tables</a>
          </div>
        </div>

        <div class="nav-link"><a href="dance-floor.html"${active('dance-floor.html')}>Dance Floor</a></div>

        <div class="nav-link" style="position:relative">
          <button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="dd-areas">Service Areas <span aria-hidden="true">▾</span></button>
          <div class="mega-dropdown" id="dd-areas" role="menu" aria-label="Service Areas">
            <a role="menuitem" href="service-areas.html" class="mega-all">All Service Areas</a>
            <div class="mega-divider" aria-hidden="true"></div>
            <div class="mega-col-title">Party Rentals By City</div>
            <div class="mega-dropdown-inner">${partyCityLinks.replace(/<a /g, '<a role="menuitem" ')}</div>
          </div>
        </div>

        <div class="nav-link">
          <button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="dd-events">Events <span aria-hidden="true">▾</span></button>
          <div class="dropdown" id="dd-events" role="menu" aria-label="Events">
            <a role="menuitem" href="corporate.html">Corporate Events</a>
            <a role="menuitem" href="corporate.html#charity">Charity Events</a>
          </div>
        </div>
        <div class="nav-link"><a href="blog/index.html"${window.location.pathname.includes('/blog') ? ' active' : ''}>Blog</a></div>
        <div class="nav-link"><a href="contact.html"${active('contact.html')}>Contact</a></div>
      </div>
      <a class="btn btn-primary nav-cta" href="${FPR.bookingUrl}">Book Now</a>
      <button type="button" class="nav-hamburger" id="navToggle" aria-label="Open navigation menu" aria-expanded="false" aria-controls="navMobile">
        <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
      </button>
    </div>
    <div class="nav-mobile" id="navMobile" role="menu" aria-label="Mobile navigation" hidden>
      <a role="menuitem" href="index.html">Home</a>
      <a role="menuitem" href="tents.html">Tent Rentals</a>
      <a role="menuitem" href="marquee-tent-rental-lowermainland-surrey-langley-vancouver.html">Marquee Tent Rental Lower Mainland</a>
      <a role="menuitem" href="chairs.html">Chair Rentals</a>
      <a role="menuitem" href="tables.html">Table Rentals</a>
      <a role="menuitem" href="dance-floor.html">Dance Floor</a>
      <a role="menuitem" href="corporate.html">Corporate &amp; Charity</a>
      <a role="menuitem" href="service-areas.html">Service Areas</a>
      <a role="menuitem" href="blog/index.html">Blog</a>
      <a role="menuitem" href="contact.html">Contact</a>
      <a role="menuitem" href="${FPR.bookingUrl}" style="color:var(--green);font-weight:600;margin-top:8px">→ Book Now Online</a>
    </div>`;

  document.body.prepend(nav);
  document.body.prepend(topbar);
  document.body.prepend(skip);

  initNavA11y();
}

function initNavA11y() {
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
  const toggle = document.getElementById('navToggle');
  const mobile = document.getElementById('navMobile');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute('aria-label', expanded ? 'Open navigation menu' : 'Close navigation menu');
      mobile.hidden = expanded;
      mobile.classList.toggle('open', !expanded);
      document.body.style.overflow = expanded ? '' : 'hidden';
    });
  }
}

// ── Inject footer ──
function buildFooter() {
  const footer = document.createElement('footer');
  footer.id = 'footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a href="/" aria-label="Forever Party Rentals — home" class="footer-logo"><img src="${FPR.logo}" alt="Forever Party Rentals"/></a>
          <p class="footer-desc">Surrey's highest quality event rental company. Tents, chairs, tables & dance floors — delivered and set up across the Lower Mainland.</p>
          <div class="footer-ctas">
            <a href="${FPR.bookingUrl}" class="btn btn-gold" style="font-size:12px;padding:9px 20px">Book Online</a>
            <a href="tel:${FPR.phone}" class="btn btn-outline-white" style="font-size:12px;padding:9px 20px">${FPR.phone}</a>
          </div>
        </div>
        <div>
          <div class="footer-col-title">Rentals</div>
          <a class="footer-link" href="tents.html">Marquee Tent Rentals</a>
          <a class="footer-link" href="tents.html#popup">Tents For Pickup</a>
          <a class="footer-link" href="chairs.html">Chair Rentals</a>
          <a class="footer-link" href="tables.html">Table Rentals</a>
          <a class="footer-link" href="dance-floor.html">Dance Floor Rental</a>
        </div>
        <div>
          <div class="footer-col-title">Service Areas</div>
          <a class="footer-link" href="surrey-party-rentals.html">Surrey</a>
          <a class="footer-link" href="langley-party-rentals.html">Langley</a>
          <a class="footer-link" href="vancouver-party-rentals.html">Vancouver</a>
          <a class="footer-link" href="burnaby-party-rentals.html">Burnaby</a>
          <a class="footer-link" href="abbotsford-party-rentals.html">Abbotsford</a>
          <a class="footer-link" href="richmond-party-rentals.html">Richmond</a>
          <a class="footer-link" href="coquitlam-party-rentals.html">Coquitlam</a>
          <a class="footer-link" href="north-vancouver-party-rentals.html">North Vancouver</a>
          <a class="footer-link" href="service-areas.html" style="color:var(--gold)">All 28 Cities →</a>
        </div>
        <div>
          <div class="footer-col-title">Contact</div>
          <a class="footer-link" href="tel:${FPR.phone}">${FPR.phone}</a>
          <a class="footer-link" href="mailto:${FPR.email}">${FPR.email}</a>
          <span class="footer-link">${FPR.hours}</span>
          <span class="footer-link">${FPR.address}</span>
          <a class="footer-link" href="https://www.google.com/search?q=Forever+Party+Rentals&kgmid=/g/11tnwsrdpc" rel="noopener noreferrer" target="_blank" style="color:var(--gold);margin-top:8px;display:block"><span aria-hidden="true">⭐</span> 200+ Google Reviews →</a>
          <a class="footer-link" href="https://www.instagram.com/foreverpartyrentals" rel="noopener noreferrer" target="_blank" style="display:block"><span aria-hidden="true">📸</span> @foreverpartyrentals</a>
          <a class="footer-link" href="reviews.html">Reviews</a>
          <a class="footer-link" href="faq.html">FAQ</a>
          <a class="footer-link" href="corporate.html">Corporate Events</a>
          <a class="footer-link" href="blog/index.html">Blog</a>
          <a class="footer-link" href="contact.html">Contact Us</a>
          <a class="footer-link" href="privacy.html">Privacy Policy</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        © 2026 Forever Party Rentals · Serving Surrey, Langley, Abbotsford, White Rock, Delta, Burnaby, Vancouver & the Lower Mainland
      </div>
    </div>`;
  document.body.appendChild(footer);
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
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const get = (name) => (form.querySelector(`[name="${name}"]`) || {}).value || '';
    const firstName = get('first_name');
    const lastName  = get('last_name');
    const email     = get('email');
    const phone     = get('phone');
    const eventDate = get('event_date');
    const rental    = get('rental_type');
    const message   = get('message');

    const body = [
      `Name: ${firstName} ${lastName}`,
      `Email: ${email}`,
      phone     ? `Phone: ${phone}`       : null,
      eventDate ? `Event Date: ${eventDate}` : null,
      rental    ? `Rental Type: ${rental}` : null,
      '',
      message,
    ].filter(l => l !== null).join('\n');

    const subject = `Event Rental Enquiry — ${firstName} ${lastName}`;
    window.location.href = `mailto:${FPR.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

// ── Shared testimonials data ──
const TESTIMONIALS = [
  { name: 'Chelsea Thompson', event: 'Wedding', text: 'Devon was so easy to coordinate with. Very professional, friendly and reliable. His tent set up team was amazing too! Would definitely recommend.' },
  { name: 'Marissa K.', event: 'Corporate Event', text: "I've worked in the event industry for over a decade — this is by far the best rental company I have ever worked with. Devon provides excellent communication and extras free of charge." },
  { name: 'Rutendo Chitungo', event: 'Private Event', text: 'Rented the white Chiavari chairs — the most comfortable chairs. Cushions were very soft and well maintained. Highly recommend 100%.' },
  { name: 'Amber Schmidt', event: 'Celebration', text: 'Forever Party Rentals was amazing. Incredibly accommodating, the tables were brand new in the plastic, and they made drop off super flexible.' },
];

const CLIENTS = [
  { name: 'lululemon', src: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/d4c3d016-f57c-4ac8-8a90-b908afd0d5ef/Lululemon_Athletica_logo.png' },
  { name: 'CIBC Run for the Cure', src: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/83297d69-9e73-4f11-9935-d1b3025a47bd/RFTC-logo-H_EN_black.png' },
  { name: 'Inclusion Langley', src: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/8f08c5b9-8d6a-4ae4-8925-a820bf492d3e/inclusion-langley-logo-notagline.png' },
  { name: 'Softball BC', src: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/26753f19-0f8a-4b23-8106-22400f24f2e6/unnamed.jpg' },
  { name: 'Vancouver Auto Show', src: 'https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/d416c3dd-4529-4401-9cc6-4e7416bc1fc2/Elevate-Vancouver-Auto-Show-2024.png' },
];

// Render testimonial cards into a container
function renderTestimonials(containerId, data = TESTIMONIALS) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = data.map(t => `
    <div class="testimonial-card">
      <div class="stars" aria-label="5 out of 5 stars"><span aria-hidden="true">★★★★★</span></div>
      <blockquote>"${t.text}"</blockquote>
      <div class="tc-name">${t.name}</div>
      <div class="tc-event">${t.event}</div>
    </div>`).join('');
}

// Render client logos — duplicated for seamless infinite scroll
function renderLogos(containerId, data = CLIENTS) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const img = c => `<img src="${c.src}" alt="${c.name}" loading="lazy" decoding="async">`;
  el.innerHTML = [...data, ...data].map(img).join('');
}

// ── Init on load ──
document.addEventListener('DOMContentLoaded', () => {
  buildNav();
  buildFooter();
  initFAQ();
  initContactForm();
  injectFavicon();
  setMainId();
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
