const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { get, run, now, all } = require('./db');
const { sha256, randomToken, log, rateLimit, str, clientIp, wrap, HttpError } = require('./util');

const COOKIE = 'ezro_sid';
const SESSION_DAYS = 30;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEV_LOGIN = process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const ownerEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
function isAdmin(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  return ownerEmails().includes(e) || !!get('SELECT 1 FROM admins WHERE email = ?', e);
}
const isOwner = (email) => !!email && ownerEmails().includes(email.toLowerCase());

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieOpts() {
  return {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production', maxAge: SESSION_DAYS * 86400_000,
  };
}

// Attach req.user / req.sessionHash on every request.
function sessionMiddleware(req, _res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  const token = req.cookies[COOKIE];
  if (token) {
    const hash = sha256(token);
    const row = get(`SELECT u.*, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ? AND s.expires_at > ?`, hash, now());
    if (row) {
      req.user = { id: row.id, email: row.email, name: row.name, picture: row.picture };
      req.user.isAdmin = isAdmin(row.email);
      req.sessionHash = hash;
    }
  }
  next();
}

const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in with Google first.' }));
const requireAdmin = (req, res, next) => (req.user?.isAdmin ? next() : res.status(req.user ? 403 : 401).json({ error: 'Admins only.' }));

function startSession(req, res, profile) {
  const email = profile.email.toLowerCase();
  let user = get('SELECT * FROM users WHERE email = ?', email);
  if (user) {
    run('UPDATE users SET name = ?, picture = ?, google_sub = COALESCE(?, google_sub), last_login = ? WHERE id = ?',
      profile.name || user.name, profile.picture || user.picture, profile.sub || null, now(), user.id);
  } else {
    const r = run('INSERT INTO users (email, name, picture, google_sub, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)',
      email, profile.name || email.split('@')[0], profile.picture || '', profile.sub || null, now(), now());
    user = { id: Number(r.lastInsertRowid) };
  }
  const token = randomToken();
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)',
    sha256(token), user.id, now(), now() + SESSION_DAYS * 86400_000, clientIp(req), str(req.headers['user-agent'], 300));
  run('DELETE FROM sessions WHERE expires_at < ?', now());
  res.cookie(COOKIE, token, cookieOpts());
  req.user = { id: user.id, email };
  log(req, 'auth.login', email);
}

const router = express.Router();

router.get('/config', (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID, devLogin: DEV_LOGIN }));

router.get('/me', (req, res) => res.json({ user: req.user || null }));

router.post('/google', rateLimit({ max: 20 }), wrap(async (req, res) => {
  if (!googleClient) throw new HttpError(503, 'Google sign-in is not configured (GOOGLE_CLIENT_ID).');
  const credential = str(req.body?.credential, 5000);
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google sign-in could not be verified.');
  }
  if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'Your Google email is not verified.');
  startSession(req, res, payload);
  res.json({ ok: true, user: { email: payload.email, name: payload.name, picture: payload.picture, isAdmin: isAdmin(payload.email) } });
}));

// Local testing only: enabled with DEV_LOGIN=1 and never in production.
router.post('/dev', rateLimit({ max: 20 }), (req, res) => {
  if (!DEV_LOGIN) return res.status(404).json({ error: 'Not found' });
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  startSession(req, res, { email, name: email.split('@')[0] });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.sessionHash) run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

module.exports = { router, sessionMiddleware, requireUser, requireAdmin, isAdmin, isOwner, ownerEmails, all };
