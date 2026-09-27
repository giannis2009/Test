/* =========================================================
   Admin login — a secret username + password, separate from the customers' Google sign-in.
   - passwords hashed with scrypt (salted), compared in constant time
   - brute-force lock per IP and per username, with a delay on every failure
   - own httpOnly SameSite=Strict cookie, sessions stored hashed and revocable
   - no sign-up: a built-in owner login, and the owner creates every other login inside the panel
   - optional 2FA: a 6-digit code from an authenticator app (TOTP, RFC 6238) + one-time recovery codes
   ========================================================= */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { db, get, run, all, now, DATA_DIR } = require('./db');
const QRCode = require('qrcode');
const { sha256, hmac, randomToken, log, str, clientIp, HttpError } = require('./util');

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

// 2FA columns (added later)
{
  const cols = all('PRAGMA table_info(admin_accounts)').map((c) => c.name);
  for (const c of ['totp_secret', 'totp_pending', 'recovery']) if (!cols.includes(c)) db.exec(`ALTER TABLE admin_accounts ADD COLUMN ${c} TEXT`);
  if (!cols.includes('totp_last_step')) db.exec('ALTER TABLE admin_accounts ADD COLUMN totp_last_step INTEGER DEFAULT 0');
}

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

/* ---------- 2FA: TOTP (Google Authenticator, Authy, Microsoft Authenticator…) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0; let val = 0; let out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
// secrets are stored encrypted (AES-256-GCM with a key derived from APP_SECRET), never in plain text
const TOTP_KEY = crypto.createHash('sha256').update(hmac('ezro-admin-totp')).digest();
function seal(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', TOTP_KEY, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
function unseal(s) {
  try {
    const [iv, tag, enc] = String(s).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', TOTP_KEY, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  } catch { return null; }
}
function totpAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const hm = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = hm[hm.length - 1] & 15;
  return String(((hm.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
const stepNow = () => Math.floor(Date.now() / 30_000);
// accepts the current code and one step either side (clock drift); a code can never be used twice
function checkTotp(sealed, code, lastStep = 0) {
  const secret = unseal(sealed);
  if (!secret || !/^\d{6}$/.test(code)) return 0;
  for (const d of [0, -1, 1]) {
    const st = stepNow() + d;
    if (st > lastStep && crypto.timingSafeEqual(Buffer.from(totpAt(secret, st)), Buffer.from(code))) return st;
  }
  return 0;
}
function makeRecovery() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = Array.from({ length: 10 }, () => { const b = crypto.randomBytes(8); const c = [...b].map((x) => A[x % A.length]).join(''); return `${c.slice(0, 4)}-${c.slice(4)}`; });
  return { codes, stored: JSON.stringify(codes.map((c) => sha256(c))) };
}
const normCode = (v) => str(v, 20).toUpperCase().replace(/\s+/g, '');
// checks a 6-digit code or a one-time recovery code; recovery codes are used up
function verifySecondFactor(acc, raw) {
  const code = normCode(raw);
  if (/^\d{6}$/.test(code)) {
    const st = checkTotp(acc.totp_secret, code, acc.totp_last_step || 0);
    if (st) { run('UPDATE admin_accounts SET totp_last_step = ? WHERE id = ?', st, acc.id); return 'totp'; }
    return null;
  }
  const list = JSON.parse(acc.recovery || '[]');
  const h = sha256(code.replace(/[^A-Z0-9]/g, '').replace(/^(.{4})/, '$1-'));
  const i = list.indexOf(h);
  if (i < 0) return null;
  list.splice(i, 1);
  run('UPDATE admin_accounts SET recovery = ? WHERE id = ?', JSON.stringify(list), acc.id);
  return 'recovery';
}
const tickets = new Map(); // password OK, waiting for the 6-digit code: ticket -> { id, remember, exp, tries }
setInterval(() => { const t = Date.now(); for (const [k, v] of tickets) if (v.exp < t) tickets.delete(k); }, 60_000).unref();

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
  if (acc.totp_secret) {
    // step two: the password was right, now the authenticator code
    const ticket = randomToken(24);
    tickets.set(ticket, { id: acc.id, remember: !!req.body?.remember, exp: Date.now() + 5 * 60_000, tries: 0, ip });
    return res.json({ twoFactor: true, ticket });
  }
  startSession(req, res, acc, !!req.body?.remember);
  req.user = { email: acc.username }; log(req, 'admin.login', acc.username, req.body?.remember ? 'kept signed in (14 days)' : '');
  res.json({ ok: true, admin: { username: acc.username, role: acc.role } });
});

router.post('/login/2fa', async (req, res) => {
  const ip = clientIp(req);
  if (lockedFor(`ip:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const t = tickets.get(str(req.body?.ticket, 100));
  if (!t || t.exp < Date.now() || t.ip !== ip) throw new HttpError(401, 'This sign-in expired. Enter your password again.', { restart: true });
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', t.id);
  const how = acc?.totp_secret ? verifySecondFactor(acc, req.body?.code) : null;
  if (!how) {
    t.tries += 1; addFail(`ip:${ip}`, 8);
    if (acc) { req.user = { email: acc.username }; log(req, 'admin.2fa_failed', acc.username, `from ${ip}`); }
    await pause(400 + Math.random() * 300);
    if (t.tries >= 5) { tickets.delete(str(req.body?.ticket, 100)); throw new HttpError(401, 'Too many wrong codes. Enter your password again.'); }
    throw new HttpError(401, 'Wrong code. Check the time on your phone and try again.');
  }
  tickets.delete(str(req.body?.ticket, 100));
  startSession(req, res, acc, t.remember);
  req.user = { email: acc.username };
  log(req, 'admin.login', acc.username, how === 'recovery' ? 'with a recovery code' : 'with 2FA');
  const left = how === 'recovery' ? JSON.parse(acc.recovery || '[]').length - 1 : null;
  res.json({ ok: true, admin: { username: acc.username, role: acc.role }, recoveryLeft: left });
});

router.post('/logout', (req, res) => {
  if (req.admin) { run('DELETE FROM admin_sessions WHERE token_hash = ?', req.admin.sessionHash); req.user = { email: req.admin.username }; log(req, 'admin.logout', req.admin.username); }
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ---------- account management (mounted under /api/admin, behind requireAdmin) ---------- */
const accounts = express.Router();
const publicAcc = (a) => ({ id: a.id, username: a.username, role: a.role, twofa: !!a.totp_secret, created_at: a.created_at, created_by: a.created_by, last_login: a.last_login, pw_changed_at: a.pw_changed_at });

accounts.get('/accounts', (req, res) => res.json({
  me: (() => { const a = get('SELECT totp_secret, recovery FROM admin_accounts WHERE id = ?', req.admin.id); return { id: req.admin.id, username: req.admin.username, role: req.admin.role, twofa: !!a.totp_secret, recoveryLeft: JSON.parse(a.recovery || '[]').length }; })(),
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

/* ---- my 2FA ---- */
async function needPassword(req, acc) {
  if (!verifyPassword(typeof req.body?.password === 'string' ? req.body.password : '', acc.pass_hash)) {
    addFail(`ip:${clientIp(req)}`, 5); await pause(500);
    throw new HttpError(401, 'Your password is wrong.');
  }
}
accounts.post('/account/2fa/setup', async (req, res) => {
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', req.admin.id);
  await needPassword(req, acc);
  const secret = crypto.randomBytes(20);
  run('UPDATE admin_accounts SET totp_pending = ? WHERE id = ?', seal(secret), acc.id);
  const b32 = base32(secret);
  const label = encodeURIComponent(`Ezro Admin:${acc.username}`);
  const uri = `otpauth://totp/${label}?secret=${b32}&issuer=${encodeURIComponent('Ezro Admin')}&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240, color: { dark: '#0d0b12', light: '#ffffff' } });
  res.json({ secret: b32.replace(/(.{4})/g, '$1 ').trim(), qr, uri });
});
accounts.post('/account/2fa/enable', (req, res) => {
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', req.admin.id);
  if (!acc.totp_pending) throw new HttpError(400, 'Start again — scan the QR code first.');
  const st = checkTotp(acc.totp_pending, normCode(req.body?.code), 0);
  if (!st) throw new HttpError(400, 'That code is not right. Enter the 6 digits the app shows now.');
  const rec = makeRecovery();
  run('UPDATE admin_accounts SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ?, recovery = ? WHERE id = ?', st, rec.stored, acc.id);
  log(req, 'admin.2fa_enabled', acc.username);
  res.json({ ok: true, recoveryCodes: rec.codes });
});
accounts.post('/account/2fa/recovery', async (req, res) => {
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', req.admin.id);
  if (!acc.totp_secret) throw new HttpError(400, '2FA is off.');
  await needPassword(req, acc);
  const rec = makeRecovery();
  run('UPDATE admin_accounts SET recovery = ? WHERE id = ?', rec.stored, acc.id);
  log(req, 'admin.2fa_recovery_new', acc.username);
  res.json({ ok: true, recoveryCodes: rec.codes });
});
accounts.post('/account/2fa/disable', async (req, res) => {
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', req.admin.id);
  await needPassword(req, acc);
  if (acc.totp_secret && !verifySecondFactor(acc, req.body?.code)) throw new HttpError(401, 'Wrong 6-digit code.');
  run('UPDATE admin_accounts SET totp_secret = NULL, totp_pending = NULL, recovery = NULL, totp_last_step = 0 WHERE id = ?', acc.id);
  log(req, 'admin.2fa_disabled', acc.username);
  res.json({ ok: true });
});
// an owner can switch off someone's 2FA if they lost their phone
accounts.post('/accounts/:id/2fa/reset', (req, res) => {
  if (!isOwnerReq(req)) throw new HttpError(403, 'Only an owner can do this.');
  const acc = get('SELECT * FROM admin_accounts WHERE id = ?', Number(req.params.id));
  if (!acc) throw new HttpError(404, 'Not found');
  if (acc.id === req.admin.id) throw new HttpError(400, 'Turn off your own 2FA from “Two-factor authentication”.');
  run('UPDATE admin_accounts SET totp_secret = NULL, totp_pending = NULL, recovery = NULL, totp_last_step = 0 WHERE id = ?', acc.id);
  run('DELETE FROM admin_sessions WHERE admin_id = ?', acc.id);
  log(req, 'admin.2fa_reset', acc.username);
  res.json({ ok: true });
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
