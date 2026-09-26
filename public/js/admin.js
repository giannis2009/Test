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
    ['Store', [['orders', 'Orders', 'receipt'], ['products', 'Products', 'box'], ['discounts', 'Discounts', 'percent'], ['payments', 'Payments & Checkout', 'card'], ['invoice', 'Invoice', 'invoice']]],
    ['Content', [['media', 'Categories & Media', 'image'], ['socials', 'Social media', 'share'], ['texts', 'Texts', 'type'], ['appearance', 'Appearance', 'palette']]],
    ['Workspace', [['tasks', 'Tasks', 'tasks'], ['customers', 'Customers', 'users']]],
    ['System', [['security', 'Admins & Security', 'shield'], ['logs', 'Logs', 'logs']]],
  ];

  /* ---------- shared helpers for pages ---------- */
  Admin.head = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), actions.length ? h('div', { class: 'acts' }, actions) : null);
  Admin.panel = (title, ...kids) => h('section', { class: 'panel' }, title ? h('div', { class: 'panel-title' }, h('span', { class: 'dot' }), typeof title === 'string' ? h('span', {}, title) : title) : null, ...kids);
  Admin.stat = (k, v, cls = '', s = '') => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: `v ${cls}` }, v), s ? h('div', { class: 's' }, s) : null);
  Admin.btn = (label, ic, onclick, cls = '') => h('button', { class: `btn ${cls}`, onclick }, ic ? iconEl(ic) : null, label);
  Admin.iconPicker = (value, onPick, { brands = true } = {}) => {
    const names = [...(brands ? E.BRANDS : []), ...E.ICONS];
    const grid = h('div', { class: 'icon-grid' });
    const draw = () => grid.replaceChildren(...names.map((n) => h('button', { type: 'button', class: n === grid.value ? 'on' : '', title: n, 'aria-label': n, html: icon(n), onclick: () => { grid.value = n; draw(); onPick?.(n); } })));
    grid.value = value; draw();
    return grid;
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
      h('div', { class: 'side-foot' }, E.avatarEl(Admin.me, 34), h('div', { class: 'who' }, h('strong', {}, Admin.me.name || 'Admin'), h('span', {}, Admin.me.email)),
        E.themeButton(), h('button', { class: 'btn icon ghost', 'aria-label': 'Sign out', html: icon('logout'), onclick: async () => { await E.auth.logout(); location.href = '/'; } })));
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

  async function boot() {
    try { await E.auth.load(); } catch (e) { fail(e); }
    Admin.me = E.auth.user;
    if (!Admin.me) return gate('Sign in to the admin panel', true);
    if (!Admin.me.isAdmin) return gate(`${Admin.me.email} is not an admin.`, false);
    Admin.site = await api('/api/public/site').catch(() => null);
    if (Admin.site) { E.setCurrency(Admin.site.checkout.currency); E.applyAppearance({ ...Admin.site.appearance, orbs: false, grid: false }); }
    shell();
    window.addEventListener('hashchange', route);
    route();
  }
  function gate(msg, canSignIn) {
    const slot = h('div', { style: { marginTop: '18px' } });
    root.replaceChildren(h('div', { style: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px' } },
      h('div', { class: 'panel', style: { width: 'min(440px,100%)', textAlign: 'center', padding: '32px' } },
        h('img', { src: '/assets/logo.webp', alt: 'Ezro', style: { width: '150px', margin: '0 auto 18px' } }),
        h('h2', { style: { fontSize: '22px' } }, msg),
        h('p', { class: 'muted', style: { marginTop: '6px' } }, canSignIn ? 'Use an admin Google account.' : 'Ask the owner to add your email in Admins & Security.'),
        slot,
        !canSignIn ? h('button', { class: 'btn', style: { marginTop: '16px' }, onclick: async () => { await E.auth.logout(); boot(); } }, 'Use another account') : null)));
    if (canSignIn) requestAnimationFrame(() => E.renderSignIn(slot, () => boot()));
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
    const [a, sec] = await Promise.all([api('/api/admin/admins'), api('/api/admin/settings/security')]);
    const email = E.input('', { type: 'email', placeholder: 'name@gmail.com' });
    const add = h('button', { class: 'btn primary' }, iconEl('plus'), 'Add admin');
    add.onclick = () => withBusy(add, async () => { try { await api('/api/admin/admins', { body: { email: email.value } }); toast('Admin added', 'success'); Admin.refresh(); } catch (e) { fail(e); } });
    const wm = E.toggle(sec.watermark, 'Moving watermark with the buyer’s email');
    const blur = E.toggle(sec.blurOnFocusLoss, 'Black out the video when the window loses focus');
    const dev = E.toggle(sec.blockDevtools, 'Black out when developer tools are opened');
    const maxv = E.input(sec.maxViewsPerKey, { type: 'number', min: '0' });
    const save = h('button', { class: 'btn primary' }, 'Save security');
    save.onclick = () => Admin.saveSettings('security', { watermark: wm.checked, blurOnFocusLoss: blur.checked, blockDevtools: dev.checked, maxViewsPerKey: Number(maxv.value) || 0 }, save);
    return [Admin.head('Admins & Security', 'Who can open this panel, and how paid videos are protected.'),
      h('div', { class: 'page' }, h('div', { class: 'split' },
        Admin.panel('Admins',
          h('p', { class: 'desc' }, 'Owners are set in the server .env (ADMIN_EMAILS) and can add or remove other admins.'),
          h('div', { class: 'list' },
            a.owners.map((o) => h('div', { class: 'lrow' }, h('div', { class: 'ic', html: icon('shield') }), h('div', { class: 'tt' }, h('strong', {}, o), h('span', {}, 'Owner')))),
            a.admins.map((x) => h('div', { class: 'lrow' }, h('div', { class: 'ic', html: icon('user') }), h('div', { class: 'tt' }, h('strong', {}, x.email), h('span', {}, `Added ${E.fmtDate(x.added_at)} by ${x.added_by || '—'}`)),
              a.canManage ? h('button', { class: 'btn icon sm ghost danger', 'aria-label': 'Remove', html: icon('trash'), onclick: async () => { if (await E.confirmDialog('Remove admin?', x.email, { ok: 'Remove', danger: true })) { await api(`/api/admin/admins/${encodeURIComponent(x.email)}`, { method: 'DELETE' }).catch(fail); Admin.refresh(); } } }) : null))),
          a.canManage ? h('div', { class: 'input-group', style: { marginTop: '14px' } }, email, add) : null),
        Admin.panel('Video protection', h('div', { class: 'form' }, wm, blur, dev,
          E.field('Maximum viewing sessions per key', maxv, '0 = unlimited. A session counts once per 30 minutes.'),
          h('div', { class: 'secure-note', style: { fontSize: '13px', color: 'var(--muted)' } }, 'Keys only work while signed in with the buyer’s Google account, stream links expire and are tied to the login session, and the Drive file is never exposed. Browsers cannot fully block screen recording — for guaranteed black-screen capture, use a DRM video host (see README).'),
          h('div', { class: 'form-actions' }, save))))),
    ];
  };

  boot();
})();
