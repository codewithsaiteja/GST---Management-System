// ── Nav scroll effect ──
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

// ── Mobile hamburger ──
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  hamburger.textContent = navLinks.classList.contains('open') ? '✕' : '☰';
});
// Close on link click
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.textContent = '☰';
  });
});

// ── Smooth scroll for anchor links ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Handle #signup hash from nav CTA ──
document.querySelectorAll('a[href="/index.html#signup"]').forEach(a => {
  a.addEventListener('click', () => {
    sessionStorage.setItem('gst_open_signup', '1');
  });
});

// ── Generate mock bar chart ──
const barsEl = document.getElementById('mock-bars');
if (barsEl) {
  const heights = [30, 45, 35, 55, 42, 60, 48, 70, 52, 65];
  barsEl.innerHTML = heights.map((h, i) =>
    `<div class="mock-bar" style="height:${h}%;opacity:${0.4 + i * 0.06}"></div>`
  ).join('');
}

// ── Intersection Observer for fade-in animations ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
    }
  });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

document.querySelectorAll('.reveal').forEach(el => {
  observer.observe(el);
});

// ── FAQ Toggles ──
const faqs = document.querySelectorAll('.faq-item');
faqs.forEach(faq => {
  faq.addEventListener('click', () => {
    // Optional: close other FAQs when one opens
    // faqs.forEach(other => { if (other !== faq) other.classList.remove('open'); });
    faq.classList.toggle('open');
  });
});
