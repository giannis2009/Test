/* =========================================================
   PayPal notifications — PayPal tells the server itself when something happens to a payment,
   so orders stay right even if the buyer closed the browser, or a refund / chargeback happens later.

   POST /api/paypal/webhook   Webhooks (REST, recommended). Every message is verified with PayPal
                              (verify-webhook-signature) using PAYPAL_WEBHOOK_ID before anything changes.
   POST /api/paypal/ipn       Instant Payment Notification (classic). Every message is sent back to PayPal
                              (_notify-validate) and only a "VERIFIED" answer is trusted.

   Both are idempotent: each event is stored once in paypal_events and never applied twice.
   ========================================================= */
const express = require('express');
const { db, get, run, all, now } = require('./db');
const { log } = require('./util');
const paypal = require('./paypal');

db.exec(`
CREATE TABLE IF NOT EXISTS paypal_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, type TEXT, resource_id TEXT, order_id INTEGER,
  result TEXT, received_at INTEGER NOT NULL
);`);

const LIVE = process.env.PAYPAL_ENV === 'live';
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const IPN_VERIFY = LIVE ? 'https://ipnpb.paypal.com/cgi-bin/webscr' : 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr';
const RECEIVER = (process.env.PAYPAL_RECEIVER_EMAIL || '').toLowerCase();

// lazy: shop.js requires paypal.js too — take fulfil only when needed to avoid a require cycle
const shop = () => require('./shop');

function remember(id, source, type, resourceId, orderId, result) {
  run('INSERT OR IGNORE INTO paypal_events (id, source, type, resource_id, order_id, result, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, source, type || '', resourceId || '', orderId || null, result, now());
  run('DELETE FROM paypal_events WHERE received_at < ?', now() - 180 * 86400_000);
}
const seen = (id) => !!get('SELECT 1 FROM paypal_events WHERE id = ?', id);

/* ---------- shared actions ---------- */
function amountMatches(order, amount) {
  return amount && amount.currency_code === order.currency && amount.value === paypal.fmt(order.total_cents);
}
async function markPaid(order, capture, payerEmail) {
  if (order.status === 'paid') return 'already paid';
  if (!['pending', 'cancelled', 'failed'].includes(order.status)) return `ignored (order is ${order.status})`;
  if (!amountMatches(order, capture.amount)) {
    log('system', 'paypal.notify_amount_mismatch', order.number, { expected: paypal.fmt(order.total_cents), got: capture.amount });
    return 'amount mismatch — not delivered';
  }
  await shop().fulfil(order, { captureId: capture.id, payerEmail });
  return 'paid → codes delivered';
}
function markRefunded(order, why) {
  if (order.status === 'refunded') return 'already refunded';
  run("UPDATE orders SET status = 'refunded', admin_note = TRIM(COALESCE(admin_note, '') || ? ) WHERE id = ?", `\n${why} (PayPal)`, order.id);
  run('UPDATE licenses SET revoked = 1 WHERE order_id = ?', order.id);
  log('system', 'order.refunded', order.number, `${why} — codes revoked`);
  return `${why.toLowerCase()} → codes revoked`;
}
const orderByPaypalId = (id) => (id ? get('SELECT * FROM orders WHERE paypal_order_id = ?', id) : null);
const orderByCapture = (id) => (id ? get('SELECT * FROM orders WHERE paypal_capture_id = ?', id) : null);
const captureIdFromLinks = (links = []) => (links.find((l) => l.rel === 'up')?.href || '').split('/captures/')[1]?.split(/[/?]/)[0] || null;

/* ---------- webhooks ---------- */
async function verifyWebhook(req) {
  if (!WEBHOOK_ID || !paypal.configured()) return false;
  const h = (k) => req.headers[k];
  const body = {
    auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'),
    webhook_id: WEBHOOK_ID, webhook_event: JSON.parse(req.rawBody || '{}'),
  };
  if (!body.transmission_id || !body.transmission_sig) return false;
  try { const r = await paypal.call('/v1/notifications/verify-webhook-signature', 'POST', body); return r.verification_status === 'SUCCESS'; } catch { return false; }
}

async function handleWebhook(ev) {
  const r = ev.resource || {};
  switch (ev.event_type) {
    case 'CHECKOUT.ORDER.APPROVED': {
      // the buyer approved but the browser never came back — capture it from here
      const order = orderByPaypalId(r.id);
      if (!order) return { result: 'unknown order' };
      if (order.status !== 'pending') return { order, result: `nothing to do (${order.status})` };
      let res;
      try { res = await paypal.captureOrder(r.id); } catch (e) {
        if (!JSON.stringify(e.paypal || {}).includes('ORDER_ALREADY_CAPTURED')) return { order, result: `capture failed: ${e.message}` };
        res = await paypal.getOrder(r.id);
      }
      const cap = res?.purchase_units?.[0]?.payments?.captures?.[0];
      if (res?.status !== 'COMPLETED' || cap?.status !== 'COMPLETED') return { order, result: `capture ${cap?.status || res?.status}` };
      return { order, result: await markPaid(order, cap, res?.payer?.email_address) };
    }
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const order = orderByPaypalId(r.supplementary_data?.related_ids?.order_id) || orderByCapture(r.id) || (r.custom_id ? get('SELECT * FROM orders WHERE id = ?', Number(r.custom_id)) : null);
      if (!order) return { result: 'unknown order' };
      return { order, result: await markPaid(order, r, null) };
    }
    case 'PAYMENT.CAPTURE.PENDING': {
      const order = orderByPaypalId(r.supplementary_data?.related_ids?.order_id);
      return { order, result: `pending at PayPal (${r.status_details?.reason || 'review'})` };
    }
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      const order = orderByPaypalId(r.supplementary_data?.related_ids?.order_id) || orderByCapture(r.id);
      if (order?.status === 'pending') run("UPDATE orders SET status = 'failed' WHERE id = ?", order.id);
      return { order, result: 'payment denied' };
    }
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED': {
      // resource is the refund / reversal; its "up" link points at the capture
      const order = orderByCapture(captureIdFromLinks(r.links)) || orderByCapture(r.id);
      if (!order) return { result: 'unknown capture' };
      return { order, result: markRefunded(order, ev.event_type.endsWith('REVERSED') ? 'Payment reversed' : 'Refunded') };
    }
    case 'CUSTOMER.DISPUTE.CREATED': {
      const capId = r.disputed_transactions?.[0]?.seller_transaction_id;
      const order = orderByCapture(capId);
      if (order) run("UPDATE orders SET admin_note = TRIM(COALESCE(admin_note, '') || ?) WHERE id = ?", `\nPayPal dispute opened: ${r.reason || ''}`, order.id);
      log('system', 'paypal.dispute', order?.number || capId || '?', r.reason || '');
      return { order, result: 'dispute opened' };
    }
    default: return { result: 'ignored' };
  }
}

/* ---------- IPN ---------- */
async function verifyIpn(raw) {
  try {
    const r = await fetch(IPN_VERIFY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Ezro-IPN' }, body: `cmd=_notify-validate&${raw}` });
    return (await r.text()).trim() === 'VERIFIED';
  } catch { return false; }
}
async function handleIpn(p) {
  if (RECEIVER && ![p.receiver_email, p.business].some((e) => String(e || '').toLowerCase() === RECEIVER)) return { result: 'wrong receiver' };
  const status = String(p.payment_status || '');
  if (status === 'Completed') {
    const order = orderByCapture(p.txn_id) || (/^\d+$/.test(p.custom || '') ? get('SELECT * FROM orders WHERE id = ?', Number(p.custom)) : null);
    if (!order) return { result: 'unknown order' };
    return { order, result: await markPaid(order, { id: p.txn_id, amount: { currency_code: p.mc_currency, value: Number(p.mc_gross).toFixed(2) } }, p.payer_email) };
  }
  if (['Refunded', 'Reversed'].includes(status)) {
    const order = orderByCapture(p.parent_txn_id || p.txn_id);
    if (!order) return { result: 'unknown transaction' };
    return { order, result: markRefunded(order, status === 'Reversed' ? 'Payment reversed' : 'Refunded') };
  }
  if (status === 'Canceled_Reversal') return { order: orderByCapture(p.parent_txn_id), result: 'reversal cancelled — check the order' };
  return { result: `ignored (${status || 'no status'})` };
}

/* ---------- routes (mounted at /api/paypal) ---------- */
const router = express.Router();

router.post('/webhook', async (req, res) => {
  const ev = req.body || {};
  if (!(await verifyWebhook(req))) {
    log(req, 'paypal.webhook_rejected', ev.event_type || '?', WEBHOOK_ID ? 'signature not verified' : 'PAYPAL_WEBHOOK_ID is not set');
    return res.status(400).json({ error: 'Not verified' });
  }
  if (!ev.id || seen(`wh:${ev.id}`)) return res.json({ ok: true, duplicate: true });
  let out;
  try { out = await handleWebhook(ev); } catch (e) { out = { result: `error: ${e.message}` }; }
  remember(`wh:${ev.id}`, 'webhook', ev.event_type, ev.resource?.id, out.order?.id, out.result);
  log('system', 'paypal.webhook', ev.event_type, `${out.order?.number || ''} ${out.result}`.trim());
  res.json({ ok: true });
});

router.post('/ipn', express.text({ type: '*/*', limit: '100kb' }), async (req, res) => {
  res.status(200).end(); // PayPal wants an empty 200 straight away; verification happens after
  const raw = typeof req.body === 'string' ? req.body : '';
  const p = Object.fromEntries(new URLSearchParams(raw));
  if (!raw || !(await verifyIpn(raw))) { log('system', 'paypal.ipn_rejected', p.txn_id || '?', 'not VERIFIED by PayPal'); return; }
  const key = `ipn:${p.ipn_track_id || `${p.txn_id}:${p.payment_status}`}`;
  if (seen(key)) return;
  let out;
  try { out = await handleIpn(p); } catch (e) { out = { result: `error: ${e.message}` }; }
  remember(key, 'ipn', p.payment_status || p.txn_type, p.txn_id, out.order?.id, out.result);
  log('system', 'paypal.ipn', `${p.payment_status || p.txn_type || '?'} ${p.txn_id || ''}`.trim(), `${out.order?.number || ''} ${out.result}`.trim());
});

/* ---------- admin: status + latest notifications ---------- */
const admin = express.Router();
admin.get('/paypal/notifications', (_req, res) => res.json({
  webhookId: !!WEBHOOK_ID, receiver: RECEIVER || null, live: LIVE,
  events: all(`SELECT e.*, o.number FROM paypal_events e LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.received_at DESC LIMIT 30`),
}));

module.exports = { router, admin, handleWebhook, handleIpn };
