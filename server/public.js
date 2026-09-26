const express = require('express');
const { all, get, run, getSetting } = require('./db');
const paypal = require('./paypal');
const { DEV_PAY } = require('./shop');
const { sha256, SECRET, clientIp, str, rateLimit } = require('./util');

const router = express.Router();

const parseJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function publicProduct(p) {
  return {
    id: p.id, slug: p.slug, title: p.title, subtitle: p.subtitle, description: p.description, category_id: p.category_id,
    price_cents: p.price_cents, compare_cents: p.compare_cents, cover_url: p.cover_url, gallery: parseJson(p.gallery, []),
    preview_url: p.preview_url, features: parseJson(p.features, []), tags: parseJson(p.tags, []), badge: p.badge,
    status: p.status, release_at: p.release_at, soldOut: p.stock != null && p.stock <= 0,
    stockLeft: p.stock != null && p.stock <= 10 ? p.stock : null,
    hasVideo: !!p.video_source && p.video_source !== 'none', deliver_note: p.deliver_note,
  };
}

router.get('/site', (_req, res) => {
  const checkout = getSetting('checkout');
  res.json({
    site: getSetting('site'),
    appearance: getSetting('appearance'),
    shop: getSetting('shop'),
    checkout: {
      currency: checkout.currency, taxPercent: checkout.taxPercent, taxLabel: checkout.taxLabel, taxIncluded: checkout.taxIncluded,
      requireTerms: checkout.requireTerms, termsText: checkout.termsText, successTitle: checkout.successTitle,
      successMessage: checkout.successMessage, buttonText: checkout.buttonText,
      paypal: checkout.paypalEnabled && paypal.configured()
        ? { clientId: paypal.CLIENT_ID, label: checkout.paypalLabel, description: checkout.paypalDescription } : null,
      devPay: DEV_PAY,
    },
    paymentMethods: all('SELECT id, name, icon, description FROM payment_methods WHERE enabled = 1 ORDER BY sort, id'),
    socials: all('SELECT id, name, icon, url FROM socials WHERE visible = 1 ORDER BY sort, id'),
    categories: all('SELECT id, name, slug, icon, description FROM categories WHERE visible = 1 ORDER BY sort, id'),
    texts: all('SELECT page, original, replacement, deleted FROM texts'),
  });
});

router.get('/media', (_req, res) => {
  res.json({ media: all(`SELECT m.id, m.category_id, m.type, m.url, m.poster, m.title, m.caption FROM media m
    JOIN categories c ON c.id = m.category_id WHERE c.visible = 1 ORDER BY m.sort, m.id`) });
});

router.get('/products', (_req, res) => {
  const shop = getSetting('shop');
  const rows = all("SELECT * FROM products WHERE status != 'hidden' ORDER BY sort, id").map(publicProduct);
  res.json({ products: shop.showSoldOut ? rows : rows.filter((p) => !p.soldOut) });
});

router.get('/products/:slug', (req, res) => {
  const p = get("SELECT * FROM products WHERE slug = ? AND status != 'hidden'", str(req.params.slug, 120));
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ product: publicProduct(p) });
});

// Privacy-friendly visitor counting: a daily, salted hash — no cookies, no raw IPs stored.
router.post('/track', rateLimit({ max: 120 }), (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const visitor = sha256(`${SECRET}|${day}|${clientIp(req)}|${req.headers['user-agent'] || ''}`).slice(0, 24);
  const path = str(req.body?.path, 80).replace(/[^\w/.-]/g, '') || '/';
  run(`INSERT INTO views (day, visitor, path) VALUES (?, ?, ?)
       ON CONFLICT(day, visitor, path) DO UPDATE SET hits = hits + 1`, day, visitor, path);
  res.json({ ok: true });
});

module.exports = { router, publicProduct };
