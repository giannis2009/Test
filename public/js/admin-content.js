/* =========================================================
   Ezro admin — Categories & Media, Socials, Texts, Appearance
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro; const A = window.Admin;
  const { h, $, $$, icon, iconEl, api, toast, fail, withBusy, sheet, field, input, textarea, toggle, select, segmented } = E;

  /* ================= Categories & Media ================= */
  let selCat = null;
  let selAlbum = 'none'; // 'none' = photos that are not in an album
  A.pages.media = async () => {
    const { categories } = await api('/api/admin/categories');
    if (!categories.some((c) => c.id === selCat)) selCat = categories[0]?.id ?? null;
    const catList = h('div', { class: 'list' });
    const mediaPanel = h('div', { style: { display: 'grid', gap: '18px', alignContent: 'start' } });
    const drawCats = () => catList.replaceChildren(...categories.map((c) => h('div', { class: `lrow ${c.id === selCat ? 'on' : ''}`, dataset: { id: c.id }, style: { cursor: 'pointer' }, onclick: () => { selCat = c.id; drawCats(); loadMedia(); } },
      h('span', { class: 'handle', html: icon('grip') }), h('div', { class: 'ic', html: icon(c.icon) }),
      h('div', { class: 'tt' }, h('strong', {}, c.name), h('span', {}, `${c.album_count} album${c.album_count === 1 ? '' : 's'} · ${c.media_count} item${c.media_count === 1 ? '' : 's'} · ${c.product_count} product${c.product_count === 1 ? '' : 's'}${c.visible ? '' : ' · hidden'}`)),
      h('button', { class: 'btn icon sm ghost', 'aria-label': 'Edit category', html: icon('edit'), onclick: (e) => { e.stopPropagation(); editCategory(c); } }))));
    drawCats();
    E.dragSort({ containers: [catList], item: '.lrow', handle: '.handle', onDrop: () => A.reorder('categories', $$('.lrow', catList).map((r) => Number(r.dataset.id))) });

    async function loadMedia() {
      const cat = categories.find((c) => c.id === selCat);
      if (!cat) { mediaPanel.replaceChildren(A.panel('Media', h('div', { class: 'empty' }, 'Create a category first.'))); return; }
      const { albums } = await api(`/api/admin/albums?category=${cat.id}`);
      if (selAlbum !== 'none' && !albums.some((a) => a.id === selAlbum)) selAlbum = 'none';
      const album = albums.find((a) => a.id === selAlbum);
      const { media } = await api(`/api/admin/media?category=${cat.id}&album=${album ? album.id : 'none'}`);
      // album strip: every album with its cover, plus "photos without album"
      const albumStrip = h('div', { class: 'album-strip' },
        h('button', { type: 'button', class: `al-card loose ${!album ? 'on' : ''}`, onclick: () => { selAlbum = 'none'; loadMedia(); } },
          h('div', { class: 'al-cv', html: icon('image') }), h('strong', {}, 'Without album')),
        albums.map((a) => h('button', { type: 'button', class: `al-card ${album?.id === a.id ? 'on' : ''}`, dataset: { id: a.id }, onclick: () => { selAlbum = a.id; loadMedia(); } },
          h('div', { class: 'al-cv' }, a.cover_url || a.first_url ? h('img', { src: a.cover_url || a.first_url, alt: '' }) : iconEl('image'),
            h('span', { class: 'handle', html: icon('grip'), title: 'Drag to reorder' })),
          h('strong', {}, a.title), h('span', {}, `${a.count} photo${a.count === 1 ? '' : 's'}${a.visible ? '' : ' · hidden'}`))),
        h('button', { type: 'button', class: 'al-card add', 'data-drop-end': '', onclick: () => editAlbum(null, cat, categories, loadMedia) }, h('div', { class: 'al-cv', html: icon('plus') }), h('strong', {}, 'New album')));
      E.dragSort({ containers: [albumStrip], item: '.al-card[data-id]', handle: '.handle', onDrop: () => A.reorder('albums', $$('.al-card[data-id]', albumStrip).map((x) => Number(x.dataset.id))) });
      let position = 'last';
      const grid = h('div', { class: 'mgrid' }, media.map((m) => h('div', { class: 'mitem', dataset: { id: m.id } },
        m.type === 'video' ? h('video', { src: m.url, muted: true, loop: true, playsinline: true, onmouseenter: (e) => e.target.play().catch(() => {}), onmouseleave: (e) => e.target.pause() }) : h('img', { src: m.url, alt: m.title || '' }),
        h('div', { class: 'ov' }, h('div', { class: 'top' }, h('span', { class: 'handle', html: icon('grip'), title: 'Drag to reorder' }),
          h('span', { style: { display: 'flex', gap: '4px' } }, h('button', { 'aria-label': 'Edit', html: icon('edit'), onclick: () => editMedia(m, categories, loadMedia) }),
            h('button', { 'aria-label': 'Delete', html: icon('trash'), onclick: async () => { if (await E.confirmDialog('Delete this item?', '', { ok: 'Delete', danger: true })) { await api(`/api/admin/media/${m.id}`, { method: 'DELETE' }).catch(fail); loadMedia(); } } }))),
          h('div', { class: 'cap' }, m.title || (m.type === 'video' ? 'Video' : 'Image'))),
        m.type === 'video' ? h('span', { class: 'chip vid' }, iconEl('film')) : null)));
      E.dragSort({ containers: [grid], item: '.mitem', handle: '.handle', onDrop: () => A.reorder('media', $$('.mitem', grid).map((x) => Number(x.dataset.id))) });
      const fileIn = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, class: 'hidden' });
      const bar = h('div', { class: 'progress hidden', style: { marginTop: '10px' } }, h('div'));
      const upBtn = h('button', { class: 'btn primary' }, iconEl('upload'), 'Upload images / videos');
      upBtn.onclick = () => fileIn.click();
      fileIn.onchange = async () => {
        const files = [...fileIn.files]; if (!files.length) return;
        bar.classList.remove('hidden');
        const list = position === 'first' ? files.reverse() : files;
        for (const [i, file] of list.entries()) {
          try {
            const r = await E.upload('/api/admin/upload', file, (p) => { bar.firstChild.style.width = `${((i + p) / list.length) * 100}%`; });
            await api('/api/admin/media', { body: { category_id: cat.id, album_id: album?.id || null, url: r.url, type: r.type, title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), position } });
          } catch (e) { fail(e); }
        }
        toast(`${files.length} item${files.length > 1 ? 's' : ''} added to ${album ? album.title : cat.name}`, 'success');
        fileIn.value = ''; loadMedia();
      };
      const addUrl = h('button', { class: 'btn' }, iconEl('link'), 'Add by link');
      addUrl.onclick = () => editMedia({ category_id: cat.id, album_id: album?.id || null, url: '', title: '', caption: '' }, categories, loadMedia);
      const albumBtn = album ? h('button', { class: 'btn' }, iconEl('edit'), 'Album settings') : null;
      if (albumBtn) albumBtn.onclick = () => editAlbum(album, cat, categories, loadMedia, media);
      mediaPanel.replaceChildren(
        A.panel(h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1 } }, `${cat.name} — albums`, h('span', { class: 'count' }, albums.length)),
          h('p', { class: 'desc' }, 'Each album shows on the site with its cover. Clicking it opens all its photos. Drag to reorder.'), albumStrip),
        A.panel(h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' } }, album ? album.title : 'Photos without album', h('span', { class: 'count' }, media.length),
          h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, albumBtn, segmented([['first', 'Add to start'], ['last', 'Add to end']], position, (v) => { position = v; }), addUrl, upBtn)),
        fileIn, bar, h('p', { class: 'desc', style: { marginTop: '0' } }, album ? 'These photos open when someone clicks the album. Drag the grip to change the order.' : 'Shown on their own in the category, outside any album. Drag the grip to change the order.'),
        media.length ? grid : h('div', { class: 'empty' }, iconEl('image'), album ? 'This album is empty — upload its photos.' : 'No loose images or videos in this category.')));
    }
    await loadMedia();
    return [A.head('Categories & Media', 'Categories → albums (with a cover) → all their photos.', A.btn('Add Category', 'plus', () => editCategory(null), 'primary')),
      h('div', { class: 'page' }, h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: '18px', alignItems: 'start' }, class: 'media-layout' },
        A.panel(h('span', {}, 'Categories'), catList.childElementCount ? catList : h('div', { class: 'empty' }, 'No categories')), mediaPanel)),
      h('style', {}, '@media (max-width: 900px) { .media-layout { grid-template-columns: 1fr !important; } }')];
  };
  function editAlbum(a, cat, categories, reload, photos = []) {
    const isNew = !a;
    a = a || { title: '', description: '', cover_url: '', visible: 1, category_id: cat.id };
    const title = input(a.title, { placeholder: 'e.g. Summer Drop 2026', autofocus: true });
    const desc = textarea(a.description, { placeholder: 'Optional — shown on the album page', style: { minHeight: '70px' } });
    const cover = E.uploadBox({ value: a.cover_url || '', label: 'Cover image (portrait 4:5 looks best)' });
    const pick = photos.filter((m) => m.type === 'image').length ? h('div', { class: 'mgrid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' } },
      photos.filter((m) => m.type === 'image').map((m) => h('button', { type: 'button', class: 'mitem', style: { padding: 0, cursor: 'pointer' }, title: 'Use as cover', onclick: () => { cover.set(m.url); toast('Cover set — save to apply'); } }, h('img', { src: m.url, alt: '' })))) : null;
    const catSel = select(categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon })), a.category_id);
    const visible = toggle(!!a.visible, 'Visible on the site');
    const save = h('button', { class: 'btn primary' }, isNew ? 'Create album' : 'Save');
    save.onclick = () => withBusy(save, async () => {
      try {
        const body = { title: title.value, description: desc.value, cover_url: cover.value, visible: visible.checked, category_id: catSel.value };
        const r = await api(isNew ? '/api/admin/albums' : `/api/admin/albums/${a.id}`, { method: isNew ? 'POST' : 'PUT', body });
        if (isNew) selAlbum = r.id;
        toast(isNew ? 'Album created — now upload its photos' : 'Album saved', 'success'); s.close(); reload();
      } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) foot.push(A.btn('Delete album', 'trash', async () => {
      if (!(await E.confirmDialog(`Delete “${a.title}”?`, `This also deletes its ${a.count} photo(s).`, { ok: 'Delete', danger: true }))) return;
      await api(`/api/admin/albums/${a.id}`, { method: 'DELETE' }).catch(fail); selAlbum = 'none'; s.close(); reload();
    }, 'danger'));
    foot.push(h('div', { class: 'spacer' }), visible, save);
    const s = sheet({ title: isNew ? 'New album' : `Album — ${a.title}`, size: 'wide', foot,
      body: h('div', { class: 'form' }, h('div', { class: 'row' }, field('Album name', title), field('Category', catSel)), field('Description', desc),
        field('Cover', cover, 'If you leave it empty, the first photo of the album is used.'), pick ? field('Or pick one of its photos', pick) : null) });
  }
  function editCategory(c) {
    const isNew = !c;
    c = c || { icon: 'sparkles', visible: 1 };
    let ic = c.icon;
    const name = input(c.name, { placeholder: 'e.g. MOTION', autofocus: true });
    const desc = input(c.description, { placeholder: 'Optional' });
    const visible = toggle(!!c.visible, 'Visible on the site');
    const save = h('button', { class: 'btn primary' }, 'Save');
    save.onclick = () => withBusy(save, async () => {
      try { await api(isNew ? '/api/admin/categories' : `/api/admin/categories/${c.id}`, { method: isNew ? 'POST' : 'PUT', body: { name: name.value, description: desc.value, icon: ic, visible: visible.checked } }); toast('Saved', 'success'); s.close(); A.refresh(); } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) foot.push(A.btn('Remove', 'trash', async () => {
      if (!(await E.confirmDialog(`Remove ${c.name}?`, `This also deletes its ${c.media_count} media item(s). Products in it keep existing without a category.`, { ok: 'Remove', danger: true }))) return;
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }).catch(fail); s.close(); A.refresh();
    }, 'danger'));
    foot.push(h('div', { class: 'spacer' }), visible, save);
    const s = sheet({ title: isNew ? 'Add category' : `Edit ${c.name}`, foot, body: h('div', { class: 'form' }, field('Name', name), field('Description', desc), field('Icon', A.iconPicker(ic, (n) => { ic = n; }, { brands: false }))) });
  }
  function editMedia(m, categories, reload) {
    const isNew = !m.id;
    const url = input(m.url, { placeholder: 'https://… image or .mp4 link' });
    const title = input(m.title, { placeholder: 'Title' });
    const caption = textarea(m.caption, { placeholder: 'Caption (optional)', style: { minHeight: '70px' } });
    const cat = select(categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon })), m.category_id);
    const poster = E.uploadBox({ value: m.poster || '', label: 'Optional poster image for videos' });
    const save = h('button', { class: 'btn primary' }, 'Save');
    save.onclick = () => withBusy(save, async () => {
      try {
        if (isNew) await api('/api/admin/media', { body: { category_id: cat.value, album_id: String(cat.value) === String(m.category_id) ? m.album_id : null, url: url.value, title: title.value, caption: caption.value, poster: poster.value } });
        else await api(`/api/admin/media/${m.id}`, { method: 'PUT', body: { category_id: cat.value, title: title.value, caption: caption.value, poster: poster.value } });
        toast('Saved', 'success'); s.close(); reload();
      } catch (e) { fail(e); }
    });
    const s = sheet({ title: isNew ? 'Add by link' : 'Edit media', foot: [h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'), save],
      body: h('div', { class: 'form' }, isNew ? field('Link', url) : null, field('Category', cat, isNew ? null : 'Move it to another category'), field('Title', title), field('Caption', caption), m.type === 'video' || isNew ? field('Poster', poster) : null) });
  }

  /* ================= Socials ================= */
  A.pages.socials = async () => {
    const { socials } = await api('/api/admin/socials');
    const list = h('div', { class: 'list' }, socials.map((s) => h('div', { class: 'lrow', dataset: { id: s.id } },
      h('span', { class: 'handle', html: icon('grip') }), h('div', { class: 'ic', html: icon(s.icon) }),
      h('div', { class: 'tt' }, h('strong', {}, s.name), h('span', {}, s.url === '#' ? 'No link yet' : s.url)),
      toggle(!!s.visible, '', (on) => api(`/api/admin/socials/${s.id}`, { method: 'PUT', body: { visible: on } }).then(() => toast(on ? 'Shown' : 'Hidden', 'success')).catch(fail)),
      h('button', { class: 'btn icon sm ghost', 'aria-label': 'Edit', html: icon('edit'), onclick: () => editSocial(s) }))));
    E.dragSort({ containers: [list], item: '.lrow', handle: '.handle', onDrop: () => A.reorder('socials', $$('.lrow', list).map((r) => Number(r.dataset.id))) });
    return [A.head('Social media', 'The icons under your logo and in the footer — drag to reorder.', A.btn('Add social', 'plus', () => editSocial(null), 'primary')),
      h('div', { class: 'page' }, A.panel('Your links', socials.length ? list : h('div', { class: 'empty' }, 'No social links yet')))];
  };
  function editSocial(so) {
    const isNew = !so;
    so = so || { icon: 'instagram', url: '', visible: 1 };
    let ic = so.icon;
    const name = input(so.name, { placeholder: 'Instagram', autofocus: true });
    const url = input(so.url === '#' ? '' : so.url, { placeholder: 'https://instagram.com/yourname', type: 'url' });
    const custom = E.uploadBox({ value: /^(\/|https?:)/.test(ic) ? ic : '', label: 'Or upload your own icon (SVG / PNG)', onDone: (r) => { ic = r.url; picker.value = ''; } });
    const picker = A.iconPicker(/^(\/|https?:)/.test(ic) ? '' : ic, (n) => { ic = n; custom.set(''); if (!name.value) name.value = n[0].toUpperCase() + n.slice(1); });
    const visible = toggle(!!so.visible, 'Visible');
    const save = h('button', { class: 'btn primary' }, 'Save');
    save.onclick = () => withBusy(save, async () => {
      try { await api(isNew ? '/api/admin/socials' : `/api/admin/socials/${so.id}`, { method: isNew ? 'POST' : 'PUT', body: { name: name.value, url: url.value || '#', icon: ic, visible: visible.checked } }); toast('Saved', 'success'); s.close(); A.refresh(); } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) foot.push(A.btn('Delete', 'trash', async () => { if (await E.confirmDialog(`Delete ${so.name}?`, '', { ok: 'Delete', danger: true })) { await api(`/api/admin/socials/${so.id}`, { method: 'DELETE' }).catch(fail); s.close(); A.refresh(); } }, 'danger'));
    foot.push(h('div', { class: 'spacer' }), visible, save);
    const s = sheet({ title: isNew ? 'Add social' : `Edit ${so.name}`, size: 'wide', foot, body: h('div', { class: 'form' }, h('div', { class: 'row' }, field('Name', name), field('Link', url)), field('Icon', picker), custom) });
  }

  /* ================= Texts (font + every text on the site) ================= */
  A.pages.texts = async () => {
    const [ap, site, { texts }] = await Promise.all([api('/api/admin/settings/appearance'), api('/api/admin/settings/site'), api('/api/admin/texts')]);
    // font
    const fontSel = select(Object.keys(E.FONTS).map((n) => ({ value: n, label: n, font: E.fontStack(n) })), ap.font);
    const preview = h('div', { class: 'font-preview' }, h('h4', {}, 'Your Creative Department. Fully Managed.'), h('p', {}, 'Regular — Design, branding, motion & VFX.'),
      h('p', {}, h('em', {}, 'Oblique'), ' · ', h('strong', {}, 'Bold'), ' · ', h('strong', {}, h('em', {}, 'Bold oblique'))));
    const setPreview = () => { preview.style.fontFamily = E.fontStack(fontSel.value); };
    fontSel.select.addEventListener('change', setPreview); setPreview();
    const useFont = h('button', { class: 'btn primary lg' }, 'Use this font');
    useFont.onclick = () => A.saveSettings('appearance', { font: fontSel.value }, useFont);

    // site details
    const sd = { name: input(site.name), handle: input(site.handle), tagline: input(site.tagline), bio: textarea(site.bio, { style: { minHeight: '70px' } }), status: input(site.status), showStatus: toggle(site.showStatus, 'Show status pill'), footer: input(site.footer), projectName: input(site.projectName) };
    const saveSite = h('button', { class: 'btn primary' }, 'Save details');
    saveSite.onclick = () => A.saveSettings('site', Object.fromEntries(Object.entries(sd).map(([k, el]) => [k, k === 'showStatus' ? el.checked : el.value])), saveSite);

    // changed texts
    let pageFilter = 'all-pages';
    const rows = texts.map((t) => ({ ...t, deleted: !!t.deleted }));
    const listEl = h('div', { style: { display: 'grid', gap: '14px' } });
    const countEl = h('span', { class: 'count' });
    const PAGES = [['all', 'All pages'], ['home', 'Home'], ['watch', 'Video Review']];
    const draw = () => {
      const vis = rows.filter((r) => !r._removed && (pageFilter === 'all-pages' || r.page === pageFilter));
      countEl.textContent = rows.filter((r) => !r._removed).length;
      listEl.replaceChildren(...(vis.length ? vis.map(changeRow) : [h('div', { class: 'empty' }, 'No changed texts. Open a page in edit mode, or add a change manually.')]));
    };
    function changeRow(r) {
      const orig = textarea(r.original, { placeholder: 'Paste the exact text as it appears on the site' });
      const repl = textarea(r.replacement, { placeholder: 'New text' });
      orig.oninput = () => { r.original = orig.value; r._dirty = true; };
      repl.oninput = () => { r.replacement = repl.value; r._dirty = true; };
      const pageSel = select(PAGES, r.page, { onChange: (v) => { r.page = v; r._dirty = true; } });
      const badge = h('span', { class: `chip ${r.deleted ? 'bad' : 'brand'}` }, r.deleted ? 'Deleted' : 'Changed');
      const replLabel = h('label', {}, r.deleted ? 'Deleted — hidden on the site, the page closes up around it' : 'New text');
      const card = h('div', { class: `change ${r.deleted ? 'del' : ''}` });
      const del = toggle(r.deleted, 'Delete this text', (on) => {
        r.deleted = on; r._dirty = true; card.classList.toggle('del', on); repl.classList.toggle('ta-del', on);
        badge.className = `chip ${on ? 'bad' : 'brand'}`; badge.textContent = on ? 'Deleted' : 'Changed';
        replLabel.textContent = on ? 'Deleted — hidden on the site, the page closes up around it' : 'New text';
      });
      repl.classList.toggle('ta-del', r.deleted);
      const trash = h('button', { class: 'btn icon sm square', 'aria-label': 'Restore original text', title: 'Restore original', html: icon('trash') });
      trash.onclick = async () => {
        if (r.id) { if (!(await E.confirmDialog('Restore the original text?', r.original.slice(0, 120), { ok: 'Restore' }))) return; await api(`/api/admin/texts/${r.id}`, { method: 'DELETE' }).catch(fail); }
        r._removed = true; draw();
      };
      card.append(h('div', { class: 'change-head' }, pageSel, badge, h('span', { class: 'grow' }), del, trash),
        h('div', { class: 'grid-2', style: { gap: '14px' } }, h('div', { class: 'field' }, h('label', {}, 'Original text (exactly as it is on the site)'), orig), h('div', { class: 'field' }, replLabel, repl)));
      return card;
    }
    draw();
    const addChange = A.btn('Add change', 'plus', () => { rows.unshift({ page: pageFilter === 'all-pages' ? 'all' : pageFilter, original: '', replacement: '', deleted: false, _dirty: true }); draw(); });
    const filterSel = select([['all-pages', 'All pages'], ...PAGES.slice(1)], pageFilter, { onChange: (v) => { pageFilter = v; draw(); } });
    const saveTexts = h('button', { class: 'btn primary' }, 'Save texts');
    saveTexts.onclick = () => withBusy(saveTexts, async () => {
      const items = rows.filter((r) => r._dirty && !r._removed && r.original.trim()).map(({ id, page, original, replacement, deleted }) => ({ id, page, original, replacement, deleted }));
      if (!items.length) { toast('No changes to save'); return; }
      try { await api('/api/admin/texts', { body: { items } }); toast('Texts saved', 'success'); A.refresh(); } catch (e) { fail(e); }
    });
    const open = (path, label) => h('a', { class: 'btn', href: `${path}?edit=1`, target: '_blank' }, iconEl('external'), label);

    return [A.head('Texts', 'Change any text on the site and the font everything is written in.', saveTexts),
      h('div', { class: 'page' },
        A.panel('Font', h('div', { class: 'font-row' }, field('Font for the whole site', fontSel), preview, useFont)),
        A.panel('Edit texts on the page', h('p', { class: 'desc' }, 'Opens the page in edit mode: click any text, then change or delete it and save.'),
          h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, open('/', 'Home'), open('/watch', 'Video Review'))),
        A.panel('Site details', h('div', { class: 'form' }, h('div', { class: 'row' }, field('Name', sd.name), field('Handle', sd.handle), field('Tagline', sd.tagline)), field('Bio', sd.bio),
          h('div', { class: 'row' }, field('Status text', sd.status), field('Footer text', sd.footer), field('Project name (Tasks & Dashboard)', sd.projectName)), sd.showStatus, h('div', { class: 'form-actions' }, saveSite))),
        A.panel(h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' } }, 'Changed texts', countEl, h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } }, filterSel, addChange)), listEl))];
  };

  /* ================= Appearance ================= */
  A.pages.appearance = async () => {
    const ap = await api('/api/admin/settings/appearance');
    const st = { ...ap };
    const frame = h('iframe', { src: '/', title: 'Site preview' });
    const pushPreview = E.debounce(() => { try { frame.contentWindow.Ezro?.applyAppearance(st); } catch { /* not loaded yet */ } }, 60);
    frame.onload = pushPreview;
    const color = (k) => { const i = input(st[k], { type: 'color' }); i.oninput = () => { st[k] = i.value; pushPreview(); drawSw(); }; return i; };
    const primary = color('primary'); const secondary = color('secondary');
    const PRESETS = [['#905abd', '#b491dc'], ['#6d5dfc', '#a39bff'], ['#e0457b', '#ff8fb1'], ['#1f8fff', '#7cc3ff'], ['#14b87a', '#7be3b9'], ['#ff7a18', '#ffc36b'], ['#111111', '#6b6b6b']];
    const sw = h('div', { class: 'swatches' });
    const drawSw = () => sw.replaceChildren(...PRESETS.map(([a, b]) => h('button', { type: 'button', class: `swatch ${st.primary === a && st.secondary === b ? 'on' : ''}`, style: { background: `linear-gradient(135deg, ${a}, ${b})` }, 'aria-label': `${a} ${b}`, onclick: () => { st.primary = a; st.secondary = b; primary.value = a; secondary.value = b; pushPreview(); drawSw(); } })));
    drawSw();
    const theme = segmented([['system', 'System', 'settings'], ['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']], st.defaultTheme, (v) => { st.defaultTheme = v; }, { block: true });
    const range = (k, min, max, lbl) => { const r = h('input', { type: 'range', min, max, value: st[k] }); const out = h('span', { class: 'muted' }, `${st[k]}px`); r.oninput = () => { st[k] = Number(r.value); out.textContent = `${r.value}px`; pushPreview(); }; return field(h('span', { style: { display: 'flex', justifyContent: 'space-between' } }, lbl, out), r); };
    const sw2 = (k, lbl) => toggle(st[k], lbl, (on) => { st[k] = on; pushPreview(); });
    const logo = E.uploadBox({ value: st.logoUrl, label: 'Logo (transparent PNG / WebP / SVG)', onDone: (r) => { st.logoUrl = r.url; } });
    const fav = E.uploadBox({ value: st.faviconUrl, label: 'Icon / favicon (square)', onDone: (r) => { st.faviconUrl = r.url; } });
    const save = h('button', { class: 'btn primary' }, iconEl('check'), 'Save appearance');
    save.onclick = () => A.saveSettings('appearance', st, save).then((r) => { if (r) frame.src = '/'; });
    const reset = A.btn('Reset colours', 'refresh', () => { st.primary = '#905abd'; st.secondary = '#b491dc'; primary.value = st.primary; secondary.value = st.secondary; drawSw(); pushPreview(); });
    return [A.head('Appearance', 'Colours, theme, shapes and logo of the whole site. The preview updates live.', reset, save),
      h('div', { class: 'page' }, h('div', { class: 'split' },
        h('div', { style: { display: 'grid', gap: '18px' } },
          A.panel('Colours', h('div', { class: 'form' }, sw, h('div', { class: 'row' }, field('Primary', primary), field('Secondary', secondary)))),
          A.panel('Theme', h('div', { class: 'form' }, field('Default theme for new visitors', theme, 'Visitors can still switch with the moon / sun button.'), sw2('glass', 'Frosted glass surfaces'), sw2('orbs', 'Glowing background orbs'), sw2('grid', 'Background grid'))),
          A.panel('Shape & size', h('div', { class: 'form' }, range('radius', 4, 32, 'Corner roundness'), range('heroSize', 200, 640, 'Logo size on the home page'))),
          A.panel('Logo & icon', h('div', { class: 'row' }, field('Logo', logo), field('Icon', fav)))),
        A.panel('Live preview', h('div', { class: 'site-frame-wrap' }, frame))))];
  };
})();
