// Minimal PayPal Orders v2 client (server side). Prices are always computed on the server.
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const BASE = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const configured = () => !!(CLIENT_ID && CLIENT_SECRET);
let cached = { token: null, exp: 0 };

async function accessToken() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function call(path, method = 'GET', body, idempotencyKey) {
  const headers = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['PayPal-Request-Id'] = idempotencyKey;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.details?.[0]?.description || j?.message || `PayPal error ${r.status}`);
    e.paypal = j; e.status = r.status;
    throw e;
  }
  return j;
}

const fmt = (c) => (c / 100).toFixed(2);

function createOrder(order, brandName) {
  return call('/v2/checkout/orders', 'POST', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: String(order.id),
      custom_id: String(order.id),
      invoice_id: order.number,
      description: `${brandName} order ${order.number}`.slice(0, 127),
      amount: { currency_code: order.currency, value: fmt(order.total_cents) },
    }],
    application_context: { brand_name: brandName.slice(0, 127), shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, `create-${order.id}`);
}

const captureOrder = (paypalOrderId) => call(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, 'POST', {}, `capture-${paypalOrderId}`);
const getOrder = (paypalOrderId) => call(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);

module.exports = { configured, createOrder, captureOrder, getOrder, CLIENT_ID, fmt };
