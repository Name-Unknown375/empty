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
    .nav-link:hover .mega-dropdown { display:block; }
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

  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.innerHTML = `
    <div class="container">
      <a href="tel:${FPR.phone}">📞 ${FPR.phone}</a>
      <a href="mailto:${FPR.email}">✉ ${FPR.email}</a>
      <span style="color:rgba(255,255,255,.5);font-size:12px">${FPR.hours}</span>
    </div>`;

  const tentCityLinks = CITIES.map(c => `<a href="tent-rental-${c.slug}.html">${c.city}</a>`).join('');
  const chairCityLinks = CITIES.map(c => `<a href="chair-rentals-${c.slug}.html">${c.city}</a>`).join('');
  const tableCityLinks = CITIES.map(c => `<a href="table-rentals-${c.slug}.html">${c.city}</a>`).join('');
  const danceCityLinks = CITIES.map(c => `<a href="dance-floor-rental-${c.slug}.html">${c.city}</a>`).join('');
  const partyCityLinks = CITIES.map(c => `<a href="${c.slug}-party-rentals.html">${c.city}</a>`).join('');

  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.innerHTML = `
    <div class="container nav-inner">
      <a class="nav-logo" href="index.html"><img src="${FPR.logo}" alt="Forever Party Rentals"/></a>
      <div class="nav-links">

        <div class="nav-link">
          <span>Tent Rentals ▾</span>
          <div class="dropdown">
            <a href="tents.html">All Tent Rentals</a>
            <a href="tents.html#popup">Tents For Pickup</a>
          </div>
        </div>

        <div class="nav-link">
          <span>Chair Rentals ▾</span>
          <div class="dropdown">
            <a href="chairs.html">All Chair Rentals</a>
            <a href="chairs.html#chiavari">Chiavari Chairs</a>
            <a href="chairs.html#fanback">Fanback Chairs</a>
            <a href="chairs.html#garden">Resin Garden Chairs</a>
          </div>
        </div>

        <div class="nav-link">
          <span>Table Rentals ▾</span>
          <div class="dropdown">
            <a href="tables.html">All Table Rentals</a>
            <a href="tables.html#banquet">8ft Banquet Tables</a>
            <a href="tables.html#round">Round Tables</a>
            <a href="tables.html#cocktail">Cocktail Tables</a>
          </div>
        </div>

        <div class="nav-link"><a href="dance-floor.html"${active('dance-floor.html')}>Dance Floor</a></div>

        <div class="nav-link" style="position:relative">
          <span>Service Areas ▾</span>
          <div class="mega-dropdown">
            <a href="service-areas.html" class="mega-all">All Service Areas</a>
            <div class="mega-divider"></div>
            <div class="mega-col-title">Party Rentals By City</div>
            <div class="mega-dropdown-inner">${partyCityLinks}</div>
          </div>
        </div>

        <div class="nav-link">
          <span>Events ▾</span>
          <div class="dropdown">
            <a href="corporate.html">Corporate Events</a>
            <a href="corporate.html#charity">Charity Events</a>
          </div>
        </div>
        <div class="nav-link"><a href="testimonials.html"${active('testimonials.html')}>Reviews</a></div>
        <div class="nav-link"><a href="contact.html"${active('contact.html')}>Contact</a></div>
      </div>
      <a class="btn btn-primary nav-cta" href="${FPR.bookingUrl}">Book Now</a>
      <div class="nav-hamburger" onclick="toggleMobileNav()">
        <span></span><span></span><span></span>
      </div>
    </div>
    <div class="nav-mobile" id="navMobile">
      <a href="index.html">Home</a>
      <a href="tents.html">Tent Rentals</a>
      <a href="chairs.html">Chair Rentals</a>
      <a href="tables.html">Table Rentals</a>
      <a href="dance-floor.html">Dance Floor</a>
      <a href="corporate.html">Corporate &amp; Charity</a>
      <a href="testimonials.html">Reviews</a>
      <a href="service-areas.html">Service Areas</a>
      <a href="contact.html">Contact</a>
      <a href="${FPR.bookingUrl}" style="color:var(--green);font-weight:600;margin-top:8px">→ Book Now Online</a>
    </div>`;

  document.body.prepend(nav);
  document.body.prepend(topbar);
}

function toggleMobileNav() {
  document.getElementById('navMobile').classList.toggle('open');
}

// ── Inject footer ──
function buildFooter() {
  const footer = document.createElement('footer');
  footer.id = 'footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-logo"><img src="${FPR.logo}" alt="Forever Party Rentals"/></div>
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
          <div class="footer-col-title">Company</div>
          <a class="footer-link" href="testimonials.html">Reviews</a>
          <a class="footer-link" href="service-areas.html">Service Areas</a>
          <a class="footer-link" href="corporate.html">Corporate Events</a>
          <a class="footer-link" href="faq.html">FAQ</a>
          <a class="footer-link" href="contact.html">Contact Us</a>
        </div>
        <div>
          <div class="footer-col-title">Contact</div>
          <a class="footer-link" href="tel:${FPR.phone}">${FPR.phone}</a>
          <a class="footer-link" href="mailto:${FPR.email}">${FPR.email}</a>
          <span class="footer-link">${FPR.hours}</span>
          <span class="footer-link">${FPR.address}</span>
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
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-q').addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

// ── Contact form handler ──
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    setTimeout(() => {
      form.innerHTML = `<div style="text-align:center;padding:48px 24px">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h3 style="color:var(--green);font-family:var(--serif);margin-bottom:8px">Message Sent!</h3>
        <p>We'll get back to you within 24 hours.</p>
      </div>`;
    }, 800);
  });
}

// ── Shared testimonials data ──
const TESTIMONIALS = [
  { name: 'Chelsea Thompson', event: 'Wedding', text: 'Devon was so easy to coordinate with. Very professional, friendly and reliable. His tent set up team was amazing too! Would definitely recommend.' },
  { name: 'Industry Professional', event: 'Corporate Event', text: "I've worked in the event industry for over a decade — this is by far the best rental company I have ever worked with. Devon provides excellent communication and extras free of charge." },
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
      <div class="stars">★★★★★</div>
      <blockquote>"${t.text}"</blockquote>
      <div class="tc-name">${t.name}</div>
      <div class="tc-event">${t.event}</div>
    </div>`).join('');
}

// Render client logos
function renderLogos(containerId, data = CLIENTS) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = data.map(c => `<img src="${c.src}" alt="${c.name}">`).join('');
}

// ── Init on load ──
document.addEventListener('DOMContentLoaded', () => {
  buildNav();
  buildFooter();
  initFAQ();
  initContactForm();
  // Render dynamic content if containers exist
  renderTestimonials('testimonialCards');
  renderLogos('clientLogos');
});
