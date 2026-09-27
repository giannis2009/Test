/* =========================================================
   Ezro — admin shell, router, dashboard, logs, people
   Pages are registered on window.Admin.pages by the other admin-*.js files.
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro;
  const { h, $, $$, icon, iconEl, money, api, toast, fail, withBusy } = E;

  const Admin = window.Admin = { pages: {}, site: null, me: null };

  const NAV = [
    ['Overview', [['dashboard', 'Dashboard', 'dashboard']]],
    ['Store', [['orders', 'Orders', 'receipt'], ['products', 'Products', 'box'], ['discounts', 'Discounts', 'percent'], ['payments', 'Payments & Checkout', 'card']]],
    ['Content', [['media', 'Categories & Media', 'image'], ['socials', 'Social media', 'share'], ['texts', 'Texts', 'type'], ['appearance', 'Appearance', 'palette']]],
    ['Workspace', [['tasks', 'Tasks', 'tasks'], ['customers', 'Customers', 'users']]],
    ['System', [['security', 'Admins & Security', 'shield'], ['logs', 'Logs', 'logs'], ['reset', 'Reset data', 'refresh']]],
  ];

  /* ---------- shared helpers for pages ---------- */
  Admin.head = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), actions.length ? h('div', { class: 'acts' }, actions) : null);
  Admin.panel = (title, ...kids) => h('section', { class: 'panel' }, title ? h('div', { class: 'panel-title' }, h('span', { class: 'dot' }), typeof title === 'string' ? h('span', {}, title) : title) : null, ...kids);
  Admin.stat = (k, v, cls = '', s = '') => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: `v ${cls}` }, v), s ? h('div', { class: 's' }, s) : null);
  Admin.btn = (label, ic, onclick, cls = '') => h('button', { class: `btn ${cls}`, onclick }, ic ? iconEl(ic) : null, label);
  Admin.iconPicker = (value, onPick, { brands = true } = {}) => {
    const names = [...(brands ? E.BRANDS : []), ...E.ICONS];
    const isUrl = (v) => /^(\/|https?:)/.test(v || '');
    const wrap = h('div', { class: 'icon-picker' });
    const grid = h('div', { class: 'icon-grid' });
    const file = h('input', { type: 'file', accept: 'image/svg+xml,image/png,image/webp', class: 'hidden' });
    const prev = h('div', { class: 'prev' });
    const own = h('div', { class: 'icon-own' }, prev,
      h('div', { class: 'tt' }, h('strong', {}, 'Upload your own icon'), h('span', {}, 'SVG or PNG · square 256×256 px · transparent background')),
      h('button', { type: 'button', class: 'btn sm' }, iconEl('upload'), 'Choose file'), file);
    const set = (v) => {
      wrap.value = v;
      grid.replaceChildren(...names.map((n) => h('button', { type: 'button', class: n === v ? 'on' : '', title: n, 'aria-label': n, html: icon(n), onclick: () => { set(n); onPick?.(n); } })));
      own.classList.toggle('on', isUrl(v));
      prev.replaceChildren(isUrl(v) ? h('img', { src: v, alt: '' }) : iconEl('image'));
    };
    own.querySelector('button').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      try { const r = await E.upload('/api/admin/upload', f); set(r.url); onPick?.(r.url); toast('Icon uploaded', 'success'); } catch (e) { fail(e); }
    };
    set(value);
    wrap.append(grid, own);
    return wrap;
  };
  Admin.saveSettings = async (key, data, btn) => {
    const go = async () => { const r = await api(`/api/admin/settings/${key}`, { method: 'PUT', body: data }); toast('Saved', 'success'); return r; };
    try { return btn ? await withBusy(btn, go) : await go(); } catch (e) { fail(e); return null; }
  };
  Admin.reorder = (table, ids) => api(`/api/admin/reorder/${table}`, { method: 'PUT', body: { ids } }).catch(fail);
  Admin.money = (c) => money(c, Admin.site?.checkout?.currency);
  Admin.statusChip = (s) => {
    const map = { paid: ['good', 'Paid'], pending: ['warn', 'Pending'], cancelled: ['', 'Cancelled'], refunded: ['bad', 'Refunded'], failed: ['bad', 'Failed'] };
    const [c, l] = map[s] || ['', s];
    return h('span', { class: `chip ${c}` }, l);
  };

  /* ---------- shell ---------- */
  const root = $('#root');
  let side; let main;
  function shell() {
    side = h('aside', { class: 'side' },
      h('a', { class: 'side-brand', href: '/', title: 'Open site' }, h('img', { src: Admin.site?.appearance?.logoUrl || '/assets/logo.webp', alt: 'Ezro' }), h('small', {}, 'Admin')),
      NAV.map(([group, items]) => [h('div', { class: 'side-group' }, group), items.map(([id, label, ic]) => h('a', { class: 'nav-i', href: `#/${id}`, dataset: { id } }, iconEl(ic), h('span', {}, label)))]),
      h('div', { class: 'side-foot' }, E.avatarEl(Admin.me, 34), h('div', { class: 'who' }, h('strong', {}, Admin.me.username), h('span', {}, Admin.me.role === 'owner' ? 'Owner' : 'Admin')),
        E.themeButton(), h('button', { class: 'btn icon ghost', 'aria-label': 'Sign out', title: 'Sign out', html: icon('logout'), onclick: signOut })));
    main = h('main', { class: 'main' });
    const mtop = h('div', { class: 'mobile-top glass' }, h('button', { class: 'btn icon ghost', 'aria-label': 'Menu', html: icon('menu'), onclick: openSide }), h('img', { src: Admin.site?.appearance?.logoUrl || '/assets/logo.webp', alt: '' }), h('span', { style: { flex: 1 } }), E.themeButton());
    root.replaceChildren(h('div', { class: 'shell' }, side, h('div', {}, mtop, main)));
    side.addEventListener('click', (e) => { if (e.target.closest('a.nav-i')) closeSide(); });
  }
  let scrim;
  function openSide() { side.classList.add('open'); scrim = h('div', { class: 'side-scrim', onclick: closeSide }); document.body.append(scrim); }
  function closeSide() { side.classList.remove('open'); scrim?.remove(); }

  let current = null;
  async function route() {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || 'dashboard';
    $$('.nav-i', side).forEach((a) => a.classList.toggle('on', a.dataset.id === id));
    current?.cleanup?.();
    const page = Admin.pages[id] || Admin.pages.dashboard;
    main.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'skeleton', style: { height: '120px' } }), h('div', { class: 'skeleton', style: { height: '300px' } })));
    window.scrollTo(0, 0);
    try {
      current = { cleanup: null };
      const nodes = await page({ setCleanup: (fn) => { current.cleanup = fn; } });
      main.replaceChildren(...[nodes].flat());
    } catch (e) {
      if (e.status === 401) { loginScreen('expired'); return; }
      fail(e);
      main.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty' }, e.message)));
    }
    refreshBadges();
  }
  Admin.refresh = route;
  async function refreshBadges() {
    try {
      const { orders } = await api('/api/admin/orders?status=pending');
      const n = orders.filter((o) => o.method.startsWith('pm:')).length;
      const a = $('.nav-i[data-id="orders"]', side);
      $('.badge', a)?.remove();
      if (n) a.append(h('span', { class: 'badge', title: 'Orders waiting for manual payment confirmation' }, n));
    } catch { /* ignore */ }
  }

  async function signOut() {
    await api('/api/admin-auth/logout', { body: {} }).catch(() => {});
    window.removeEventListener('hashchange', route);
    loginScreen('signedout');
  }
  async function boot() {
    let st;
    try { st = await api('/api/admin-auth/status'); } catch (e) { fail(e); return; }
    if (!st.admin) return loginScreen(st.setup ? 'setup' : null);
    Admin.me = { ...st.admin, name: st.admin.username, email: st.admin.role };
    Admin.site = await api('/api/public/site').catch(() => null);
    if (Admin.site) { E.setCurrency(Admin.site.checkout.currency); E.applyAppearance({ ...Admin.site.appearance, orbs: false, grid: false }); }
    shell();
    window.removeEventListener('hashchange', route);
    window.addEventListener('hashchange', route);
    route();
  }

  /* ---------- login panel: secret username + password (and the one-time owner setup) ---------- */
  // strength 0–4 from length and character variety
  Admin.pwStrength = (pw) => {
    if (!pw) return 0;
    let sc = 0;
    if (pw.length >= 10) sc++; if (pw.length >= 14) sc++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) sc++;
    if (pw.length < 10) sc = Math.min(sc, 1);
    return Math.min(4, sc);
  };
  Admin.pwField = (placeholder, { autocomplete = 'current-password', meter = false } = {}) => {
    const inp = h('input', { class: 'input', type: 'password', placeholder, autocomplete, spellcheck: 'false', maxlength: '200' });
    const eye = h('button', { type: 'button', class: 'lg-eye', 'aria-label': 'Show password', html: icon('eye') });
    eye.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.classList.toggle('on', show); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); inp.focus(); };
    const caps = h('div', { class: 'lg-caps hidden' }, iconEl('arrow'), 'Caps Lock is on');
    const onKey = (e) => { if (e.getModifierState) caps.classList.toggle('hidden', !e.getModifierState('CapsLock')); };
    inp.addEventListener('keydown', onKey); inp.addEventListener('keyup', onKey);
    const wrap = h('div', { class: 'lg-field' }, h('span', { class: 'lg-ic', html: icon('lock') }), inp, eye);
    let bar = null;
    if (meter) {
      const LBL = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'];
      const segs = [0, 1, 2, 3].map(() => h('i'));
      const txt = h('span', {}, '');
      bar = h('div', { class: 'lg-meter', dataset: { s: '0' } }, h('div', { class: 'lg-segs' }, segs), txt);
      inp.addEventListener('input', () => { const sc = Admin.pwStrength(inp.value); bar.dataset.s = String(inp.value ? Math.max(1, sc) : 0); txt.textContent = inp.value ? LBL[sc] : ''; });
    }
    return { el: h('div', { class: 'lg-group' }, wrap, caps, bar), input: inp };
  };
  function loginScreen(mode) {
    const setup = mode === 'setup';
    document.title = setup ? 'Create admin login — Ezro' : 'Admin — Ezro';
    const err = h('div', { class: 'lg-error', role: 'alert', 'aria-live': 'assertive' });
    const showErr = (m) => { err.replaceChildren(iconEl('shield'), h('span', {}, m)); err.classList.add('on'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };
    const user = h('input', { class: 'input', placeholder: 'Username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '32' });
    const userField = h('div', { class: 'lg-field' }, h('span', { class: 'lg-ic', html: icon('user') }), user);
    const pw = Admin.pwField(setup ? 'Create a password' : 'Password', { autocomplete: setup ? 'new-password' : 'current-password', meter: setup });
    const pw2 = setup ? Admin.pwField('Repeat the password', { autocomplete: 'new-password' }) : null;
    const code = setup ? h('input', { class: 'input mono', placeholder: 'XXXX-XXXX', autocomplete: 'one-time-code', maxlength: '9', style: { letterSpacing: '.18em', textTransform: 'uppercase' } }) : null;
    const remember = h('label', { class: 'lg-remember' }, h('input', { type: 'checkbox' }), h('span', { class: 'lg-check', html: icon('check') }), 'Keep me signed in for 14 days');
    const go = h('button', { class: 'btn primary lg block lg-go', type: 'submit' }, h('span', {}, setup ? 'Create admin login' : 'Sign in'), iconEl('arrow'));
    let lockT = null;
    const lock = (secs) => {
      clearInterval(lockT); go.disabled = true;
      const end = Date.now() + secs * 1000;
      const tick = () => {
        const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        go.firstChild.textContent = left ? `Locked · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Sign in';
        if (!left) { clearInterval(lockT); go.disabled = false; err.classList.remove('on'); }
      };
      tick(); lockT = setInterval(tick, 1000);
    };
    const form = h('form', { class: 'lg-form', novalidate: true },
      setup ? h('div', { class: 'lg-group' }, h('label', { class: 'lg-label' }, 'Setup code'), h('div', { class: 'lg-field' }, h('span', { class: 'lg-ic', html: icon('key') }), code),
        h('p', { class: 'lg-hint' }, 'Shown once in the server window, and saved in ', h('code', {}, 'data/ADMIN-SETUP-CODE.txt'), '.')) : null,
      h('div', { class: 'lg-group' }, setup ? h('label', { class: 'lg-label' }, 'Username') : null, userField,
        setup ? h('p', { class: 'lg-hint' }, '3–32 letters or numbers. Keep it secret — it is half of your login.') : null),
      h('div', { class: 'lg-group' }, setup ? h('label', { class: 'lg-label' }, 'Password') : null, pw.el),
      pw2 ? pw2.el : null,
      err,
      setup ? null : remember,
      go);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      err.classList.remove('on');
      if (setup && !code.value.trim()) { showErr('Enter the setup code.'); code.focus(); return; }
      if (!user.value.trim()) { showErr('Enter your username.'); user.focus(); return; }
      if (!pw.input.value) { showErr('Enter your password.'); pw.input.focus(); return; }
      if (setup && pw.input.value !== pw2.input.value) { showErr('The two passwords are not the same.'); pw2.input.focus(); return; }
      go.classList.add('loading'); go.disabled = true;
      try {
        const body = setup ? { code: code.value, username: user.value.trim(), password: pw.input.value }
          : { username: user.value.trim(), password: pw.input.value, remember: remember.querySelector('input').checked };
        await api(setup ? '/api/admin-auth/setup' : '/api/admin-auth/login', { body });
        card.classList.add('ok');
        go.replaceChildren(iconEl('check'), h('span', {}, setup ? 'Account created' : 'Welcome'));
        setTimeout(() => { location.hash = location.hash || '#/dashboard'; boot(); }, 520);
      } catch (ex) {
        go.classList.remove('loading'); go.disabled = false;
        pw.input.value = ''; if (pw2) pw2.input.value = '';
        showErr(ex.message);
        const m = /(\d+) min/.exec(ex.message); if (ex.status === 429 && m) lock(Number(m[1]) * 60);
        pw.input.focus();
      }
    };
    const note = mode === 'expired' ? 'Your session ended. Sign in again.' : mode === 'signedout' ? 'You are signed out.' : null;
    const card = h('div', { class: 'lg-card' },
      h('div', { class: 'lg-top' },
        h('div', { class: 'lg-badge', html: icon(setup ? 'sparkles' : 'shield') }),
        h('img', { class: 'lg-logo', src: '/assets/logo.webp', alt: 'Ezro' })),
      h('h1', {}, setup ? 'Create your admin login' : 'Admin'),
      h('p', { class: 'lg-sub' }, setup ? 'First time here — choose the secret username and password that will open this panel.' : 'Restricted area. Sign in with your admin username and password.'),
      note ? h('div', { class: 'lg-note' }, iconEl('clock'), note) : null,
      form,
      h('div', { class: 'lg-foot' }, iconEl('lock'), 'Encrypted session · every attempt is logged'));
    root.replaceChildren(h('div', { class: 'lg-page' },
      h('div', { class: 'lg-orb a' }), h('div', { class: 'lg-orb b' }), h('div', { class: 'lg-grid' }),
      h('a', { class: 'lg-back', href: '/' }, iconEl('chevron-left'), 'Back to site'),
      h('div', { class: 'lg-theme' }, E.themeButton()),
      card));
    requestAnimationFrame(() => (setup ? code : user).focus());
  }

  /* ---------- bar chart (single series, hover tooltip) ---------- */
  Admin.barChart = ({ data, value, label, format, alt = false, integer = false }) => {
    const W = 640; const H = 200; const pad = { l: 44, r: 6, t: 10, b: 24 };
    const vals = data.map(value);
    const max = Math.max(1, ...vals);
    const nice = (() => {
      const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw)); const m = raw / p;
      let step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
      if (integer) step = Math.max(1, Math.ceil(step));
      return step * 4;
    })();
    const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
    const bw = iw / data.length; const gap = Math.min(2, bw * 0.25);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', data.map((d, i) => `${label(d)}: ${format(vals[i])}`).join(', '));
    const el = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; svg.append(n); return n; };
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + ih - (ih * g) / 4;
      el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'gl' });
      el('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis' }, format((nice * g) / 4, true));
    }
    const step = Math.ceil(data.length / 7);
    const bars = data.map((d, i) => {
      const v = vals[i]; const hgt = (v / nice) * ih; const x = pad.l + i * bw + gap / 2; const w = Math.max(1, bw - gap);
      const r = Math.min(4, w / 2, hgt);
      const y = pad.t + ih - hgt;
      const path = hgt > 0 ? `M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${pad.t + ih} Z` : '';
      const b = el('path', { d: path, class: `bar ${alt ? 'alt' : ''}` });
      if (i % step === 0 || i === data.length - 1) el('text', { x: x + w / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis' }, label(d, true));
      return b;
    });
    const tip = h('div', { class: 'tip hidden' });
    const wrap = h('div', { class: 'chart' }, svg, tip);
    data.forEach((d, i) => {
      const hit = el('rect', { x: pad.l + i * bw, y: pad.t, width: bw, height: ih, class: 'hit' });
      const show = () => {
        svg.classList.add('dim'); bars.forEach((b, j) => b.classList.toggle('hl', i === j));
        tip.classList.remove('hidden');
        tip.replaceChildren(h('strong', {}, format(vals[i])), h('span', {}, label(d)));
        const r = svg.getBoundingClientRect(); const sx = r.width / W;
        tip.style.left = `${(pad.l + i * bw + bw / 2) * sx}px`;
        tip.style.top = `${(pad.t + ih - (vals[i] / nice) * ih) * (r.height / H)}px`;
      };
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show);
    });
    svg.addEventListener('pointerleave', () => { svg.classList.remove('dim'); tip.classList.add('hidden'); });
    return wrap;
  };

  const LOG_META = {
    auth: ['user', ''], order: ['receipt', 'good'], paypal: ['paypal', 'warn'], product: ['box', ''], category: ['image', ''], media: ['image', ''],
    discount: ['percent', ''], payment_method: ['card', ''], settings: ['settings', ''], texts: ['type', ''], task: ['tasks', ''], social: ['share', ''],
    watch: ['play', ''], mail: ['mail', ''], invoice: ['invoice', ''], license: ['key', 'warn'], admin: ['shield', 'warn'], upload: ['upload', ''],
  };
  const humanAction = (a) => a.replace(/^[a-z_]+\./, (m) => `${m.slice(0, -1).replace(/_/g, ' ')} · `).replace(/_/g, ' ');
  function detailText(d) {
    if (!d || d[0] !== '{') return d;
    try { return Object.entries(JSON.parse(d)).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '); } catch { return d; }
  }
  Admin.logRow = (l) => {
    const [ic, cls] = LOG_META[l.action.split('.')[0]] || ['logs', ''];
    const bad = /fail|error|invalid|wrong|revoke|remove/.test(l.action);
    return h('div', { class: 'log' }, h('div', { class: `lic ${bad ? 'bad' : cls}`, html: icon(ic) }),
      h('div', { class: 'lt' }, h('div', {}, h('strong', {}, humanAction(l.action)), l.target ? ` — ${l.target}` : ''),
        h('div', { class: 'd' }, [l.actor, detailText(l.details), l.ip].filter(Boolean).join(' · '))),
      h('time', { datetime: new Date(l.at).toISOString(), title: new Date(l.at).toLocaleString() }, E.timeAgo(l.at)));
  };

  /* ================= Dashboard ================= */
  let range = 30;
  Admin.pages.dashboard = async () => {
    const d = await api(`/api/admin/stats?days=${range}`);
    const fmtDay = (x, short) => new Date(`${x.day}T12:00:00`).toLocaleDateString(undefined, short ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
    const t = d.totals;
    const rangeSeg = E.segmented([[7, '7 days'], [30, '30 days'], [90, '90 days']], range, (v) => { range = Number(v); Admin.refresh(); });
    const ok = (b) => h('span', { class: `chip st ${b ? 'good' : 'warn'}` }, b ? 'Connected' : 'Not set');
    return [
      Admin.head('Dashboard', `${Admin.site?.site?.projectName || 'Ezro'} — visitors, orders and revenue at a glance.`, rangeSeg),
      h('div', { class: 'page' },
        h('div', { class: 'stats' },
          Admin.stat('Revenue', Admin.money(t.periodRevenue), 'brand', `Last ${range} days · ${Admin.money(t.revenueAll)} all time`),
          Admin.stat('Orders', t.periodOrders, '', `${t.ordersAll} paid all time · avg ${Admin.money(t.avgOrder)}`),
          Admin.stat('Visitors', t.periodVisitors.toLocaleString(), '', `${t.today.visitors} today · ${t.today.views} page views`),
          Admin.stat('Conversion', `${t.conversion.toFixed(1)}%`, '', 'Orders ÷ visitors'),
          Admin.stat('Awaiting payment', t.pending, t.pending ? 'warn' : '', 'Manual methods to confirm')),
        h('div', { class: 'grid-2' },
          Admin.panel(null, h('div', { class: 'chart-head' }, h('div', {}, h('div', { class: 'label' }, 'Visitors per day'), h('div', { class: 'big' }, t.periodVisitors.toLocaleString()))),
            Admin.barChart({ data: d.series, value: (x) => x.visitors, integer: true, label: fmtDay, format: (v) => Math.round(v).toLocaleString() })),
          Admin.panel(null, h('div', { class: 'chart-head' }, h('div', {}, h('div', { class: 'label' }, 'Revenue per day'), h('div', { class: 'big' }, Admin.money(t.periodRevenue)))),
            Admin.barChart({ data: d.series, value: (x) => x.revenue, integer: true, label: fmtDay, format: (v, axis) => (axis ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(v / 100) : Admin.money(v)), alt: true }))),
        h('div', { class: 'grid-3' },
          Admin.panel(h('span', {}, 'Recent orders'), d.recentOrders.length ? h('div', { class: 'list' }, d.recentOrders.map((o) => h('a', { class: 'lrow', href: `#/orders/${o.id}` },
            h('div', { class: 'tt' }, h('strong', {}, `${o.number} · ${money(o.total_cents, o.currency)}`), h('span', {}, `${o.email} · ${E.timeAgo(o.created_at)}`)), Admin.statusChip(o.status))))
            : h('div', { class: 'empty' }, 'No orders yet')),
          Admin.panel('Recent activity', d.recentLogs.length ? h('div', {}, d.recentLogs.map(Admin.logRow)) : h('div', { class: 'empty' }, 'Nothing yet'),
            h('a', { class: 'btn sm', href: '#/logs', style: { marginTop: '10px' } }, 'All logs', iconEl('arrow'))),
          h('div', { style: { display: 'grid', gap: '18px', alignContent: 'start' } },
            Admin.panel('Top products', d.topProducts.length ? h('div', { class: 'list' }, d.topProducts.map((p) => h('div', { class: 'lrow' }, h('div', { class: 'tt' }, h('strong', {}, p.title)), h('span', { class: 'chip brand' }, `${p.sold} sold`)))) : h('div', { class: 'empty' }, 'No sales yet')),
            Admin.panel('Integrations', h('div', { class: 'integ' },
              h('div', {}, h('span', { html: icon('paypal') }), `PayPal (${d.integrations.paypalEnv})`, ok(d.integrations.paypal)),
              h('div', {}, iconEl('user'), 'Google sign-in', ok(d.integrations.google)),
              h('div', {}, iconEl('mail'), 'Email (SMTP)', ok(d.integrations.smtp)),
              h('div', {}, iconEl('film'), 'Google Drive videos', ok(d.integrations.drive))),
              h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '12px' } }, 'Connected in the server .env file — see README.')))),
      ),
    ];
  };

  /* ================= Logs ================= */
  Admin.pages.logs = async () => {
    let q = ''; let type = '';
    const list = h('div');
    const more = h('button', { class: 'btn', style: { marginTop: '12px' } }, 'Load more');
    let last = null;
    const load = async (reset) => {
      if (reset) { list.replaceChildren(); last = null; }
      const { logs } = await api(`/api/admin/logs?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}${last ? `&before=${last}` : ''}`);
      if (!logs.length && reset) list.append(h('div', { class: 'empty' }, 'No log entries match.'));
      logs.forEach((l) => list.append(Admin.logRow(l)));
      last = logs.length ? logs[logs.length - 1].at : last;
      more.classList.toggle('hidden', logs.length < 100);
    };
    more.onclick = () => withBusy(more, () => load(false));
    const search = h('div', { class: 'input-wrap grow' }, iconEl('search'), E.input('', { placeholder: 'Search logs…', oninput: E.debounce((e) => { q = e.target.value; load(true); }) }));
    const types = E.select([['', 'Every type'], ['order', 'Orders'], ['paypal', 'PayPal'], ['auth', 'Sign-ins'], ['watch', 'Video views'], ['product', 'Products'], ['settings', 'Settings'], ['texts', 'Texts'], ['task', 'Tasks'], ['mail', 'Emails'], ['license', 'Keys'], ['admin', 'Admins'], ['media', 'Media'], ['category', 'Categories']], '', { onChange: (v) => { type = v; load(true); } });
    await load(true);
    return [Admin.head('Logs', 'Every change, payment, sign-in and video view — newest first.'),
      h('div', { class: 'page' }, h('div', { class: 'toolbar' }, search, types), Admin.panel(null, list, more))];
  };

  /* ================= Customers ================= */
  Admin.pages.customers = async () => {
    const { customers } = await api('/api/admin/customers');
    return [Admin.head('Customers', 'Everyone who signed in with Google.'),
      h('div', { class: 'page' }, customers.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Customer'), h('th', {}, 'Joined'), h('th', {}, 'Last sign-in'), h('th', { class: 'num' }, 'Orders'), h('th', { class: 'num' }, 'Spent'))),
        h('tbody', {}, customers.map((c) => h('tr', {},
          h('td', {}, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, E.avatarEl(c, 32), h('div', {}, h('strong', {}, c.name || '—'), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, c.email)))),
          h('td', {}, E.fmtDate(c.created_at)), h('td', {}, E.timeAgo(c.last_login)), h('td', { class: 'num' }, c.orders), h('td', { class: 'num' }, Admin.money(c.spent)))))))
        : h('div', { class: 'empty' }, 'No customers yet'))];
  };

  /* ================= Admins & Security ================= */
  Admin.pages.security = async () => {
    const [acc, sec] = await Promise.all([api('/api/admin/accounts'), api('/api/admin/settings/security')]);
    const { me, canManage, accounts, sessions } = acc;

    // ---- my login: username + password (current password always required)
    const uname = E.input(me.username, { autocomplete: 'username', maxlength: '32', spellcheck: 'false' });
    const cur = Admin.pwField('Current password');
    const npw = Admin.pwField('New password (leave empty to keep it)', { autocomplete: 'new-password', meter: true });
    const npw2 = Admin.pwField('Repeat the new password', { autocomplete: 'new-password' });
    const saveMe = h('button', { class: 'btn primary' }, iconEl('check'), 'Save my login');
    saveMe.onclick = () => withBusy(saveMe, async () => {
      if (!cur.input.value) { toast('Enter your current password', 'error'); cur.input.focus(); return; }
      if (npw.input.value && npw.input.value !== npw2.input.value) { toast('The new passwords are not the same', 'error'); npw2.input.focus(); return; }
      if (uname.value.trim() === me.username && !npw.input.value) { toast('Nothing to change'); return; }
      try {
        const r = await api('/api/admin/account', { method: 'PUT', body: { currentPassword: cur.input.value, username: uname.value.trim(), newPassword: npw.input.value || undefined } });
        toast(npw.input.value ? 'Saved — other devices were signed out' : 'Saved', 'success');
        Admin.me.username = r.username; Admin.me.name = r.username; shell(); route();
      } catch (e) { fail(e); cur.input.value = ''; cur.input.focus(); }
    });

    // ---- accounts
    const nu = E.input('', { placeholder: 'username', autocomplete: 'off', maxlength: '32', spellcheck: 'false' });
    const np = Admin.pwField('Password for this admin', { autocomplete: 'new-password', meter: true });
    let role = 'admin';
    const roleSeg = E.segmented([['admin', 'Admin'], ['owner', 'Owner']], role, (v) => { role = v; });
    const add = h('button', { class: 'btn primary' }, iconEl('plus'), 'Add admin');
    add.onclick = () => withBusy(add, async () => {
      try { await api('/api/admin/accounts', { body: { username: nu.value.trim(), password: np.input.value, role } }); toast('Admin added — give them the username and password privately', 'success', 4500); Admin.refresh(); } catch (e) { fail(e); }
    });
    const resetPw = async (a) => {
      const f = Admin.pwField('New password', { autocomplete: 'new-password', meter: true });
      const ok = h('button', { class: 'btn primary' }, 'Set password');
      const sh = E.sheet({ title: `New password for ${a.username}`, body: h('div', { class: 'form' }, h('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, 'They are signed out everywhere and use the new password next time.'), f.el),
        foot: [h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => sh.close() }, 'Cancel'), ok] });
      ok.onclick = () => withBusy(ok, async () => { try { await api(`/api/admin/accounts/${a.id}/password`, { method: 'PUT', body: { password: f.input.value } }); toast('Password changed', 'success'); sh.close(); } catch (e) { fail(e); } });
    };
    const list = h('div', { class: 'list' }, accounts.map((a) => h('div', { class: 'lrow' },
      h('div', { class: 'ic', html: icon(a.role === 'owner' ? 'shield' : 'user') }),
      h('div', { class: 'tt' }, h('strong', {}, a.username, a.id === me.id ? ' (you)' : ''),
        h('span', {}, `${a.role === 'owner' ? 'Owner' : 'Admin'} · ${a.last_login ? `last sign-in ${E.timeAgo(a.last_login)}` : 'never signed in'}`)),
      canManage && a.id !== me.id ? h('button', { class: 'btn icon sm ghost', 'aria-label': 'Set password', title: 'Set a new password', html: icon('key'), onclick: () => resetPw(a) }) : null,
      canManage && a.id !== me.id ? h('button', { class: 'btn icon sm ghost danger', 'aria-label': 'Remove', html: icon('trash'), onclick: async () => {
        if (await E.confirmDialog(`Remove ${a.username}?`, 'They are signed out and can no longer open the admin panel.', { ok: 'Remove', danger: true })) { await api(`/api/admin/accounts/${a.id}`, { method: 'DELETE' }).catch(fail); Admin.refresh(); }
      } }) : null)));

    // ---- my devices
    const uaName = (ua = '') => `${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'} · ${/Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown'}`;
    const others = h('button', { class: 'btn', disabled: sessions.length < 2 }, iconEl('logout'), 'Sign out other devices');
    others.onclick = () => withBusy(others, async () => { try { const r = await api('/api/admin/account/signout-others', { body: {} }); toast(`${r.count} device(s) signed out`, 'success'); Admin.refresh(); } catch (e) { fail(e); } });

    const blur = E.toggle(sec.blurOnFocusLoss, 'Black out the video when the window loses focus');
    const dev = E.toggle(sec.blockDevtools, 'Black out when developer tools are opened');
    const maxv = E.input(sec.maxViewsPerKey, { type: 'number', min: '0' });
    const save = h('button', { class: 'btn primary' }, 'Save security');
    save.onclick = () => Admin.saveSettings('security', { blurOnFocusLoss: blur.checked, blockDevtools: dev.checked, maxViewsPerKey: Number(maxv.value) || 0 }, save);
    return [Admin.head('Admins & Security', 'Your secret admin login, who else can open this panel, and how paid videos are protected.'),
      h('div', { class: 'page' }, h('div', { class: 'split' },
        h('div', { class: 'stack' },
          Admin.panel('Your login', h('div', { class: 'form' },
            h('p', { class: 'desc', style: { margin: 0 } }, 'The admin panel opens only with this username and password — never with an email. Keep both secret.'),
            E.field('Username', uname, '3–32 letters, numbers, dot, dash or underscore.'),
            E.field('Current password', cur.el),
            E.field('New password', h('div', { style: { display: 'grid', gap: '10px' } }, npw.el, npw2.el), 'At least 10 characters. Changing it signs out every other device.'),
            h('div', { class: 'form-actions' }, saveMe))),
          Admin.panel('Your devices', h('div', { class: 'list' }, sessions.map((x) => h('div', { class: 'lrow' },
            h('div', { class: 'ic', html: icon(/iPhone|Android/.test(x.ua) ? 'phone' : 'globe') }),
            h('div', { class: 'tt' }, h('strong', {}, uaName(x.ua), x.current ? h('span', { class: 'chip good', style: { marginLeft: '8px', display: 'inline-flex', width: 'auto', verticalAlign: 'middle' } }, 'This device') : null),
              h('span', {}, `${x.ip || '—'} · active ${E.timeAgo(x.last_seen || x.created_at)}`))))),
            h('div', { class: 'form-actions', style: { marginTop: '12px' } }, others))),
        h('div', { class: 'stack' },
          Admin.panel('Admin accounts',
            h('p', { class: 'desc' }, canManage ? 'Owners can add admins, set their passwords and remove them.' : 'Only an owner can add or remove admins.'),
            list,
            canManage ? h('div', { class: 'form', style: { marginTop: '16px' } }, h('div', { class: 'row' }, E.field('Username', nu), E.field('Role', roleSeg)), E.field('Password', np.el), h('div', { class: 'form-actions' }, add)) : null),
          Admin.panel('Video protection', h('div', { class: 'form' }, blur, dev,
            E.field('Maximum viewing sessions per key', maxv, '0 = unlimited. A session counts once per 30 minutes.'),
            h('div', { class: 'secure-note', style: { fontSize: '13px', color: 'var(--muted)' } }, 'Keys only work while signed in with the buyer’s Google account, stream links expire and are tied to the login session, and the Drive file is never exposed. Browsers cannot fully block screen recording — for guaranteed black-screen capture, use a DRM video host (see README).'),
            h('div', { class: 'form-actions' }, save)))))),
    ];
  };

  /* ================= Reset data ================= */
  Admin.pages.reset = async () => {
    const { canReset, counts } = await api('/api/admin/reset');
    const OPTS = [
      ['logs', 'Activity logs', 'Every entry in Logs.', 'logs'],
      ['analytics', 'Visitor statistics', 'Visitors and page views on the Dashboard.', 'chart'],
      ['orders', 'Orders & redeem codes', 'All orders, their codes and discount-code usage. Revenue starts from zero.', 'receipt'],
      ['customers', 'Customer accounts', 'Everyone except admins — with their orders and codes.', 'users'],
      ['tasks', 'Tasks', 'Every card on the Tasks board.', 'tasks'],
      ['notify', '“Notify me” sign-ups', 'People waiting for Coming soon products.', 'bell'],
    ];
    const picked = new Set();
    const confirmIn = E.input('', { placeholder: 'Type RESET', autocomplete: 'off', style: { textTransform: 'uppercase', fontFamily: 'var(--mono)' } });
    const go = h('button', { class: 'btn danger solid' }, iconEl('trash'), 'Reset selected');
    const all = h('button', { class: 'btn' }, 'Select everything');
    const rows = OPTS.map(([k, label, desc, ic]) => {
      const t = E.toggle(false, '', (on) => { on ? picked.add(k) : picked.delete(k); });
      return h('div', { class: 'lrow' }, h('div', { class: 'ic', html: icon(ic) }), h('div', { class: 'tt' }, h('strong', {}, label), h('span', {}, `${desc} · ${counts[k]} now`)), t);
    });
    all.onclick = () => rows.forEach((r) => { const t = r.lastChild; if (!t.checked) { t.checked = true; t.querySelector('input').dispatchEvent(new Event('change')); } });
    go.onclick = () => withBusy(go, async () => {
      if (!picked.size) { toast('Choose what to reset', 'error'); return; }
      if (confirmIn.value.trim().toUpperCase() !== 'RESET') { toast('Type RESET to confirm', 'error'); confirmIn.focus(); return; }
      if (!(await E.confirmDialog('Delete for good?', 'This cannot be undone.', { ok: 'Reset', danger: true }))) return;
      try { await api('/api/admin/reset', { body: { what: [...picked], confirm: 'RESET' } }); toast('Done — data reset', 'success'); Admin.refresh(); } catch (e) { fail(e); }
    });
    const uEmail = E.input('', { type: 'email', placeholder: 'customer@gmail.com', autocomplete: 'off' });
    const uGo = h('button', { class: 'btn danger solid' }, iconEl('user'), 'Reset user');
    uGo.onclick = () => withBusy(uGo, async () => {
      const em = uEmail.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Enter a valid email', 'error'); uEmail.focus(); return; }
      if (!(await E.confirmDialog(`Reset ${em}?`, 'Deletes their account, profile, orders, redeem codes and sign-ups. They can sign in again as a new customer.', { ok: 'Reset user', danger: true }))) return;
      try { const r = await api('/api/admin/reset-user', { body: { email: em } }); toast(`Reset — ${r.found.orders} order(s), ${r.found.codes} code(s) removed`, 'success'); uEmail.value = ''; Admin.refresh(); } catch (e) { fail(e); }
    });
    return [Admin.head('Reset data', 'Start fresh — clear test orders, statistics and logs. Products, albums, texts and settings are never touched.'),
      h('div', { class: 'page' }, canReset
        ? [Admin.panel('Reset a user', h('p', { class: 'desc' }, 'Everything for one email: account, photo and name, orders, redeem codes, sessions.'),
          h('div', { class: 'input-group', style: { flexWrap: 'wrap' } }, uEmail, uGo)),
        Admin.panel('Choose what to clear', h('div', { class: 'list' }, rows),
          h('div', { class: 'input-group', style: { marginTop: '18px', flexWrap: 'wrap' } }, all, h('span', { style: { flex: 1 } }), confirmIn, go))]
        : h('div', { class: 'empty' }, iconEl('lock'), 'Only an owner admin can reset data.'))];
  };

  boot();
})();
