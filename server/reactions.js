/* =========================================================
   Likes — a ❤️ with a count on products, albums and covers.
   One vote per person: a signed-in customer votes with their account, a visitor with an anonymous
   browser id (random, httpOnly cookie). Voting again with the same choice removes the vote.
   ========================================================= */
const crypto = require('node:crypto');
const express = require('express');
const { db, all, get, run, now } = require('./db');
const { rateLimit, log } = require('./util');

db.exec(`
CREATE TABLE IF NOT EXISTS reactions (
  target_type TEXT NOT NULL, target_id INTEGER NOT NULL, voter TEXT NOT NULL, value INTEGER NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (target_type, target_id, voter)
);
CREATE INDEX IF NOT EXISTS reactions_target ON reactions (target_type, target_id);
DELETE FROM reactions WHERE value != 1;
`); // only likes are kept (thumbs-down was removed)

const TYPES = { product: 'products', album: 'albums', media: 'media' };
const VID = 'ezro_vid';

function voterOf(req, res) {
  if (req.user?.id) return `u:${req.user.id}`;
  let v = req.cookies?.[VID];
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(v || '')) {
    v = crypto.randomBytes(18).toString('base64url');
    res.cookie(VID, v, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 400 * 86400_000 });
  }
  return `v:${v}`;
}
function counts(type, id) {
  return { likes: get('SELECT COUNT(*) n FROM reactions WHERE target_type = ? AND target_id = ? AND value = 1', type, id).n };
}

const router = express.Router();

// every count + what this visitor chose — small enough to send in one go
router.get('/reactions', (req, res) => {
  const out = {};
  for (const r of all('SELECT target_type t, target_id i, SUM(value = 1) l FROM reactions GROUP BY target_type, target_id')) out[`${r.t}:${r.i}`] = { likes: r.l };
  const mine = {};
  const voter = req.user?.id ? `u:${req.user.id}` : req.cookies?.[VID] ? `v:${req.cookies[VID]}` : null;
  if (voter) for (const r of all('SELECT target_type t, target_id i, value FROM reactions WHERE voter = ?', voter)) mine[`${r.t}:${r.i}`] = r.value;
  res.set('Cache-Control', 'no-store').json({ counts: out, mine });
});

router.post('/react', rateLimit({ max: 60 }), (req, res) => {
  const type = String(req.body?.type || '');
  const id = Number(req.body?.id);
  const value = Number(req.body?.value);
  if (!TYPES[type] || !Number.isInteger(id) || ![1, 0].includes(value)) return res.status(400).json({ error: 'Bad request.' });
  if (!get(`SELECT 1 FROM ${TYPES[type]} WHERE id = ?`, id)) return res.status(404).json({ error: 'Not found.' });
  const voter = voterOf(req, res);
  if (value === 0) run('DELETE FROM reactions WHERE target_type = ? AND target_id = ? AND voter = ?', type, id, voter);
  else run(`INSERT INTO reactions (target_type, target_id, voter, value, created_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (target_type, target_id, voter) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`, type, id, voter, value, now());
  res.json({ ...counts(type, id), mine: value });
});

/* ---------- admin: who likes what ---------- */
const admin = express.Router();
admin.get('/reactions', (_req, res) => {
  const rows = all(`SELECT target_type t, target_id i, SUM(value = 1) likes, MAX(created_at) last
                    FROM reactions GROUP BY target_type, target_id`);
  const name = (t, i) => (t === 'product' ? get('SELECT title n, cover_url img FROM products WHERE id = ?', i)
    : t === 'album' ? get("SELECT title n, COALESCE(NULLIF(cover_url, ''), (SELECT url FROM media m WHERE m.album_id = albums.id AND m.type = 'image' LIMIT 1)) img FROM albums WHERE id = ?", i)
      : get("SELECT COALESCE(NULLIF(song_title, ''), NULLIF(title, ''), (SELECT name FROM categories c WHERE c.id = media.category_id)) n, CASE WHEN type = 'video' THEN poster ELSE url END img FROM media WHERE id = ?", i));
  const items = rows.map((r) => { const x = name(r.t, r.i); return x ? { type: r.t, id: r.i, title: x.n, image: x.img, likes: r.likes, last: r.last } : null; })
    .filter(Boolean).sort((a, b) => b.likes - a.likes || b.last - a.last);
  const week = now() - 7 * 86400_000;
  res.json({
    items,
    totals: { likes: items.reduce((s, x) => s + x.likes, 0), voters: get('SELECT COUNT(DISTINCT voter) n FROM reactions').n,
      week: get('SELECT COUNT(*) n FROM reactions WHERE value = 1 AND created_at > ?', week).n },
  });
});
admin.delete('/reactions/:type/:id', (req, res) => {
  if (!TYPES[req.params.type]) return res.status(400).json({ error: 'Bad request.' });
  run('DELETE FROM reactions WHERE target_type = ? AND target_id = ?', req.params.type, Number(req.params.id));
  log(req, 'reactions.reset', `${req.params.type} #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = { router, admin };
