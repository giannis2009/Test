/* =========================================================
   Ezro — Video Review: key unlock + protected player
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro;
  const { h, $, $$, icon, iconEl, api, toast, fail, withBusy, auth } = E;
  const app = $('#app');
  const params = new URLSearchParams(location.search);
  let SITE = null;
  let teardown = null;

  async function boot() {
    try { SITE = await api('/api/public/site'); } catch (e) { fail(e); }
    if (SITE) { E.setTexts(SITE.texts); E.applyAppearance(SITE.appearance); E.watchTexts('watch'); }
    await auth.load().catch(() => {});
    if (params.get('edit') === '1' && auth.user?.isAdmin) E.textEditMode('watch'); else E.track('/watch');
    route();
  }
  auth.onChange(() => { renderNav(); });

  function renderNav() {
    const acts = [E.themeButton()];
    if (auth.user) {
      const acc = h('button', { class: 'btn ghost account-btn', 'aria-label': 'Account' }, E.avatarEl(auth.user, 32));
      acc.onclick = () => E.popMenu(acc, (m) => {
        m.append(h('div', { class: 'menu-head' }, auth.user.email));
        m.append(h('a', { class: 'menu-item', href: '/' }, iconEl('bag'), 'Back to shop'));
        m.append(h('button', { class: 'menu-item danger', onclick: async () => { E.closeMenus(); await auth.logout(); route(); } }, iconEl('logout'), 'Sign out'));
      }, { align: 'right', minWidth: 230 });
      acts.push(acc);
    }
    $('#navActions').replaceChildren(...acts);
  }

  function route() {
    teardown?.(); teardown = null;
    renderNav();
    if (!auth.user) return renderSignIn();
    renderLibrary();
  }

  /* ---------- signed out ---------- */
  function renderSignIn() {
    const slot = h('div', { style: { marginTop: '20px' } });
    app.replaceChildren(
      h('div', { class: 'w-hero' }, h('div', { class: 'w-icon', html: icon('lock') }), h('h1', {}, 'Video Review'),
        h('p', {}, 'Sign in with the Google account you used to pay. Your key only works with that account.')),
      h('div', { class: 'w-card glass' }, slot));
    requestAnimationFrame(() => E.renderSignIn(slot, () => route()));
  }

  /* ---------- key entry (used in the "Redeem a key" sheet) ---------- */
  function keyEntry() {
    const boxes = [0, 1, 2, 3].map(() => h('input', { maxlength: '4', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', 'aria-label': 'Key part' }));
    const keyin = h('div', { class: 'keyin' }, h('span', { class: 'pre' }, 'EZRO'), ...boxes.flatMap((b) => [h('span', { class: 'dash' }, '–'), b]));
    const unlock = h('button', { class: 'btn primary lg block', style: { marginTop: '18px' } }, iconEl('key'), 'Unlock video');
    const fillFrom = (text, start = 0) => {
      const chars = text.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^EZRO/, '');
      let i = start; let s = chars;
      while (s && i < 4) { boxes[i].value = s.slice(0, 4); s = s.slice(4); i++; }
      boxes.forEach((b) => b.classList.toggle('full', b.value.length === 4));
      (boxes.find((b) => b.value.length < 4) || boxes[3]).focus();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const v = b.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 4) { fillFrom(v, i); return; }
        b.value = v; b.classList.toggle('full', v.length === 4);
        if (v.length === 4 && i < 3) boxes[i + 1].focus();
        if (boxes.every((x) => x.value.length === 4)) unlock.focus();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
        if (e.key === 'Enter') unlock.click();
      });
      b.addEventListener('paste', (e) => { e.preventDefault(); fillFrom(e.clipboardData.getData('text'), i); });
    });
    const shake = () => { keyin.classList.remove('shake'); void keyin.offsetWidth; keyin.classList.add('shake'); };
    const el = h('div', {}, keyin, unlock, h('p', { class: 'protect-note' }, iconEl('shield'), `Works only with ${auth.user.email}`));
    return { el, boxes, unlock, shake };
  }
  function redeemSheet() {
    const k = keyEntry();
    const s = E.sheet({
      body: [h('div', { style: { textAlign: 'center', padding: '6px 0 18px' } },
        h('div', { class: 'w-icon sm', html: icon('key') }), h('h3', { style: { fontSize: '22px', marginTop: '14px' } }, 'Redeem a key'),
        h('p', { class: 'muted', style: { marginTop: '6px' } }, 'Enter the key from your invoice email.')), k.el],
    });
    k.unlock.onclick = () => withBusy(k.unlock, async () => {
      if (k.boxes.some((b) => b.value.length !== 4)) { k.shake(); toast('Enter the full key', 'error'); return; }
      const key = `EZRO-${k.boxes.map((b) => b.value).join('-')}`;
      try { const sess = await api('/api/watch/open', { body: { key } }); s.close(); play(sess, { key }); }
      catch (e) { k.shake(); fail(e); }
    });
    setTimeout(() => k.boxes[0].focus(), 250);
  }

  /* ---------- library ---------- */
  const money = (c, cur) => (c == null ? '' : E.money(c, cur));
  const lib = { items: [], q: '', filter: 'all', sort: 'recent' };
  async function renderLibrary() {
    const highlight = params.get('order');
    const first = (auth.user.name || auth.user.email).split(/[\s@]/)[0];
    const head = h('header', { class: 'lb-head' },
      h('div', { class: 'lb-hello' }, E.avatarEl(auth.user, 52),
        h('div', {}, h('p', { class: 'eyebrow' }, 'Your library'), h('h1', {}, `Welcome back, ${first}`))),
      h('div', { class: 'lb-head-acts' },
        h('button', { class: 'btn lg', onclick: redeemSheet }, iconEl('key'), 'Redeem a key'),
        h('a', { class: 'btn lg primary', href: '/#shop' }, iconEl('bag'), 'Shop')));
    const stats = h('div', { class: 'lb-stats' });
    const feature = h('div');
    const tools = h('div', { class: 'lb-tools' });
    const grid = h('div', { class: 'lb-grid' }, [1, 2, 3].map(() => h('div', { class: 'skeleton', style: { height: '330px', borderRadius: '24px' } })));
    app.replaceChildren(h('div', { class: 'lb' }, head, stats, feature, tools, grid));

    try { lib.items = (await api('/api/watch/library')).items; } catch (e) { fail(e); lib.items = []; }
    const items = lib.items;
    if (!items.length) {
      stats.remove(); tools.remove();
      grid.replaceWith(h('div', { class: 'lb-empty' },
        h('div', { class: 'w-icon', html: icon('film') }), h('h2', {}, 'Your library is empty'),
        h('p', { class: 'muted' }, 'Everything you buy appears here instantly — ready to watch, with your invoice and key.'),
        h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' } },
          h('a', { class: 'btn primary lg', href: '/#shop' }, 'Browse the shop'), h('button', { class: 'btn lg', onclick: redeemSheet }, iconEl('key'), 'Redeem a key'))));
      return;
    }
    const orders = new Set(items.map((i) => i.order_number)).size;
    const sessions = items.reduce((n, i) => n + (i.views || 0), 0);
    const since = Math.min(...items.map((i) => i.created_at));
    stats.replaceChildren(...[
      ['film', items.length, items.length === 1 ? 'Item' : 'Items'],
      ['receipt', orders, orders === 1 ? 'Order' : 'Orders'],
      ['eye', sessions, 'Watch sessions'],
      ['calendar', E.fmtDate(since, { month: 'short', year: 'numeric' }), 'Member since'],
    ].map(([ic, v, l]) => h('div', { class: 'lb-stat' }, h('span', { class: 'lb-stat-ic', html: icon(ic) }), h('div', {}, h('strong', {}, String(v)), h('span', {}, l)))));

    // "Continue" hero: the most recently watched video, otherwise the newest purchase
    const pick = [...items].filter((i) => i.hasVideo).sort((a, b) => (b.last_view_at || 0) - (a.last_view_at || 0))[0];
    if (pick) {
      const watched = !!pick.last_view_at;
      feature.replaceChildren(E.reveal(h('section', { class: 'lb-feature' },
        pick.cover_url ? h('div', { class: 'lb-feature-bg', style: { backgroundImage: `url("${pick.cover_url}")` } }) : null,
        h('div', { class: 'lb-feature-body' },
          h('span', { class: 'chip brand' }, iconEl(watched ? 'play' : 'sparkles'), watched ? 'Continue watching' : 'Ready to watch'),
          h('h2', {}, pick.product_title), pick.subtitle ? h('p', {}, pick.subtitle) : null,
          h('div', { class: 'lb-feature-meta' }, watched ? `Last watched ${E.timeAgo(pick.last_view_at)}` : `Purchased ${E.fmtDate(pick.created_at)}`),
          h('div', { class: 'lb-feature-acts' },
            h('button', { class: 'btn lg lb-play', onclick: () => open(pick) }, iconEl('play', 'fill'), watched ? 'Resume' : 'Play'),
            pick.order_number ? h('a', { class: 'btn lg lb-glass', href: `/invoice/${encodeURIComponent(pick.order_number)}`, target: '_blank' }, iconEl('invoice'), 'Invoice') : null)),
        pick.cover_url ? h('div', { class: 'lb-feature-art' }, h('img', { src: pick.cover_url, alt: '' })) : null)));
    }

    const search = h('div', { class: 'input-wrap lb-search' }, iconEl('search'),
      E.input(lib.q, { placeholder: 'Search your library…', oninput: E.debounce((e) => { lib.q = e.target.value; draw(); }, 120) }));
    const hasOther = items.some((i) => !i.hasVideo);
    tools.replaceChildren(h('h2', {}, 'All purchases'), h('div', { class: 'lb-tools-r' }, search,
      hasOther ? E.segmented([['all', 'All'], ['video', 'Videos'], ['other', 'Files']], lib.filter, (v) => { lib.filter = v; draw(); }) : null,
      E.select([['recent', 'Newest first'], ['watched', 'Recently watched'], ['az', 'A → Z']], lib.sort, { onChange: (v) => { lib.sort = v; draw(); }, cls: 'sm' })));

    function card(it, i) {
      const isNew = highlight && it.order_number === highlight;
      const keyTxt = h('span', { class: 'mono' }, it.key);
      let revealed = false;
      const eye = h('button', { class: 'btn icon sm ghost', 'aria-label': 'Show key', title: 'Show key', html: icon('eye') });
      eye.onclick = async (e) => {
        e.stopPropagation();
        if (revealed) { keyTxt.textContent = it.key; revealed = false; return; }
        try { const { key } = await api('/api/watch/key', { body: { licenseId: it.id } }); keyTxt.textContent = key; revealed = true; } catch (err) { fail(err); }
      };
      const cp = h('button', { class: 'btn icon sm ghost', 'aria-label': 'Copy key', title: 'Copy key', html: icon('copy') });
      cp.onclick = async (e) => { e.stopPropagation(); try { const { key } = await api('/api/watch/key', { body: { licenseId: it.id } }); E.copy(key); } catch (err) { fail(err); } };
      const el = h('article', { class: `lb-card ${isNew ? 'is-new' : ''}`, tabindex: '0', onkeydown: (e) => e.key === 'Enter' && e.target === el && open(it) },
        h('div', { class: 'lb-cov', onclick: () => open(it) },
          it.cover_url ? h('img', { src: it.cover_url, alt: '', loading: 'lazy' }) : h('div', { class: 'ph', html: icon(it.hasVideo ? 'film' : 'box') }),
          h('div', { class: 'lb-cov-top' }, it.category ? h('span', { class: 'chip' }, it.category) : h('span'), isNew ? h('span', { class: 'chip brand' }, 'New') : null),
          it.hasVideo ? h('span', { class: 'lb-playbtn', html: icon('play', 'fill') }) : null,
          it.views ? h('span', { class: 'lb-watched' }, iconEl('eye'), `${it.views}`) : null),
        h('div', { class: 'lb-body' },
          h('h3', {}, it.product_title), it.subtitle ? h('p', { class: 'lb-sub' }, it.subtitle) : null,
          it.deliver_note ? h('p', { class: 'lb-note' }, iconEl('gift'), it.deliver_note) : null,
          h('div', { class: 'lb-key' }, iconEl('key'), keyTxt, h('span', { class: 'lb-key-acts' }, eye, cp)),
          h('div', { class: 'lb-foot' },
            h('div', { class: 'lb-meta' }, h('span', {}, E.fmtDate(it.created_at)), it.order_number ? h('span', {}, `#${it.order_number}`) : null,
              it.total_cents != null ? h('span', {}, money(it.total_cents, it.currency)) : null),
            h('div', { class: 'lb-acts' },
              it.order_number ? h('a', { class: 'btn icon sm', href: `/invoice/${encodeURIComponent(it.order_number)}`, target: '_blank', 'aria-label': 'Invoice', title: 'Invoice', html: icon('invoice') }) : null,
              it.hasVideo ? h('button', { class: 'btn sm primary', onclick: () => open(it) }, iconEl('play', 'fill'), 'Watch') : h('span', { class: 'chip' }, 'No video')))));
      return E.reveal(el, (i % 6) * 60);
    }
    function draw() {
      let list = items.filter((i) => lib.filter === 'all' || (lib.filter === 'video' ? i.hasVideo : !i.hasVideo));
      const q = lib.q.trim().toLowerCase();
      if (q) list = list.filter((i) => `${i.product_title} ${i.subtitle || ''} ${i.category || ''} ${i.order_number || ''}`.toLowerCase().includes(q));
      if (lib.sort === 'az') list.sort((a, b) => a.product_title.localeCompare(b.product_title));
      else if (lib.sort === 'watched') list.sort((a, b) => (b.last_view_at || 0) - (a.last_view_at || 0));
      else list.sort((a, b) => b.created_at - a.created_at);
      grid.replaceChildren(...(list.length ? list.map(card) : [h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, iconEl('search'), 'Nothing matches your search.')]));
    }
    draw();
    if (highlight) setTimeout(() => $('.lb-card.is-new')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
  }
  async function open(it) {
    if (!it.hasVideo) { toast('This purchase has no video attached yet.'); return; }
    try { play(await api('/api/watch/open', { body: { licenseId: it.id } }), { licenseId: it.id }); } catch (e) { fail(e); }
  }

  /* ---------- protected player ---------- */
  function play(sess, ref) {
    teardown?.();
    const video = h('video', {
      playsinline: true, preload: 'metadata', controlslist: 'nodownload noplaybackrate noremoteplayback',
      disablepictureinpicture: true, disableremoteplayback: true, 'x-webkit-airplay': 'deny',
    });
    video.src = `/api/watch/stream/${sess.token}`;
    const wm = sess.watermark ? h('div', { class: 'wm' }, sess.watermark) : null;
    const wmTile = sess.watermark ? h('div', { class: 'wm-tile' }, Array.from({ length: 40 }, () => h('span', {}, sess.watermark))) : null;
    const shield = h('div', { class: 'shield' }, iconEl('shield'), h('strong', {}, 'Protected content'), h('span', { style: { fontSize: '13px', opacity: .7 } }, 'Click to continue watching'));
    const bigBtn = h('div', { class: 'big', html: icon('play') });
    const center = h('div', { class: 'p-center' }, bigBtn);
    const playBtn = h('button', { 'aria-label': 'Play', html: icon('play', 'fillme') });
    const fill = h('div', { class: 'fill' }); const buf = h('div', { class: 'buf' });
    const bar = h('div', { class: 'p-bar', role: 'slider', 'aria-label': 'Seek', tabindex: '0' }, h('div', { class: 'rail' }, buf, fill));
    const time = h('span', { class: 'p-time' }, '0:00 / 0:00');
    const muteBtn = h('button', { 'aria-label': 'Mute', html: icon('volume') });
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '1', class: 'p-vol', 'aria-label': 'Volume' });
    const fsBtn = h('button', { 'aria-label': 'Fullscreen', html: icon('fullscreen') });
    const controls = h('div', { class: 'p-controls' }, playBtn, bar, time, muteBtn, vol, fsBtn);
    const player = h('div', { class: 'player', tabindex: '0' }, video, wmTile, wm, center, controls, shield);

    app.replaceChildren(h('div', { class: 'player-page' },
      h('div', { class: 'player-top' }, h('button', { class: 'btn icon', 'aria-label': 'Back', html: icon('chevron-left'), onclick: () => route() }),
        h('div', { style: { flex: 1 } }, h('h2', {}, sess.title), sess.subtitle ? h('p', { class: 'muted' }, sess.subtitle) : null)),
      player,
      h('p', { class: 'protect-note' }, iconEl('shield'), 'Private stream · licensed to your account · recording and sharing are not allowed')));

    const fmt = (s) => { if (!Number.isFinite(s)) return '0:00'; s = Math.floor(s); const m = Math.floor(s / 60); const hh = Math.floor(m / 60); return `${hh ? `${hh}:${String(m % 60).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`; };
    const setPlayIcon = () => {
      const p = !video.paused;
      player.classList.toggle('playing', p);
      playBtn.innerHTML = icon(p ? 'pause' : 'play', 'fillme');
      bigBtn.innerHTML = icon(p ? 'pause' : 'play');
    };
    const toggle = () => { if (shield.classList.contains('on')) return; video.paused ? video.play().catch(() => {}) : video.pause(); };
    playBtn.onclick = toggle; center.onclick = toggle;
    video.addEventListener('play', setPlayIcon); video.addEventListener('pause', setPlayIcon);
    video.addEventListener('timeupdate', () => {
      fill.style.width = `${(video.currentTime / video.duration) * 100 || 0}%`;
      time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
    });
    video.addEventListener('progress', () => { if (video.buffered.length) buf.style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`; });
    const seekTo = (x) => { const r = bar.getBoundingClientRect(); video.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * (video.duration || 0); };
    bar.addEventListener('pointerdown', (e) => {
      seekTo(e.clientX); bar.setPointerCapture(e.pointerId);
      const mv = (ev) => seekTo(ev.clientX);
      bar.addEventListener('pointermove', mv);
      bar.addEventListener('pointerup', () => bar.removeEventListener('pointermove', mv), { once: true });
    });
    bar.onkeydown = (e) => { if (e.key === 'ArrowRight') video.currentTime += 5; if (e.key === 'ArrowLeft') video.currentTime -= 5; };
    vol.oninput = () => { video.volume = Number(vol.value); video.muted = video.volume === 0; muteBtn.innerHTML = icon(video.muted ? 'mute' : 'volume'); };
    muteBtn.onclick = () => { video.muted = !video.muted; muteBtn.innerHTML = icon(video.muted ? 'mute' : 'volume'); };
    fsBtn.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen?.().catch(() => {}));
    player.addEventListener('dblclick', () => fsBtn.click());
    player.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); } if (e.key === 'f') fsBtn.click(); });

    // hide controls when idle
    let idleT;
    const wake = () => { player.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => player.classList.add('idle'), 2600); };
    player.addEventListener('pointermove', wake); wake();

    // moving watermark (identifies the buyer on any leaked copy)
    let wmT;
    if (wm) {
      const moveWm = () => { wm.style.left = `${5 + Math.random() * 70}%`; wm.style.top = `${6 + Math.random() * 78}%`; };
      moveWm(); wmT = setInterval(moveWm, 4000);
    }

    // expired token / network error → fetch a fresh token and resume where we were
    let retrying = false;
    video.addEventListener('error', async () => {
      if (retrying) return; retrying = true;
      const t = video.currentTime; const wasPlaying = !video.paused;
      try {
        const s2 = await api('/api/watch/open', { body: ref.licenseId ? { licenseId: ref.licenseId } : { key: ref.key } });
        video.src = `/api/watch/stream/${s2.token}`;
        video.currentTime = t; if (wasPlaying) video.play().catch(() => {});
      } catch (e) { fail(e); }
      setTimeout(() => { retrying = false; }, 5000);
    });

    /* ---- capture deterrents ----
       Browsers cannot fully stop screen recording; these block the easy paths and the watermark
       makes any leak traceable. True black-screen-on-record needs DRM (see README). */
    const sec = sess.security || {};
    const hide = () => { shield.classList.add('on'); video.pause(); };
    const onVis = () => { if (document.hidden) hide(); };
    const onBlur = () => { if (sec.blurOnFocusLoss) hide(); };
    shield.onclick = () => { shield.classList.remove('on'); player.focus(); };
    const onKey = (e) => {
      const k = e.key?.toLowerCase();
      const shot = k === 'printscreen' || (e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(k)) || (e.ctrlKey && e.shiftKey && k === 's') || (e.metaKey && e.shiftKey && k === 's');
      const save = (e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(k);
      const dev = k === 'f12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k));
      if (shot || save || dev) { e.preventDefault(); hide(); if (shot) navigator.clipboard?.writeText(' ').catch(() => {}); }
    };
    const onKeyUp = (e) => { if (e.key === 'PrintScreen') { hide(); navigator.clipboard?.writeText(' ').catch(() => {}); } };
    const block = (e) => { if (player.contains(e.target)) e.preventDefault(); };
    let devT;
    if (sec.blockDevtools) devT = setInterval(() => { if (window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 240) hide(); }, 1000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('contextmenu', block);
    document.addEventListener('dragstart', block);
    window.addEventListener('beforeprint', hide);

    teardown = () => {
      video.pause(); video.removeAttribute('src'); video.load();
      clearInterval(wmT); clearInterval(devT); clearTimeout(idleT);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('contextmenu', block); document.removeEventListener('dragstart', block);
      window.removeEventListener('beforeprint', hide);
    };
    player.focus();
  }

  boot();
})();
