/* =========================================================
   Admin login — a secret username + password, separate from the customers' Google sign-in.
   - passwords hashed with scrypt (salted), compared in constant time
   - brute-force lock per IP and per username, with a delay on every failure
   - own httpOnly SameSite=Strict cookie, sessions stored hashed and revocable
   - no sign-up: a built-in owner login, and the owner creates every other login inside the panel
   ========================================================= */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { db, get, run, all, now, DATA_DIR } = require('./db');
const { sha256, randomToken, log, str, clientIp, HttpError } = require('./util');

db.exec(`
CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', created_at INTEGER NOT NULL, created_by TEXT, last_login INTEGER, pw_changed_at INTEGER
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER, ip TEXT, ua TEXT
);
`);

const COOKIE = 'ezro_admin';
const SHORT = 12 * 3600_000; // a normal sign-in lasts 12 hours
const LONG = 14 * 86400_000; // "keep me signed in" — 14 days
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

/* ---------- password hashing ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const DUMMY_HASH = hashPassword(randomToken()); // compared against when the username doesn't exist, so timing gives nothing away

function checkPassword(pw, username) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return 'The password must not contain the username.';
  if (new Set(pw).size < 5) return 'That password is too simple.';
  return null;
}

/* ---------- brute-force protection ---------- */
const fails = new Map(); // key -> { n, until, first }
const FAIL_WINDOW = 15 * 60_000;
function lockedFor(key) {
  const f = fails.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function addFail(key, limit) {
  const t = Date.now();
  const f = fails.get(key) && t - fails.get(key).first < FAIL_WINDOW ? fails.get(key) : { n: 0, first: t, until: 0, strikes: fails.get(key)?.strikes || 0 };
  f.n += 1;
  if (f.n >= limit) { f.strikes += 1; f.until = t + Math.min(60, 5 * 2 ** (f.strikes - 1)) * 60_000; f.n = 0; f.first = t; } // 5, 10, 20, 40, 60 min
  fails.set(key, f);
}
setInterval(() => { const t = Date.now(); for (const [k, f] of fails) if (f.until < t && t - f.first > FAIL_WINDOW * 4) fails.delete(k); }, 10 * 60_000).unref();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the owner login ---------- */
// The owner account is built in: its password is stored only as a scrypt hash (the password itself was handed to the owner privately).
// It is created once; after that the owner can change the username and password in Admins & Security and it is never re-created.
// There is no sign-up / setup screen — new logins are made by the owner inside the panel.
const OWNER_SEED = { username: 'owner.uh4tv', hash: 'scrypt$16384$8$1$uVLbM1dJU2Rh76OxY2fxTA==$caYoviK63CDQfRtpm0mvVX2KLziPcR1b5CQzWB4GLLToNvMkkPwiPmd53tkmp6mMIQLlfD79u/SI/bDPinQLcw==' };
db.exec('CREATE TABLE IF NOT EXISTS admin_meta (k TEXT PRIMARY KEY, v TEXT)');
if (!get("SELECT 1 FROM admin_meta WHERE k = 'owner_seeded'")) {
  if (!get('SELECT 1 FROM admin_accounts WHERE username = ?', OWNER_SEED.username)) {
    run("INSERT INTO admin_accounts (username, pass_hash, role, created_at, created_by, pw_changed_at) VALUES (?, ?, 'owner', ?, 'built-in', ?)", OWNER_SEED.username, OWNER_SEED.hash, now(), now());
  }
  run("INSERT INTO admin_meta (k, v) VALUES ('owner_seeded', ?)", String(now()));
}
fs.rm(path.join(DATA_DIR, 'ADMIN-SETUP-CODE.txt'), { force: true }, () => {});

/* ---------- sessions ---------- */
function cookieOpts(maxAge) {
  return { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.NODE_ENV === 'production', maxAge };
}
function startSession(req, res, acc, remember) {
  const token = randomToken(32);
  const ttl = remember ? LONG : SHORT;
  run('INSERT INTO admin_sessions (token_hash, admin_id, created_at, expires_at, last_seen, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?)',
    sha256(token), acc.id, now(), now() + ttl, now(), clientIp(req), str(req.headers['user-agent'], 300));
  run('DELETE FROM admin_sessions WHERE expires_at < ?', now());
  run('UPDATE admin_accounts SET last_login = ? WHERE id = ?', now(), acc.id);
  res.cookie(COOKIE, token, cookieOpts(ttl));
}

// Attach req.admin on every request (after the customer session middleware, which parses cookies).
function adminSession(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const hash = sha256(token);
    const row = get(`SELECT a.id, a.username, a.role, s.last_seen FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id
                     WHERE s.token_hash = ? AND s.expires_at > ?`, hash, now());
    if (row) {
      req.admin = { id: row.id, username: row.username, role: row.role, sessionHash: hash };
      if (!row.last_seen || now() - row.last_seen > 60_000) run('UPDATE admin_sessions SET last_seen = ? WHERE token_hash = ?', now(), hash);
    }
  }
  next();
}
// Admin API: only with an admin session. Logs and tasks identify the admin by username.
function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Please sign in to the admin panel.', adminLogin: true });
  req.customer = req.user;
  req.user = { email: req.admin.username, name: req.admin.username, isAdmin: true };
  next();
}
const isOwnerReq = (req) => req.admin?.role === 'owner';

/* ---------- /api/admin-auth ---------- */
const router = express.Router();

router.get('/status', (req, res) => res.json({
  admin: req.admin ? { username: req.admin.username, role: req.admin.role } : null,
}));

router.post('/login', async (req, res) => {
  const ip = clientIp(req);
  const username = str(req.body?.username, 64);
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
  const ipKey = `ip:${ip}`; const userKey = `u:${username.toLowerCase()}`;
  const wait = Math.max(lockedFor(ipKey), lockedFor(userKey));
  if (wait) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`, retryAfter: wait });
  const acc = username ? get('SELECT * FROM admin_accounts WHERE username = ?', username) : null;
  const ok = verifyPassword(password, acc ? acc.pass_hash : DUMMY_HASH) && !!acc;
  if (!ok) {
    addFail(ipKey, 5); addFail(userKey, 10);
    log(req, 'admin.login_failed', username || '(empty)', `from ${ip}`);
    await pause(500 + Math.random() * 400);
    const left = Math.max(lockedFor(ipKey), lockedFor(userKey));
    if (left) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(left / 60)} min.`, retryAfter: left });
    throw new HttpError(401, 'Wrong username or password.');
  }
  fails.delete(ipKey); fails.delete(userKey);
  startSession(req, res, acc, !!req.body?.remember);
  req.user = { email: acc.username }; log(req, 'admin.login', acc.username, req.body?.remember ? 'kept signed in (14 days)' : '');
  res.json({ ok: true, admin: { username: acc.username, role: acc.role } });
});

router.post('/logout', (req, res) => {
  if (req.admin) { run('DELETE FROM admin_sessions WHERE token_hash = ?', req.admin.sessionHash); req.user = { email: req.admin.username }; log(req, 'admin.logout', req.admin.username); }
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ---------- account management (mounted under /api/admin, behind requireAdmin) ---------- */
const accounts = express.Router();
const publicAcc = (a) => ({ id: a.id, username: a.username, role: a.role, created_at: a.created_at, created_by: a.created_by, last_login: a.last_login, pw_changed_at: a.pw_changed_at });

accounts.get('/accounts', (req, res) => res.json({
  me: { id: req.admin.id, username: req.admin.username, role: req.admin.role },
  canManage: isOwnerReq(req),
  accounts: all('SELECT * FROM admin_accounts ORDER BY role DESC, created_at').map(publicAcc),
  sessions: all('SELECT created_at, last_seen, expires_at, ip, ua, token_hash FROM admin_sessions WHERE admin_id = ? AND expires_at > ? ORDER BY last_seen DESC', req.admin.id, now())
    .map((s) => ({ created_at: s.created_at, last_seen: s.last_seen, ip: s.ip, ua: s.ua, current: s.token_hash === req.admin.sessionHash })),
}));

// change my own username and/or password — always needs the current password
accounts.put('/account', async (req, res) => {
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', req.admin.id);
  if (!verifyPassword(typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '', acc.pass_hash)) {
    addFail(`ip:${clientIp(req)}`, 5); await pause(500);
    throw new HttpError(401, 'Your current password is wrong.');
  }
  const username = req.body?.username !== undefined ? str(req.body.username, 32) : acc.username;
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username: 3–32 letters, numbers, dot, dash or underscore.');
  if (username.toLowerCase() !== acc.username.toLowerCase() && get('SELECT 1 FROM admin_accounts WHERE username = ?', username)) throw new HttpError(409, 'That username is taken.');
  const newPw = req.body?.newPassword;
  if (newPw) { const bad = checkPassword(newPw, username); if (bad) throw new HttpError(400, bad); }
  run('UPDATE admin_accounts SET username = ?, pass_hash = ?, pw_changed_at = ? WHERE id = ?',
    username, newPw ? hashPassword(newPw) : acc.pass_hash, newPw ? now() : acc.pw_changed_at, acc.id);
  // a new password signs out every other device
  if (newPw) run('DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?', acc.id, req.admin.sessionHash);
  if (username !== acc.username) run('UPDATE tasks SET assignee = ? WHERE assignee = ?', username, acc.username);
  log(req, 'admin.account_changed', username, [username !== acc.username ? `username ${acc.username} → ${username}` : '', newPw ? 'password changed' : ''].filter(Boolean).join(', '));
  res.json({ ok: true, username });
});

accounts.post('/account/signout-others', (req, res) => {
  const n = run('DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?', req.admin.id, req.admin.sessionHash).changes;
  log(req, 'admin.signout_others', req.admin.username, `${n} session(s)`);
  res.json({ ok: true, count: n });
});

accounts.post('/accounts', (req, res) => {
  if (!isOwnerReq(req)) throw new HttpError(403, 'Only an owner can add admins.');
  const username = str(req.body?.username, 32);
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username: 3–32 letters, numbers, dot, dash or underscore.');
  if (get('SELECT 1 FROM admin_accounts WHERE username = ?', username)) throw new HttpError(409, 'That username is taken.');
  const bad = checkPassword(req.body?.password, username);
  if (bad) throw new HttpError(400, bad);
  const role = req.body?.role === 'owner' ? 'owner' : 'admin';
  run('INSERT INTO admin_accounts (username, pass_hash, role, created_at, created_by, pw_changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    username, hashPassword(req.body.password), role, now(), req.admin.username, now());
  log(req, 'admin.account_created', username, role);
  res.json({ ok: true });
});

accounts.put('/accounts/:id/password', (req, res) => {
  if (!isOwnerReq(req)) throw new HttpError(403, 'Only an owner can reset passwords.');
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', Number(req.params.id));
  if (!acc) throw new HttpError(404, 'Not found');
  const bad = checkPassword(req.body?.password, acc.username);
  if (bad) throw new HttpError(400, bad);
  run('UPDATE admin_accounts SET pass_hash = ?, pw_changed_at = ? WHERE id = ?', hashPassword(req.body.password), now(), acc.id);
  run('DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?', acc.id, req.admin.sessionHash);
  log(req, 'admin.password_reset', acc.username);
  res.json({ ok: true });
});

accounts.delete('/accounts/:id', (req, res) => {
  if (!isOwnerReq(req)) throw new HttpError(403, 'Only an owner can remove admins.');
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', Number(req.params.id));
  if (!acc) throw new HttpError(404, 'Not found');
  if (acc.id === req.admin.id) throw new HttpError(400, 'You cannot remove your own account.');
  if (acc.role === 'owner' && get("SELECT COUNT(*) n FROM admin_accounts WHERE role = 'owner'").n <= 1) throw new HttpError(400, 'Keep at least one owner.');
  run('DELETE FROM admin_sessions WHERE admin_id = ?', acc.id);
  run('DELETE FROM admin_accounts WHERE id = ?', acc.id);
  log(req, 'admin.account_removed', acc.username);
  res.json({ ok: true });
});

const adminUsernames = () => all('SELECT username FROM admin_accounts ORDER BY created_at').map((a) => a.username);

module.exports = { router, accounts, adminSession, requireAdmin, isOwnerReq, adminUsernames, COOKIE };
