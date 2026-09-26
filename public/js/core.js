/* =========================================================
   Ezro — shared front-end core (no framework)
   ========================================================= */
(function () {
  'use strict';

  /* ---------- DOM helpers ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v; // only ever used with trusted, static markup (icons)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  /* ---------- icons ---------- */
  const P = {
    sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    cube: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>',
    crypto: '<circle cx="12" cy="12" r="9"/><path d="M9.5 7.5h4a2.2 2.2 0 010 4.5h-4zM9.5 12h4.5a2.2 2.2 0 010 4.5H9.5zM9.5 7.5v9M11 6v1.5M11 16.5V18"/>',
    wallet: '<path d="M4 7a2 2 0 012-2h11v4"/><rect x="3" y="8" width="18" height="12" rx="3"/><circle cx="16.5" cy="14" r="1.3"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    play: '<path d="M7 4.5v15l13-7.5z"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2L6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z"/>',
    cart: '<path d="M3 4h2.5l2.2 11h10.6L20.5 7H6.3"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6"/>',
    logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9s-1.2 6.3-3.7 9c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a1 1 0 001 1h14a1 1 0 001-1v-1"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
    tag: '<path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8a1.5 1.5 0 010 2.1l-6.9 6.9a1.5 1.5 0 01-2.1 0z"/><circle cx="8" cy="8" r="1.5"/>',
    invoice: '<path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    tasks: '<rect x="3.5" y="3.5" width="5" height="17" rx="1.6"/><rect x="10.5" y="3.5" width="5" height="11" rx="1.6"/><rect x="17.5" y="3.5" width="3" height="7" rx="1.2"/>',
    palette: '<path d="M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4.2-4-7.6-9-7.6z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    type: '<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    logs: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17L17 7M8 7h9v9"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
    dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z"/>',
    bolt: '<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
  };
  const BRAND = {
    youtube: '<path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6z"/>',
    tiktok: '<path d="M19.6 6.7a4.8 4.8 0 01-3.8-4.2V2h-3.4v13.4a2.9 2.9 0 11-2-2.7V9.2a6.3 6.3 0 105.4 6.2V8.6a8.2 8.2 0 004.8 1.5V6.8a4.9 4.9 0 01-1-.1z"/>',
    instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-11.8a1.4 1.4 0 100 2.9 1.4 1.4 0 000-2.9z"/>',
    discord: '<path d="M20.3 4.4A19.8 19.8 0 0015.4 3l-.6 1.3a18.4 18.4 0 00-5.5 0L8.6 3a19.7 19.7 0 00-4.9 1.5C.5 9.1-.3 13.7.1 18.2a19.9 19.9 0 006 3l1.3-2.1a13 13 0 01-2-1l.5-.4a14.2 14.2 0 0012.2 0l.5.4-2 1 1.3 2.1a19.8 19.8 0 006-3c.5-5.2-.8-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/>',
    x: '<path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.3zm-1.2 17.9h1.9L7 4.2H5z"/>',
    paypal: '<path d="M7.1 21.5H3.6a.6.6 0 01-.6-.7L5.9 2.8c.1-.5.5-.8 1-.8h6.8c3.4 0 5.7 1.7 5.2 5.1-.6 3.9-3.2 5.8-6.8 5.8H9.6c-.4 0-.8.3-.9.8zm12.3-13.4c-.7 4.5-3.8 6.6-7.8 6.6h-1.3l-1.1 6.8H6.4l-.2.9c0 .3.2.6.5.6h3.4c.4 0 .7-.3.8-.7l.7-4.3c.1-.4.4-.7.8-.7h.9c3.4 0 6-1.4 6.7-5.4.3-1.5.1-2.8-.6-3.8z"/>',
    twitch: '<path d="M4 2L2.5 6v14h5v2.5h3L13 20h4l5-5V2zm16 12l-3 3h-5l-2.5 2.5V17H5.5V4H20zM15.5 7.5h2v5h-2zm-5 0h2v5h-2z"/>',
    behance: '<path d="M7.8 11.3c1 0 1.9-.9 1.9-2 0-2-1.5-2.3-3.3-2.3H1v10h5.6c2.1 0 4-.7 4-3.1 0-1.4-.9-2.5-2.8-2.6zM3.3 8.8h2.4c.9 0 1.7.2 1.7 1.2 0 .9-.6 1.3-1.5 1.3H3.3zm2.6 6.4H3.3v-2.8h2.7c1.1 0 1.8.4 1.8 1.5 0 1.1-.8 1.3-1.9 1.3zM18 9.4c-2.6 0-4.3 1.9-4.3 4.4 0 2.6 1.6 4.4 4.3 4.4 2 0 3.3-.9 4-2.9h-2c-.3.7-1 1.1-1.9 1.1-1.3 0-2.1-.8-2.1-2.1h6.1c.2-2.7-1.3-4.9-4.1-4.9zm-2 3.5c.1-1.1.8-1.8 1.9-1.8 1.2 0 1.7.7 1.8 1.8zM15.3 7h5.3v1.3h-5.3z"/>',
    spotify: '<path d="M12 0a12 12 0 100 24 12 12 0 000-24zm5.5 17.3a.7.7 0 01-1 .3c-2.8-1.7-6.4-2.1-10.6-1.2a.7.7 0 11-.3-1.5c4.6-1 8.5-.6 11.6 1.3.4.3.5.7.3 1.1zm1.5-3.3a.9.9 0 01-1.3.3c-3.2-2-8.1-2.6-11.9-1.4a.9.9 0 01-.6-1.8c4.3-1.3 9.7-.7 13.4 1.6.5.3.6.9.4 1.3zm.1-3.4C15.3 8.3 8.9 8.1 5.2 9.2a1.1 1.1 0 11-.7-2.1c4.3-1.3 11.3-1 15.7 1.6a1.1 1.1 0 01-1.1 1.9z"/>',
    github: '<path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17.3 4.9 18.3 5.2 18.3 5.2c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .3z"/>',
    whatsapp: '<path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8 8 0 01-2.4-1.5 9 9 0 01-1.6-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 00-.8.4 3.4 3.4 0 00-1 2.5 5.9 5.9 0 001.2 3.1 13.5 13.5 0 005.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 002-1.4 2.5 2.5 0 00.2-1.4c-.1-.1-.3-.2-.6-.4zM12 21.8a9.9 9.9 0 01-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1112 21.8zM20.5 3.5A11.8 11.8 0 001.9 17.7L.2 24l6.4-1.7A11.8 11.8 0 0024 12a11.7 11.7 0 00-3.5-8.5z"/>',
    telegram: '<path d="M23.9 3.6l-3.6 17c-.3 1.2-1 1.5-2 .9l-5.5-4-2.6 2.5c-.3.3-.6.6-1.2.6l.4-5.6L19.6 5.8c.4-.4-.1-.6-.7-.2L6.3 13.5.9 11.8c-1.2-.4-1.2-1.2.2-1.7L22.4 2c1-.4 1.8.2 1.5 1.6z"/>',
    linkedin: '<path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6a3.7 3.7 0 013.4-1.9c3.6 0 4.3 2.4 4.3 5.5zM5.3 7.4a2.1 2.1 0 110-4.1 2.1 2.1 0 010 4.1zM7.1 20.5H3.6V9h3.5zM22.2 0H1.8A1.8 1.8 0 000 1.7v20.6A1.8 1.8 0 001.8 24h20.4a1.8 1.8 0 001.8-1.7V1.7A1.8 1.8 0 0022.2 0z"/>',
    facebook: '<path d="M24 12a12 12 0 10-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0024 12z"/>',
    snapchat: '<path d="M12.2 1c1.2 0 5.2.3 7 4.4.6 1.4.5 3.7.4 5.6l.1.1a1.5 1.5 0 001.2-.1c.7-.3 1.5.2 1.5.8 0 .5-.4.9-1.3 1.3l-.9.3c-.6.2-1.3.4-1.1 1.2.6 1.3 2 3.4 4 3.8.3.1.5.4.4.7-.1.6-1.4 1.1-3 1.3-.2.3-.2 1.2-.6 1.4-.4.2-1.3-.2-2.4 0-1.2.2-1.9 1.9-5.3 1.9s-4-1.7-5.3-1.9c-1.1-.2-2 .2-2.4 0-.4-.2-.4-1.1-.6-1.4-1.6-.2-2.9-.7-3-1.3 0-.3.1-.6.4-.7 2-.4 3.4-2.5 4-3.8.2-.8-.5-1-1.1-1.2l-.9-.3C1.4 12.8 1 12.4 1 11.9c0-.6.8-1.1 1.5-.8a1.5 1.5 0 001.2.1l.1-.1c-.1-1.9-.2-4.2.4-5.6C6 1.3 10 1 11.2 1z"/>',
    pinterest: '<path d="M12 0a12 12 0 00-4.4 23.2c-.1-.9-.2-2.4 0-3.4l1.4-6s-.4-.7-.4-1.8c0-1.7 1-2.9 2.2-2.9 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.1 0 3.8-2.3 3.8-5.5 0-2.9-2.1-4.9-5-4.9a5.2 5.2 0 00-5.5 5.2c0 1 .4 2.1.9 2.7.1.1.1.2.1.4l-.3 1.4c-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.6 0-3.8 2.7-7.2 7.9-7.2 4.1 0 7.4 3 7.4 6.9 0 4.1-2.6 7.5-6.2 7.5-1.2 0-2.4-.6-2.8-1.4l-.7 2.9c-.3 1-1 2.3-1.5 3.1A12 12 0 1012 0z"/>',
    vimeo: '<path d="M23.9 6.4c-.1 2.3-1.7 5.5-4.9 9.6-3.3 4.3-6 6.4-8.3 6.4-1.4 0-2.6-1.3-3.6-3.9L5.2 11c-.7-2.6-1.5-3.9-2.3-3.9-.2 0-.8.4-1.9 1.1L0 6.9l3.5-3.1C5.1 2.4 6.3 1.7 7.1 1.6c1.9-.2 3 1.1 3.5 3.8.5 3 .8 4.8.9 5.5.5 2.5 1.1 3.7 1.8 3.7.5 0 1.3-.8 2.3-2.4a9.6 9.6 0 001.6-3.7c.1-1.4-.4-2.1-1.6-2.1-.6 0-1.2.1-1.8.4 1.2-4 3.5-5.9 6.9-5.8 2.5.1 3.7 1.7 3.5 4.8z"/>',
    artstation: '<path d="M0 17.7l2 3.5a2.4 2.4 0 002.2 1.3h13.5l-2.8-4.8zM24 17.7a2.4 2.4 0 00-.4-1.3L15.7 2.7a2.4 2.4 0 00-2.1-1.3H9.4l12.3 21.3 1.9-3.3c.4-.6.4-.9.4-1.7zM12.9 13.8L7.4 4.3l-5.5 9.5z"/>',
  };
  function icon(name, cls = '') {
    if (!name) name = 'link';
    if (/^(\/|https?:)/.test(name)) return `<img class="i-img ${cls}" src="${esc(name)}" alt="">`;
    if (BRAND[name]) return `<svg class="i fill ${cls}" viewBox="0 0 24 24" aria-hidden="true">${BRAND[name]}</svg>`;
    return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.link}</svg>`;
  }
  const iconEl = (name, cls) => { const t = document.createElement('template'); t.innerHTML = icon(name, cls); return t.content.firstChild; };

  /* ---------- money / dates ---------- */
  let CURRENCY = 'EUR';
  const money = (c, cur = CURRENCY) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'EUR' }).format((c || 0) / 100);
  const fmtDate = (t, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => (t ? new Date(t).toLocaleDateString(undefined, opts) : '');
  const fmtDateTime = (t) => (t ? new Date(t).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
    const hh = Math.round(m / 60); if (hh < 24) return `${hh}h ago`;
    const d = Math.round(hh / 24); if (d < 7) return `${d}d ago`;
    return fmtDate(t);
  }
  const toLocalInput = (t) => { if (!t) return ''; const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  /* ---------- API ---------- */
  async function api(url, { method, body, raw } = {}) {
    const opts = { method: method || (body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(url, opts);
    if (raw) { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`); return r; }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) { const e = new Error(data.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
    return data;
  }

  // Upload with progress (XHR gives upload progress events, fetch does not).
  function upload(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData(); fd.append('file', file);
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch { /* ignore */ } (x.status < 300 && !d.error) ? resolve(d) : reject(new Error(d.error || `Upload failed (${x.status})`)); };
      x.onerror = () => reject(new Error('Upload failed'));
      x.send(fd);
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, type = 'info', ms = 2600) {
    let wrap = $('.toasts');
    if (!wrap) { wrap = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
    const ic = type === 'error' ? 'close' : type === 'success' ? 'check' : 'sparkles';
    const t = h('div', { class: `toast ${type}` }, iconEl(ic), h('span', {}, msg));
    wrap.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }
  const fail = (e) => toast(e?.message || String(e), 'error', 4000);

  /* ---------- sheets & dialogs ---------- */
  const openSheets = [];
  function sheet({ title, body, foot, size = '', cls = '', drawer = false, onClose, head } = {}) {
    const prevFocus = document.activeElement;
    const closeBtn = h('button', { class: 'btn icon sm ghost', 'aria-label': 'Close', html: icon('close') });
    const panel = h('div', { class: `sheet ${size} ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title || head ? h('div', { class: 'sheet-head' }, head || h('h3', {}, title), closeBtn) : null,
      h('div', { class: 'sheet-body' }, body),
      foot ? h('div', { class: 'sheet-foot' }, foot) : null);
    const ov = h('div', { class: `overlay ${drawer ? 'drawer-right' : ''}` }, panel);
    let closed = false;
    const api = {
      el: panel, overlay: ov, body: $('.sheet-body', panel),
      close(result) {
        if (closed) return; closed = true;
        ov.classList.add('closing');
        openSheets.splice(openSheets.indexOf(api), 1);
        setTimeout(() => { ov.remove(); if (!openSheets.length) document.body.style.overflow = ''; prevFocus?.focus?.(); }, 260);
        onClose?.(result);
      },
      setFoot(nodes) { let f = $('.sheet-foot', panel); if (!f) { f = h('div', { class: 'sheet-foot' }); panel.append(f); } f.replaceChildren(...[nodes].flat()); },
      setBody(nodes) { api.body.replaceChildren(...[nodes].flat()); },
    };
    closeBtn.onclick = () => api.close();
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) api.close(); });
    // swipe down to close on phones
    let sy = null;
    panel.addEventListener('touchstart', (e) => { if (api.body.scrollTop <= 0 && e.touches[0].clientY - panel.getBoundingClientRect().top < 70) sy = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchmove', (e) => { if (sy != null) { const d = Math.max(0, e.touches[0].clientY - sy); panel.style.transform = `translateY(${d}px)`; } }, { passive: true });
    panel.addEventListener('touchend', (e) => { if (sy == null) return; const d = e.changedTouches[0].clientY - sy; sy = null; panel.style.transform = ''; if (d > 110) api.close(); });
    document.body.append(ov);
    document.body.style.overflow = 'hidden';
    openSheets.push(api);
    setTimeout(() => (panel.querySelector('[autofocus]') || closeBtn).focus({ preventScroll: true }), 50);
    return api;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheets.length && !$('.menu')) openSheets[openSheets.length - 1].close(); });

  function confirmDialog(title, text = '', { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const s = sheet({
        cls: 'alert', body: [h('h3', {}, title), text ? h('p', {}, text) : null],
        foot: [h('button', { class: 'btn', onclick: () => { answered = true; s.close(false); } }, cancel),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, autofocus: true, onclick: () => { answered = true; s.close(true); } }, ok)],
        onClose: (r) => resolve(answered ? !!r : false),
      });
    });
  }

  /* ---------- Apple-style select (enhances a native <select>) ---------- */
  function popMenu(anchor, build, { align = 'left', minWidth } = {}) {
    closeMenus();
    const menu = h('div', { class: 'menu', role: 'listbox' });
    build(menu);
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    const mw = Math.max(minWidth || r.width, 180);
    menu.style.minWidth = `${mw}px`;
    const mh = menu.offsetHeight;
    const below = window.innerHeight - r.bottom;
    const up = below < mh + 16 && r.top > below;
    menu.classList.toggle('up', up);
    menu.style.top = `${up ? r.top - mh - 6 : r.bottom + 6}px`;
    const left = align === 'right' ? r.right - menu.offsetWidth : r.left;
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8))}px`;
    const onDoc = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenus(); };
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    menu._cleanup = () => document.removeEventListener('mousedown', onDoc);
    menu._anchor = anchor;
    return menu;
  }
  function closeMenus() {
    $$('.menu').forEach((m) => {
      m._cleanup?.(); m._anchor?.setAttribute('aria-expanded', 'false');
      m.classList.add('closing'); setTimeout(() => m.remove(), 160);
    });
  }
  window.addEventListener('resize', closeMenus);
  document.addEventListener('scroll', (e) => { if (!e.target.closest?.('.menu')) closeMenus(); }, true);

  function enhanceSelect(sel) {
    if (sel._enhanced) return sel._enhanced;
    const wrap = h('div', { class: `aselect ${sel.classList.contains('sm') ? 'sm' : ''}` });
    const label = h('span');
    const btn = h('button', { type: 'button', class: 'aselect-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, label, iconEl('chevron', 'chev'));
    sel.style.display = 'none';
    sel.after(wrap); wrap.append(btn, sel);
    const sync = () => { const o = sel.options[sel.selectedIndex]; label.textContent = o ? o.textContent : ''; if (o?.dataset.font) label.style.fontFamily = o.dataset.font; };
    sync();
    sel.addEventListener('change', sync);
    const open = () => {
      btn.setAttribute('aria-expanded', 'true');
      const menu = popMenu(btn, (m) => {
        [...sel.options].forEach((o, i) => {
          const item = h('button', { type: 'button', class: 'menu-item', role: 'option', 'aria-selected': String(i === sel.selectedIndex), disabled: o.disabled },
            o.dataset.icon ? iconEl(o.dataset.icon) : null, h('span', {}, o.textContent), iconEl('check', 'tick'));
          if (o.dataset.font) item.style.fontFamily = o.dataset.font;
          item.onclick = () => { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); closeMenus(); btn.focus(); };
          m.append(item);
        });
      });
      const items = $$('.menu-item', menu);
      let idx = Math.max(0, sel.selectedIndex);
      items[idx]?.classList.add('active'); items[idx]?.scrollIntoView({ block: 'nearest' });
      menu.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); items[idx]?.classList.remove('active');
          idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[idx].classList.add('active'); items[idx].focus();
        } else if (e.key === 'Escape') { closeMenus(); btn.focus(); }
      });
      items[idx]?.focus({ preventScroll: true });
    };
    btn.addEventListener('click', () => (btn.getAttribute('aria-expanded') === 'true' ? closeMenus() : open()));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    sel._enhanced = { wrap, sync };
    return sel._enhanced;
  }
  // Build a select element: options = [{value,label,icon,font}] or [[value,label]]
  function select(options, value, { onChange, cls = '', name } = {}) {
    const sel = h('select', { class: `input ${cls}`, name });
    for (const o of options) {
      const [v, l] = Array.isArray(o) ? o : [o.value, o.label];
      const opt = h('option', { value: v }, l);
      if (o.icon) opt.dataset.icon = o.icon;
      if (o.font) opt.dataset.font = o.font;
      if (String(v) === String(value ?? '')) opt.selected = true;
      sel.append(opt);
    }
    if (onChange) sel.addEventListener('change', () => onChange(sel.value));
    const holder = h('div');
    holder.append(sel);
    enhanceSelect(sel);
    const wrap = sel._enhanced.wrap;
    wrap.select = sel;
    Object.defineProperty(wrap, 'value', { get: () => sel.value, set: (v) => { sel.value = v; sel._enhanced.sync(); } });
    return wrap;
  }

  /* ---------- segmented control ---------- */
  function segmented(options, value, onChange, { brand = false, block = false, cls = '' } = {}) {
    const el = h('div', { class: `seg ${brand ? 'brand' : ''} ${block ? 'block' : ''} ${cls}`, role: 'tablist' });
    const pill = h('div', { class: 'pill' });
    el.append(pill);
    const buttons = options.map((o) => {
      const [v, l, ic] = Array.isArray(o) ? o : [o.value, o.label, o.icon];
      const b = h('button', { type: 'button', role: 'tab', dataset: { v: String(v) } }, ic ? iconEl(ic) : null, l);
      b.onclick = () => { if (el.value === String(v)) return; set(String(v)); onChange?.(v); };
      el.append(b);
      return b;
    });
    function place(animate = true) {
      const b = buttons.find((x) => x.dataset.v === el.value);
      if (!b) { pill.style.width = '0'; return; }
      if (!animate) pill.style.transition = 'none';
      pill.style.width = `${b.offsetWidth}px`;
      pill.style.transform = `translateX(${b.offsetLeft}px)`;
      if (!animate) { pill.offsetWidth; pill.style.transition = ''; }
    }
    function set(v) {
      el.value = String(v);
      buttons.forEach((b) => { b.classList.toggle('on', b.dataset.v === el.value); b.setAttribute('aria-selected', String(b.dataset.v === el.value)); });
      place();
    }
    el.value = String(value);
    el.set = set;
    buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === el.value));
    new ResizeObserver(() => place(false)).observe(el);
    requestAnimationFrame(() => place(false));
    return el;
  }

  /* ---------- small form builders ---------- */
  function field(label, control, hint) {
    return h('div', { class: 'field' }, label ? h('label', {}, label) : null, control, hint ? h('div', { class: 'hint' }, hint) : null);
  }
  function input(value = '', attrs = {}) { return h('input', { class: 'input', value: value ?? '', ...attrs }); }
  function textarea(value = '', attrs = {}) { const t = h('textarea', { class: 'textarea', ...attrs }); t.value = value ?? ''; return t; }
  function toggle(checked, label, onChange) {
    const cb = h('input', { type: 'checkbox', role: 'switch' });
    cb.checked = !!checked;
    if (onChange) cb.addEventListener('change', () => onChange(cb.checked));
    const el = h('label', { class: 'switch' }, cb, h('span', { class: 'track' }), label ? h('span', {}, label) : null);
    Object.defineProperty(el, 'checked', { get: () => cb.checked, set: (v) => { cb.checked = !!v; } });
    return el;
  }
  function busy(btn, on) {
    if (on) { btn._html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    else { btn.disabled = false; if (btn._html != null) btn.innerHTML = btn._html; }
  }
  async function withBusy(btn, fn) { busy(btn, true); try { return await fn(); } finally { busy(btn, false); } }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied', 'success'); } catch { toast('Copy failed', 'error'); } }

  /* ---------- upload widget ---------- */
  function uploadBox({ value = '', accept = 'image/*', label = 'Click or drop a file', url = '/api/admin/upload', onDone, secure = false } = {}) {
    const inputEl = h('input', { type: 'file', accept, class: 'hidden' });
    const bar = h('div', { class: 'progress hidden' }, h('div'));
    const preview = h('div');
    const box = h('div', { class: 'upload-box', tabindex: '0', role: 'button' }, preview, bar, inputEl);
    box.value = value;
    const show = (v, name) => {
      preview.replaceChildren();
      if (v && !secure) {
        preview.append(/\.(mp4|webm|mov|m4v)$/i.test(v) ? h('video', { src: v, muted: true, playsinline: true, autoplay: true, loop: true }) : h('img', { src: v, alt: '' }));
      } else if (v && secure) preview.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text)' } }, iconEl('lock'), name || 'Private video uploaded'));
      else preview.append(iconEl('upload'), h('div', {}, label));
    };
    show(value);
    const handle = async (file) => {
      if (!file) return;
      bar.classList.remove('hidden');
      try {
        const res = await upload(url, file, (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; });
        box.value = secure ? res.ref : res.url;
        show(box.value, res.name);
        onDone?.(res);
      } catch (e) { fail(e); } finally { bar.classList.add('hidden'); bar.firstChild.style.width = '0'; }
    };
    box.onclick = () => inputEl.click();
    box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputEl.click(); } };
    inputEl.onchange = () => handle(inputEl.files[0]);
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drag'); handle(e.dataTransfer.files[0]); });
    box.set = (v) => { box.value = v; show(v); };
    return box;
  }

  /* ---------- pointer-based drag & drop (mouse + touch) ---------- */
  function dragSort({ containers, item, handle, onDrop, longPress = 220 }) {
    const getContainers = () => (typeof containers === 'function' ? containers() : containers);
    let state = null;
    function start(el, e) {
      const r = el.getBoundingClientRect();
      const ph = h('div', { class: 'drag-placeholder', style: { height: `${r.height}px` } });
      if (getComputedStyle(el.parentElement).display.includes('grid')) ph.style.height = `${r.height}px`;
      el.after(ph);
      const from = el.parentElement;
      Object.assign(el.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
      el.classList.add('drag-ghost', 'lifted');
      document.body.append(el);
      document.body.classList.add('dragging');
      state = { el, ph, from, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY };
      navigator.vibrate?.(8);
    }
    function move(x, y) {
      const s = state; s.x = x; s.y = y;
      s.el.style.left = `${x - s.dx}px`; s.el.style.top = `${y - s.dy}px`;
      const under = document.elementFromPoint(x, y);
      const cont = getContainers().find((c) => c.contains(under) || c === under);
      if (cont) {
        const kids = [...cont.querySelectorAll(`:scope > ${item}`)].filter((k) => k !== s.el);
        const horizontal = getComputedStyle(cont).display.includes('grid') && getComputedStyle(cont).gridTemplateColumns.split(' ').length > 1;
        let before = null;
        for (const k of kids) {
          const kr = k.getBoundingClientRect();
          const past = horizontal ? (y < kr.top + kr.height / 2 && x < kr.right) || y < kr.top : y < kr.top + kr.height / 2;
          if (past) { before = k; break; }
        }
        if (before) { if (s.ph.nextSibling !== before) cont.insertBefore(s.ph, before); }
        else {
          const tail = cont.querySelector(':scope > [data-drop-end]');
          if (tail) { if (s.ph.nextSibling !== tail) cont.insertBefore(s.ph, tail); }
          else if (cont.lastElementChild !== s.ph) cont.append(s.ph);
        }
      }
      // auto-scroll page / nearest scroll container
      const edge = 60;
      if (y < edge) window.scrollBy(0, -12); else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
    }
    function end() {
      const s = state; state = null;
      const r = s.ph.getBoundingClientRect();
      s.el.classList.remove('lifted');
      s.el.style.transition = 'left .25s var(--ease), top .25s var(--ease), scale .25s, rotate .25s';
      s.el.style.left = `${r.left}px`; s.el.style.top = `${r.top}px`; s.el.style.scale = '1'; s.el.style.rotate = '0deg';
      setTimeout(() => {
        s.ph.replaceWith(s.el);
        s.el.classList.remove('drag-ghost');
        s.el.removeAttribute('style');
        document.body.classList.remove('dragging');
        onDrop?.(s.el, s.el.parentElement, s.from);
      }, 230);
    }
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || state) return;
      const el = e.target.closest(item);
      if (!el || !getContainers().some((c) => c.contains(el))) return;
      if (handle ? !e.target.closest(handle) : e.target.closest('button, a, input, textarea, select, .aselect')) return;
      const sx = e.clientX; const sy = e.clientY;
      const isTouch = e.pointerType === 'touch' && !handle;
      let timer = null; let started = false;
      const begin = (ev) => { started = true; start(el, ev); };
      if (isTouch) timer = setTimeout(() => begin({ clientX: sx, clientY: sy }), longPress);
      const onMove = (ev) => {
        if (!started) {
          const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
          if (isTouch) { if (d > 8) cleanup(); return; }
          if (d > 5) begin(ev); else return;
        }
        ev.preventDefault();
        move(ev.clientX, ev.clientY);
      };
      const onUp = () => { const was = started; cleanup(); if (was) { end(); swallowClick(); } };
      function cleanup() { clearTimeout(timer); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp); }
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
    document.addEventListener('touchmove', (e) => { if (state) e.preventDefault(); }, { passive: false });
    function swallowClick() { const f = (e) => { e.stopPropagation(); e.preventDefault(); }; document.addEventListener('click', f, true); setTimeout(() => document.removeEventListener('click', f, true), 50); }
  }

  /* ---------- theme ---------- */
  function setTheme(t, persist = true) {
    document.documentElement.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem('ezro-theme', t); } catch { /* private mode */ } }
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = t === 'dark' ? '#0d0b12' : '#f5f5f7';
  }
  // Smooth theme switch: a circular reveal that grows from the button (View Transitions),
  // falling back to a soft colour cross-fade in browsers without it.
  function switchTheme(t, from) {
    const root = document.documentElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) {
      root.classList.add('theme-fade');
      setTheme(t);
      setTimeout(() => root.classList.remove('theme-fade'), 650);
      return;
    }
    const r = from?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth - 40; const y = r ? r.top + r.height / 2 : 30;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('theme-vt');
    const vt = document.startViewTransition(() => setTheme(t));
    vt.ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(.65,0,.25,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove('theme-vt'));
  }
  function themeButton() {
    const b = h('button', { class: 'btn icon ghost theme-btn', 'aria-label': 'Toggle dark / light theme', html: icon('moon', 'moon') + icon('sun', 'sun') });
    b.onclick = () => switchTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', b);
    return b;
  }

  /* ---------- appearance / fonts ---------- */
  const FONTS = {
    Helvetica: { stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    'SF Pro (System)': { stack: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' },
    Inter: { google: 'Inter' }, Manrope: { google: 'Manrope' }, 'DM Sans': { google: 'DM Sans' }, Poppins: { google: 'Poppins' },
    Montserrat: { google: 'Montserrat' }, 'Space Grotesk': { google: 'Space Grotesk', noItalic: true }, 'Plus Jakarta Sans': { google: 'Plus Jakarta Sans' },
    Outfit: { google: 'Outfit', noItalic: true }, Sora: { google: 'Sora', noItalic: true }, Urbanist: { google: 'Urbanist' },
    Syne: { google: 'Syne', noItalic: true }, 'Archivo': { google: 'Archivo' },
  };
  function fontStack(name) {
    const f = FONTS[name] || FONTS.Helvetica;
    if (f.stack) return f.stack;
    loadFont(name);
    return `"${f.google}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  }
  function loadFont(name) {
    const f = FONTS[name];
    if (!f?.google || document.querySelector(`link[data-font="${name}"]`)) return;
    const fam = f.google.replace(/ /g, '+');
    const axis = f.noItalic ? 'wght@400;500;600;700;800' : 'ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,700';
    document.head.append(h('link', { rel: 'stylesheet', 'data-font': name, href: `https://fonts.googleapis.com/css2?family=${fam}:${axis}&display=swap` }));
  }
  function applyAppearance(a = {}) {
    const root = document.documentElement.style;
    if (a.primary) root.setProperty('--brand', a.primary);
    if (a.secondary) root.setProperty('--brand-2', a.secondary);
    if (a.radius != null) { root.setProperty('--radius', `${a.radius}px`); root.setProperty('--radius-sm', `${Math.max(6, Math.round(a.radius * 0.66))}px`); }
    root.setProperty('--font', fontStack(a.font));
    document.body.classList.toggle('no-orbs', a.orbs === false);
    document.body.classList.toggle('no-grid', a.grid === false);
    document.body.classList.toggle('no-glass', a.glass === false);
    if (a.heroSize) root.setProperty('--hero-size', `${a.heroSize}px`);
    if (a.faviconUrl) { const l = $('link[rel="icon"]'); if (l) l.href = a.faviconUrl; }
    if (a.defaultTheme) {
      try { localStorage.setItem('ezro-default-theme', a.defaultTheme); } catch { /* */ }
      let manual = null; try { manual = localStorage.getItem('ezro-theme'); } catch { /* */ }
      if (!manual) setTheme(a.defaultTheme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : a.defaultTheme, false);
    }
  }

  /* ---------- text overrides (Admin → Texts) ---------- */
  let TEXTS = [];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'svg']);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  function applyTexts(root = document.body, page) {
    if (!TEXTS.length) return;
    const map = new Map();
    for (const t of TEXTS) if (t.page === 'all' || t.page === page) map.set(norm(t.original), t);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !SKIP.has(n.parentElement.tagName) && !n.parentElement.closest('[data-no-t], .menu, .toasts') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const orig = n.__orig ?? norm(n.nodeValue);
      if (!orig) continue;
      const t = map.get(orig);
      if (!t) continue;
      n.__orig = orig;
      const el = n.parentElement;
      if (t.deleted) {
        if (norm(el.textContent) === orig) el.style.display = 'none'; else n.nodeValue = '';
      } else if (norm(n.nodeValue) !== t.replacement) {
        n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, t.replacement);
      }
    }
  }
  function watchTexts(page) {
    applyTexts(document.body, page);
    const mo = new MutationObserver(debounce(() => { mo.disconnect(); applyTexts(document.body, page); mo.observe(document.body, { childList: true, subtree: true }); }, 30));
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- in-page text editor (opened from Admin → Texts) ---------- */
  function textEditMode(page) {
    const changes = new Map();
    document.body.classList.add('edit-mode');
    const style = h('style', {}, `
      body.edit-mode [data-editable]{outline:1.5px dashed color-mix(in srgb,var(--brand) 60%,transparent);outline-offset:3px;border-radius:4px;cursor:text}
      body.edit-mode [data-editable]:hover{background:color-mix(in srgb,var(--brand) 12%,transparent)}
      body.edit-mode [data-editable][contenteditable="plaintext-only"],body.edit-mode [data-editable][contenteditable="true"]{outline:2px solid var(--brand);background:color-mix(in srgb,var(--brand) 10%,transparent)}
      body.edit-mode .t-deleted{opacity:.3;text-decoration:line-through}
      .edit-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1500;display:flex;gap:8px;align-items:center;padding:8px 8px 8px 16px;border-radius:999px;border:1px solid var(--border);box-shadow:var(--shadow);font-size:14px;font-weight:600;animation:toastIn .5s var(--spring);max-width:calc(100vw - 24px);flex-wrap:wrap}`);
    document.head.append(style);
    const count = h('span', {}, 'Click any text to edit it');
    const delBtn = h('button', { class: 'btn sm danger', disabled: true }, iconEl('trash'), 'Delete text');
    const saveBtn = h('button', { class: 'btn sm primary' }, 'Save texts');
    const exitBtn = h('button', { class: 'btn sm' }, 'Exit');
    document.body.append(h('div', { class: 'edit-bar glass', 'data-no-t': '' }, iconEl('type'), count, delBtn, saveBtn, exitBtn));
    let current = null;
    const mark = () => {
      $$('body *').forEach((el) => {
        if (el.closest('[data-no-t], .edit-bar, .menu, .overlay') || SKIP.has(el.tagName) || el.dataset.editable) return;
        const direct = [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
        if (direct.length && [...el.children].every((c) => ['BR', 'B', 'STRONG', 'EM', 'I', 'SPAN'].includes(c.tagName) && !c.children.length)) el.dataset.editable = '1';
      });
    };
    mark();
    new MutationObserver(debounce(mark, 100)).observe(document.body, { childList: true, subtree: true });
    const upd = () => { count.textContent = changes.size ? `${changes.size} unsaved change${changes.size > 1 ? 's' : ''}` : 'Click any text to edit it'; };
    document.addEventListener('click', (e) => {
      if (e.target.closest('.edit-bar')) return;
      const el = e.target.closest('[data-editable]');
      e.preventDefault(); e.stopPropagation();
      if (!el) return;
      if (current && current !== el) current.removeAttribute('contenteditable');
      current = el;
      if (!el.__origText) el.__origText = norm([...el.childNodes].map((n) => n.__orig || n.textContent).join(''));
      try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
      el.focus();
      delBtn.disabled = false;
      delBtn.lastChild.textContent = el.classList.contains('t-deleted') ? 'Restore text' : 'Delete text';
    }, true);
    document.addEventListener('input', (e) => {
      const el = e.target.closest?.('[data-editable]'); if (!el) return;
      const val = norm(el.textContent);
      if (val === el.__origText) changes.delete(el.__origText); else changes.set(el.__origText, { page, original: el.__origText, replacement: val, deleted: false });
      upd();
    });
    delBtn.onclick = () => {
      if (!current) return;
      const del = !current.classList.contains('t-deleted');
      current.classList.toggle('t-deleted', del);
      if (del) changes.set(current.__origText, { page, original: current.__origText, replacement: '', deleted: true });
      else changes.delete(current.__origText);
      delBtn.lastChild.textContent = del ? 'Restore text' : 'Delete text';
      upd();
    };
    saveBtn.onclick = () => withBusy(saveBtn, async () => {
      if (!changes.size) return toast('Nothing to save');
      await api('/api/admin/texts', { body: { items: [...changes.values()] } }).then(() => { toast('Texts saved', 'success'); changes.clear(); upd(); }).catch(fail);
    });
    exitBtn.onclick = () => { location.href = location.pathname; };
    window.addEventListener('beforeunload', (e) => { if (changes.size) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ---------- auth (Google Identity Services) ---------- */
  const auth = { user: null, config: null, listeners: [] };
  auth.onChange = (fn) => auth.listeners.push(fn);
  auth.emit = () => auth.listeners.forEach((fn) => fn(auth.user));
  auth.load = async () => {
    const [me, cfg] = await Promise.all([api('/api/auth/me'), api('/api/auth/config')]);
    auth.user = me.user; auth.config = cfg; auth.emit();
    return auth.user;
  };
  auth.logout = async () => { await api('/api/auth/logout', { body: {} }); auth.user = null; auth.emit(); toast('Signed out'); };
  let gsiLoading = null;
  function loadGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    gsiLoading ||= new Promise((res, rej) => { const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true }); s.onload = res; s.onerror = () => rej(new Error('Could not load Google sign-in')); document.head.append(s); });
    return gsiLoading;
  }
  // Renders a Google button (or the local dev login) into `container`; resolves when signed in.
  function renderSignIn(container, onDone) {
    container.replaceChildren();
    const cfg = auth.config || {};
    if (cfg.googleClientId) {
      const slot = h('div', { style: { display: 'flex', justifyContent: 'center', minHeight: '44px' } });
      container.append(slot);
      loadGsi().then(() => {
        google.accounts.id.initialize({
          client_id: cfg.googleClientId, ux_mode: 'popup', auto_select: false,
          callback: async ({ credential }) => {
            try { const r = await api('/api/auth/google', { body: { credential } }); auth.user = r.user; await auth.load(); toast(`Welcome, ${auth.user.name || auth.user.email}`, 'success'); onDone?.(auth.user); }
            catch (e) { fail(e); }
          },
        });
        google.accounts.id.renderButton(slot, { theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(320, container.clientWidth || 320) });
      }).catch(fail);
    }
    if (cfg.devLogin) {
      const em = input('', { type: 'email', placeholder: 'you@gmail.com (local test login)', autocomplete: 'email' });
      const go = h('button', { class: 'btn primary' }, 'Sign in');
      go.onclick = () => withBusy(go, async () => {
        try { await api('/api/auth/dev', { body: { email: em.value } }); await auth.load(); toast('Signed in (test mode)', 'success'); onDone?.(auth.user); } catch (e) { fail(e); }
      });
      em.onkeydown = (e) => e.key === 'Enter' && go.click();
      container.append(h('div', { style: { display: 'grid', gap: '8px', marginTop: cfg.googleClientId ? '14px' : 0 } },
        h('div', { class: 'hint muted', style: { fontSize: '12px', textAlign: 'center' } }, 'Test mode — Google sign-in replacement for local development'),
        h('div', { class: 'input-group' }, em, go)));
    }
    if (!cfg.googleClientId && !cfg.devLogin) container.append(h('div', { class: 'empty' }, 'Google sign-in is not configured yet.'));
  }
  function signInSheet(reason = 'Sign in to continue') {
    return new Promise((resolve) => {
      const slot = h('div');
      const s = sheet({
        body: [h('div', { style: { textAlign: 'center', padding: '12px 0 18px' } },
          h('div', { class: 'avatar', style: { width: '56px', height: '56px', margin: '0 auto 14px', fontSize: '22px' }, html: icon('lock') }),
          h('h3', { style: { fontSize: '22px', marginBottom: '6px' } }, reason),
          h('p', { class: 'muted' }, 'Use your Google account — your purchases and keys are linked to it.')), slot],
        onClose: () => resolve(auth.user),
      });
      requestAnimationFrame(() => renderSignIn(slot, () => s.close()));
    });
  }
  function avatarEl(user, size = 30) {
    if (user?.picture) return h('img', { class: 'avatar', src: user.picture, alt: '', referrerpolicy: 'no-referrer', style: { width: `${size}px`, height: `${size}px` } });
    const letters = (user?.name || user?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
    return h('span', { class: 'avatar', style: { width: `${size}px`, height: `${size}px` } }, letters);
  }

  /* ---------- reveal on scroll ---------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }) : null;
  const reveal = (el, delay = 0) => { el.classList.add('reveal'); el.style.transitionDelay = `${delay}ms`; io ? io.observe(el) : el.classList.add('in'); return el; };

  const track = (path) => api('/api/public/track', { body: { path } }).catch(() => {});

  window.Ezro = {
    h, $, $$, esc, debounce, store, icon, iconEl, money, fmtDate, fmtDateTime, timeAgo, toLocalInput, api, upload, toast, fail,
    sheet, confirmDialog, popMenu, closeMenus, enhanceSelect, select, segmented, field, input, textarea, toggle, busy, withBusy, copy,
    uploadBox, dragSort, setTheme, themeButton, applyAppearance, FONTS, fontStack, loadFont, applyTexts, watchTexts, textEditMode,
    auth, renderSignIn, signInSheet, avatarEl, reveal, track, ICONS: Object.keys(P), BRANDS: Object.keys(BRAND),
    setCurrency: (c) => { CURRENCY = c || 'EUR'; }, setTexts: (t) => { TEXTS = t || []; },
  };
})();
