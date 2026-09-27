const express = require('express');
const path = require('node:path');
const { all, get, run, now, getSetting, SECURE_DIR } = require('./db');
const { requireUser } = require('./auth');
const video = require('./video');
const { hmac, safeEqual, log, rateLimit, str, HttpError, wrap } = require('./util');

const TOKEN_TTL = 2 * 60 * 60_000; // bound to the login session, refreshed automatically by the player
const router = express.Router();

// Stream tokens are bound to the license, the user AND the current login session.
function makeToken(licenseId, req) {
  const body = Buffer.from(JSON.stringify({ l: licenseId, u: req.user.id, s: req.sessionHash.slice(0, 16), e: Date.now() + TOKEN_TTL })).toString('base64url');
  return `${body}.${hmac(body)}`;
}
function readToken(token, req) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig || !safeEqual(sig, hmac(body))) return null;
  const t = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (t.e < Date.now() || !req.user || t.u !== req.user.id || !req.sessionHash?.startsWith(t.s)) return null;
  return t;
}

const normalizeKey = (k) => str(k, 40).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(EZRO)?/, 'EZRO')
  .replace(/^EZRO(.{4})(.{4})(.{4})(.{4})$/, 'EZRO-$1-$2-$3-$4');

router.get('/library', requireUser, (req, res) => {
  const rows = all(`SELECT l.id, l.key, l.product_title, l.created_at, l.views, l.last_view_at, p.cover_url, p.slug, p.video_source,
                           p.subtitle, p.deliver_note, p.category_id, p.downloads, p.video_download, c.name category, o.number order_number, o.total_cents, o.currency, o.method_label
                    FROM licenses l LEFT JOIN products p ON p.id = l.product_id LEFT JOIN categories c ON c.id = p.category_id
                    LEFT JOIN orders o ON o.id = l.order_id
                    WHERE l.email = ? AND l.revoked = 0 ORDER BY l.created_at DESC`, req.user.email);
  res.json({ items: rows.map(({ video_source, downloads, video_download, ...r }) => {
    const hasVideo = !!video_source && video_source !== 'none';
    return { ...r, key: `${r.key.slice(0, 10)}••••-••••`, hasVideo, files: JSON.parse(downloads || '[]').length + (hasVideo && video_download ? 1 : 0) };
  }) });
});

// Full key, only for its owner (for the copy button in the library).
router.post('/key', requireUser, rateLimit({ max: 30 }), (req, res) => {
  const lic = get('SELECT key, email FROM licenses WHERE id = ? AND revoked = 0', Number(req.body?.licenseId));
  if (!lic || lic.email !== req.user.email) throw new HttpError(404, 'Not found.');
  res.json({ key: lic.key });
});

// Files the buyer can download: the video itself (if allowed) + everything attached to the product.
function downloadsFor(p) {
  const files = [];
  if (p.video_download && p.video_source && p.video_source !== 'none' && p.video_ref) files.push({ id: 'video', name: `${p.title} — video`, kind: 'video' });
  for (const f of JSON.parse(p.downloads || '[]')) files.push({ id: f.id, name: f.name, size: f.size, kind: 'file' });
  return files;
}
const ownLicense = (req, id) => {
  const lic = get('SELECT * FROM licenses WHERE id = ? AND revoked = 0', Number(id));
  if (!lic || lic.email !== req.user.email) throw new HttpError(404, 'Not found.');
  return lic;
};

// Redeem a code: it is claimed by the first account that redeems it and can never be redeemed again.
router.post('/redeem', requireUser, rateLimit({ max: 10 }), (req, res) => {
  const lic = get('SELECT * FROM licenses WHERE key = ?', normalizeKey(req.body?.key));
  if (!lic || lic.revoked) { log(req, 'watch.invalid_key', str(req.body?.key, 40)); throw new HttpError(404, 'This code is not valid.'); }
  if (lic.email === req.user.email) return res.json({ status: 'already', licenseId: lic.id, title: lic.product_title });
  if (lic.email) { log(req, 'watch.code_taken', lic.key, `owned by ${lic.email}`); throw new HttpError(409, 'This code has already been redeemed.'); }
  if (get('SELECT 1 FROM licenses WHERE product_id = ? AND revoked = 0 AND email = ?', lic.product_id, req.user.email)) {
    throw new HttpError(409, `You already own "${lic.product_title}" — this code was not used, you can give it to someone else.`);
  }
  const r = run('UPDATE licenses SET email = ?, user_id = ?, redeemed_at = ? WHERE id = ? AND email IS NULL', req.user.email, req.user.id, now(), lic.id);
  if (!r.changes) throw new HttpError(409, 'This code has already been redeemed.');
  log(req, 'watch.redeem', lic.key, lic.product_title);
  res.json({ status: 'redeemed', licenseId: lic.id, title: lic.product_title });
});

router.post('/open', requireUser, rateLimit({ max: 20 }), (req, res) => {
  const sec = getSetting('security');
  const lic = ownLicense(req, req.body?.licenseId);
  const p = get('SELECT * FROM products WHERE id = ?', lic.product_id);
  if (!p) throw new HttpError(404, 'This product no longer exists.');
  const hasVideo = !!p.video_source && p.video_source !== 'none' && !!p.video_ref;
  if (hasVideo && sec.maxViewsPerKey > 0 && lic.views >= sec.maxViewsPerKey) throw new HttpError(403, 'This code has reached its view limit.');
  if (!lic.last_view_at || now() - lic.last_view_at > 30 * 60_000) {
    run('UPDATE licenses SET views = views + 1, last_view_at = ? WHERE id = ?', now(), lic.id);
    log(req, 'watch.open', lic.key, p.title);
  }
  res.json({
    title: p.title, subtitle: p.subtitle, cover: p.cover_url, licenseId: lic.id, ttl: TOKEN_TTL,
    token: hasVideo ? makeToken(lic.id, req) : null, deliver_note: p.deliver_note, downloads: downloadsFor(p),
    security: { blurOnFocusLoss: !!sec.blurOnFocusLoss, blockDevtools: !!sec.blockDevtools },
  });
});

router.get('/download/:licenseId/:fileId', requireUser, rateLimit({ max: 40 }), wrap(async (req, res) => {
  const lic = ownLicense(req, req.params.licenseId);
  const p = get('SELECT * FROM products WHERE id = ?', lic.product_id);
  if (!p) throw new HttpError(404, 'Not found.');
  const safeName = (n) => n.replace(/[\\/:*?"<>|]+/g, '').trim() || 'download';
  if (req.params.fileId === 'video') {
    if (!p.video_download) throw new HttpError(403, 'This video cannot be downloaded.');
    log(req, 'watch.download', lic.key, `${p.title} (video)`);
    return video.download(p, res, safeName(p.title));
  }
  const f = JSON.parse(p.downloads || '[]').find((x) => x.id === req.params.fileId);
  if (!f) throw new HttpError(404, 'File not found.');
  log(req, 'watch.download', lic.key, f.name);
  res.setHeader('Cache-Control', 'no-store, private');
  res.download(path.join(SECURE_DIR, path.basename(f.ref)), safeName(f.name), (err) => { if (err && !res.headersSent) res.status(404).end(); });
}));

router.get('/stream/:token', wrap(async (req, res) => {
  // Refuse direct navigation (typing/pasting the URL into the address bar).
  if (req.headers['sec-fetch-dest'] === 'document') throw new HttpError(403, 'Forbidden');
  const t = readToken(req.params.token, req);
  if (!t) throw new HttpError(403, 'Expired');
  const lic = get('SELECT * FROM licenses WHERE id = ? AND revoked = 0', t.l);
  const p = lic && get('SELECT * FROM products WHERE id = ?', lic.product_id);
  if (!p || lic.email !== req.user.email) throw new HttpError(403, 'Forbidden');
  await video.stream(p, req, res);
}));

module.exports = { router };
