/* =========================================================
   PayPal — Payments Standard + IPN (no API keys, just your PayPal email).

   1. Checkout creates a pending order and sends the buyer to PayPal's own payment page
      (PayPal balance, bank or card — whatever the buyer's PayPal offers).
   2. PayPal sends an IPN (Instant Payment Notification) to /api/paypal/ipn.
   3. The IPN is posted back to PayPal (_notify-validate); only a "VERIFIED" answer is trusted.
      Receiver email, order, exact amount and currency are checked, then the redeem codes are delivered.
   Refunds and reversals arrive the same way and revoke the codes. Every IPN is applied once.
   ========================================================= */
const express = require('express');
const { db, get, run, all, now, getSetting } = require('./db');
const { log } = require('./util');

db.exec(`
CREATE TABLE IF NOT EXISTS paypal_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, type TEXT, resource_id TEXT, order_id INTEGER,
  result TEXT, received_at INTEGER NOT NULL
);`);

const sandbox = () => !!getSetting('checkout').paypalSandbox;
const host = (sb) => (sb ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com');
const ipnVerifyUrl = (sb) => (sb ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr' : 'https://ipnpb.paypal.com/cgi-bin/webscr');
const receiver = () => String(getSetting('checkout').paypalEmail || process.env.PAYPAL_RECEIVER_EMAIL || '').trim().toLowerCase();
const configured = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(receiver());
const fmt = (c) => (c / 100).toFixed(2);

// where PayPal can reach the site (notify_url must be public — not localhost)
function baseUrl(req) {
  if (process.env.PUBLIC_URL && !/localhost|example\.com/.test(process.env.PUBLIC_URL)) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// The fields for PayPal's payment page (a normal HTML form post to PayPal).
function paymentForm(order, req) {
  const base = baseUrl(req);
  const site = getSetting('site').name || 'Ezro';
  const items = JSON.parse(order.items || '[]').map((i) => i.title).join(', ');
  return {
    action: `${host(sandbox())}/cgi-bin/webscr`,
    fields: {
      cmd: '_xclick', business: receiver(), charset: 'utf-8',
      item_name: `${site} — ${items}`.slice(0, 127), item_number: order.number,
      amount: fmt(order.total_cents), currency_code: order.currency, quantity: '1',
      invoice: `${order.number}-${order.id}`, custom: String(order.id),
      no_shipping: '1', no_note: '1', rm: '1',
      notify_url: `${base}/api/paypal/ipn`,
      return: `${base}/?paypal=return&order=${order.id}`,
      cancel_return: `${base}/?paypal=cancel&order=${order.id}`,
    },
  };
}

/* ---------- IPN ---------- */
const shop = () => require('./shop'); // lazy — shop.js requires this file too

function remember(id, type, txn, orderId, result) {
  run('INSERT OR IGNORE INTO paypal_events (id, source, type, resource_id, order_id, result, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, 'ipn', type || '', txn || '', orderId || null, result, now());
  run('DELETE FROM paypal_events WHERE received_at < ?', now() - 180 * 86400_000);
}
async function verifyIpn(raw, sb) {
  try {
    const r = await fetch(ipnVerifyUrl(sb), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Ezro-IPN-Listener' }, body: `cmd=_notify-validate&${raw}` });
    return (await r.text()).trim() === 'VERIFIED';
  } catch { return false; }
}
const note = (order, text) => run("UPDATE orders SET admin_note = TRIM(COALESCE(admin_note, '') || ?) WHERE id = ?", `\n${text}`, order.id);
const byTxn = (txn) => (txn ? get('SELECT * FROM orders WHERE paypal_capture_id = ?', txn) : null);

async function handleIpn(p) {
  const status = String(p.payment_status || '');
  // the money must be for this account
  if (![p.receiver_email, p.business].some((e) => String(e || '').trim().toLowerCase() === receiver())) return { result: `wrong receiver (${p.receiver_email || p.business || '?'})` };

  if (status === 'Completed') {
    const order = /^\d+$/.test(p.custom || '') ? get('SELECT * FROM orders WHERE id = ?', Number(p.custom)) : null;
    if (!order || order.method !== 'paypal') return { result: 'unknown order' };
    if (order.status === 'paid') return { order, result: 'already paid' };
    if (order.status === 'refunded') return { order, result: 'order was refunded — not delivered' };
    const amountOk = Number(p.mc_gross).toFixed(2) === fmt(order.total_cents) && String(p.mc_currency) === order.currency;
    if (!amountOk) {
      note(order, `PayPal paid ${p.mc_gross} ${p.mc_currency} but the order is ${fmt(order.total_cents)} ${order.currency} — check it`);
      log('system', 'paypal.amount_mismatch', order.number, { paid: `${p.mc_gross} ${p.mc_currency}`, expected: `${fmt(order.total_cents)} ${order.currency}` });
      return { order, result: 'amount mismatch — not delivered' };
    }
    if (byTxn(p.txn_id) && byTxn(p.txn_id).id !== order.id) return { order, result: 'transaction already used' };
    await shop().fulfil(order, { captureId: p.txn_id, payerEmail: p.payer_email });
    return { order, result: 'paid → codes delivered' };
  }
  if (status === 'Pending') {
    const order = /^\d+$/.test(p.custom || '') ? get('SELECT * FROM orders WHERE id = ?', Number(p.custom)) : null;
    if (order) note(order, `PayPal payment pending: ${p.pending_reason || 'review'}`);
    return { order, result: `pending at PayPal (${p.pending_reason || 'review'})` };
  }
  if (['Failed', 'Denied', 'Voided', 'Expired'].includes(status)) {
    const order = /^\d+$/.test(p.custom || '') ? get('SELECT * FROM orders WHERE id = ?', Number(p.custom)) : null;
    if (order?.status === 'pending') run("UPDATE orders SET status = 'failed' WHERE id = ?", order.id);
    return { order, result: `payment ${status.toLowerCase()}` };
  }
  if (['Refunded', 'Reversed'].includes(status)) {
    const order = byTxn(p.parent_txn_id);
    if (!order) return { result: 'unknown transaction' };
    if (order.status === 'refunded') return { order, result: 'already refunded' };
    const why = status === 'Reversed' ? `Payment reversed (${p.reason_code || 'chargeback'})` : 'Refunded';
    run("UPDATE orders SET status = 'refunded' WHERE id = ?", order.id);
    run('UPDATE licenses SET revoked = 1 WHERE order_id = ?', order.id);
    note(order, `${why} via PayPal`);
    log('system', 'order.refunded', order.number, `${why} — codes revoked`);
    return { order, result: `${why.toLowerCase()} → codes revoked` };
  }
  if (status === 'Canceled_Reversal') {
    const order = byTxn(p.parent_txn_id);
    if (order) note(order, 'PayPal cancelled the reversal — you won the case; restore the order in Orders if you want');
    return { order, result: 'reversal cancelled' };
  }
  return { result: `ignored (${status || p.txn_type || 'no status'})` };
}

const router = express.Router();
router.post('/ipn', express.text({ type: '*/*', limit: '100kb' }), async (req, res) => {
  res.status(200).end(); // PayPal wants an empty 200 right away; checking happens after
  const raw = typeof req.body === 'string' ? req.body : '';
  const p = Object.fromEntries(new URLSearchParams(raw));
  const sb = p.test_ipn === '1';
  if (sb && !sandbox()) { log('system', 'paypal.ipn_rejected', p.txn_id || '?', 'sandbox IPN while in live mode'); return; }
  if (!raw || !(await verifyIpn(raw, sb))) { log('system', 'paypal.ipn_rejected', p.txn_id || '?', 'not VERIFIED by PayPal'); return; }
  const key = `ipn:${p.ipn_track_id || ''}:${p.txn_id}:${p.payment_status}`;
  if (get('SELECT 1 FROM paypal_events WHERE id = ?', key)) return;
  let out;
  try { out = await handleIpn(p); } catch (e) { out = { result: `error: ${e.message}` }; }
  remember(key, p.payment_status || p.txn_type, p.txn_id, out.order?.id, out.result);
  log('system', 'paypal.ipn', `${p.payment_status || p.txn_type || '?'} ${p.txn_id || ''}`.trim(), `${out.order?.number || ''} ${out.result}`.trim());
});

/* ---------- admin ---------- */
const admin = express.Router();
admin.get('/paypal/notifications', (_req, res) => res.json({
  configured: configured(), receiver: receiver() || null, sandbox: sandbox(),
  events: all('SELECT e.*, o.number FROM paypal_events e LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.received_at DESC LIMIT 30'),
}));

module.exports = { router, admin, configured, paymentForm, handleIpn, fmt, sandbox, host };
