const crypto = require('node:crypto');
const fs = require('node:fs');
const { run, now, DATA_DIR } = require('./db');

// Without APP_SECRET a random one is created once and kept in the data folder,
// so logins survive restarts.
const SECRET = process.env.APP_SECRET || (() => {
  const file = require('node:path').join(DATA_DIR, '.app-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* first run */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
})();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Human-friendly license key: EZRO-XXXX-XXXX-XXXX-XXXX (no 0/O/1/I).
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function licenseKey() {
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
  return `EZRO-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}

/* ---------- activity log (shown in Admin → Logs) ---------- */
function log(req, action, target = '', details = '') {
  const actor = req?.user?.email || (typeof req === 'string' ? req : 'system');
  const d = typeof details === 'string' ? details : JSON.stringify(details);
  run('INSERT INTO logs (at, actor, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
    now(), actor, action, String(target ?? ''), d.slice(0, 4000), req?.headers ? clientIp(req) : '');
}

/* ---------- tiny in-memory rate limiter ---------- */
const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 30, key = (req) => clientIp(req) } = {}) {
  return (req, res, next) => {
    const k = `${req.baseUrl}${req.path}|${key(req)}`;
    const t = Date.now();
    const b = buckets.get(k) || { n: 0, reset: t + windowMs };
    if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
    b.n += 1; buckets.set(k, b);
    if (b.n > max) return res.status(429).json({ error: 'Too many requests, slow down a little.' });
    next();
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60_000).unref();

/* ---------- validation helpers ---------- */
const str = (v, max = 500) => (v == null ? '' : String(v)).trim().slice(0, max);
const int = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
const cents = (v) => Math.max(0, Math.round(parseFloat(String(v ?? '0').replace(',', '.')) * 100) || 0);
const slugify = (s) => str(s, 120).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || randomToken(4).toLowerCase();
const isHttpUrl = (u) => /^https?:\/\//i.test(u);
function safeUrl(u) {
  const s = str(u, 2000);
  if (!s || s === '#') return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^(https?:|mailto:)/i.test(s)) return s;
  return '';
}
const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : def);

function money(c, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format((c || 0) / 100);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  SECRET, sha256, hmac, randomToken, safeEqual, licenseKey, clientIp, log, rateLimit,
  str, int, bool, cents, slugify, isHttpUrl, safeUrl, hex, money, escapeHtml, HttpError, wrap,
};
