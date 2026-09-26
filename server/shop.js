const express = require('express');
const { all, get, run, tx, now, getSetting, setSetting } = require('./db');
const { requireUser } = require('./auth');
const paypal = require('./paypal');
const { sendInvoice, renderInvoice } = require('./mailer');
const { licenseKey, log, rateLimit, str, int, bool, HttpError, wrap } = require('./util');

const DEV_PAY = process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';

/* ---------- pricing (server is the only source of truth) ---------- */
function findDiscount(code, productIds, subtotalByProduct) {
  if (!code) return { discount: null, amount: 0 };
  const d = get('SELECT * FROM discounts WHERE code = ? COLLATE NOCASE', code.trim());
  const t = now();
  const fail = (msg) => { throw new HttpError(400, msg); };
  if (!d || !d.active) fail('This discount code is not valid.');
  if (d.starts_at && t < d.starts_at) fail('This discount code is not active yet.');
  if (d.ends_at && t > d.ends_at) fail('This discount code has expired.');
  if (d.max_uses && d.uses >= d.max_uses) fail('This discount code has been used up.');
  const scope = d.product_ids ? JSON.parse(d.product_ids) : null;
  const eligible = productIds.filter((id) => !scope || !scope.length || scope.includes(id));
  if (!eligible.length) fail('This code does not apply to the items in your cart.');
  const base = eligible.reduce((s, id) => s + subtotalByProduct[id], 0);
  if (d.min_cents && base < d.min_cents) fail('Your cart does not reach the minimum for this code.');
  const amount = d.type === 'fixed' ? Math.min(base, d.value) : Math.round(base * Math.min(100, d.value) / 100);
  return { discount: d, amount };
}

function quote(productIds, code) {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))].slice(0, 50);
  if (!ids.length) throw new HttpError(400, 'Your cart is empty.');
  const products = ids.map((id) => get('SELECT * FROM products WHERE id = ?', id)).filter(Boolean);
  for (const p of products) {
    if (p.status === 'coming_soon') throw new HttpError(400, `"${p.title}" is coming soon and can't be bought yet.`);
    if (p.status !== 'active') throw new HttpError(400, `"${p.title}" is not available.`);
    if (p.stock != null && p.stock <= 0) throw new HttpError(400, `"${p.title}" is sold out.`);
  }
  if (!products.length) throw new HttpError(400, 'Your cart is empty.');
  const checkout = getSetting('checkout');
  const byId = Object.fromEntries(products.map((p) => [p.id, p.price_cents]));
  const subtotal = products.reduce((s, p) => s + p.price_cents, 0);
  const { discount, amount } = findDiscount(str(code, 60), products.map((p) => p.id), byId);
  const afterDiscount = Math.max(0, subtotal - amount);
  const rate = Math.max(0, Number(checkout.taxPercent) || 0) / 100;
  let tax = 0; let total = afterDiscount;
  if (rate) {
    if (checkout.taxIncluded) tax = Math.round(afterDiscount - afterDiscount / (1 + rate));
    else { tax = Math.round(afterDiscount * rate); total = afterDiscount + tax; }
  }
  return {
    currency: checkout.currency,
    items: products.map((p) => ({ product_id: p.id, title: p.title, subtitle: p.subtitle, price_cents: p.price_cents, qty: 1, cover_url: p.cover_url })),
    subtotal_cents: subtotal, discount_cents: amount, discount_code: discount ? discount.code : null,
    tax_cents: tax, total_cents: total,
  };
}

function nextOrderNumber() {
  const inv = getSetting('invoice');
  const n = int(inv.nextNumber, 1001);
  setSetting('invoice', { nextNumber: n + 1 });
  return `${inv.prefix || ''}${n}`;
}

function createOrder(user, q, method, methodLabel) {
  return tx(() => {
    const number = nextOrderNumber();
    const r = run(`INSERT INTO orders (number, user_id, email, name, status, method, method_label, subtotal_cents, discount_cents,
        tax_cents, total_cents, currency, discount_code, items, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      number, user.id, user.email, user.name || '', method, methodLabel, q.subtotal_cents, q.discount_cents, q.tax_cents,
      q.total_cents, q.currency, q.discount_code, JSON.stringify(q.items), now());
    return get('SELECT * FROM orders WHERE id = ?', Number(r.lastInsertRowid));
  });
}

/* Marks an order paid, issues one access key per item and emails the invoice. Safe to call twice. */
async function fulfil(order, extra = {}, req = null) {
  const done = tx(() => {
    const fresh = get('SELECT * FROM orders WHERE id = ?', order.id);
    if (fresh.status === 'paid') return false;
    run(`UPDATE orders SET status = 'paid', paid_at = ?, paypal_capture_id = COALESCE(?, paypal_capture_id),
         payer_email = COALESCE(?, payer_email) WHERE id = ?`, now(), extra.captureId || null, extra.payerEmail || null, order.id);
    for (const it of JSON.parse(fresh.items)) {
      run('INSERT INTO licenses (key, order_id, product_id, product_title, user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        licenseKey(), order.id, it.product_id, it.title, fresh.user_id, fresh.email, now());
      run('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock IS NOT NULL AND stock > 0', it.product_id);
    }
    if (fresh.discount_code) run('UPDATE discounts SET uses = uses + 1 WHERE code = ? COLLATE NOCASE', fresh.discount_code);
    return true;
  });
  if (!done) return get('SELECT * FROM orders WHERE id = ?', order.id);
  const paid = get('SELECT * FROM orders WHERE id = ?', order.id);
  log(req || 'system', 'order.paid', paid.number, { total: paid.total_cents / 100, currency: paid.currency, method: paid.method_label, capture: extra.captureId || null });
  try {
    await sendInvoice(paid);
    run('UPDATE orders SET invoice_sent_at = ? WHERE id = ?', now(), paid.id);
  } catch (e) {
    log('system', 'mail.error', paid.number, e.message);
  }
  return paid;
}

function publicOrder(o) {
  const keys = o.status === 'paid' ? all('SELECT key, product_id, product_title FROM licenses WHERE order_id = ? AND revoked = 0', o.id) : [];
  return {
    id: o.id, number: o.number, status: o.status, method: o.method, method_label: o.method_label,
    subtotal_cents: o.subtotal_cents, discount_cents: o.discount_cents, tax_cents: o.tax_cents, total_cents: o.total_cents,
    currency: o.currency, discount_code: o.discount_code, items: JSON.parse(o.items), created_at: o.created_at, paid_at: o.paid_at, keys,
  };
}

function ownOrder(req) {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.body?.orderId ?? req.params.id));
  if (!o || o.user_id !== req.user.id) throw new HttpError(404, 'Order not found.');
  return o;
}

/* ---------- routes ---------- */
const router = express.Router();

router.post('/quote', rateLimit({ max: 60 }), (req, res) => {
  res.json(quote(req.body?.productIds, req.body?.code));
});

router.post('/checkout', requireUser, rateLimit({ max: 15 }), wrap(async (req, res) => {
  const checkout = getSetting('checkout');
  if (checkout.requireTerms && !bool(req.body?.acceptTerms)) throw new HttpError(400, 'Please accept the terms first.');
  const q = quote(req.body?.productIds, req.body?.code);
  const method = str(req.body?.method, 40);

  if (q.total_cents === 0) {
    const order = createOrder(req.user, q, 'free', 'Free');
    log(req, 'order.created', order.number, 'free order');
    return res.json({ order: publicOrder(await fulfil(order, {}, req)) });
  }

  if (method === 'paypal') {
    if (!checkout.paypalEnabled || !paypal.configured()) throw new HttpError(400, 'PayPal is not available right now.');
    const order = createOrder(req.user, q, 'paypal', checkout.paypalLabel || 'PayPal');
    try {
      const pp = await paypal.createOrder(order, getSetting('site').name);
      run('UPDATE orders SET paypal_order_id = ? WHERE id = ?', pp.id, order.id);
      log(req, 'order.created', order.number, { method: 'paypal', total: order.total_cents / 100 });
      return res.json({ order: publicOrder(order), paypalOrderId: pp.id });
    } catch (e) {
      run("UPDATE orders SET status = 'failed' WHERE id = ?", order.id);
      log(req, 'paypal.error', order.number, e.message);
      throw new HttpError(502, 'PayPal could not start the payment. Please try again.');
    }
  }

  if (method === 'dev' && DEV_PAY) {
    const order = createOrder(req.user, q, 'dev', 'Test payment');
    log(req, 'order.created', order.number, 'test payment (dev mode)');
    return res.json({ order: publicOrder(await fulfil(order, { captureId: `TEST-${Date.now()}` }, req)) });
  }

  const pmId = int(method.replace(/^pm:/, ''));
  const pm = method.startsWith('pm:') && get('SELECT * FROM payment_methods WHERE id = ? AND enabled = 1', pmId);
  if (!pm) throw new HttpError(400, 'Choose a payment method.');
  const order = createOrder(req.user, q, `pm:${pm.id}`, pm.name);
  log(req, 'order.created', order.number, { method: pm.name, total: order.total_cents / 100 });
  const instructions = pm.instructions.replaceAll('{number}', order.number);
  sendInvoice(order, { instructions: pm.instructions }).catch((e) => log('system', 'mail.error', order.number, e.message));
  res.json({ order: publicOrder(order), instructions });
}));

router.post('/paypal/capture', requireUser, rateLimit({ max: 20 }), wrap(async (req, res) => {
  const order = ownOrder(req);
  if (order.status === 'paid') return res.json({ order: publicOrder(order) });
  if (order.method !== 'paypal' || !order.paypal_order_id || order.status !== 'pending') throw new HttpError(400, 'This order cannot be captured.');

  let result;
  try {
    result = await paypal.captureOrder(order.paypal_order_id);
  } catch (e) {
    if (JSON.stringify(e.paypal || {}).includes('ORDER_ALREADY_CAPTURED')) result = await paypal.getOrder(order.paypal_order_id);
    else { log(req, 'paypal.capture_failed', order.number, e.message); throw new HttpError(402, 'The payment was not completed. No money was taken.'); }
  }

  // Verify that the money actually arrived and matches this order exactly.
  const unit = result?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const ok = result?.status === 'COMPLETED' && capture?.status === 'COMPLETED'
    && capture.amount?.currency_code === order.currency && capture.amount?.value === paypal.fmt(order.total_cents)
    && String(unit?.custom_id || unit?.reference_id) === String(order.id);
  if (!ok) {
    log(req, 'paypal.verify_failed', order.number, { status: result?.status, capture: capture?.status, amount: capture?.amount });
    if (capture?.status === 'PENDING') throw new HttpError(202, 'PayPal is still processing this payment. You will get an email once it clears.');
    throw new HttpError(402, 'The payment could not be verified. Contact us with your order number.');
  }
  const paid = await fulfil(order, { captureId: capture.id, payerEmail: result?.payer?.email_address }, req);
  res.json({ order: publicOrder(paid) });
}));

router.post('/paypal/cancel', requireUser, (req, res) => {
  const order = ownOrder(req);
  if (order.status === 'pending' && order.method === 'paypal') run("UPDATE orders SET status = 'cancelled' WHERE id = ?", order.id);
  res.json({ ok: true });
});

router.get('/orders/:id', requireUser, (req, res) => res.json({ order: publicOrder(ownOrder(req)) }));

router.get('/my', requireUser, (req, res) => {
  const orders = all('SELECT * FROM orders WHERE user_id = ? AND status IN (\'paid\', \'pending\') ORDER BY created_at DESC LIMIT 100', req.user.id);
  res.json({ orders: orders.map(publicOrder) });
});

router.post('/notify', requireUser, rateLimit({ max: 20 }), (req, res) => {
  const p = get("SELECT id, title FROM products WHERE id = ? AND status = 'coming_soon'", int(req.body?.productId));
  if (!p) throw new HttpError(404, 'Product not found.');
  run('INSERT OR IGNORE INTO product_notify (product_id, email, created_at) VALUES (?, ?, ?)', p.id, req.user.email, now());
  log(req, 'product.notify_signup', p.title);
  res.json({ ok: true });
});

/* Online invoice: owner or admin only. */
function invoicePage(req, res) {
  const o = get('SELECT * FROM orders WHERE number = ?', str(req.params.number, 60));
  if (!o || !req.user || (o.user_id !== req.user.id && !req.user.isAdmin)) return res.status(404).send('Invoice not found. Sign in with the account that placed the order.');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderInvoice(o));
}

module.exports = { router, fulfil, publicOrder, invoicePage, DEV_PAY, quote };
