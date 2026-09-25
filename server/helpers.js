const crypto = require('node:crypto');
const { MONTHS } = require('./constants');

const nf = new Intl.NumberFormat('el-GR');

const fmt = {
  price: (v) => (v === null || v === undefined ? 'Ρωτήστε τιμή' : `${nf.format(v)} €`),
  km: (v) => (v === null || v === undefined ? '—' : `${nf.format(v)} km`),
  num: (v) => (v === null || v === undefined ? '—' : nf.format(v)),
  reg: (car) => (car.year ? `${car.month ? `${MONTHS[car.month - 1]} ` : ''}${car.year}` : '—'),
  tel: (s) => String(s || '').replace(/[^\d+]/g, ''),
  bytes: (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`),
  date: (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : ''),
};

/** Builds a query string from the current filters, overriding the given keys. */
function qs(query, overrides = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...overrides })) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

function verifyCsrf(req, res, next) {
  const sent = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session?.csrf;
  if (!sent || !expected || sent.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return res.status(403).send('Μη έγκυρο αίτημα (CSRF). Ανανεώστε τη σελίδα και δοκιμάστε ξανά.');
  }
  next();
}

function flash(req, type, message) {
  (req.session.flash ||= []).push({ type, message });
}

module.exports = { fmt, qs, csrfToken, verifyCsrf, flash };
