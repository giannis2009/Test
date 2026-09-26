/* =========================================================
   Ezro — public site: portfolio, shop, cart & checkout
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro;
  const { h, $, $$, icon, iconEl, money, api, toast, fail, sheet, segmented, withBusy, copy, auth } = E;

  const S = { site: null, products: [], media: [], cart: E.store.get('ezro-cart', []), code: E.store.get('ezro-code', '') };
  const saveCart = () => { E.store.set('ezro-cart', S.cart); renderNav(); };
  const params = new URLSearchParams(location.search);

  /* ---------- boot ---------- */
  async function boot() {
    try {
      const [site, prod, media] = await Promise.all([api('/api/public/site'), api('/api/public/products'), api('/api/public/media')]);
      S.site = site; S.products = prod.products; S.media = media.media;
    } catch (e) { fail(e); return; }
    E.setCurrency(S.site.checkout.currency);
    E.setTexts(S.site.texts);
    E.applyAppearance(S.site.appearance);
    // drop cart items that no longer exist / aren't buyable
    S.cart = S.cart.filter((id) => S.products.some((p) => p.id === id && p.status === 'active' && !p.soldOut));
    renderHero(); renderWork(); renderShop(); renderNav();
    $('#year').textContent = new Date().getFullYear();
    $$('[data-ic]').forEach((el) => el.replaceChildren(iconEl(el.dataset.ic)));
    E.watchTexts('home');
    await auth.load().catch(() => {});
    if (params.get('edit') === '1') {
      if (auth.user?.isAdmin) E.textEditMode('home'); else toast('Sign in as an admin to edit texts', 'error');
    } else if (window.top === window) E.track('/');
    openFromHash();
  }
  auth.onChange(() => renderNav());
  window.addEventListener('hashchange', openFromHash);
  function openFromHash() {
    const m = location.hash.match(/^#shop\/(.+)$/);
    if (m) { const p = S.products.find((x) => x.slug === decodeURIComponent(m[1])); if (p) openProduct(p); }
  }

  /* ---------- nav ---------- */
  function renderNav() {
    const box = $('#navActions');
    if (!box) return;
    const cartBtn = h('button', { class: 'btn icon ghost cart-btn', 'aria-label': 'Cart', onclick: openCart, html: icon('cart') });
    if (S.cart.length) cartBtn.append(h('span', { class: 'cart-count' }, S.cart.length));
    let acc;
    if (auth.user) {
      acc = h('button', { class: 'btn ghost account-btn', 'aria-label': 'Account' }, E.avatarEl(auth.user, 32));
      acc.onclick = () => E.popMenu(acc, (m) => {
        m.append(h('div', { class: 'menu-head' }, auth.user.email));
        m.append(h('a', { class: 'menu-item', href: '/watch' }, iconEl('play'), 'My library'));
        m.append(h('button', { class: 'menu-item', onclick: () => { E.closeMenus(); openOrders(); } }, iconEl('receipt'), 'My orders'));
        if (auth.user.isAdmin) m.append(h('a', { class: 'menu-item', href: '/admin' }, iconEl('dashboard'), 'Admin panel'));
        m.append(h('div', { class: 'menu-sep' }));
        m.append(h('button', { class: 'menu-item danger', onclick: () => { E.closeMenus(); auth.logout(); } }, iconEl('logout'), 'Sign out'));
      }, { align: 'right', minWidth: 230 });
    } else {
      acc = h('button', { class: 'btn sm primary', onclick: () => E.signInSheet('Sign in') }, 'Sign in');
    }
    box.replaceChildren(E.themeButton(), cartBtn, acc);
  }

  /* ---------- hero ---------- */
  function renderHero() {
    const { site, appearance, socials } = S.site;
    document.title = `${site.name} — ${site.tagline}`;
    $('#heroLogo').src = appearance.logoUrl || '/assets/logo.webp';
    $('#heroLogo').alt = site.name;
    $('#footerLogo').src = appearance.logoUrl || '/assets/logo.webp';
    $('#navIcon').src = appearance.faviconUrl || '/assets/favicon.png';
    $('#navName').textContent = site.name;
    $('#heroHandle').textContent = site.handle;
    $('#heroTagline').textContent = site.tagline;
    $('#heroBio').textContent = site.bio;
    $('#heroStatus').classList.toggle('hidden', !site.showStatus || !site.status);
    $('#heroStatusText').textContent = site.status;
    $('#footName').textContent = site.name;
    $('#footText').textContent = site.footer;
    const socialEls = () => socials.map((s) => h('a', {
      class: 'social', href: s.url, 'aria-label': s.name, title: s.name, html: icon(s.icon),
      ...(/^https?:/.test(s.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      onclick: (e) => { if (s.url === '#') { e.preventDefault(); toast('Coming soon'); } },
    }));
    $('#socials').replaceChildren(...socialEls());
    $('#footerSocials').replaceChildren(...socialEls());
  }

  /* ---------- work / gallery ---------- */
  let workCat = 'all';
  function renderWork() {
    const cats = S.site.categories.filter((c) => S.media.some((m) => m.category_id === c.id));
    const filter = $('#workFilter');
    filter.replaceChildren();
    if (cats.length) filter.append(segmented([['all', 'All'], ...cats.map((c) => [String(c.id), c.name])], workCat, (v) => { workCat = String(v); renderGallery(); }));
    renderGallery();
  }
  function renderGallery() {
    const g = $('#gallery');
    const items = S.media.filter((m) => workCat === 'all' || String(m.category_id) === workCat);
    if (!items.length) { g.replaceChildren(h('div', { class: 'empty' }, iconEl('image'), 'New work is coming soon.')); return; }
    g.replaceChildren(...items.map((m, i) => {
      const media = m.type === 'video'
        ? h('video', { src: m.url, poster: m.poster || null, muted: true, loop: true, playsinline: true, preload: 'metadata' })
        : h('img', { src: m.url, alt: m.title || '', loading: 'lazy' });
      const tile = h('figure', { class: 'tile', style: { margin: '0 0 14px' }, tabindex: '0' }, media,
        m.type === 'video' ? h('span', { class: 'play-badge', html: icon('play') }) : null,
        m.title ? h('figcaption', { class: 'tile-cap' }, m.title) : null);
      if (m.type === 'video') { tile.onmouseenter = () => media.play().catch(() => {}); tile.onmouseleave = () => media.pause(); }
      tile.onclick = () => lightbox(items, i);
      tile.onkeydown = (e) => e.key === 'Enter' && lightbox(items, i);
      return E.reveal(tile, (i % 6) * 60);
    }));
  }
  function lightbox(items, index) {
    let i = index;
    const stage = h('div');
    const cap = h('div', { class: 'lb-cap' });
    const close = () => { lb.classList.add('closing'); setTimeout(() => lb.remove(), 250); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    const show = () => {
      const m = items[i];
      stage.replaceChildren(m.type === 'video' ? h('video', { src: m.url, controls: true, autoplay: true, playsinline: true, loop: true }) : h('img', { src: m.url, alt: m.title || '' }));
      stage.firstChild.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.4,.64,1)' });
      cap.replaceChildren(m.title ? h('strong', {}, m.title) : '', m.caption ? h('p', {}, m.caption) : '');
    };
    const nav = (d) => { i = (i + d + items.length) % items.length; show(); };
    const lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' }, stage, cap,
      h('button', { class: 'btn icon lb-close', 'aria-label': 'Close', html: icon('close'), onclick: close }),
      items.length > 1 ? h('button', { class: 'btn icon lb-nav prev', 'aria-label': 'Previous', html: icon('chevron-left'), onclick: (e) => { e.stopPropagation(); nav(-1); } }) : null,
      items.length > 1 ? h('button', { class: 'btn icon lb-nav next', 'aria-label': 'Next', html: icon('chevron-right'), onclick: (e) => { e.stopPropagation(); nav(1); } }) : null);
    lb.onclick = (e) => { if (e.target === lb) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.append(lb); show();
  }

  /* ---------- shop ---------- */
  let shopCat = 'all';
  function renderShop() {
    const shop = S.site.shop;
    $('#shopTitle').textContent = shop.title;
    $('#shopSub').textContent = shop.subtitle;
    const cats = S.site.categories.filter((c) => S.products.some((p) => p.category_id === c.id));
    const filter = $('#shopFilter');
    filter.replaceChildren();
    if (cats.length > 1) filter.append(segmented([['all', 'All'], ...cats.map((c) => [String(c.id), c.name])], shopCat, (v) => { shopCat = String(v); renderProducts(); }));
    renderProducts();
  }
  const soonTimers = [];
  function renderProducts() {
    soonTimers.splice(0).forEach(clearInterval);
    const grid = $('#products');
    const list = S.products.filter((p) => shopCat === 'all' || String(p.category_id) === shopCat);
    if (!list.length) { grid.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, iconEl('bag'), 'Products are on the way.')); return; }
    grid.replaceChildren(...list.map((p, i) => E.reveal(productCard(p), (i % 4) * 70)));
  }
  function priceEl(p) {
    return h('div', { class: 'price' }, p.price_cents ? money(p.price_cents) : 'Free', p.compare_cents > p.price_cents ? h('s', {}, money(p.compare_cents)) : null);
  }
  function countdown(target) {
    const el = h('div', { class: 'countdown' });
    const tick = () => {
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s -= d * 86400; const hh = Math.floor(s / 3600); s -= hh * 3600; const m = Math.floor(s / 60); s -= m * 60;
      el.replaceChildren(...[[d, 'DAYS'], [hh, 'HRS'], [m, 'MIN'], [s, 'SEC']].map(([v, l]) => h('div', {}, String(v).padStart(2, '0'), h('small', {}, l))));
    };
    tick(); soonTimers.push(setInterval(tick, 1000));
    return el;
  }
  function productCard(p) {
    const soon = p.status === 'coming_soon';
    const off = p.compare_cents > p.price_cents ? Math.round((1 - p.price_cents / p.compare_cents) * 100) : 0;
    const media = h('div', { class: 'p-media' },
      p.cover_url ? h('img', { src: p.cover_url, alt: '', loading: 'lazy' }) : h('div', { class: 'ph', html: icon('box') }),
      h('div', { class: 'p-badges' },
        p.badge ? h('span', { class: 'chip brand' }, p.badge) : null,
        off && !soon ? h('span', { class: 'chip' }, `−${off}%`) : null,
        p.soldOut ? h('span', { class: 'chip' }, 'Sold out') : null,
        p.stockLeft && !p.soldOut ? h('span', { class: 'chip' }, `Only ${p.stockLeft} left`) : null),
      soon ? h('div', { class: 'soon-veil' }, h('strong', {}, 'Coming soon'), p.release_at && p.release_at > Date.now() ? countdown(p.release_at) : null) : null);
    const card = h('article', { class: `product ${soon ? 'soon' : ''}`, tabindex: '0' }, media,
      h('div', { class: 'p-body' },
        h('div', { class: 'p-title' }, p.title),
        p.subtitle ? h('div', { class: 'p-sub' }, p.subtitle) : null,
        h('div', { class: 'p-foot' }, soon ? h('span', { class: 'chip brand' }, iconEl('bell'), 'Notify me') : priceEl(p),
          !soon && !p.soldOut ? h('button', { class: 'btn icon sm primary', 'aria-label': `Add ${p.title} to cart`, html: icon('plus'), onclick: (e) => { e.stopPropagation(); addToCart(p, e.currentTarget); } }) : null)));
    card.onclick = () => { history.replaceState(null, '', `#shop/${encodeURIComponent(p.slug)}`); openProduct(p); };
    card.onkeydown = (e) => e.key === 'Enter' && card.click();
    return card;
  }

  function addToCart(p, fromEl) {
    if (S.cart.includes(p.id)) { toast('Already in your cart'); return; }
    S.cart.push(p.id); saveCart();
    toast(`${p.title} added to cart`, 'success');
    // fly-to-cart effect
    const target = $('.cart-btn');
    if (fromEl && target) {
      const a = fromEl.getBoundingClientRect(); const b = target.getBoundingClientRect();
      const dot = h('div', { style: { position: 'fixed', left: `${a.left + a.width / 2 - 8}px`, top: `${a.top + a.height / 2 - 8}px`, width: '16px', height: '16px', borderRadius: '50%', background: 'var(--brand-grad)', zIndex: 3000, pointerEvents: 'none' } });
      document.body.append(dot);
      dot.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(.4)`, opacity: 0.2 }], { duration: 650, easing: 'cubic-bezier(.5,-0.3,.6,1)' }).onfinish = () => dot.remove();
    }
  }

  /* ---------- product sheet ---------- */
  function embedUrl(u) {
    if (!u) return null;
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
    m = u.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }
  function openProduct(p) {
    const soon = p.status === 'coming_soon';
    const slides = [];
    const emb = embedUrl(p.preview_url);
    if (emb) slides.push(h('iframe', { src: emb, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, title: `${p.title} preview` }));
    else if (p.preview_url) slides.push(h('video', { src: p.preview_url, controls: true, playsinline: true, poster: p.cover_url || null, controlslist: 'nodownload' }));
    for (const src of [p.cover_url, ...(p.gallery || [])].filter(Boolean)) slides.push(h('img', { src, alt: '' }));
    const gal = slides.length ? h('div', { class: 'pv-gallery' }, slides) : null;
    const dots = slides.length > 1 ? h('div', { class: 'pv-dots' }, slides.map((_, i) => h('span', { class: i ? '' : 'on' }))) : null;
    if (gal && dots) gal.addEventListener('scroll', E.debounce(() => { const i = Math.round(gal.scrollLeft / gal.clientWidth); $$('span', dots).forEach((d, j) => d.classList.toggle('on', i === j)); }, 40));

    const cat = S.site.categories.find((c) => c.id === p.category_id);
    const body = [
      gal, dots,
      h('div', { class: 'pv-head' },
        h('div', {}, cat ? h('p', { class: 'eyebrow' }, cat.name) : null, h('h2', {}, p.title), p.subtitle ? h('p', { class: 'muted' }, p.subtitle) : null),
        soon ? null : priceEl(p)),
      soon && p.release_at && p.release_at > Date.now() ? h('div', { style: { margin: '6px 0 14px' } }, h('p', { class: 'label', style: { marginBottom: '8px' } }, 'Launches in'), (() => { const c = countdown(p.release_at); c.style.color = 'var(--text)'; $$('div', c).forEach((d) => { d.style.background = 'var(--surface-2)'; }); return c; })()) : null,
      p.description ? h('p', { class: 'pv-desc' }, p.description) : null,
      p.features?.length ? h('ul', { class: 'features' }, p.features.map((f) => h('li', {}, iconEl('check'), h('span', {}, f)))) : null,
      p.deliver_note ? h('div', { class: 'secure-note' }, iconEl('gift'), h('div', {}, h('strong', {}, 'What you get'), h('div', {}, p.deliver_note))) : null,
      p.hasVideo ? h('div', { class: 'secure-note' }, iconEl('shield'), h('div', {}, h('strong', {}, 'Private streaming'), h('div', {}, 'After payment you get a personal key. Watch it in your private Video Review page — the key only works with your Google account.'))) : null,
      p.tags?.length ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '14px' } }, p.tags.map((t) => h('span', { class: 'chip' }, `#${t}`))) : null,
    ];
    let foot;
    if (soon) {
      const nb = h('button', { class: 'btn primary lg block' }, iconEl('bell'), 'Notify me when it launches');
      nb.onclick = () => withBusy(nb, async () => {
        if (!auth.user && !(await E.signInSheet('Sign in to get notified'))) return;
        await api('/api/shop/notify', { body: { productId: p.id } }).then(() => toast('We will email you at launch', 'success')).catch(fail);
      });
      foot = [nb];
    } else if (p.soldOut) foot = [h('button', { class: 'btn lg block', disabled: true }, 'Sold out')];
    else {
      const add = h('button', { class: 'btn lg', onclick: (e) => addToCart(p, e.currentTarget) }, iconEl('cart'), 'Add to cart');
      const buy = h('button', { class: 'btn primary lg', style: { flex: 1 } }, 'Buy now', iconEl('arrow'));
      buy.onclick = () => { if (!S.cart.includes(p.id)) { S.cart.push(p.id); saveCart(); } s.close(); openCart(); };
      foot = [add, buy];
    }
    const s = sheet({ body, foot, size: 'wide', title: ' ', onClose: () => { if (location.hash.startsWith('#shop/')) history.replaceState(null, '', '#shop'); } });
  }

  /* ---------- cart & checkout ---------- */
  function openCart() {
    const s = sheet({ title: 'Your cart', drawer: true });
    const st = { step: 'cart', quote: null, method: null, terms: false };
    const steps = () => h('div', { class: 'steps' }, ['cart', 'pay', 'done'].map((k, i) => h('span', { class: ['cart', 'pay', 'done'].indexOf(st.step) >= i ? 'on' : '' })));

    async function refreshQuote() {
      if (!S.cart.length) { st.quote = null; return; }
      try { st.quote = await api('/api/shop/quote', { body: { productIds: S.cart, code: S.code } }); }
      catch (e) {
        if (S.code) { toast(e.message, 'error'); S.code = ''; E.store.set('ezro-code', ''); st.quote = await api('/api/shop/quote', { body: { productIds: S.cart } }).catch(() => null); }
        else { fail(e); st.quote = null; }
      }
    }
    function totals(q) {
      const c = S.site.checkout;
      return h('div', { class: 'totals' },
        h('div', {}, h('span', { class: 'muted' }, 'Subtotal'), h('span', {}, money(q.subtotal_cents))),
        q.discount_cents ? h('div', { class: 'disc' }, h('span', {}, `Discount (${q.discount_code})`), h('span', {}, `−${money(q.discount_cents)}`)) : null,
        q.tax_cents ? h('div', {}, h('span', { class: 'muted' }, `${c.taxLabel} ${c.taxPercent}%${c.taxIncluded ? ' incl.' : ''}`), h('span', {}, money(q.tax_cents))) : null,
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, money(q.total_cents))));
    }

    async function renderCart() {
      st.step = 'cart';
      s.setBody(h('div', { style: { display: 'grid', placeItems: 'center', padding: '40px' } }, h('span', { class: 'spinner' })));
      await refreshQuote();
      if (!S.cart.length || !st.quote) {
        s.setBody(h('div', { class: 'empty', style: { marginTop: '8px' } }, iconEl('cart'), 'Your cart is empty.', h('a', { class: 'btn sm', href: '#shop', onclick: () => s.close() }, 'Browse the shop')));
        s.setFoot([]); return;
      }
      const codeIn = E.input(S.code, { placeholder: 'Discount code', autocomplete: 'off', style: { textTransform: 'uppercase' } });
      const apply = h('button', { class: 'btn' }, S.code ? 'Remove' : 'Apply');
      apply.onclick = () => withBusy(apply, async () => {
        if (S.code) { S.code = ''; } else {
          const code = codeIn.value.trim();
          if (!code) return;
          try { await api('/api/shop/quote', { body: { productIds: S.cart, code } }); S.code = code.toUpperCase(); toast('Discount applied', 'success'); } catch (e) { fail(e); return; }
        }
        E.store.set('ezro-code', S.code); renderCart();
      });
      codeIn.onkeydown = (e) => e.key === 'Enter' && apply.click();
      s.setBody([steps(),
        ...st.quote.items.map((it) => h('div', { class: 'cart-item' },
          it.cover_url ? h('img', { src: it.cover_url, alt: '' }) : h('div', { class: 'thumb', html: icon('box') }),
          h('div', { class: 'ci-t' }, h('strong', {}, it.title), h('span', { class: 'muted' }, money(it.price_cents))),
          h('button', { class: 'btn icon sm ghost', 'aria-label': 'Remove', html: icon('trash'), onclick: () => { S.cart = S.cart.filter((id) => id !== it.product_id); saveCart(); renderCart(); } }))),
        h('div', { class: 'input-group', style: { marginTop: '16px' } }, codeIn, apply),
        totals(st.quote)]);
      s.setFoot([h('button', { class: 'btn primary lg block', onclick: renderPay }, S.site.checkout.buttonText || 'Checkout', iconEl('arrow'))]);
    }

    async function renderPay() {
      if (!auth.user) {
        const u = await E.signInSheet('Sign in to pay');
        if (!u) return;
      }
      st.step = 'pay';
      const c = S.site.checkout;
      const q = st.quote;
      const opts = [];
      if (q.total_cents === 0) opts.push({ id: 'free', name: 'Free', desc: 'No payment needed', ic: 'gift' });
      else {
        if (c.paypal) opts.push({ id: 'paypal', name: c.paypal.label || 'PayPal', desc: c.paypal.description, ic: 'paypal', cls: 'paypal' });
        for (const m of S.site.paymentMethods) opts.push({ id: `pm:${m.id}`, name: m.name, desc: m.description, ic: m.icon });
        if (c.devPay) opts.push({ id: 'dev', name: 'Test payment', desc: 'Local test mode only — simulates a paid order', ic: 'bolt' });
      }
      if (!st.method || !opts.some((o) => o.id === st.method)) st.method = opts[0]?.id;
      const payArea = h('div');
      const optEls = opts.map((o) => {
        const el = h('button', { type: 'button', class: `pay-opt ${o.cls || ''} ${st.method === o.id ? 'on' : ''}` },
          h('span', { class: 'po-ic', html: icon(o.ic) }), h('span', { class: 'po-t' }, h('strong', {}, o.name), o.desc ? h('span', {}, o.desc) : null), h('span', { class: 'radio' }));
        el.onclick = () => { st.method = o.id; optEls.forEach((x) => x.classList.toggle('on', x === el)); renderAction(); };
        return el;
      });
      const terms = c.requireTerms ? E.h('label', { class: 'check', style: { marginTop: '16px' } }, (() => { const cb = h('input', { type: 'checkbox' }); cb.checked = st.terms; cb.onchange = () => { st.terms = cb.checked; renderAction(); }; return cb; })(), h('span', {}, c.termsText)) : null;
      s.setBody([steps(),
        h('div', { class: 'cart-item', style: { borderBottom: 0, paddingTop: 0 } }, E.avatarEl(auth.user, 40), h('div', { class: 'ci-t' }, h('strong', {}, auth.user.name || auth.user.email), h('span', { class: 'muted' }, auth.user.email))),
        h('p', { class: 'label', style: { margin: '6px 0 10px' } }, 'Payment method'),
        opts.length ? h('div', { class: 'pay-options' }, optEls) : h('div', { class: 'empty' }, 'No payment methods are available right now.'),
        terms, totals(q), payArea]);
      s.setFoot([h('button', { class: 'btn', onclick: renderCart }, iconEl('chevron-left'), 'Back'), h('div', { class: 'spacer' })]);

      function renderAction() {
        payArea.replaceChildren();
        const blocked = c.requireTerms && !st.terms;
        if (!st.method) return;
        if (st.method === 'paypal') {
          if (blocked) { payArea.append(h('p', { class: 'muted', style: { textAlign: 'center', fontSize: '13px' } }, 'Accept the terms to show the PayPal button.')); return; }
          const slot = h('div', { class: 'paypal-slot' }, h('div', { style: { display: 'grid', placeItems: 'center' } }, h('span', { class: 'spinner' })));
          payArea.append(slot);
          renderPayPal(slot);
          return;
        }
        const label = st.method === 'free' ? 'Get it now' : st.method === 'dev' ? `Pay ${money(q.total_cents)} (test)` : `Place order · ${money(q.total_cents)}`;
        const btn = h('button', { class: 'btn primary lg block', style: { marginTop: '14px' }, disabled: blocked }, label);
        btn.onclick = () => withBusy(btn, async () => {
          try {
            const r = await api('/api/shop/checkout', { body: { productIds: S.cart, code: S.code, method: st.method, acceptTerms: st.terms } });
            if (r.order.status === 'paid') done(r.order); else pending(r.order, r.instructions);
          } catch (e) { fail(e); }
        });
        payArea.append(btn);
      }
      renderAction();
    }

    let paypalScript = null;
    function loadPayPal() {
      const c = S.site.checkout;
      if (window.paypal?.Buttons) return Promise.resolve();
      paypalScript ||= new Promise((res, rej) => {
        const u = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(c.paypal.clientId)}&currency=${encodeURIComponent(c.currency)}&intent=capture&components=buttons`;
        const el = h('script', { src: u, 'data-namespace': 'paypal' });
        el.onload = res; el.onerror = () => rej(new Error('PayPal could not load. Check your connection or ad-blocker.'));
        document.head.append(el);
      });
      return paypalScript;
    }
    async function renderPayPal(slot) {
      try { await loadPayPal(); } catch (e) { slot.replaceChildren(h('div', { class: 'empty' }, e.message)); return; }
      slot.replaceChildren();
      let orderId = null;
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', color: 'gold', label: 'pay', height: 48 },
        createOrder: async () => {
          const r = await api('/api/shop/checkout', { body: { productIds: S.cart, code: S.code, method: 'paypal', acceptTerms: st.terms } }).catch((e) => { fail(e); throw e; });
          orderId = r.order.id;
          if (r.order.status === 'paid') { done(r.order); throw new Error('free'); }
          return r.paypalOrderId;
        },
        onApprove: async () => {
          s.setBody(h('div', { class: 'success' }, h('span', { class: 'spinner', style: { margin: '30px auto' } }), h('p', { class: 'muted' }, 'Confirming your payment with PayPal…')));
          s.setFoot([]);
          try { const r = await api('/api/shop/paypal/capture', { body: { orderId } }); done(r.order); }
          catch (e) { fail(e); renderPay(); }
        },
        onCancel: () => { if (orderId) api('/api/shop/paypal/cancel', { body: { orderId } }).catch(() => {}); toast('Payment cancelled'); },
        onError: (err) => { if (String(err?.message) !== 'free') toast('PayPal ran into a problem. Please try again.', 'error'); },
      }).render(slot);
    }

    function done(order) {
      st.step = 'done';
      S.cart = []; S.code = ''; E.store.set('ezro-code', ''); saveCart();
      const c = S.site.checkout;
      s.setBody([steps(), h('div', { class: 'success' },
        h('div', { html: '<svg class="check-anim" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40"/><path d="M27 45l12 12 23-25"/></svg>' }),
        h('h3', {}, c.successTitle), h('p', { class: 'muted', style: { marginTop: '6px' } }, c.successMessage),
        h('p', { class: 'chip', style: { marginTop: '14px' } }, `Order ${order.number}`)),
      order.keys?.length ? h('div', { class: 'keybox' }, h('div', { class: 'label' }, order.keys.length > 1 ? 'Your access keys' : 'Your access key'),
        order.keys.map((k) => h('div', {}, h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '8px' } }, k.product_title),
          h('div', { class: 'k' }, h('span', {}, k.key), h('button', { class: 'btn icon sm ghost', 'aria-label': 'Copy key', html: icon('copy'), onclick: () => copy(k.key) }))))) : null]);
      s.setFoot([h('a', { class: 'btn', href: `/invoice/${encodeURIComponent(order.number)}`, target: '_blank' }, iconEl('invoice'), 'Invoice'),
        h('a', { class: 'btn primary', style: { flex: 1 }, href: '/watch' }, iconEl('play'), 'Watch now')]);
      for (let i = 0; i < 26; i++) confetti();
    }
    function pending(order, instructions) {
      st.step = 'done';
      S.cart = []; S.code = ''; E.store.set('ezro-code', ''); saveCart();
      s.setBody([steps(), h('div', { class: 'success' },
        h('div', { class: 'avatar', style: { width: '64px', height: '64px', margin: '0 auto 14px' }, html: icon('clock') }),
        h('h3', {}, 'Order placed'), h('p', { class: 'muted', style: { margin: '6px 0 16px' } }, `Order ${order.number} · ${money(order.total_cents)} — complete the payment below. Your key is sent as soon as it's confirmed.`)),
      h('div', { class: 'instructions' }, instructions),
      h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '12px' } }, 'We also emailed you these instructions.')]);
      s.setFoot([h('button', { class: 'btn', onclick: () => copy(instructions) }, iconEl('copy'), 'Copy'), h('button', { class: 'btn primary', style: { flex: 1 }, onclick: () => s.close() }, 'Done')]);
    }
    renderCart();
  }

  function confetti() {
    const colors = ['#905abd', '#b491dc', '#ffffff', '#f0b24a', '#34c77b'];
    const c = h('div', { style: { position: 'fixed', zIndex: 3000, left: `${50 + (Math.random() - 0.5) * 20}vw`, top: '40vh', width: '8px', height: '12px', borderRadius: '2px', background: colors[Math.floor(Math.random() * colors.length)], pointerEvents: 'none' } });
    document.body.append(c);
    const x = (Math.random() - 0.5) * 700; const y = -300 - Math.random() * 300;
    c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${x}px, ${y}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${x * 1.2}px, ${y + 900}px) rotate(${Math.random() * 1440}deg)`, opacity: 0 }],
      { duration: 1800 + Math.random() * 800, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
  }

  /* ---------- my orders ---------- */
  async function openOrders() {
    const s = sheet({ title: 'My orders' });
    try {
      const { orders } = await api('/api/shop/my');
      if (!orders.length) { s.setBody(h('div', { class: 'empty' }, iconEl('receipt'), 'No orders yet.')); return; }
      s.setBody(orders.map((o) => h('div', { class: 'cart-item' },
        h('div', { class: 'thumb', html: icon(o.status === 'paid' ? 'check' : 'clock') }),
        h('div', { class: 'ci-t' }, h('strong', {}, `${o.number} · ${money(o.total_cents, o.currency)}`), h('span', { class: 'muted' }, `${o.items.map((i) => i.title).join(', ')} · ${E.fmtDate(o.created_at)}`)),
        h('span', { class: `chip ${o.status === 'paid' ? 'good' : 'warn'}` }, o.status === 'paid' ? 'Paid' : 'Pending'),
        h('a', { class: 'btn icon sm ghost', href: `/invoice/${encodeURIComponent(o.number)}`, target: '_blank', 'aria-label': 'Invoice', html: icon('invoice') }))));
    } catch (e) { fail(e); s.close(); }
  }

  boot();
})();
