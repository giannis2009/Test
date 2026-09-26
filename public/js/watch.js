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

  /* ---------- key entry + library ---------- */
  async function renderLibrary() {
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
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].focus(); }
        if (e.key === 'Enter') unlock.click();
      });
      b.addEventListener('paste', (e) => { e.preventDefault(); fillFrom(e.clipboardData.getData('text'), i); });
    });
    unlock.onclick = () => withBusy(unlock, async () => {
      const key = `EZRO-${boxes.map((b) => b.value).join('-')}`;
      if (boxes.some((b) => b.value.length !== 4)) { shake(); toast('Enter the full key', 'error'); return; }
      try { const s = await api('/api/watch/open', { body: { key } }); play(s, { key }); }
      catch (e) { shake(); fail(e); }
    });
    const shake = () => { keyin.classList.remove('shake'); void keyin.offsetWidth; keyin.classList.add('shake'); };

    const lib = h('div', { class: 'lib' }, [1, 2, 3].map(() => h('div', { class: 'skeleton', style: { height: '220px' } })));
    app.replaceChildren(
      h('div', { class: 'w-hero' }, h('div', { class: 'w-icon', html: icon('play') }), h('h1', {}, 'Video Review'),
        h('p', {}, 'Enter the key from your invoice email, or pick a video from your library.')),
      h('div', { class: 'w-card glass' }, h('p', { class: 'label', style: { textAlign: 'center', marginBottom: '14px' } }, 'Access key'), keyin, unlock,
        h('p', { class: 'protect-note' }, iconEl('shield'), `Signed in as ${auth.user.email}`)),
      h('div', { style: { marginTop: '48px' } }, h('h2', { style: { fontSize: '22px' } }, 'Your library'), lib));
    setTimeout(() => boxes[0].focus(), 300);

    try {
      const { items } = await api('/api/watch/library');
      if (!items.length) { lib.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, iconEl('film'), 'Nothing here yet. Your purchases appear here automatically.')); return; }
      lib.replaceChildren(...items.map((it, i) => E.reveal(h('div', {
        class: 'lib-item', tabindex: '0',
        onclick: () => open(it), onkeydown: (e) => e.key === 'Enter' && open(it),
      }, h('div', { class: 'cov' }, it.cover_url ? h('img', { src: it.cover_url, alt: '' }) : iconEl('film'), it.hasVideo ? h('span', { class: 'pl', html: icon('play') }) : null),
      h('div', { class: 'meta' }, h('strong', {}, it.product_title), h('span', {}, it.key))), i * 60)));
    } catch (e) { fail(e); }
    async function open(it) {
      if (!it.hasVideo) { toast('This purchase has no video attached yet.'); return; }
      try { play(await api('/api/watch/open', { body: { licenseId: it.id } }), { licenseId: it.id }); } catch (e) { fail(e); }
    }
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
