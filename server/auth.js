const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { get, run, now, all } = require('./db');
const { sha256, randomToken, log, rateLimit, str, clientIp, wrap, HttpError } = require('./util');

const COOKIE = 'ezro_sid';
const SESSION_DAYS = 30;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEV_LOGIN = process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

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
      req.sessionHash = hash;
    }
  }
  next();
}

const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in with Google first.' }));

function startSession(req, res, profile) {
  const email = profile.email.toLowerCase();
  let user = get('SELECT * FROM users WHERE email = ?', email);
  if (user) {
    // a name / photo the user set in their profile is kept over the Google one
    run('UPDATE users SET name = ?, picture = ?, google_sub = COALESCE(?, google_sub), last_login = ? WHERE id = ?',
      user.name_locked ? user.name : profile.name || user.name, user.picture_locked ? user.picture : profile.picture || user.picture,
      profile.sub || null, now(), user.id);
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

router.get('/me', (req, res) => res.json({ user: req.user ? { ...req.user, isAdmin: !!req.admin } : null, admin: !!req.admin }));

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
  res.json({ ok: true, user: { email: payload.email, name: payload.name, picture: payload.picture, isAdmin: !!req.admin } });
}));

// Local testing only: enabled with DEV_LOGIN=1 and never in production.
router.post('/dev', rateLimit({ max: 20 }), (req, res) => {
  if (!DEV_LOGIN) return res.status(404).json({ error: 'Not found' });
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  startSession(req, res, { email, name: email.split('@')[0] });
  res.json({ ok: true });
});

/* ---------- profile: name and photo ---------- */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('./db');
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, f, cb) => cb(null, `av-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(/\.(png|jpe?g|webp|gif|avif)$/i.test(f.originalname) ? null : new HttpError(400, 'Use a PNG, JPG or WebP image.'), true),
});
const removeOldAvatar = (url) => { if (url?.startsWith('/uploads/av-')) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {}); };
const requireUserMw = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in first.' }));

router.put('/profile', requireUserMw, rateLimit({ max: 20 }), (req, res) => {
  const name = str(req.body?.name, 40).replace(/\s+/g, ' ');
  if (name.length < 2) throw new HttpError(400, 'Your name needs at least 2 characters.');
  run('UPDATE users SET name = ?, name_locked = 1 WHERE id = ?', name, req.user.id);
  log(req, 'auth.profile_name', req.user.email, name);
  res.json({ ok: true, name });
});
router.post('/avatar', requireUserMw, rateLimit({ max: 10 }), avatarUpload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an image.');
  const old = get('SELECT picture FROM users WHERE id = ?', req.user.id)?.picture;
  const url = `/uploads/${req.file.filename}`;
  run('UPDATE users SET picture = ?, picture_locked = 1 WHERE id = ?', url, req.user.id);
  removeOldAvatar(old);
  log(req, 'auth.profile_photo', req.user.email);
  res.json({ ok: true, url });
});
router.delete('/avatar', requireUserMw, (req, res) => {
  const old = get('SELECT picture FROM users WHERE id = ?', req.user.id)?.picture;
  run("UPDATE users SET picture = '', picture_locked = 0 WHERE id = ?", req.user.id);
  removeOldAvatar(old);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.sessionHash) run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

module.exports = { router, sessionMiddleware, requireUser };
