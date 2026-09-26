const express = require('express');
const { all, get, run, now, getSetting } = require('./db');
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
  const rows = all(`SELECT l.id, l.key, l.product_title, l.created_at, l.views, p.cover_url, p.slug, p.video_source
                    FROM licenses l LEFT JOIN products p ON p.id = l.product_id
                    WHERE l.email = ? AND l.revoked = 0 ORDER BY l.created_at DESC`, req.user.email);
  res.json({ items: rows.map((r) => ({ ...r, key: `${r.key.slice(0, 10)}••••-••••`, hasVideo: !!r.video_source && r.video_source !== 'none' })) });
});

router.post('/open', requireUser, rateLimit({ max: 12 }), (req, res) => {
  const sec = getSetting('security');
  let lic;
  if (req.body?.licenseId) lic = get('SELECT * FROM licenses WHERE id = ?', Number(req.body.licenseId));
  else lic = get('SELECT * FROM licenses WHERE key = ?', normalizeKey(req.body?.key));
  if (!lic || lic.revoked) { log(req, 'watch.invalid_key', str(req.body?.key, 40)); throw new HttpError(404, 'This key is not valid.'); }
  if (lic.email !== req.user.email) {
    log(req, 'watch.wrong_account', lic.key, `key owner: ${lic.email}`);
    throw new HttpError(403, 'This key belongs to a different Google account.');
  }
  const p = get('SELECT * FROM products WHERE id = ?', lic.product_id);
  if (!p || !p.video_source || p.video_source === 'none' || !p.video_ref) throw new HttpError(404, 'There is no video attached to this product yet.');
  if (sec.maxViewsPerKey > 0 && lic.views >= sec.maxViewsPerKey) throw new HttpError(403, 'This key has reached its view limit.');
  if (!lic.last_view_at || now() - lic.last_view_at > 30 * 60_000) {
    run('UPDATE licenses SET views = views + 1, last_view_at = ? WHERE id = ?', now(), lic.id);
    log(req, 'watch.open', lic.key, p.title);
  }
  res.json({
    title: p.title, subtitle: p.subtitle, licenseId: lic.id, token: makeToken(lic.id, req), ttl: TOKEN_TTL,
    watermark: sec.watermark ? `${req.user.email} · ${lic.key.slice(-4)}` : '',
    security: { blurOnFocusLoss: !!sec.blurOnFocusLoss, blockDevtools: !!sec.blockDevtools },
  });
});

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
