const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { OUTBOX_DIR } = require('./db');
const { log } = require('./util');

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

module.exports = { send, smtpConfigured, PUBLIC_URL };
