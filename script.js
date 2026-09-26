/* =========================================================
   Ezro — edit your links here.
   Replace every "#" with your real URL.
   ========================================================= */
const CONFIG = {
  contact: 'mailto:hello@example.com',

  socials: [
    { name: 'YouTube',   icon: 'youtube',   url: '#' },
    { name: 'TikTok',    icon: 'tiktok',    url: '#' },
    { name: 'Instagram', icon: 'instagram', url: '#' },
    { name: 'Discord',   icon: 'discord',   url: '#' },
    { name: 'X',         icon: 'x',         url: '#' },
  ],

  links: [
    { title: 'Portfolio',       sub: 'My best VFX & edits',         icon: 'play',      url: '#', featured: true, badge: 'New' },
    { title: 'YouTube',         sub: 'Edits, tutorials & showcases', icon: 'youtube',   url: '#' },
    { title: 'TikTok',          sub: 'Short-form edits',            icon: 'tiktok',    url: '#' },
    { title: 'Instagram',       sub: 'Reels & behind the scenes',   icon: 'instagram', url: '#' },
    { title: 'Discord Server',  sub: 'Join the community',          icon: 'discord',   url: '#' },
    { title: 'Commissions',     sub: 'Order a custom edit',         icon: 'mail',      url: '#' },
  ],
};

/* ---------- Icons (inline SVG paths) ---------- */
const ICONS = {
  youtube: '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/>',
  tiktok: '<path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.4a2.9 2.9 0 1 1-2-2.7V9.2a6.3 6.3 0 1 0 5.4 6.2V8.6a8.2 8.2 0 0 0 4.8 1.5V6.8a4.9 4.9 0 0 1-1-.1Z"/>',
  instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1ZM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0Zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9Z"/>',
  discord: '<path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.5 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2.1a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.8-3.6-13.8ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/>',
  x: '<path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.3 5.5-6.3Zm-1.2 17.9h1.9L7 4.2H5l12 16Z"/>',
  play: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm-2 15.5v-9l7 4.5-7 4.5Z"/>',
  mail: '<path d="M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 3.2V18h18V7.2l-9 5.6-9-5.6ZM4.3 6 12 10.8 19.7 6H4.3Z"/>',
};

const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.play}</svg>`;
const ARROW = '<svg class="link-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

const isExternal = (url) => /^https?:\/\//.test(url);
const targetAttrs = (url) => (isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Render ---------- */
document.getElementById('socials').innerHTML = CONFIG.socials
  .map((s) => `<a class="social" href="${esc(s.url)}" aria-label="${esc(s.name)}" title="${esc(s.name)}"${targetAttrs(s.url)}>${svg(s.icon)}</a>`)
  .join('');

document.getElementById('links').innerHTML = CONFIG.links
  .map((l) => `
    <a class="link reveal${l.featured ? ' featured' : ''}" href="${esc(l.url)}"${targetAttrs(l.url)}>
      <span class="link-icon">${svg(l.icon)}</span>
      <span class="link-text">
        <span class="link-title">${esc(l.title)}${l.badge ? `<span class="badge">${esc(l.badge)}</span>` : ''}</span>
        <span class="link-sub">${esc(l.sub)}</span>
      </span>
      ${ARROW}
    </a>`)
  .join('');

document.getElementById('ctaContact').href = CONFIG.contact;
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- Theme toggle ---------- */
const root = document.documentElement;
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('ezro-theme', next); } catch (e) {}
});

/* ---------- Placeholder links: show a hint instead of jumping ---------- */
const toast = document.getElementById('toast');
let toastTimer;
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#"]');
  if (!a || a.classList.contains('brand')) return;
  e.preventDefault();
  toast.textContent = 'Coming soon';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
});

/* ---------- Cursor glow on link cards ---------- */
document.querySelectorAll('.link').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* ---------- Reveal on scroll + stat counters ---------- */
const countUp = (el) => {
  const end = Number(el.dataset.count);
  const start = performance.now();
  const dur = 1400;
  const step = (t) => {
    const p = Math.min((t - start) / dur, 1);
    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    entry.target.querySelectorAll('[data-count]').forEach(countUp);
    io.unobserve(entry.target);
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 60, 400)}ms`;
  io.observe(el);
});
