/* =========================================================
   Ezro admin — Orders, Products, Discounts, Payments, Invoice
   ========================================================= */
(function () {
  'use strict';
  const E = window.Ezro; const A = window.Admin;
  const { h, $, $$, icon, iconEl, money, api, toast, fail, withBusy, sheet, field, input, textarea, toggle, select, segmented } = E;

  /* ================= Orders ================= */
  let oStatus = ''; let oQuery = '';
  A.pages.orders = async () => {
    const body = h('div');
    const load = async () => {
      const { orders } = await api(`/api/admin/orders?status=${oStatus}&q=${encodeURIComponent(oQuery)}`);
      if (!orders.length) { body.replaceChildren(h('div', { class: 'empty' }, iconEl('receipt'), 'No orders found.')); return; }
      body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Order'), h('th', {}, 'Customer'), h('th', {}, 'Items'), h('th', {}, 'Method'), h('th', {}, 'Status'), h('th', {}, 'Date'), h('th', { class: 'num' }, 'Total'))),
        h('tbody', {}, orders.map((o) => h('tr', { class: 'click', onclick: () => openOrder(o.id, load) },
          h('td', {}, h('strong', {}, o.number)), h('td', {}, h('div', {}, o.name || '—'), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, o.email)),
          h('td', {}, o.items.map((i) => i.title).join(', ')), h('td', {}, o.method_label || o.method), h('td', {}, A.statusChip(o.status)),
          h('td', {}, E.fmtDateTime(o.created_at)), h('td', { class: 'num' }, h('strong', {}, money(o.total_cents, o.currency)))))))));
    };
    const seg = segmented([['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']], oStatus, (v) => { oStatus = v; load(); });
    const search = h('div', { class: 'input-wrap grow' }, iconEl('search'), input(oQuery, { placeholder: 'Search by order number, email or name…', oninput: E.debounce((e) => { oQuery = e.target.value; load(); }) }));
    await load();
    const sub = (location.hash.match(/^#\/orders\/(\d+)/) || [])[1];
    if (sub) setTimeout(() => openOrder(Number(sub), load), 50);
    return [A.head('Orders', 'Every purchase — verify payments, resend invoices and manage access keys.'), h('div', { class: 'page' }, h('div', { class: 'toolbar' }, search, seg), body)];
  };

  async function openOrder(id, reload) {
    const { order: o, licenses } = await api(`/api/admin/orders/${id}`).catch((e) => { fail(e); return {}; });
    if (!o) return;
    const cur = o.currency;
    const note = textarea(o.admin_note, { placeholder: 'Private note (only admins see this)', style: { minHeight: '70px' } });
    note.onchange = () => api(`/api/admin/orders/${o.id}/note`, { body: { note: note.value } }).then(() => toast('Note saved', 'success')).catch(fail);
    const act = async (fn, msg) => { try { await fn(); toast(msg, 'success'); s.close(); reload?.(); } catch (e) { fail(e); } };
    const foot = [h('a', { class: 'btn', href: `/invoice/${encodeURIComponent(o.number)}`, target: '_blank' }, iconEl('invoice'), 'Invoice'), h('div', { class: 'spacer' })];
    if (o.status === 'paid') {
      foot.push(A.btn('Resend invoice', 'mail', (e) => withBusy(e.currentTarget, () => api(`/api/admin/orders/${o.id}/resend`, { body: {} }).then(() => toast('Invoice sent', 'success')).catch(fail))));
      foot.push(A.btn('Mark refunded', 'refresh', async () => { if (await E.confirmDialog('Mark as refunded?', 'Access keys will stop working. Refund the money in PayPal separately.', { ok: 'Mark refunded', danger: true })) act(() => api(`/api/admin/orders/${o.id}/status`, { body: { status: 'refunded' } }), 'Order refunded'); }, 'danger'));
    } else {
      foot.push(A.btn('Cancel order', 'close', async () => { if (await E.confirmDialog('Cancel this order?', '', { ok: 'Cancel order', danger: true })) act(() => api(`/api/admin/orders/${o.id}/status`, { body: { status: 'cancelled' } }), 'Order cancelled'); }, 'danger'));
      foot.push(A.btn('Confirm payment', 'check', async () => {
        if (await E.confirmDialog('Payment received?', `Only confirm once ${money(o.total_cents, cur)} has actually arrived. The customer instantly gets their key and invoice.`, { ok: 'Confirm & send key' })) act(() => api(`/api/admin/orders/${o.id}/mark-paid`, { body: {} }), 'Marked paid — key sent');
      }, 'primary'));
    }
    const s = sheet({
      title: `Order ${o.number}`, size: 'wide', foot,
      body: [
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' } }, A.statusChip(o.status), h('span', { class: 'chip' }, o.method_label || o.method), o.invoice_sent_at ? h('span', { class: 'chip good' }, iconEl('mail'), `Invoice sent ${E.timeAgo(o.invoice_sent_at)}`) : null),
        h('div', { class: 'grid-2' },
          h('dl', { class: 'kv' },
            h('dt', {}, 'Customer'), h('dd', {}, `${o.name || '—'} · ${o.email}`),
            o.payer_email ? [h('dt', {}, 'PayPal payer'), h('dd', {}, o.payer_email)] : null,
            h('dt', {}, 'Created'), h('dd', {}, new Date(o.created_at).toLocaleString()),
            o.paid_at ? [h('dt', {}, 'Paid'), h('dd', {}, new Date(o.paid_at).toLocaleString())] : null,
            o.paypal_order_id ? [h('dt', {}, 'PayPal order'), h('dd', { class: 'mono' }, o.paypal_order_id)] : null,
            o.paypal_capture_id ? [h('dt', {}, 'Transaction'), h('dd', { class: 'mono' }, o.paypal_capture_id)] : null),
          h('div', { class: 'totals', style: { margin: 0 } },
            o.items.map((i) => h('div', {}, h('span', {}, i.title), h('span', {}, money(i.price_cents, cur)))),
            o.discount_cents ? h('div', { class: 'disc', style: { color: 'var(--good)' } }, h('span', {}, `Discount ${o.discount_code || ''}`), h('span', {}, `−${money(o.discount_cents, cur)}`)) : null,
            o.tax_cents ? h('div', {}, h('span', { class: 'muted' }, 'Tax'), h('span', {}, money(o.tax_cents, cur))) : null,
            h('div', { class: 'total', style: { fontWeight: 800, fontSize: '18px', paddingTop: '8px', borderTop: '1px solid var(--border)' } }, h('span', {}, 'Total'), h('span', {}, money(o.total_cents, cur))))),
        licenses.length ? [h('div', { class: 'divider' }), h('div', { class: 'label', style: { marginBottom: '10px' } }, 'Access keys'),
          h('div', { class: 'list' }, licenses.map((l) => h('div', { class: 'lrow' }, h('div', { class: 'ic', html: icon('key') }),
            h('div', { class: 'tt' }, h('strong', { class: 'mono' }, l.key), h('span', {}, `${l.product_title} · ${l.views} view session${l.views === 1 ? '' : 's'}${l.last_view_at ? ` · last ${E.timeAgo(l.last_view_at)}` : ''}`)),
            h('button', { class: 'btn icon sm ghost', 'aria-label': 'Copy', html: icon('copy'), onclick: () => E.copy(l.key) }),
            toggle(!l.revoked, l.revoked ? 'Revoked' : 'Active', (on) => api(`/api/admin/licenses/${l.id}/revoke`, { body: { revoked: !on } }).then(() => toast(on ? 'Key restored' : 'Key revoked', 'success')).catch(fail)))))] : null,
        h('div', { class: 'divider' }), field('Admin note', note),
      ],
    });
  }

  /* ================= Products ================= */
  A.pages.products = async () => {
    const [{ products }, { categories }] = await Promise.all([api('/api/admin/products'), api('/api/admin/categories')]);
    const catName = (id) => categories.find((c) => c.id === id)?.name || 'No category';
    const statusChip = (p) => (p.status === 'active' ? h('span', { class: 'chip good' }, 'Live') : p.status === 'coming_soon' ? h('span', { class: 'chip warn' }, 'Coming soon') : h('span', { class: 'chip' }, 'Hidden'));
    const grid = h('div', { class: 'pgrid' }, products.map((p) => h('article', { class: 'pcard', dataset: { id: p.id }, onclick: () => editProduct(p, categories) },
      h('div', { class: 'cv' }, p.cover_url ? h('img', { src: p.cover_url, alt: '' }) : iconEl('box'), h('div', { class: 'chips' }, statusChip(p), p.badge ? h('span', { class: 'chip brand' }, p.badge) : null), h('span', { class: 'handle', html: icon('grip'), title: 'Drag to reorder' })),
      h('div', { class: 'bd' }, h('strong', {}, p.title), h('div', { class: 'r' }, h('span', {}, catName(p.category_id)), h('span', {}, h('strong', { style: { color: 'var(--text)' } }, A.money(p.price_cents)))),
        h('div', { class: 'r' }, h('span', {}, `${p.sold} sold${p.stock != null ? ` · ${p.stock} left` : ''}`), p.status === 'coming_soon' ? h('span', {}, `${p.waiting} waiting`) : h('span', {}, p.video_source !== 'none' ? '🔒 video' : ''))))));
    E.dragSort({ containers: [grid], item: '.pcard', handle: '.handle', onDrop: () => A.reorder('products', $$('.pcard', grid).map((c) => Number(c.dataset.id))) });
    return [A.head('Products', 'Everything you sell — drag to change the order in the shop.', A.btn('Add Product', 'plus', () => editProduct(null, categories), 'primary')),
      h('div', { class: 'page' }, products.length ? grid : h('div', { class: 'empty' }, iconEl('box'), 'No products yet.', A.btn('Add your first product', 'plus', () => editProduct(null, categories), 'primary')))];
  };

  function editProduct(p, categories) {
    const isNew = !p;
    p = p || { status: 'active', video_source: 'none', gallery: [], features: [], tags: [], price_cents: 0 };
    const f = {
      title: input(p.title, { placeholder: 'Cinematic VFX Pack', autofocus: true }),
      subtitle: input(p.subtitle, { placeholder: 'Short line under the title' }),
      slug: input(p.slug, { placeholder: 'auto from title' }),
      category: select([['', 'No category'], ...categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))], p.category_id ?? ''),
      badge: input(p.badge, { placeholder: 'e.g. New, Best seller' }),
      price: input(p.price_cents ? (p.price_cents / 100).toFixed(2) : '', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' }),
      compare: input(p.compare_cents ? (p.compare_cents / 100).toFixed(2) : '', { type: 'number', min: '0', step: '0.01', placeholder: 'Optional — shows as crossed out' }),
      stock: input(p.stock ?? '', { type: 'number', min: '0', placeholder: 'Unlimited' }),
      release: input(E.toLocalInput(p.release_at), { type: 'datetime-local' }),
      description: textarea(p.description, { placeholder: 'What is it, who is it for, what makes it special…', style: { minHeight: '130px' } }),
      features: textarea((p.features || []).join('\n'), { placeholder: 'One per line — e.g.\n4K project files\nStep-by-step tutorial\nCommercial license' }),
      tags: input((p.tags || []).join(', '), { placeholder: 'vfx, after effects, pack' }),
      preview: input(p.preview_url, { placeholder: 'YouTube / Vimeo link, or upload below' }),
      deliver: textarea(p.deliver_note, { placeholder: 'Shown on the product page and after purchase — e.g. “1h 20m tutorial + project files”', style: { minHeight: '70px' } }),
      driveRef: input(p.video_source === 'drive' ? p.video_ref : '', { placeholder: 'Google Drive share link or file ID' }),
    };
    let status = p.status; let source = p.video_source || 'none'; let uploadRef = p.video_source === 'upload' ? p.video_ref : '';
    const cover = E.uploadBox({ value: p.cover_url || '', label: 'Cover image (16:10 looks best)' });
    const gallery = [...(p.gallery || [])];
    const galBox = h('div', { class: 'mgrid' });
    const drawGallery = () => galBox.replaceChildren(...gallery.map((u, i) => h('div', { class: 'mitem', dataset: { u } }, /\.(mp4|webm|mov)$/i.test(u) ? h('video', { src: u, muted: true }) : h('img', { src: u, alt: '' }),
      h('div', { class: 'ov' }, h('div', { class: 'top' }, h('span', { class: 'handle', html: icon('grip') }), h('button', { type: 'button', 'aria-label': 'Remove', html: icon('trash'), onclick: () => { gallery.splice(i, 1); drawGallery(); } }))))),
    E.uploadBox({ label: 'Add image', onDone: (r) => { gallery.push(r.url); drawGallery(); } }));
    drawGallery();
    E.dragSort({ containers: [galBox], item: '.mitem', handle: '.handle', onDrop: () => { const order = $$('.mitem', galBox).map((m) => m.dataset.u); gallery.splice(0, gallery.length, ...order); } });
    const previewUp = E.uploadBox({ accept: 'video/*', label: 'Upload a public preview / trailer video', onDone: (r) => { f.preview.value = r.url; } });

    const releaseField = field('Release date (countdown)', f.release, 'Optional. Shows a live countdown on the product.');
    const statusSeg = segmented([['active', 'Live', 'check'], ['coming_soon', 'Coming soon', 'clock'], ['hidden', 'Hidden', 'lock']], status, (v) => { status = v; releaseField.classList.toggle('hidden', v !== 'coming_soon'); }, { block: true });
    releaseField.classList.toggle('hidden', status !== 'coming_soon');

    const secureUp = E.uploadBox({ accept: 'video/*', secure: true, url: '/api/admin/upload-secure', value: uploadRef, label: 'Upload the private video (stored outside the public site)', onDone: (r) => { uploadRef = r.ref; } });
    const driveField = field('Google Drive file', f.driveRef, 'Share the file with your service-account email (Viewer). Customers never see this link.');
    const upField = field('Private video file', secureUp);
    const showSource = () => { driveField.classList.toggle('hidden', source !== 'drive'); upField.classList.toggle('hidden', source !== 'upload'); };
    const sourceSeg = segmented([['none', 'No video'], ['drive', 'Google Drive', 'globe'], ['upload', 'Upload', 'upload']], source, (v) => { source = v; showSource(); }, { block: true });
    showSource();

    const save = h('button', { class: 'btn primary' }, iconEl('check'), isNew ? 'Create product' : 'Save changes');
    save.onclick = () => withBusy(save, async () => {
      const body = {
        title: f.title.value, subtitle: f.subtitle.value, slug: f.slug.value || undefined, category_id: f.category.value, badge: f.badge.value,
        price: f.price.value || 0, compare_price: f.compare.value, stock: f.stock.value, status, release_at: f.release.value || null,
        description: f.description.value, features: f.features.value, tags: f.tags.value, preview_url: f.preview.value, deliver_note: f.deliver.value,
        cover_url: cover.value, gallery, video_source: source, video_ref: source === 'drive' ? f.driveRef.value : source === 'upload' ? uploadRef : '',
      };
      if (!body.title.trim()) { toast('Give the product a title', 'error'); f.title.focus(); return; }
      try {
        await api(isNew ? '/api/admin/products' : `/api/admin/products/${p.id}`, { method: isNew ? 'POST' : 'PUT', body });
        toast(isNew ? 'Product created' : 'Product saved', 'success'); s.close(); A.refresh();
      } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) {
      foot.push(A.btn('Delete', 'trash', async () => {
        if (!(await E.confirmDialog(`Delete “${p.title}”?`, 'Existing buyers keep their keys, but the video will no longer play.', { ok: 'Delete', danger: true }))) return;
        await api(`/api/admin/products/${p.id}`, { method: 'DELETE' }).then(() => { toast('Product deleted'); s.close(); A.refresh(); }).catch(fail);
      }, 'danger'));
      foot.push(h('a', { class: 'btn', href: `/#shop/${encodeURIComponent(p.slug)}`, target: '_blank' }, iconEl('external'), 'View'));
    }
    foot.push(h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'), save);

    const sec = (t, ...kids) => h('section', { class: 'form', style: { marginBottom: '26px' } }, h('div', { class: 'panel-title', style: { marginBottom: 0 } }, h('span', { class: 'dot' }), t), ...kids);
    const s = sheet({
      title: isNew ? 'Add Product' : `Edit — ${p.title}`, size: 'xl', foot,
      body: h('div', { class: 'split' },
        h('div', {},
          sec('Basics', field('Title', f.title), field('Subtitle', f.subtitle), h('div', { class: 'row' }, field('Category', f.category), field('Badge', f.badge)), field('URL name', f.slug, 'Used in the product link.')),
          sec('Availability', statusSeg, releaseField),
          sec('Pricing', h('div', { class: 'row' }, field(`Price (${A.site?.checkout?.currency || 'EUR'})`, f.price), field('Compare-at price', f.compare)), field('Stock', f.stock, 'Leave empty for unlimited digital copies.')),
          sec('Description', field('Description', f.description), field('Features', f.features), field('Tags', f.tags))),
        h('div', {},
          sec('Images', field('Cover', cover), field('Gallery — drag to reorder', galBox)),
          sec('Public preview', field('Preview video', f.preview), previewUp),
          sec('Protected delivery', h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '-6px' } }, 'The video buyers unlock with their key on the Video Review page.'), sourceSeg, driveField, upField, field('What the buyer gets', f.deliver)))),
    });
  }

  /* ================= Discounts ================= */
  A.pages.discounts = async () => {
    const [{ discounts }, { products }] = await Promise.all([api('/api/admin/discounts'), api('/api/admin/products')]);
    const now = Date.now();
    const state = (d) => (!d.active ? ['', 'Off'] : d.ends_at && d.ends_at < now ? ['bad', 'Expired'] : d.starts_at && d.starts_at > now ? ['warn', 'Scheduled'] : d.max_uses && d.uses >= d.max_uses ? ['bad', 'Used up'] : ['good', 'Active']);
    const list = discounts.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Discount'), h('th', {}, 'Applies to'), h('th', {}, 'Uses'), h('th', {}, 'Valid'), h('th', {}, 'Status'))),
      h('tbody', {}, discounts.map((d) => { const [c, l] = state(d); return h('tr', { class: 'click', onclick: () => editDiscount(d, products) },
        h('td', {}, h('strong', { class: 'mono' }, d.code), d.note ? h('div', { class: 'muted', style: { fontSize: '12px' } }, d.note) : null),
        h('td', {}, d.type === 'percent' ? `${d.value}% off` : `${A.money(d.value)} off`, d.min_cents ? h('div', { class: 'muted', style: { fontSize: '12px' } }, `min ${A.money(d.min_cents)}`) : null),
        h('td', {}, d.product_ids?.length ? `${d.product_ids.length} product(s)` : 'Everything'),
        h('td', {}, `${d.uses}${d.max_uses ? ` / ${d.max_uses}` : ''}`),
        h('td', {}, d.starts_at || d.ends_at ? `${d.starts_at ? E.fmtDate(d.starts_at) : 'now'} → ${d.ends_at ? E.fmtDate(d.ends_at) : '∞'}` : 'Always'),
        h('td', {}, h('span', { class: `chip ${c}` }, l))); }))))
      : h('div', { class: 'empty' }, iconEl('percent'), 'No discount codes yet.');
    return [A.head('Discounts', 'Create codes — percent or fixed amount, with limits and dates.', A.btn('New code', 'plus', () => editDiscount(null, products), 'primary')), h('div', { class: 'page' }, list)];
  };
  function editDiscount(d, products) {
    const isNew = !d;
    d = d || { type: 'percent', active: 1, product_ids: [] };
    let type = d.type;
    const code = input(d.code, { placeholder: 'SUMMER20', style: { textTransform: 'uppercase', fontFamily: 'var(--mono)' }, autofocus: true });
    const gen = h('button', { class: 'btn', type: 'button', onclick: () => { code.value = `EZRO${Math.random().toString(36).slice(2, 7).toUpperCase()}`; } }, iconEl('sparkles'), 'Generate');
    const value = input(d.value != null ? (d.type === 'fixed' ? (d.value / 100).toFixed(2) : d.value) : '', { type: 'number', min: '0', step: 'any' });
    const suffix = h('span', { class: 'suffix' }, type === 'percent' ? '%' : A.site?.checkout?.currency || 'EUR');
    const typeSeg = segmented([['percent', 'Percent %'], ['fixed', 'Fixed amount']], type, (v) => { type = v; suffix.textContent = v === 'percent' ? '%' : A.site?.checkout?.currency || 'EUR'; }, { block: true });
    const min = input(d.min_cents ? (d.min_cents / 100).toFixed(2) : '', { type: 'number', min: '0', step: '0.01', placeholder: 'No minimum' });
    const maxUses = input(d.max_uses ?? '', { type: 'number', min: '1', placeholder: 'Unlimited' });
    const starts = input(E.toLocalInput(d.starts_at), { type: 'datetime-local' });
    const ends = input(E.toLocalInput(d.ends_at), { type: 'datetime-local' });
    const active = toggle(!!d.active, 'Active');
    const note = input(d.note, { placeholder: 'Internal note, e.g. “Instagram giveaway”' });
    const picked = new Set(d.product_ids || []);
    const prodList = h('div', { class: 'list', style: { maxHeight: '220px', overflowY: 'auto' } }, products.map((p) => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = picked.has(p.id);
      cb.onchange = () => (cb.checked ? picked.add(p.id) : picked.delete(p.id));
      return h('label', { class: 'check lrow', style: { alignItems: 'center' } }, cb, h('span', { class: 'tt' }, p.title));
    }));
    const save = h('button', { class: 'btn primary' }, isNew ? 'Create code' : 'Save');
    save.onclick = () => withBusy(save, async () => {
      const body = { code: code.value, type, value: value.value, min: min.value, max_uses: maxUses.value, starts_at: starts.value || null, ends_at: ends.value || null, active: active.checked, note: note.value, product_ids: [...picked] };
      try { await api(isNew ? '/api/admin/discounts' : `/api/admin/discounts/${d.id}`, { method: isNew ? 'POST' : 'PUT', body }); toast('Saved', 'success'); s.close(); A.refresh(); } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) foot.push(A.btn('Delete', 'trash', async () => { if (await E.confirmDialog(`Delete ${d.code}?`, '', { ok: 'Delete', danger: true })) { await api(`/api/admin/discounts/${d.id}`, { method: 'DELETE' }).catch(fail); s.close(); A.refresh(); } }, 'danger'));
    foot.push(h('div', { class: 'spacer' }), active, save);
    const s = sheet({
      title: isNew ? 'New discount code' : `Edit ${d.code}`, size: 'wide', foot,
      body: h('div', { class: 'form' },
        field('Code', h('div', { class: 'input-group' }, code, gen)), typeSeg,
        h('div', { class: 'row' }, field('Amount', h('div', { class: 'input-wrap' }, value, suffix)), field('Minimum order', min), field('Max uses', maxUses)),
        h('div', { class: 'row' }, field('Starts', starts), field('Ends', ends)),
        field('Only for these products', prodList, 'Leave all unchecked to apply to the whole cart.'), field('Note', note)),
    });
  }

  /* ================= Payments & Checkout ================= */
  A.pages.payments = async () => {
    const [{ methods, paypal }, c] = await Promise.all([api('/api/admin/payment-methods'), api('/api/admin/settings/checkout')]);
    const pp = { enabled: toggle(c.paypalEnabled, 'Show PayPal at checkout'), label: input(c.paypalLabel), desc: input(c.paypalDescription) };
    const co = {
      currency: select(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'JPY'].map((x) => [x, x]), c.currency),
      tax: input(c.taxPercent, { type: 'number', min: '0', max: '50', step: '0.1' }), taxLabel: input(c.taxLabel), taxIncluded: toggle(c.taxIncluded, 'Prices already include tax'),
      requireTerms: toggle(c.requireTerms, 'Require a checkbox before paying'), terms: textarea(c.termsText, { style: { minHeight: '64px' } }),
      button: input(c.buttonText), sTitle: input(c.successTitle), sMsg: textarea(c.successMessage, { style: { minHeight: '64px' } }),
    };
    const savePP = h('button', { class: 'btn primary' }, 'Save PayPal');
    savePP.onclick = () => A.saveSettings('checkout', { paypalEnabled: pp.enabled.checked, paypalLabel: pp.label.value, paypalDescription: pp.desc.value }, savePP);
    const saveCo = h('button', { class: 'btn primary' }, 'Save checkout');
    saveCo.onclick = () => A.saveSettings('checkout', { currency: co.currency.value, taxPercent: Number(co.tax.value) || 0, taxLabel: co.taxLabel.value, taxIncluded: co.taxIncluded.checked, requireTerms: co.requireTerms.checked, termsText: co.terms.value, buttonText: co.button.value, successTitle: co.sTitle.value, successMessage: co.sMsg.value }, saveCo);

    const list = h('div', { class: 'list' }, methods.map((m) => h('div', { class: 'lrow', dataset: { id: m.id } },
      h('span', { class: 'handle', html: icon('grip') }), h('div', { class: 'ic', html: icon(m.icon) }),
      h('div', { class: 'tt' }, h('strong', {}, m.name), h('span', {}, m.description || m.instructions.split('\n')[0])),
      toggle(!!m.enabled, '', (on) => api(`/api/admin/payment-methods/${m.id}`, { method: 'PUT', body: { enabled: on } }).then(() => toast(on ? `${m.name} enabled` : `${m.name} disabled`, 'success')).catch(fail)),
      h('button', { class: 'btn icon sm ghost', 'aria-label': 'Edit', html: icon('edit'), onclick: () => editMethod(m) }))));
    E.dragSort({ containers: [list], item: '.lrow', handle: '.handle', onDrop: () => A.reorder('payment_methods', $$('.lrow', list).map((r) => Number(r.dataset.id))) });

    return [A.head('Payments & Checkout', 'PayPal, your own payment methods, and everything the checkout shows.'),
      h('div', { class: 'page' }, h('div', { class: 'split' },
        h('div', { style: { display: 'grid', gap: '18px' } },
          A.panel(h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, 'PayPal', h('span', { class: `chip ${paypal.configured ? 'good' : 'warn'}` }, paypal.configured ? `Connected · ${paypal.env}` : 'Keys missing in .env')),
            h('p', { class: 'desc' }, 'Payments are captured and verified on the server — the key is only sent after PayPal confirms the exact amount arrived.'),
            h('div', { class: 'form' }, pp.enabled, h('div', { class: 'row' }, field('Label', pp.label), field('Description', pp.desc)), h('div', { class: 'form-actions' }, savePP))),
          A.panel(h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 } }, 'Your payment methods', h('span', { style: { marginLeft: 'auto' } }, A.btn('Add method', 'plus', () => editMethod(null), 'sm'))),
            h('p', { class: 'desc' }, 'Bank transfer, IRIS, Revolut, crypto… The customer sees your instructions, the order waits as “Pending” and you confirm it in Orders — then the key is sent.'),
            methods.length ? list : h('div', { class: 'empty' }, 'No custom methods yet'))),
        A.panel('Checkout', h('div', { class: 'form' },
          h('div', { class: 'row' }, field('Currency', co.currency), field('Tax %', co.tax), field('Tax label', co.taxLabel)), co.taxIncluded,
          co.requireTerms, field('Terms text', co.terms), field('Checkout button text', co.button),
          field('Success title', co.sTitle), field('Success message', co.sMsg), h('div', { class: 'form-actions' }, saveCo)))))];
  };
  function editMethod(m) {
    const isNew = !m;
    m = m || { icon: 'bank', enabled: 1, instructions: '' };
    let ic = m.icon;
    const name = input(m.name, { placeholder: 'e.g. Bank transfer, IRIS, Revolut', autofocus: true });
    const desc = input(m.description, { placeholder: 'Short line under the name' });
    const instr = textarea(m.instructions, { placeholder: 'Step by step how to pay. Use {number} for the order number.', style: { minHeight: '150px', fontFamily: 'var(--mono)', fontSize: '13px' } });
    const enabled = toggle(!!m.enabled, 'Enabled');
    const picker = A.iconPicker(ic, (n) => { ic = n; });
    const save = h('button', { class: 'btn primary' }, 'Save');
    save.onclick = () => withBusy(save, async () => {
      try { await api(isNew ? '/api/admin/payment-methods' : `/api/admin/payment-methods/${m.id}`, { method: isNew ? 'POST' : 'PUT', body: { name: name.value, description: desc.value, instructions: instr.value, icon: ic, enabled: enabled.checked } }); toast('Saved', 'success'); s.close(); A.refresh(); } catch (e) { fail(e); }
    });
    const foot = [];
    if (!isNew) foot.push(A.btn('Delete', 'trash', async () => { if (await E.confirmDialog(`Delete ${m.name}?`, '', { ok: 'Delete', danger: true })) { await api(`/api/admin/payment-methods/${m.id}`, { method: 'DELETE' }).catch(fail); s.close(); A.refresh(); } }, 'danger'));
    foot.push(h('div', { class: 'spacer' }), enabled, save);
    const s = sheet({ title: isNew ? 'Add payment method' : `Edit ${m.name}`, size: 'wide', foot,
      body: h('div', { class: 'form' }, h('div', { class: 'row' }, field('Name', name), field('Description', desc)), field('Icon', picker), field('Instructions for the customer', instr, 'Shown after they place the order and in their email.')) });
  }

  /* ================= Invoice ================= */
  A.pages.invoice = async () => {
    const inv = await api('/api/admin/settings/invoice');
    const f = {
      companyName: input(inv.companyName), address: textarea(inv.address, { style: { minHeight: '70px' } }), vatId: input(inv.vatId), email: input(inv.email), website: input(inv.website),
      subject: input(inv.subject), heading: input(inv.heading), intro: textarea(inv.intro, { style: { minHeight: '80px' } }), notes: textarea(inv.notes, { style: { minHeight: '70px' } }), footer: textarea(inv.footer, { style: { minHeight: '60px' } }),
      accent: input(inv.accent, { type: 'color' }), prefix: input(inv.prefix), nextNumber: input(inv.nextNumber, { type: 'number', min: '1' }),
      showTax: toggle(inv.showTax, 'Show tax line'), showKeys: toggle(inv.showKeys, 'Include access keys'), showPayer: toggle(inv.showPayer, 'Show PayPal payer email'),
    };
    const logo = E.uploadBox({ value: inv.logoUrl, label: 'Logo', onDone: () => refresh() });
    const banner = E.uploadBox({ value: inv.bannerUrl, label: 'Optional banner image on top', onDone: () => refresh() });
    const values = () => ({
      ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, 'checked' in el && !(el instanceof HTMLInputElement) ? el.checked : el.value])),
      logoUrl: logo.value, bannerUrl: banner.value, nextNumber: Number(f.nextNumber.value) || 1,
    });
    const frame = h('iframe', { class: 'preview-frame', title: 'Invoice preview', sandbox: '' });
    const refresh = E.debounce(async () => { try { const r = await api('/api/admin/invoice/preview', { body: values(), raw: true }); frame.srcdoc = await r.text(); } catch (e) { fail(e); } }, 350);
    Object.values(f).forEach((el) => { el.addEventListener('input', refresh); el.addEventListener('change', refresh); });
    const clearBanner = h('button', { class: 'btn sm', onclick: () => { banner.set(''); refresh(); } }, 'Remove banner');
    const save = h('button', { class: 'btn primary' }, iconEl('check'), 'Save invoice');
    save.onclick = () => A.saveSettings('invoice', values(), save);
    const test = h('button', { class: 'btn' }, iconEl('mail'), 'Send me a test');
    test.onclick = () => withBusy(test, async () => { try { const r = await api('/api/admin/invoice/test', { body: {} }); toast(r.smtp ? `Test sent to ${A.me.email}` : 'SMTP not set — saved to data/outbox instead', r.smtp ? 'success' : 'info', 4000); } catch (e) { fail(e); } });
    refresh();
    return [A.head('Invoice', 'Design the email customers get after paying. Placeholders: {number}, {name}, {total}.', test, save),
      h('div', { class: 'page' }, h('div', { class: 'split' },
        h('div', { style: { display: 'grid', gap: '18px' } },
          A.panel('Brand', h('div', { class: 'form' }, h('div', { class: 'row' }, field('Logo', logo), field('Banner', h('div', { style: { display: 'grid', gap: '8px' } }, banner, clearBanner))), h('div', { class: 'row' }, field('Business name', f.companyName), field('Accent colour', f.accent)))),
          A.panel('Details', h('div', { class: 'form' }, field('Address', f.address), h('div', { class: 'row' }, field('VAT / Tax ID', f.vatId), field('Email', f.email), field('Website', f.website)), h('div', { class: 'row' }, field('Invoice prefix', f.prefix), field('Next number', f.nextNumber)))),
          A.panel('Email text', h('div', { class: 'form' }, field('Subject', f.subject), field('Heading', f.heading), field('Intro', f.intro), field('Notes', f.notes), field('Footer', f.footer), f.showKeys, f.showTax, f.showPayer))),
        A.panel('Live preview', frame)))];
  };
})();
