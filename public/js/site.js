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
      S.site = site; S.products = prod.products; S.media = media.media; S.albums = media.albums || [];
    } catch (e) { fail(e); return; }
    E.setCurrency(S.site.checkout.currency);
    E.setTexts(S.site.texts);
    E.applyAppearance(S.site.appearance);
    // drop cart items that no longer exist / aren't buyable
    S.cart = S.cart.filter((id) => S.products.some((p) => p.id === id && p.status === 'active' && !p.soldOut));
    renderHero(); buildNavCats(); renderWork(); renderShop(); renderNav();
    $('#year').textContent = new Date().getFullYear();
    $$('[data-ic]').forEach((el) => el.replaceChildren(iconEl(el.dataset.ic)));
    E.watchTexts('home');
    await auth.load().catch(() => {});
    if (params.get('edit') === '1') {
      if (auth.user?.isAdmin) E.textEditMode('home'); else toast('Sign in as an admin to edit texts', 'error');
    } else if (window.top === window) E.track('/');
    const legacy = location.hash.match(/^#shop\/(.+)$/); // old links: /#shop/slug
    if (legacy) history.replaceState({}, '', `/product/${legacy[1]}`);
    route();
    heroScroll();
  }
  auth.onChange(() => renderNav());
  // in-page links (#work, #shop) also work from a product page
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || location.pathname === '/' || a.getAttribute('href') === '#') return;
    e.preventDefault();
    navigate('/');
    setTimeout(() => $(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }), 120);
  });

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
    const watch = h('a', { class: 'btn icon ghost', href: '/watch', 'aria-label': 'Video Review', title: 'Video Review', html: icon('play') });
    box.replaceChildren(E.themeButton(), watch, cartBtn, acc);
  }

  /* ---------- centred category navigation ---------- */
  let navSeg = null;
  function buildNavCats() {
    const cats = S.site.categories.filter((c) => S.media.some((m) => m.category_id === c.id) || S.albums.some((a) => a.category_id === c.id) || S.products.some((p) => p.category_id === c.id));
    navSeg = segmented([['all', 'All'], ...cats.map((c) => [String(c.id), c.name])], cat, (v) => {
      if (location.pathname !== '/') navigate('/');
      setCategory(String(v), true);
    }, { cls: 'nav-seg' });
    $('#navCats').replaceChildren(navSeg);
    // fade the right edge only when the categories don't fit (small phones)
    new ResizeObserver(() => $('#navCats').classList.toggle('overflow', navSeg.scrollWidth > navSeg.clientWidth + 1)).observe(navSeg);
    // the nav becomes a little more solid once the page scrolls
    const nav = $('.nav');
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- Apple-style motion ---------- */
  // Hero logo gently shrinks, blurs and fades as you scroll past it.
  function heroScroll() {
    const hero = $('.hero'); const logo = $('.hero-logo');
    if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      if ($('#homeView').classList.contains('hidden')) return;
      const t = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight * 0.9)));
      logo.style.transform = `translateY(${t * 60}px) scale(${1 - t * 0.18})`;
      logo.style.opacity = String(1 - t * 0.85);
      logo.style.filter = `blur(${t * 6}px)`;
      hero.style.setProperty('--hero-t', t);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }
  // Apple TV-style tilt with a soft light reflection (mouse / trackpad only).
  function tilt(el) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glare = h('span', { class: 'glare' });
    el.append(glare);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-6px)`;
      glare.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,.22), transparent 55%)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; glare.style.background = ''; });
  }

  /* ---------- hero ---------- */
  function renderHero() {
    const { site, appearance, socials } = S.site;
    document.title = `${site.name} — ${site.tagline}`;
    $('#heroLogo').src = appearance.logoUrl || '/assets/logo.webp';
    $('#heroLogo').alt = site.name;
    $('#footerLogo').src = appearance.logoUrl || '/assets/logo.webp';
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
  let cat = 'all';
  // One category filter drives the nav, the portfolio and the shop.
  function setCategory(id, scroll) {
    cat = String(id);
    navSeg?.set(cat);
    renderGallery(); renderProducts();
    const c = S.site.categories.find((x) => String(x.id) === cat);
    $('#workLabel').textContent = c ? c.name : '';
    $('#shopLabel').textContent = c ? c.name : '';
    if (scroll) {
      const hasWork = S.media.some((m) => cat === 'all' || String(m.category_id) === cat);
      const target = hasWork ? $('#work') : $('#shop');
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), location.pathname === '/' ? 0 : 60);
    }
  }
  function renderWork() {
    renderGallery();
  }
  function renderGallery() {
    const g = $('#gallery');
    const inCat = (x) => cat === 'all' || String(x.category_id) === cat;
    const albums = S.albums.filter(inCat);
    const items = S.media.filter((m) => inCat(m) && !m.album_id);
    const ab = $('#albums');
    ab.replaceChildren(...albums.map((a, i) => E.reveal(albumCard(a), (i % 6) * 60)));
    ab.classList.toggle('hidden', !albums.length);
    if (!items.length) { g.replaceChildren(albums.length ? '' : h('div', { class: 'empty' }, iconEl('image'), 'New work is coming soon.')); return; }
    g.replaceChildren(...items.map((m, i) => {
      const media = m.type === 'video'
        ? h('video', { src: m.url, poster: m.poster || null, muted: true, loop: true, playsinline: true, preload: 'metadata' })
        : h('img', { src: m.url, alt: m.title || '', loading: 'lazy' });
      const tile = h('figure', { class: 'tile', style: { margin: '0 0 14px' }, tabindex: '0' }, media,
        m.type === 'video' ? h('span', { class: 'play-badge', html: icon('play') }) : null,
        m.title ? h('figcaption', { class: 'tile-cap' }, m.title) : null);
      if (m.type === 'video') { tile.onmouseenter = () => media.play().catch(() => {}); tile.onmouseleave = () => media.pause(); }
      tile.onclick = () => lightbox(items, i);
      tilt(tile);
      tile.onkeydown = (e) => e.key === 'Enter' && lightbox(items, i);
      return E.reveal(tile, (i % 6) * 60);
    }));
  }
  // Album card: the cover + title + photo count; opens the album page.
  function albumCard(a) {
    const cover = a.cover_url || a.first_url;
    const catName = S.site.categories.find((c) => c.id === a.category_id)?.name;
    const card = h('a', { class: 'album', href: `/album/${a.id}` },
      h('div', { class: 'album-cover' }, cover ? h('img', { src: cover, alt: '', loading: 'lazy' }) : h('div', { class: 'ph', html: icon('image') }),
        h('span', { class: 'album-count' }, iconEl('image'), `${a.count}`)),
      h('div', { class: 'album-meta' }, catName ? h('span', { class: 'eyebrow' }, catName) : null, h('strong', {}, a.title),
        h('span', { class: 'album-open' }, 'View album', iconEl('arrow'))));
    card.onclick = (e) => { e.preventDefault(); const img = card.querySelector('img'); if (img) img.style.viewTransitionName = 'product-hero'; navigate(`/album/${a.id}`, { fromHome: location.pathname === '/' }); };
    tilt(card);
    return card;
  }
  function renderAlbumPage(a) {
    pageCleanup?.();
    const view = $('#productView');
    const photos = S.media.filter((m) => m.album_id === a.id);
    const catObj = S.site.categories.find((c) => c.id === a.category_id);
    const cover = a.cover_url || a.first_url;
    document.title = `${a.title} — ${S.site.site.name}`;
    const others = S.albums.filter((x) => x.id !== a.id && x.category_id === a.category_id).slice(0, 3);
    view.replaceChildren(h('div', { class: 'pp album-page' },
      h('div', { class: 'pp-top' }, h('button', { class: 'btn sm', onclick: () => (history.state?.fromHome ? history.back() : navigate('/')) }, iconEl('chevron-left'), 'Back'),
        catObj ? h('button', { class: 'crumb', onclick: () => { navigate('/'); setCategory(String(catObj.id), true); } }, catObj.name) : null),
      h('header', { class: 'album-hero' },
        cover ? h('img', { src: cover, alt: '', style: { viewTransitionName: 'product-hero' } }) : null,
        h('div', { class: 'album-hero-text' }, catObj ? h('p', { class: 'eyebrow' }, catObj.name) : null, h('h1', {}, a.title),
          a.description ? h('p', {}, a.description) : null, h('span', { class: 'chip' }, iconEl('image'), `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`))),
      photos.length ? h('div', { class: 'gallery album-grid' }, photos.map((m, i) => {
        const media = m.type === 'video' ? h('video', { src: m.url, poster: m.poster || null, muted: true, loop: true, playsinline: true, preload: 'metadata' }) : h('img', { src: m.url, alt: m.title || '', loading: 'lazy' });
        const tile = h('figure', { class: 'tile', style: { margin: '0 0 14px' }, tabindex: '0' }, media,
          m.type === 'video' ? h('span', { class: 'play-badge', html: icon('play') }) : null);
        if (m.type === 'video') { tile.onmouseenter = () => media.play().catch(() => {}); tile.onmouseleave = () => media.pause(); }
        tile.onclick = () => lightbox(photos, i);
        tile.onkeydown = (e) => e.key === 'Enter' && lightbox(photos, i);
        tilt(tile);
        return E.reveal(tile, (i % 6) * 50);
      })) : h('div', { class: 'empty' }, iconEl('image'), 'Photos are coming soon.'),
      others.length ? h('div', { class: 'pp-more' }, h('h2', {}, 'More albums'), h('div', { class: 'albums' }, others.map(albumCard))) : null));
    pageCleanup = null;
    E.applyTexts(view, 'home');
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
  function renderShop() {
    const shop = S.site.shop;
    $('#shopTitle').textContent = shop.title;
    $('#shopSub').textContent = shop.subtitle;
    renderProducts();
  }
  const soonTimers = [];
  function renderProducts() {
    soonTimers.splice(0).forEach(clearInterval);
    const grid = $('#products');
    const list = S.products.filter((p) => cat === 'all' || String(p.category_id) === cat);
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
    card.onclick = () => openProduct(p, card.querySelector('.p-media img'));
    tilt(card);
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

  /* ---------- product page (/product/:slug) with auto-advancing slideshow ---------- */
  function embedUrl(u) {
    if (!u) return null;
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
    m = u.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }
  let pageCleanup = null;
  function slideshow(p) {
    const items = [];
    for (const src of [p.cover_url, ...(p.gallery || [])].filter(Boolean)) items.push({ type: /\.(mp4|webm|mov)$/i.test(src) ? 'video' : 'img', src });
    const emb = embedUrl(p.preview_url);
    if (emb) items.push({ type: 'embed', src: emb });
    else if (p.preview_url) items.push({ type: 'video', src: p.preview_url, controls: true });
    if (!items.length) return { el: h('div', { class: 'ss ss-empty', html: icon('box') }), stop() {} };

    const DUR = 5000;
    let i = 0; let timer = null; let started = 0; let paused = false; let left = DUR;
    const slides = items.map((it, n) => {
      const media = it.type === 'embed' ? h('iframe', { src: n === 0 ? it.src : 'about:blank', 'data-src': it.src, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, title: `${p.title} preview` })
        : it.type === 'video' ? h('video', { src: it.src, muted: !it.controls, loop: true, playsinline: true, controls: !!it.controls, controlslist: 'nodownload', poster: p.cover_url || null })
          : h('img', { src: it.src, alt: `${p.title} ${n + 1}` });
      return h('div', { class: `ss-slide ${n === 0 ? 'on' : ''}`, dataset: { type: it.type } }, media);
    });
    if (slides[0].firstChild.tagName === 'IMG') slides[0].firstChild.style.viewTransitionName = 'product-hero';
    const bars = items.length > 1 ? h('div', { class: 'ss-bars' }, items.map((_, n) => h('button', { type: 'button', 'aria-label': `Slide ${n + 1}`, onclick: () => go(n) }, h('span')))) : null;
    const prev = h('button', { class: 'ss-btn prev', 'aria-label': 'Previous', html: icon('chevron-left'), onclick: () => go(i - 1) });
    const next = h('button', { class: 'ss-btn next', 'aria-label': 'Next', html: icon('chevron-right'), onclick: () => go(i + 1) });
    const counter = h('span', { class: 'ss-count' });
    const stage = h('div', { class: 'ss-stage' }, slides);
    const thumbs = items.length > 1 ? h('div', { class: 'ss-thumbs' }, items.map((it, n) => h('button', { type: 'button', class: n === 0 ? 'on' : '', 'aria-label': `Show slide ${n + 1}`, onclick: () => go(n) },
      it.type === 'img' ? h('img', { src: it.src, alt: '' }) : h('span', { html: icon('play') })))) : null;
    const el = h('div', { class: 'ss' }, h('div', { class: 'ss-frame' }, stage, bars, items.length > 1 ? [prev, next, counter] : null), thumbs);

    function setBars() {
      if (!bars) return;
      [...bars.children].forEach((b, n) => {
        const f = b.firstChild;
        f.style.transition = 'none';
        f.style.width = n < i ? '100%' : '0%';
        if (n === i && !paused && isAuto()) { f.offsetWidth; f.style.transition = `width ${left}ms linear`; f.style.width = '100%'; }
        else if (n === i) f.style.width = `${(1 - left / DUR) * 100}%`;
      });
    }
    const isAuto = () => items[i].type === 'img';
    function schedule() {
      clearTimeout(timer);
      if (items.length < 2 || paused || !isAuto()) { setBars(); return; }
      started = Date.now();
      timer = setTimeout(() => go(i + 1), left);
      setBars();
    }
    function go(n) {
      const to = (n + items.length) % items.length;
      if (to === i) return;
      const dir = n > i ? 1 : -1;
      const from = slides[i]; const target = slides[to];
      from.classList.remove('on'); from.classList.toggle('out-left', dir > 0); from.classList.toggle('out-right', dir < 0);
      target.classList.remove('out-left', 'out-right'); target.style.setProperty('--dir', dir); target.classList.add('on');
      from.querySelector('video')?.pause();
      const ifr = target.querySelector('iframe'); if (ifr && ifr.src === 'about:blank') ifr.src = ifr.dataset.src;
      const v = target.querySelector('video'); if (v && v.muted) v.play().catch(() => {});
      i = to; left = DUR;
      counter.textContent = `${i + 1} / ${items.length}`;
      thumbs && [...thumbs.children].forEach((t, k) => t.classList.toggle('on', k === i));
      thumbs?.children[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      schedule();
    }
    counter.textContent = `1 / ${items.length}`;
    const pause = () => { if (paused) return; paused = true; left = Math.max(300, left - (Date.now() - started)); clearTimeout(timer); setBars(); };
    const resume = () => { if (!paused) return; paused = false; schedule(); };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pause(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') resume(); });
    const onVis = () => (document.hidden ? pause() : resume());
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e) => { if (e.target.closest?.('input, textarea')) return; if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };
    document.addEventListener('keydown', onKey);
    // swipe
    let sx = null;
    stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { if (sx == null) return; const d = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(d) > 40) go(i + (d < 0 ? 1 : -1)); });
    requestAnimationFrame(schedule);
    return { el, stop() { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('keydown', onKey); } };
  }

  function buyBox(p) {
    const soon = p.status === 'coming_soon';
    const off = p.compare_cents > p.price_cents ? Math.round((1 - p.price_cents / p.compare_cents) * 100) : 0;
    const box = h('aside', { class: 'buybox glass' });
    const kids = [];
    if (soon) {
      kids.push(h('span', { class: 'chip brand' }, iconEl('clock'), 'Coming soon'));
      if (p.release_at && p.release_at > Date.now()) kids.push(h('p', { class: 'label', style: { marginTop: '14px' } }, 'Launches in'), countdown(p.release_at));
      const nb = h('button', { class: 'btn primary lg block' }, iconEl('bell'), 'Notify me');
      nb.onclick = () => withBusy(nb, async () => {
        if (!auth.user && !(await E.signInSheet('Sign in to get notified'))) return;
        await api('/api/shop/notify', { body: { productId: p.id } }).then(() => toast('We will email you at launch', 'success')).catch(fail);
      });
      kids.push(nb);
    } else {
      kids.push(h('div', { class: 'bb-price' }, h('strong', {}, p.price_cents ? money(p.price_cents) : 'Free'), p.compare_cents > p.price_cents ? h('s', {}, money(p.compare_cents)) : null, off ? h('span', { class: 'chip good' }, `Save ${off}%`) : null));
      if (p.stockLeft && !p.soldOut) kids.push(h('p', { class: 'muted', style: { fontSize: '13px' } }, `Only ${p.stockLeft} left`));
      if (p.soldOut) kids.push(h('button', { class: 'btn lg block', disabled: true }, 'Sold out'));
      else {
        const buy = h('button', { class: 'btn primary lg block' }, 'Buy now', iconEl('arrow'));
        buy.onclick = () => { if (!S.cart.includes(p.id)) { S.cart.push(p.id); saveCart(); } openCart(); };
        kids.push(buy, h('button', { class: 'btn lg block', onclick: (e) => addToCart(p, e.currentTarget) }, iconEl('cart'), 'Add to cart'));
      }
    }
    kids.push(h('div', { class: 'bb-perks' },
      h('div', {}, iconEl('shield'), 'Secure checkout with PayPal'),
      p.hasVideo ? h('div', {}, iconEl('key'), 'Personal key, linked to your Google account') : null,
      h('div', {}, iconEl('invoice'), 'Detailed invoice by email')));
    box.append(...kids);
    return box;
  }

  function renderProductPage(p) {
    pageCleanup?.();
    const view = $('#productView');
    const cat = S.site.categories.find((c) => c.id === p.category_id);
    const ss = slideshow(p);
    const more = S.products.filter((x) => x.id !== p.id).slice(0, 3);
    document.title = `${p.title} — ${S.site.site.name}`;
    view.replaceChildren(h('div', { class: 'pp' },
      h('div', { class: 'pp-top' }, h('button', { class: 'btn sm', onclick: () => (history.state?.fromHome ? history.back() : navigate('/')) }, iconEl('chevron-left'), 'Back'),
        cat ? h('button', { class: 'crumb', onclick: () => { navigate('/'); setCategory(String(cat.id), true); } }, cat.name) : null),
      ss.el,
      h('div', { class: 'pp-grid' },
        h('div', { class: 'pp-info' },
          cat ? h('p', { class: 'eyebrow' }, cat.name) : null,
          h('h1', {}, p.title), p.subtitle ? h('p', { class: 'pp-sub' }, p.subtitle) : null,
          p.badge ? h('span', { class: 'chip brand', style: { marginTop: '12px' } }, p.badge) : null,
          p.description ? h('p', { class: 'pv-desc', style: { marginTop: '22px' } }, p.description) : null,
          p.features?.length ? h('div', { class: 'pp-block' }, h('h3', {}, 'What’s included'), h('ul', { class: 'features' }, p.features.map((f) => h('li', {}, iconEl('check'), h('span', {}, f))))) : null,
          p.deliver_note ? h('div', { class: 'secure-note' }, iconEl('gift'), h('div', {}, h('strong', {}, 'What you get'), h('div', {}, p.deliver_note))) : null,
          p.hasVideo ? h('div', { class: 'secure-note' }, iconEl('shield'), h('div', {}, h('strong', {}, 'Private streaming'), h('div', {}, 'After payment you get a personal key. Watch it on your private Video Review page — it only works with your Google account.'))) : null,
          p.tags?.length ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '18px' } }, p.tags.map((t) => h('span', { class: 'chip' }, `#${t}`))) : null),
        buyBox(p)),
      more.length ? h('div', { class: 'pp-more' }, h('h2', {}, 'You may also like'), h('div', { class: 'products' }, more.map((x) => productCard(x)))) : null));
    pageCleanup = () => ss.stop();
    E.applyTexts(view, 'home');
  }

  /* ---------- tiny router: "/" = home, "/product/:slug" = product page ---------- */
  function transition(fn) {
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(fn);
    else fn();
  }
  function navigate(path, state = {}) {
    if (location.pathname + location.hash === path) return;
    history.pushState(state, '', path);
    transition(route);
  }
  let homeScroll = 0;
  function route() {
    const m = location.pathname.match(/^\/product\/([^/]+)/);
    const am = location.pathname.match(/^\/album\/(\d+)/);
    const p = m && S.products.find((x) => x.slug === decodeURIComponent(m[1]));
    const al = am && S.albums.find((x) => x.id === Number(am[1]));
    $$('.p-media img, .album-cover img').forEach((img) => { img.style.viewTransitionName = ''; });
    if (p || al) {
      if (!$('#homeView').classList.contains('hidden')) homeScroll = window.scrollY;
      $('#homeView').classList.add('hidden'); $('#productView').classList.remove('hidden');
      if (p) renderProductPage(p); else renderAlbumPage(al);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      pageCleanup?.(); pageCleanup = null;
      $('#productView').classList.add('hidden'); $('#productView').replaceChildren();
      $('#homeView').classList.remove('hidden');
      document.title = `${S.site.site.name} — ${S.site.site.tagline}`;
      if (m || am) toast('That page is no longer available');
      requestAnimationFrame(() => window.scrollTo({ top: homeScroll, behavior: 'instant' }));
    }
    renderNav();
  }
  window.addEventListener('popstate', () => transition(route));
  function openProduct(p, fromImg) {
    if (fromImg) fromImg.style.viewTransitionName = 'product-hero';
    navigate(`/product/${encodeURIComponent(p.slug)}`, { fromHome: location.pathname === '/' });
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
