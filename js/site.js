// Boost Cars – λειτουργίες ιστοσελίδας (μενού, φίλτρα, αγαπημένα, gallery, δόσεις, κοινοποίηση)
(() => {
  document.documentElement.classList.add('js');
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  };

  /* ---------- Toast ---------- */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  /* ---------- Header: shadow on scroll, mobile menu ---------- */
  const topbar = $('[data-topbar]');
  const onScroll = () => topbar?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuBtn = $('[data-menu-toggle]');
  menuBtn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });

  /* ---------- Filters drawer (mobile) ---------- */
  $$('[data-open-filters]').forEach((b) => b.addEventListener('click', () => {
    document.body.classList.add('filters-open');
    document.body.style.overflow = 'hidden';
  }));
  $$('[data-close-filters]').forEach((b) => b.addEventListener('click', () => {
    document.body.classList.remove('filters-open');
    document.body.style.overflow = '';
  }));
  $$('select[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  /* ---------- Make → model dropdown ---------- */
  $$('[data-make-select]').forEach((makeSel) => {
    const modelSel = $('[data-model-select]', makeSel.form);
    if (!modelSel) return;
    const allLabel = modelSel.options[0]?.textContent || 'Όλα';
    makeSel.addEventListener('change', async () => {
      modelSel.innerHTML = '';
      modelSel.append(new Option(allLabel, ''));
      modelSel.disabled = !makeSel.value;
      if (!makeSel.value) return;
      try {
        const res = await fetch(`/api/models?make=${encodeURIComponent(makeSel.value)}`);
        for (const m of await res.json()) modelSel.append(new Option(`${m.v} (${m.n})`, m.v));
      } catch { /* keep "all models" */ }
    });
  });

  /* ---------- Grid / list view ---------- */
  const list = $('[data-car-list]');
  const viewBtns = $$('[data-view]');
  const setView = (v) => {
    list?.classList.toggle('list-view', v === 'list');
    viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    store.set('bc-view', v);
  };
  if (list && viewBtns.length) {
    setView(store.get('bc-view', 'grid'));
    viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  }

  /* ---------- Favorites (saved on this device) ---------- */
  const favs = new Set(store.get('bc-favs', []).map(Number));
  const countEl = $('[data-fav-count]');
  function renderFavs() {
    $$('[data-fav]').forEach((b) => {
      const on = favs.has(Number(b.dataset.fav));
      b.setAttribute('aria-pressed', String(on));
      const label = $('[data-fav-label]', b);
      if (label) label.textContent = on ? 'Αποθηκεύτηκε' : 'Αποθήκευση';
    });
    if (countEl) {
      countEl.textContent = favs.size;
      countEl.hidden = favs.size === 0;
    }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    const id = Number(btn.dataset.fav);
    if (favs.has(id)) { favs.delete(id); toast('Αφαιρέθηκε από τα αγαπημένα'); } else { favs.add(id); toast('Προστέθηκε στα αγαπημένα ♥'); }
    store.set('bc-favs', [...favs]);
    renderFavs();
    if (favList && !favs.has(id)) btn.closest('.car-card')?.remove();
    if (favList && !favs.size) favEmpty.hidden = false;
  });
  renderFavs();

  const favList = $('[data-favorites-list]');
  const favEmpty = $('[data-favorites-empty]');
  if (favList) {
    if (!favs.size) favEmpty.hidden = false;
    else {
      fetch(`/api/cards?ids=${[...favs].join(',')}`).then((r) => r.text()).then((html) => {
        favList.innerHTML = html;
        if (!favList.children.length) favEmpty.hidden = false;
        renderFavs();
      });
    }
  }

  /* ---------- Gallery + lightbox ---------- */
  const gallery = $('[data-gallery]');
  const dataEl = $('#gallery-data');
  if (gallery && dataEl) {
    const imgs = JSON.parse(dataEl.textContent);
    const main = $('[data-gallery-main]', gallery);
    const counter = $('[data-gallery-counter]', gallery);
    const thumbs = $$('[data-gallery-thumb]', gallery);
    const lb = $('[data-lightbox]');
    const lbImg = $('[data-lightbox-img]', lb);
    const lbCounter = $('[data-lightbox-counter]', lb);
    let idx = 0;

    const show = (i) => {
      idx = (i + imgs.length) % imgs.length;
      main.src = imgs[idx];
      lbImg.src = imgs[idx];
      const text = `${idx + 1} / ${imgs.length}`;
      if (counter) counter.textContent = text;
      if (lbCounter) lbCounter.textContent = text;
      thumbs.forEach((t, j) => t.classList.toggle('active', j === idx));
      thumbs[idx]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    const openLb = () => { show(idx); lb.hidden = false; document.body.style.overflow = 'hidden'; };
    const closeLb = () => { lb.hidden = true; document.body.style.overflow = ''; };

    $('[data-gallery-prev]', gallery)?.addEventListener('click', () => show(idx - 1));
    $('[data-gallery-next]', gallery)?.addEventListener('click', () => show(idx + 1));
    thumbs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.galleryThumb))));
    main.addEventListener('click', openLb);
    $('[data-lightbox-close]', lb).addEventListener('click', closeLb);
    $('[data-lightbox-prev]', lb).addEventListener('click', () => show(idx - 1));
    $('[data-lightbox-next]', lb).addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });

    let startX = null;
    [main, lbImg].forEach((el) => {
      el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
        startX = null;
      });
    });
  }

  /* ---------- Finance calculator ---------- */
  const euro = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  $$('[data-finance]').forEach((box) => {
    const rate = parseFloat(box.dataset.rate) || 0;
    const down = $('[data-down]', box);
    const months = $('[data-months]', box);
    const priceInput = $('[data-price-input]', box);
    const update = () => {
      const price = priceInput ? Math.max(0, Number(priceInput.value) || 0) : Number(box.dataset.price);
      down.max = Math.round(price * 0.7);
      const d = Math.min(Number(down.value), Number(down.max));
      const n = Number(months.value);
      const p = Math.max(0, price - d);
      const r = rate / 100 / 12;
      const monthly = r ? (p * r) / (1 - (1 + r) ** -n) : p / n;
      $('[data-down-label]', box).textContent = euro.format(d);
      $('[data-financed]', box).textContent = euro.format(p);
      $('[data-monthly]', box).textContent = `${euro.format(Math.ceil(monthly))}/μήνα`;
    };
    [down, months, priceInput].forEach((el) => el?.addEventListener('input', update));
    update();
  });

  /* ---------- Share ---------- */
  $$('[data-share]').forEach((btn) => btn.addEventListener('click', async () => {
    const data = { title: btn.dataset.shareTitle, url: btn.dataset.shareUrl };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(data.url);
      toast('Ο σύνδεσμος αντιγράφηκε');
    } catch {
      window.prompt('Αντιγράψτε τον σύνδεσμο:', data.url);
    }
  }));

  /* ---------- Reveal on scroll ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }
})();
