const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { getSetting, all, OUTBOX_DIR } = require('./db');
const { escapeHtml: e, money, log } = require('./util');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const smtpConfigured = () => !!process.env.SMTP_HOST;

let transport = null;
function mailer() {
  if (!transport && smtpConfigured()) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const abs = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${PUBLIC_URL}${u.startsWith('/') ? '' : '/'}${u}`);
const nl2br = (s) => e(s).replace(/\n/g, '<br>');
const fill = (tpl, order) => String(tpl || '').replaceAll('{number}', order.number || '').replaceAll('{name}', order.name || '')
  .replaceAll('{total}', money(order.total_cents, order.currency));

/* ---------- invoice HTML (used for the email, the online invoice and the admin preview) ---------- */
function renderInvoice(order, opts = {}) {
  const inv = { ...getSetting('invoice'), ...(opts.override || {}) };
  const checkout = getSetting('checkout');
  const accent = /^#[0-9a-f]{6}$/i.test(inv.accent) ? inv.accent : '#905abd';
  const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  const keys = opts.keys ?? (order.id ? all('SELECT key, product_title FROM licenses WHERE order_id = ? AND revoked = 0', order.id) : []);
  const date = new Date(order.paid_at || order.created_at || Date.now());
  const cur = order.currency;
  const paid = order.status === 'paid';

  const rows = items.map((it) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #eee;font-size:14px;color:#1c1326">
        <strong>${e(it.title)}</strong>${it.subtitle ? `<br><span style="color:#8a7f96;font-size:12px">${e(it.subtitle)}</span>` : ''}
      </td>
      <td style="padding:14px 0;border-bottom:1px solid #eee;font-size:14px;color:#1c1326;text-align:center">${it.qty || 1}</td>
      <td style="padding:14px 0;border-bottom:1px solid #eee;font-size:14px;color:#1c1326;text-align:right;white-space:nowrap">${money(it.price_cents * (it.qty || 1), cur)}</td>
    </tr>`).join('');

  const line = (label, value, strong) => `<tr><td style="padding:4px 0;font-size:${strong ? 16 : 14}px;color:${strong ? '#1c1326' : '#6d5f7d'};${strong ? 'font-weight:700' : ''}">${label}</td>
    <td style="padding:4px 0;font-size:${strong ? 16 : 14}px;text-align:right;color:#1c1326;${strong ? 'font-weight:700' : ''}">${value}</td></tr>`;

  const keyBlock = inv.showKeys && keys.length ? `
    <tr><td style="padding:24px 32px 0">
      <div style="border-radius:14px;background:#f6f1fb;padding:18px 20px">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:8px">Your access key${keys.length > 1 ? 's' : ''}</div>
        ${keys.map((k) => `<div style="margin:6px 0;font-size:13px;color:#6d5f7d">${e(k.product_title)}</div>
          <div style="font-family:Menlo,Consolas,monospace;font-size:17px;font-weight:700;color:#1c1326;letter-spacing:.04em">${e(k.key)}</div>`).join('')}
        <a href="${PUBLIC_URL}/watch" style="display:inline-block;margin-top:14px;padding:11px 20px;border-radius:999px;background:${accent};color:#fff;text-decoration:none;font-weight:600;font-size:14px">Watch now</a>
        <div style="margin-top:10px;font-size:12px;color:#8a7f96">The key only works while signed in with ${e(order.email)}.</div>
      </div>
    </td></tr>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${e(order.number)}</title></head>
<body style="margin:0;padding:0;background:#f3eff8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eff8;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 10px 40px rgba(60,20,100,.08)">
  <tr><td style="height:6px;background:linear-gradient(90deg,${accent},#b491dc)"></td></tr>
  ${inv.bannerUrl ? `<tr><td><img src="${e(abs(inv.bannerUrl))}" alt="" width="620" style="display:block;width:100%;height:auto"></td></tr>` : ''}
  <tr><td style="padding:28px 32px 8px">
    <table role="presentation" width="100%"><tr>
      <td>${inv.logoUrl ? `<img src="${e(abs(inv.logoUrl))}" alt="${e(inv.companyName)}" height="40" style="display:block;height:40px;width:auto">` : `<strong style="font-size:22px">${e(inv.companyName)}</strong>`}</td>
      <td style="text-align:right;font-size:12px;color:#8a7f96;line-height:1.6">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase">Invoice</div>
        <div style="font-size:16px;color:#1c1326;font-weight:700">${e(order.number)}</div>
        <div>${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div style="display:inline-block;margin-top:4px;padding:3px 10px;border-radius:999px;font-weight:700;font-size:11px;${paid ? 'background:#e5f8ee;color:#1b8a4f' : 'background:#fff4e0;color:#b36b00'}">${paid ? 'PAID' : 'AWAITING PAYMENT'}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:16px 32px 0">
    <h1 style="margin:0 0 8px;font-size:22px;color:#1c1326">${e(fill(inv.heading, order))}</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6d5f7d">${nl2br(fill(inv.intro, order))}</p>
  </td></tr>
  ${opts.instructions ? `<tr><td style="padding:20px 32px 0"><div style="border:1px dashed ${accent};border-radius:14px;padding:16px 18px;font-size:14px;line-height:1.6;color:#1c1326">
    <strong>How to pay (${e(order.method_label)})</strong><br>${nl2br(fill(opts.instructions, order))}</div></td></tr>` : ''}
  <tr><td style="padding:24px 32px 0">
    <table role="presentation" width="100%" style="font-size:13px;line-height:1.6;color:#6d5f7d"><tr>
      <td valign="top" width="50%"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a99bbb">Billed to</div>
        <div style="color:#1c1326;font-weight:600">${e(order.name || '')}</div><div>${e(order.email)}</div>
        ${inv.showPayer && order.payer_email && order.payer_email !== order.email ? `<div>PayPal: ${e(order.payer_email)}</div>` : ''}</td>
      <td valign="top" width="50%" style="text-align:right"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a99bbb">From</div>
        <div style="color:#1c1326;font-weight:600">${e(inv.companyName)}</div>${inv.address ? `<div>${nl2br(inv.address)}</div>` : ''}
        ${inv.vatId ? `<div>VAT: ${e(inv.vatId)}</div>` : ''}${inv.email ? `<div>${e(inv.email)}</div>` : ''}${inv.website ? `<div>${e(inv.website)}</div>` : ''}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><th align="left" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a99bbb;padding-bottom:8px;border-bottom:1px solid #eee">Item</th>
        <th style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a99bbb;padding-bottom:8px;border-bottom:1px solid #eee">Qty</th>
        <th align="right" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a99bbb;padding-bottom:8px;border-bottom:1px solid #eee">Amount</th></tr>
      ${rows}
    </table>
    <table role="presentation" width="100%" style="margin-top:12px">
      ${line('Subtotal', money(order.subtotal_cents, cur))}
      ${order.discount_cents ? line(`Discount${order.discount_code ? ` (${e(order.discount_code)})` : ''}`, `−${money(order.discount_cents, cur)}`) : ''}
      ${inv.showTax && order.tax_cents ? line(`${e(checkout.taxLabel)} ${checkout.taxPercent}%${checkout.taxIncluded ? ' (included)' : ''}`, money(order.tax_cents, cur)) : ''}
      ${line('Total', money(order.total_cents, cur), true)}
      ${line('Payment method', e(order.method_label || order.method))}
      ${order.paypal_capture_id ? line('Transaction ID', e(order.paypal_capture_id)) : ''}
    </table>
  </td></tr>
  ${keyBlock}
  ${inv.notes ? `<tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.6;color:#6d5f7d">${nl2br(inv.notes)}</td></tr>` : ''}
  <tr><td style="padding:28px 32px 32px;font-size:12px;line-height:1.6;color:#a99bbb;text-align:center">${nl2br(fill(inv.footer, order))}
    <div style="margin-top:8px"><a href="${PUBLIC_URL}/invoice/${encodeURIComponent(order.number)}" style="color:${accent}">View invoice online</a></div></td></tr>
</table></td></tr></table></body></html>`;
}

async function send({ to, subject, html, tag }) {
  const from = process.env.MAIL_FROM || `Ezro <no-reply@${new URL(PUBLIC_URL).hostname}>`;
  if (!smtpConfigured()) {
    const file = path.join(OUTBOX_DIR, `${Date.now()}-${(tag || 'mail').replace(/[^\w-]/g, '')}.html`);
    fs.writeFileSync(file, `<!-- To: ${to} | Subject: ${subject} -->\n${html}`);
    log('system', 'mail.saved', to, `SMTP not configured — saved to ${path.basename(file)}`);
    return { saved: file };
  }
  const info = await mailer().sendMail({ from, to, subject, html });
  log('system', 'mail.sent', to, subject);
  return info;
}

async function sendInvoice(order, opts = {}) {
  const inv = getSetting('invoice');
  return send({ to: order.email, subject: fill(inv.subject, order), html: renderInvoice(order, opts), tag: order.number });
}

module.exports = { renderInvoice, sendInvoice, send, smtpConfigured, PUBLIC_URL };
