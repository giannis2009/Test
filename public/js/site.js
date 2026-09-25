(() => {
  // Mobile filter toggle
  const filters = document.getElementById('filters');
  document.querySelectorAll('[data-toggle-filters]').forEach((btn) => {
    btn.addEventListener('click', () => filters?.classList.toggle('open'));
  });

  // Make -> model dependent dropdown
  const makeSel = document.querySelector('[data-make-select]');
  const modelSel = document.querySelector('[data-model-select]');
  if (makeSel && modelSel) {
    makeSel.addEventListener('change', async () => {
      modelSel.innerHTML = '<option value="">Όλα</option>';
      modelSel.disabled = !makeSel.value;
      if (!makeSel.value) return;
      const res = await fetch(`/api/models?make=${encodeURIComponent(makeSel.value)}`);
      const models = await res.json();
      for (const m of models) {
        const o = document.createElement('option');
        o.value = m.v;
        o.textContent = `${m.v} (${m.n})`;
        modelSel.append(o);
      }
    });
  }

  // Gallery + lightbox
  const gallery = document.querySelector('[data-gallery]');
  const dataEl = document.getElementById('gallery-data');
  if (gallery && dataEl) {
    const imgs = JSON.parse(dataEl.textContent);
    const main = gallery.querySelector('[data-gallery-main]');
    const counter = gallery.querySelector('[data-gallery-counter]');
    const thumbs = [...gallery.querySelectorAll('[data-gallery-thumb]')];
    const lb = document.querySelector('[data-lightbox]');
    const lbImg = lb.querySelector('[data-lightbox-img]');
    let idx = 0;

    const show = (i) => {
      idx = (i + imgs.length) % imgs.length;
      main.src = imgs[idx];
      lbImg.src = imgs[idx];
      if (counter) counter.textContent = `${idx + 1} / ${imgs.length}`;
      thumbs.forEach((t, j) => t.classList.toggle('active', j === idx));
      thumbs[idx]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', () => show(idx - 1));
    gallery.querySelector('[data-gallery-next]')?.addEventListener('click', () => show(idx + 1));
    thumbs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.galleryThumb))));
    main.addEventListener('click', () => { lbImg.src = imgs[idx]; lb.hidden = false; });
    lb.querySelector('[data-lightbox-close]').addEventListener('click', () => { lb.hidden = true; });
    lb.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(idx - 1));
    lb.querySelector('[data-lightbox-next]').addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') lb.hidden = true;
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });

    // Swipe on touch devices
    let startX = null;
    const onStart = (e) => { startX = e.touches[0].clientX; };
    const onEnd = (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
      startX = null;
    };
    [main, lbImg].forEach((el) => {
      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchend', onEnd);
    });
  }
})();
