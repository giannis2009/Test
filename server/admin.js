const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { all, get, run, tx, now, getSetting, setSetting, DEFAULTS, UPLOAD_DIR, SECURE_DIR } = require('./db');
const { requireAdmin, isOwner, ownerEmails } = require('./auth');
const { fulfil } = require('./shop');
const { renderInvoice, sendInvoice, send, smtpConfigured } = require('./mailer');
const paypal = require('./paypal');
const video = require('./video');
const { log, str, int, bool, cents, slugify, safeUrl, hex, money, HttpError, wrap } = require('./util');

const router = express.Router();
router.use(requireAdmin);

const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const day = (t) => new Date(t).toISOString().slice(0, 10);
const dateOrNull = (v) => { if (!v) return null; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };

/* ================= uploads ================= */
const IMG = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const VID = /\.(mp4|webm|mov|m4v)$/i;
const storage = (dir) => multer.diskStorage({
  destination: dir,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});
const publicUpload = multer({
  storage: storage(UPLOAD_DIR), limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(IMG.test(f.originalname) || VID.test(f.originalname) ? null : new HttpError(400, 'Only images or videos.'), true),
});
const secureUpload = multer({
  storage: storage(SECURE_DIR), limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(VID.test(f.originalname) ? null : new HttpError(400, 'Only video files.'), true),
});

router.post('/upload', publicUpload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file.');
  log(req, 'upload', req.file.originalname);
  res.json({ url: `/uploads/${req.file.filename}`, type: VID.test(req.file.filename) ? 'video' : 'image' });
});
router.post('/upload-secure', secureUpload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file.');
  log(req, 'upload.secure_video', req.file.originalname);
  res.json({ ref: req.file.filename, name: req.file.originalname });
});

/* ================= dashboard ================= */
router.get('/stats', (req, res) => {
  const days = Math.min(365, Math.max(7, int(req.query.days, 30)));
  const since = Date.now() - (days - 1) * 86400_000;
  const series = [];
  for (let i = 0; i < days; i++) series.push({ day: day(since + i * 86400_000), visitors: 0, views: 0, orders: 0, revenue: 0 });
  const idx = Object.fromEntries(series.map((s, i) => [s.day, i]));
  for (const r of all('SELECT day, COUNT(DISTINCT visitor) v, SUM(hits) h FROM views WHERE day >= ? GROUP BY day', day(since))) {
    if (idx[r.day] != null) Object.assign(series[idx[r.day]], { visitors: r.v, views: r.h });
  }
  for (const o of all("SELECT paid_at, total_cents FROM orders WHERE status = 'paid' AND paid_at >= ?", since)) {
    const i = idx[day(o.paid_at)]; if (i != null) { series[i].orders += 1; series[i].revenue += o.total_cents; }
  }
  const cur = getSetting('checkout').currency;
  const tot = get("SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) s FROM orders WHERE status = 'paid'");
  const periodRevenue = series.reduce((s, d) => s + d.revenue, 0);
  const periodOrders = series.reduce((s, d) => s + d.orders, 0);
  const periodVisitors = series.reduce((s, d) => s + d.visitors, 0);
  res.json({
    currency: cur, series,
    totals: {
      revenueAll: tot.s, ordersAll: tot.n, periodRevenue, periodOrders, periodVisitors,
      today: series[series.length - 1],
      pending: get("SELECT COUNT(*) n FROM orders WHERE status = 'pending' AND method LIKE 'pm:%'").n,
      customers: get("SELECT COUNT(DISTINCT email) n FROM orders WHERE status = 'paid'").n,
      conversion: periodVisitors ? (periodOrders / periodVisitors) * 100 : 0,
      avgOrder: tot.n ? Math.round(tot.s / tot.n) : 0,
    },
    topProducts: all(`SELECT l.product_title title, COUNT(*) sold FROM licenses l GROUP BY l.product_title ORDER BY sold DESC LIMIT 5`),
    recentOrders: all('SELECT id, number, email, status, total_cents, currency, method_label, created_at FROM orders ORDER BY created_at DESC LIMIT 6'),
    recentLogs: all('SELECT * FROM logs ORDER BY at DESC LIMIT 8'),
    integrations: {
      paypal: paypal.configured(), paypalEnv: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
      google: !!process.env.GOOGLE_CLIENT_ID, smtp: smtpConfigured(), drive: video.driveConfigured(),
    },
  });
});

/* ================= generic settings ================= */
// Values are coerced to the type of their default, so nothing unexpected can be stored.
function sanitizeSettings(key, body) {
  const defs = DEFAULTS[key];
  if (!defs) throw new HttpError(404, 'Unknown settings group');
  const out = {};
  for (const [k, def] of Object.entries(defs)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (typeof def === 'boolean') out[k] = bool(v);
    else if (typeof def === 'number') out[k] = Number.isFinite(Number(v)) ? Number(v) : def;
    else if (/Url$/.test(k)) out[k] = safeUrl(v);
    else if (/^(primary|secondary|accent)$/.test(k)) out[k] = hex(v, def);
    else out[k] = str(v, 5000);
  }
  if (key === 'checkout' && out.currency) out.currency = out.currency.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'EUR';
  return out;
}
router.get('/settings/:key', (req, res) => res.json(getSetting(req.params.key)));
router.put('/settings/:key', (req, res) => {
  const value = setSetting(req.params.key, sanitizeSettings(req.params.key, req.body || {}));
  log(req, `settings.${req.params.key}`, '', Object.keys(req.body || {}).join(', '));
  res.json(value);
});

/* ================= generic reorder ================= */
const ORDERABLE = { categories: 'categories', media: 'media', albums: 'albums', products: 'products', socials: 'socials', payment_methods: 'payment_methods' };
router.put('/reorder/:table', (req, res) => {
  const table = ORDERABLE[req.params.table];
  if (!table) throw new HttpError(404, 'Unknown');
  const ids = (req.body?.ids || []).map(Number);
  tx(() => ids.forEach((id, i) => run(`UPDATE ${table} SET sort = ? WHERE id = ?`, i, id)));
  log(req, `${table}.reorder`, '', `${ids.length} items`);
  res.json({ ok: true });
});

/* ================= categories ================= */
router.get('/categories', (_req, res) => res.json({
  categories: all(`SELECT c.*, (SELECT COUNT(*) FROM media m WHERE m.category_id = c.id) media_count, (SELECT COUNT(*) FROM albums a WHERE a.category_id = c.id) album_count,
    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) product_count FROM categories c ORDER BY sort, id`),
}));
router.post('/categories', (req, res) => {
  const name = str(req.body?.name, 60);
  if (!name) throw new HttpError(400, 'Name is required.');
  let slug = slugify(req.body?.slug || name);
  if (get('SELECT 1 FROM categories WHERE slug = ?', slug)) slug = `${slug}-${Date.now() % 10000}`;
  const sort = get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM categories').s;
  const r = run('INSERT INTO categories (name, slug, icon, description, sort, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name, slug, str(req.body?.icon, 40) || 'sparkles', str(req.body?.description, 500), sort, req.body?.visible === false ? 0 : 1, now());
  log(req, 'category.add', name);
  res.json({ id: Number(r.lastInsertRowid) });
});
router.put('/categories/:id', (req, res) => {
  const c = get('SELECT * FROM categories WHERE id = ?', int(req.params.id));
  if (!c) throw new HttpError(404, 'Not found');
  const b = req.body || {};
  run('UPDATE categories SET name = ?, slug = ?, icon = ?, description = ?, visible = ? WHERE id = ?',
    str(b.name ?? c.name, 60) || c.name, b.slug ? slugify(b.slug) : c.slug, str(b.icon ?? c.icon, 40), str(b.description ?? c.description, 500),
    b.visible === undefined ? c.visible : bool(b.visible) ? 1 : 0, c.id);
  log(req, 'category.update', c.name, b.name && b.name !== c.name ? `renamed to ${b.name}` : '');
  res.json({ ok: true });
});
router.delete('/categories/:id', (req, res) => {
  const c = get('SELECT * FROM categories WHERE id = ?', int(req.params.id));
  if (!c) throw new HttpError(404, 'Not found');
  run('DELETE FROM categories WHERE id = ?', c.id);
  log(req, 'category.remove', c.name);
  res.json({ ok: true });
});

/* ================= media (gallery items per category) ================= */
router.get('/media', (req, res) => {
  const cat = int(req.query.category);
  const album = req.query.album;
  let rows;
  if (album === 'none') rows = all('SELECT * FROM media WHERE category_id = ? AND album_id IS NULL ORDER BY sort, id', cat);
  else if (int(album)) rows = all('SELECT * FROM media WHERE album_id = ? ORDER BY sort, id', int(album));
  else rows = cat ? all('SELECT * FROM media WHERE category_id = ? ORDER BY sort, id', cat) : all('SELECT * FROM media ORDER BY category_id, sort, id');
  res.json({ media: rows });
});

/* ================= albums (cover + all photos, inside a category) ================= */
router.get('/albums', (req, res) => res.json({
  albums: all(`SELECT a.*, (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id) count,
    (SELECT url FROM media m WHERE m.album_id = a.id AND m.type = 'image' ORDER BY m.sort, m.id LIMIT 1) first_url
    FROM albums a WHERE a.category_id = ? ORDER BY a.sort, a.id`, int(req.query.category)),
}));
router.post('/albums', (req, res) => {
  const b = req.body || {};
  const cat = get('SELECT id, name FROM categories WHERE id = ?', int(b.category_id));
  const title = str(b.title, 120);
  if (!cat || !title) throw new HttpError(400, 'Give the album a name.');
  const sort = get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM albums WHERE category_id = ?', cat.id).s;
  const r = run('INSERT INTO albums (category_id, title, description, cover_url, sort, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    cat.id, title, str(b.description, 2000), safeUrl(b.cover_url), sort, b.visible === false ? 0 : 1, now());
  log(req, 'album.add', title, cat.name);
  res.json({ id: Number(r.lastInsertRowid) });
});
router.put('/albums/:id', (req, res) => {
  const a = get('SELECT * FROM albums WHERE id = ?', int(req.params.id));
  if (!a) throw new HttpError(404, 'Not found');
  const b = req.body || {};
  const catId = b.category_id ? int(b.category_id) : a.category_id;
  run('UPDATE albums SET category_id = ?, title = ?, description = ?, cover_url = ?, visible = ? WHERE id = ?',
    catId, str(b.title ?? a.title, 120) || a.title, str(b.description ?? a.description, 2000),
    b.cover_url !== undefined ? safeUrl(b.cover_url) : a.cover_url, b.visible === undefined ? a.visible : bool(b.visible) ? 1 : 0, a.id);
  if (catId !== a.category_id) run('UPDATE media SET category_id = ? WHERE album_id = ?', catId, a.id);
  log(req, 'album.update', b.title || a.title);
  res.json({ ok: true });
});
router.delete('/albums/:id', (req, res) => {
  const a = get('SELECT * FROM albums WHERE id = ?', int(req.params.id));
  if (!a) throw new HttpError(404, 'Not found');
  const urls = all('SELECT url FROM media WHERE album_id = ?', a.id).map((m) => m.url);
  run('DELETE FROM media WHERE album_id = ?', a.id);
  run('DELETE FROM albums WHERE id = ?', a.id);
  urls.forEach(removeUpload);
  log(req, 'album.remove', a.title, `${urls.length} photo(s)`);
  res.json({ ok: true });
});
router.post('/media', (req, res) => {
  const b = req.body || {};
  const cat = get('SELECT id, name FROM categories WHERE id = ?', int(b.category_id));
  const url = safeUrl(b.url);
  if (!cat || !url) throw new HttpError(400, 'Category and file are required.');
  const type = b.type === 'video' || VID.test(url) ? 'video' : 'image';
  const sort = b.position === 'first' ? (get('SELECT COALESCE(MIN(sort), 1) - 1 s FROM media WHERE category_id = ?', cat.id).s)
    : get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM media WHERE category_id = ?', cat.id).s;
  const album = int(b.album_id) ? get('SELECT id FROM albums WHERE id = ? AND category_id = ?', int(b.album_id), cat.id) : null;
  const r = run('INSERT INTO media (category_id, album_id, type, url, poster, title, caption, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    cat.id, album ? album.id : null, type, url, safeUrl(b.poster), str(b.title, 120), str(b.caption, 500), sort, now());
  log(req, 'media.add', cat.name, `${type}: ${str(b.title, 120) || url}`);
  res.json({ id: Number(r.lastInsertRowid) });
});
router.put('/media/:id', (req, res) => {
  const m = get('SELECT * FROM media WHERE id = ?', int(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  const b = req.body || {};
  const catId = b.category_id ? int(b.category_id) : m.category_id;
  let albumId = b.album_id === undefined ? m.album_id : int(b.album_id) || null;
  if (albumId && !get('SELECT 1 FROM albums WHERE id = ? AND category_id = ?', albumId, catId)) albumId = null;
  run('UPDATE media SET category_id = ?, album_id = ?, title = ?, caption = ?, poster = ? WHERE id = ?',
    catId, albumId, str(b.title ?? m.title, 120), str(b.caption ?? m.caption, 500), b.poster !== undefined ? safeUrl(b.poster) : m.poster, m.id);
  log(req, 'media.update', m.title || m.url, catId !== m.category_id ? 'moved category' : '');
  res.json({ ok: true });
});
router.delete('/media/:id', (req, res) => {
  const m = get('SELECT * FROM media WHERE id = ?', int(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  run('DELETE FROM media WHERE id = ?', m.id);
  removeUpload(m.url);
  log(req, 'media.remove', m.title || m.url);
  res.json({ ok: true });
});
function removeUpload(url) {
  if (!url?.startsWith('/uploads/')) return;
  const still = get('SELECT 1 FROM media WHERE url = ? UNION SELECT 1 FROM albums WHERE cover_url = ? UNION SELECT 1 FROM products WHERE cover_url = ? OR gallery LIKE ?', url, url, url, `%${url}%`);
  if (!still) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}

/* ================= products ================= */
function productFromBody(b, existing = {}) {
  const pick = (k, fn, d) => (b[k] === undefined ? existing[k] ?? d : fn(b[k]));
  const list = (v) => JSON.stringify((Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => str(x, 300)).filter(Boolean).slice(0, 40));
  const status = pick('status', (v) => (['active', 'coming_soon', 'hidden'].includes(v) ? v : 'active'), 'active');
  return {
    title: pick('title', (v) => str(v, 140), ''),
    subtitle: pick('subtitle', (v) => str(v, 200), ''),
    description: pick('description', (v) => str(v, 10000), ''),
    category_id: pick('category_id', (v) => int(v) || null, null),
    price_cents: pick('price', cents, 0),
    compare_cents: b.compare_price === undefined ? existing.compare_cents ?? null : (cents(b.compare_price) || null),
    cover_url: pick('cover_url', safeUrl, ''),
    gallery: b.gallery === undefined ? existing.gallery ?? '[]' : JSON.stringify((b.gallery || []).map(safeUrl).filter(Boolean).slice(0, 30)),
    preview_url: pick('preview_url', safeUrl, ''),
    features: b.features === undefined ? existing.features ?? '[]' : list(b.features),
    tags: b.tags === undefined ? existing.tags ?? '[]' : JSON.stringify(String(b.tags).split(',').map((t) => str(t, 30)).filter(Boolean).slice(0, 20)),
    badge: pick('badge', (v) => str(v, 30), ''),
    status,
    release_at: b.release_at === undefined ? existing.release_at ?? null : dateOrNull(b.release_at),
    stock: b.stock === undefined ? existing.stock ?? null : (b.stock === '' || b.stock === null ? null : Math.max(0, int(b.stock))),
    video_source: pick('video_source', (v) => (['none', 'drive', 'upload'].includes(v) ? v : 'none'), 'none'),
    video_ref: pick('video_ref', (v) => str(v, 500), ''),
    deliver_note: pick('deliver_note', (v) => str(v, 1000), ''),
  };
}
router.get('/products', (_req, res) => res.json({
  products: all(`SELECT p.*, (SELECT COUNT(*) FROM licenses l WHERE l.product_id = p.id) sold,
    (SELECT COUNT(*) FROM product_notify n WHERE n.product_id = p.id) waiting FROM products p ORDER BY sort, id`)
    .map((p) => ({ ...p, gallery: J(p.gallery, []), features: J(p.features, []), tags: J(p.tags, []) })),
}));
router.post('/products', (req, res) => {
  const p = productFromBody(req.body || {});
  if (!p.title) throw new HttpError(400, 'Title is required.');
  let slug = slugify(req.body?.slug || p.title);
  if (get('SELECT 1 FROM products WHERE slug = ?', slug)) slug = `${slug}-${Date.now() % 100000}`;
  const sort = get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM products').s;
  const cols = Object.keys(p);
  const r = run(`INSERT INTO products (slug, sort, created_at, updated_at, ${cols.join(', ')}) VALUES (?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`,
    slug, sort, now(), now(), ...Object.values(p));
  log(req, 'product.add', p.title, { price: p.price_cents / 100, status: p.status });
  res.json({ id: Number(r.lastInsertRowid) });
});
router.put('/products/:id', (req, res) => {
  const ex = get('SELECT * FROM products WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  const p = productFromBody(req.body || {}, ex);
  const slug = req.body?.slug ? slugify(req.body.slug) : ex.slug;
  if (slug !== ex.slug && get('SELECT 1 FROM products WHERE slug = ? AND id != ?', slug, ex.id)) throw new HttpError(400, 'That URL name is taken.');
  run(`UPDATE products SET slug = ?, updated_at = ?, ${Object.keys(p).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, slug, now(), ...Object.values(p), ex.id);
  const changed = Object.keys(p).filter((k) => String(p[k] ?? '') !== String(ex[k] ?? ''));
  log(req, 'product.update', p.title, changed.join(', '));
  if (ex.status === 'coming_soon' && p.status === 'active') notifyLaunch(ex.id, p.title, slug);
  res.json({ ok: true });
});
router.delete('/products/:id', (req, res) => {
  const ex = get('SELECT * FROM products WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  run('DELETE FROM products WHERE id = ?', ex.id);
  log(req, 'product.remove', ex.title);
  res.json({ ok: true });
});
function notifyLaunch(id, title, slug) {
  const { PUBLIC_URL } = require('./mailer');
  const site = getSetting('site');
  for (const n of all('SELECT email FROM product_notify WHERE product_id = ?', id)) {
    send({ to: n.email, subject: `${title} is out now`, tag: 'launch',
      html: `<div style="font-family:Helvetica,Arial,sans-serif;padding:24px"><h2>${title} is available</h2>
        <p>You asked to be notified — it just launched on ${site.name}.</p>
        <a href="${PUBLIC_URL}/product/${encodeURIComponent(slug)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#905abd;color:#fff;text-decoration:none">View it</a></div>` })
      .catch(() => {});
  }
  run('DELETE FROM product_notify WHERE product_id = ?', id);
  log('system', 'product.launch_notified', title);
}

/* ================= orders ================= */
router.get('/orders', (req, res) => {
  const q = `%${str(req.query.q, 100)}%`;
  const status = str(req.query.status, 20);
  const rows = all(`SELECT * FROM orders WHERE (number LIKE ? OR email LIKE ? OR name LIKE ?) ${status ? 'AND status = ?' : ''}
    ORDER BY created_at DESC LIMIT 300`, q, q, q, ...(status ? [status] : []));
  res.json({ orders: rows.map((o) => ({ ...o, items: J(o.items, []) })) });
});
router.get('/orders/:id', (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o) throw new HttpError(404, 'Not found');
  res.json({ order: { ...o, items: J(o.items, []) }, licenses: all('SELECT * FROM licenses WHERE order_id = ?', o.id) });
});
router.post('/orders/:id/mark-paid', wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o || !['pending', 'cancelled', 'failed'].includes(o.status)) throw new HttpError(400, 'Only unpaid orders can be marked as paid.');
  log(req, 'order.mark_paid', o.number, 'confirmed manually by admin');
  await fulfil(o, { captureId: str(req.body?.reference, 100) || null }, req);
  res.json({ ok: true });
}));
router.post('/orders/:id/status', (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  const s = str(req.body?.status, 20);
  if (!o || !['cancelled', 'refunded', 'pending'].includes(s)) throw new HttpError(400, 'Invalid');
  run('UPDATE orders SET status = ? WHERE id = ?', s, o.id);
  if (s === 'refunded' || s === 'cancelled') run('UPDATE licenses SET revoked = 1 WHERE order_id = ?', o.id);
  log(req, `order.${s}`, o.number);
  res.json({ ok: true });
});
router.post('/orders/:id/note', (req, res) => {
  run('UPDATE orders SET admin_note = ? WHERE id = ?', str(req.body?.note, 2000), int(req.params.id));
  res.json({ ok: true });
});
router.post('/orders/:id/resend', wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o) throw new HttpError(404, 'Not found');
  await sendInvoice(o);
  run('UPDATE orders SET invoice_sent_at = ? WHERE id = ?', now(), o.id);
  log(req, 'invoice.resend', o.number, o.email);
  res.json({ ok: true });
}));
router.post('/licenses/:id/revoke', (req, res) => {
  const l = get('SELECT * FROM licenses WHERE id = ?', int(req.params.id));
  if (!l) throw new HttpError(404, 'Not found');
  const revoked = bool(req.body?.revoked) ? 1 : 0;
  run('UPDATE licenses SET revoked = ? WHERE id = ?', revoked, l.id);
  log(req, revoked ? 'license.revoke' : 'license.restore', l.key, l.email);
  res.json({ ok: true });
});

/* ================= discounts ================= */
router.get('/discounts', (_req, res) => res.json({ discounts: all('SELECT * FROM discounts ORDER BY created_at DESC').map((d) => ({ ...d, product_ids: J(d.product_ids, []) })) }));
function discountFromBody(b) {
  const type = b.type === 'fixed' ? 'fixed' : 'percent';
  const value = type === 'fixed' ? cents(b.value) : Math.min(100, Math.max(1, int(b.value)));
  if (!value) throw new HttpError(400, 'Enter a discount value.');
  return {
    code: str(b.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type, value,
    min_cents: cents(b.min), max_uses: int(b.max_uses) || null, starts_at: dateOrNull(b.starts_at), ends_at: dateOrNull(b.ends_at),
    active: b.active === undefined ? 1 : bool(b.active) ? 1 : 0,
    product_ids: Array.isArray(b.product_ids) && b.product_ids.length ? JSON.stringify(b.product_ids.map(Number)) : null,
    note: str(b.note, 200),
  };
}
router.post('/discounts', (req, res) => {
  const d = discountFromBody(req.body || {});
  if (!d.code) throw new HttpError(400, 'Enter a code.');
  if (get('SELECT 1 FROM discounts WHERE code = ? COLLATE NOCASE', d.code)) throw new HttpError(400, 'That code already exists.');
  run(`INSERT INTO discounts (${Object.keys(d).join(', ')}, created_at) VALUES (${Object.keys(d).map(() => '?').join(', ')}, ?)`, ...Object.values(d), now());
  log(req, 'discount.add', d.code, d.type === 'percent' ? `${d.value}%` : money(d.value));
  res.json({ ok: true });
});
router.put('/discounts/:id', (req, res) => {
  const ex = get('SELECT * FROM discounts WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  const d = discountFromBody({ ...ex, value: ex.type === 'fixed' ? ex.value / 100 : ex.value, min: ex.min_cents / 100, product_ids: J(ex.product_ids, []), ...req.body });
  if (d.code !== ex.code && get('SELECT 1 FROM discounts WHERE code = ? COLLATE NOCASE AND id != ?', d.code, ex.id)) throw new HttpError(400, 'That code already exists.');
  run(`UPDATE discounts SET ${Object.keys(d).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(d), ex.id);
  log(req, 'discount.update', d.code);
  res.json({ ok: true });
});
router.delete('/discounts/:id', (req, res) => {
  const d = get('SELECT * FROM discounts WHERE id = ?', int(req.params.id));
  if (!d) throw new HttpError(404, 'Not found');
  run('DELETE FROM discounts WHERE id = ?', d.id);
  log(req, 'discount.remove', d.code);
  res.json({ ok: true });
});

/* ================= payment methods ================= */
router.get('/payment-methods', (_req, res) => res.json({
  methods: all('SELECT * FROM payment_methods ORDER BY sort, id'),
  paypal: { configured: paypal.configured(), env: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox' },
}));
function pmFromBody(b, ex = {}) {
  return {
    name: str(b.name ?? ex.name, 60), icon: str(b.icon ?? ex.icon, 40) || 'bank', description: str(b.description ?? ex.description, 200),
    instructions: str(b.instructions ?? ex.instructions, 4000), enabled: (b.enabled === undefined ? ex.enabled ?? 1 : bool(b.enabled)) ? 1 : 0,
  };
}
router.post('/payment-methods', (req, res) => {
  const m = pmFromBody(req.body || {});
  if (!m.name) throw new HttpError(400, 'Name is required.');
  const sort = get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM payment_methods').s;
  run('INSERT INTO payment_methods (name, icon, description, instructions, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    m.name, m.icon, m.description, m.instructions, m.enabled, sort, now());
  log(req, 'payment_method.add', m.name);
  res.json({ ok: true });
});
router.put('/payment-methods/:id', (req, res) => {
  const ex = get('SELECT * FROM payment_methods WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  const m = pmFromBody(req.body || {}, ex);
  run('UPDATE payment_methods SET name = ?, icon = ?, description = ?, instructions = ?, enabled = ? WHERE id = ?', m.name, m.icon, m.description, m.instructions, m.enabled, ex.id);
  log(req, 'payment_method.update', m.name, ex.enabled !== m.enabled ? (m.enabled ? 'enabled' : 'disabled') : '');
  res.json({ ok: true });
});
router.delete('/payment-methods/:id', (req, res) => {
  const ex = get('SELECT * FROM payment_methods WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  run('DELETE FROM payment_methods WHERE id = ?', ex.id);
  log(req, 'payment_method.remove', ex.name);
  res.json({ ok: true });
});

/* ================= invoice ================= */
const SAMPLE_ORDER = () => ({
  id: 0, number: `${getSetting('invoice').prefix}1001`, email: 'customer@gmail.com', name: 'Alex Customer', status: 'paid',
  method: 'paypal', method_label: 'PayPal', subtotal_cents: 4900, discount_cents: 490, tax_cents: 0, total_cents: 4410,
  currency: getSetting('checkout').currency, discount_code: 'WELCOME10', payer_email: 'alex.paypal@gmail.com', paypal_capture_id: '8MC585209K746392H',
  items: [{ title: 'Cinematic VFX Pack', subtitle: 'Project files + tutorial', price_cents: 4900, qty: 1 }], created_at: Date.now(), paid_at: Date.now(),
});
router.post('/invoice/preview', (req, res) => {
  const override = sanitizeSettings('invoice', req.body || {});
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderInvoice(SAMPLE_ORDER(), { override, keys: [{ key: 'EZRO-ABCD-EFGH-JKLM-NPQR', product_title: 'Cinematic VFX Pack' }] }));
});
router.post('/invoice/test', wrap(async (req, res) => {
  const inv = getSetting('invoice');
  const order = { ...SAMPLE_ORDER(), email: req.user.email };
  await send({ to: req.user.email, subject: `[Test] ${inv.subject.replace('{number}', order.number)}`, tag: 'test',
    html: renderInvoice(order, { keys: [{ key: 'EZRO-TEST-TEST-TEST-TEST', product_title: 'Cinematic VFX Pack' }] }) });
  log(req, 'invoice.test_sent', req.user.email);
  res.json({ ok: true, smtp: smtpConfigured() });
}));

/* ================= socials ================= */
router.get('/socials', (_req, res) => res.json({ socials: all('SELECT * FROM socials ORDER BY sort, id') }));
router.post('/socials', (req, res) => {
  const b = req.body || {};
  if (!str(b.name, 40)) throw new HttpError(400, 'Name is required.');
  const sort = get('SELECT COALESCE(MAX(sort), -1) + 1 s FROM socials').s;
  run('INSERT INTO socials (name, icon, url, sort, visible) VALUES (?, ?, ?, ?, ?)', str(b.name, 40), str(b.icon, 300) || 'link', safeUrl(b.url) || '#', sort, b.visible === false ? 0 : 1);
  log(req, 'social.add', b.name);
  res.json({ ok: true });
});
router.put('/socials/:id', (req, res) => {
  const ex = get('SELECT * FROM socials WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  const b = req.body || {};
  run('UPDATE socials SET name = ?, icon = ?, url = ?, visible = ? WHERE id = ?', str(b.name ?? ex.name, 40), str(b.icon ?? ex.icon, 300),
    b.url === undefined ? ex.url : safeUrl(b.url) || '#', b.visible === undefined ? ex.visible : bool(b.visible) ? 1 : 0, ex.id);
  log(req, 'social.update', b.name || ex.name);
  res.json({ ok: true });
});
router.delete('/socials/:id', (req, res) => {
  const ex = get('SELECT * FROM socials WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  run('DELETE FROM socials WHERE id = ?', ex.id);
  log(req, 'social.remove', ex.name);
  res.json({ ok: true });
});

/* ================= texts ================= */
router.get('/texts', (_req, res) => res.json({ texts: all('SELECT * FROM texts ORDER BY updated_at DESC') }));
router.post('/texts', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
  tx(() => {
    for (const b of items) {
      const original = str(b.original, 4000);
      if (!original) continue;
      const page = ['all', 'home', 'watch', 'checkout'].includes(b.page) ? b.page : 'all';
      if (b.id) run('UPDATE texts SET page = ?, original = ?, replacement = ?, deleted = ?, updated_at = ? WHERE id = ?',
        page, original, str(b.replacement, 4000), bool(b.deleted) ? 1 : 0, now(), int(b.id));
      else run(`INSERT INTO texts (page, original, replacement, deleted, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(page, original) DO UPDATE SET replacement = excluded.replacement, deleted = excluded.deleted, updated_at = excluded.updated_at`,
        page, original, str(b.replacement, 4000), bool(b.deleted) ? 1 : 0, now());
    }
  });
  log(req, 'texts.save', '', `${items.length} change(s)`);
  res.json({ ok: true });
});
router.delete('/texts/:id', (req, res) => {
  const t = get('SELECT * FROM texts WHERE id = ?', int(req.params.id));
  if (!t) throw new HttpError(404, 'Not found');
  run('DELETE FROM texts WHERE id = ?', t.id);
  log(req, 'texts.restore', t.original.slice(0, 80));
  res.json({ ok: true });
});

/* ================= tasks ================= */
const STATUSES = ['todo', 'progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
router.get('/tasks', (req, res) => {
  const me = req.user.email;
  res.json({
    tasks: all("SELECT * FROM tasks WHERE visibility = 'team' OR created_by = ? OR assignee = ? ORDER BY sort, id", me, me),
    people: [...new Set([...ownerEmails(), ...all('SELECT email FROM admins').map((a) => a.email)])],
  });
});
function taskFromBody(b, ex = {}) {
  const status = STATUSES.includes(b.status) ? b.status : ex.status || 'todo';
  return {
    title: str(b.title ?? ex.title, 200), description: str(b.description ?? ex.description, 5000), status,
    priority: PRIORITIES.includes(b.priority) ? b.priority : ex.priority || 'medium',
    due_at: b.due_at === undefined ? ex.due_at ?? null : dateOrNull(b.due_at),
    assignee: b.assignee === undefined ? ex.assignee ?? null : str(b.assignee, 200).toLowerCase() || null,
    visibility: b.visibility === 'private' ? 'private' : b.visibility === 'team' ? 'team' : ex.visibility || 'team',
    completed_at: status === 'done' ? ex.completed_at || now() : null,
  };
}
router.post('/tasks', (req, res) => {
  const t = taskFromBody(req.body || {});
  if (!t.title) throw new HttpError(400, 'Give the task a title.');
  const sort = get('SELECT COALESCE(MIN(sort), 1) - 1 s FROM tasks WHERE status = ?', t.status).s;
  run(`INSERT INTO tasks (${Object.keys(t).join(', ')}, created_by, sort, created_at, updated_at) VALUES (${Object.keys(t).map(() => '?').join(', ')}, ?, ?, ?, ?)`,
    ...Object.values(t), req.user.email, sort, now(), now());
  log(req, 'task.add', t.title);
  res.json({ ok: true });
});
router.put('/tasks/:id', (req, res) => {
  const ex = get('SELECT * FROM tasks WHERE id = ?', int(req.params.id));
  if (!ex || (ex.visibility === 'private' && ex.created_by !== req.user.email && ex.assignee !== req.user.email)) throw new HttpError(404, 'Not found');
  const t = taskFromBody(req.body || {}, ex);
  const sort = req.body?.sort !== undefined ? Number(req.body.sort) : ex.sort;
  run(`UPDATE tasks SET ${Object.keys(t).map((k) => `${k} = ?`).join(', ')}, sort = ?, updated_at = ? WHERE id = ?`, ...Object.values(t), sort, now(), ex.id);
  if (t.status !== ex.status) log(req, 'task.move', t.title, `${ex.status} → ${t.status}`);
  else log(req, 'task.update', t.title);
  res.json({ ok: true });
});
router.delete('/tasks/:id', (req, res) => {
  const ex = get('SELECT * FROM tasks WHERE id = ?', int(req.params.id));
  if (!ex) throw new HttpError(404, 'Not found');
  run('DELETE FROM tasks WHERE id = ?', ex.id);
  log(req, 'task.remove', ex.title);
  res.json({ ok: true });
});

/* ================= admins ================= */
router.get('/admins', (req, res) => res.json({
  owners: ownerEmails(), admins: all('SELECT * FROM admins ORDER BY added_at'), canManage: isOwner(req.user.email),
}));
router.post('/admins', (req, res) => {
  if (!isOwner(req.user.email)) throw new HttpError(403, 'Only the owner can manage admins.');
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid Google email.');
  run('INSERT OR IGNORE INTO admins (email, added_at, added_by) VALUES (?, ?, ?)', email, now(), req.user.email);
  log(req, 'admin.add', email);
  res.json({ ok: true });
});
router.delete('/admins/:email', (req, res) => {
  if (!isOwner(req.user.email)) throw new HttpError(403, 'Only the owner can manage admins.');
  run('DELETE FROM admins WHERE email = ?', str(req.params.email, 200).toLowerCase());
  log(req, 'admin.remove', req.params.email);
  res.json({ ok: true });
});

/* ================= logs & customers ================= */
router.get('/logs', (req, res) => {
  const q = `%${str(req.query.q, 100)}%`;
  const type = str(req.query.type, 40);
  const before = int(req.query.before) || Date.now() + 1;
  const rows = all(`SELECT * FROM logs WHERE at < ? AND (action LIKE ? OR target LIKE ? OR actor LIKE ? OR details LIKE ?)
    ${type ? 'AND action LIKE ?' : ''} ORDER BY at DESC LIMIT 100`, before, q, q, q, q, ...(type ? [`${type}.%`] : []));
  res.json({ logs: rows });
});
router.get('/customers', (_req, res) => res.json({
  customers: all(`SELECT u.email, u.name, u.picture, u.created_at, u.last_login,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') orders,
    (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') spent
    FROM users u ORDER BY u.last_login DESC LIMIT 500`),
}));

module.exports = { router };
