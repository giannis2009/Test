/* =========================================================
   Backups — a full copy of the database every day, kept for 30 days.
   - VACUUM INTO makes a consistent snapshot while the site keeps running
   - optional second copy in BACKUP_COPY_DIR (e.g. a OneDrive / Google Drive / USB folder)
   - owners can download a backup, download everything as .zip (database + images + private files), or restore one
   ========================================================= */
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const archiver = require('archiver');
const { db, DATA_DIR, UPLOAD_DIR, SECURE_DIR, BACKUP_DIR } = require('./db');
const { log, HttpError } = require('./util');

const KEEP_DAYS = 30;
const DAY = 86400_000;
const COPY_DIR = process.env.BACKUP_COPY_DIR ? path.resolve(process.env.BACKUP_COPY_DIR) : null;
const NAME_RE = /^(auto|manual|before-restore)-[\w-]+\.db$/;

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function list() {
  return fs.readdirSync(BACKUP_DIR).filter((f) => NAME_RE.test(f))
    .map((name) => { const st = fs.statSync(path.join(BACKUP_DIR, name)); return { name, size: st.size, at: st.mtimeMs, kind: name.split('-')[0] }; })
    .sort((a, b) => b.at - a.at);
}
function makeBackup(kind = 'auto') {
  const name = `${kind}-${stamp()}${kind === 'manual' ? `-${Date.now() % 1000}` : ''}.db`;
  const file = path.join(BACKUP_DIR, name);
  fs.rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  if (COPY_DIR) {
    try { fs.mkdirSync(COPY_DIR, { recursive: true }); fs.copyFileSync(file, path.join(COPY_DIR, name)); } catch (e) { console.error('[ezro] backup copy failed:', e.message); }
  }
  prune();
  return name;
}
// keeps 30 days of backups, but never fewer than the newest 5
function prune() {
  const all = list();
  all.forEach((b, i) => { if (i >= 5 && Date.now() - b.at > KEEP_DAYS * DAY) fs.rmSync(path.join(BACKUP_DIR, b.name), { force: true }); });
}
function lastAuto() { return list().find((b) => b.kind === 'auto')?.at || 0; }
function tick() {
  try {
    if (Date.now() - lastAuto() >= DAY - 5 * 60_000) { const n = makeBackup('auto'); log('system', 'backup.created', n, 'daily'); }
  } catch (e) { console.error('[ezro] backup failed:', e.message); log('system', 'backup.failed', '', e.message); }
}
setTimeout(tick, 15_000).unref();
setInterval(tick, 3600_000).unref();

/* ---------- admin routes (mounted under /api/admin) ---------- */
const router = express.Router();
const ownerOnly = (req) => { if (req.admin?.role !== 'owner') throw new HttpError(403, 'Only an owner can do this.'); };
const pick = (name) => {
  if (!NAME_RE.test(String(name))) throw new HttpError(400, 'Unknown backup.');
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Backup not found.');
  return file;
};
const dirSize = (d) => { let n = 0; try { for (const f of fs.readdirSync(d)) { const st = fs.statSync(path.join(d, f)); if (st.isFile()) n += st.size; } } catch { /* empty */ } return n; };

router.get('/backups', (req, res) => res.json({
  backups: list(), next: lastAuto() + DAY, canManage: req.admin?.role === 'owner', copyDir: !!COPY_DIR,
  sizes: { uploads: dirSize(UPLOAD_DIR), secure: dirSize(SECURE_DIR) },
}));
router.post('/backups', (req, res) => {
  ownerOnly(req);
  const name = makeBackup('manual');
  log(req, 'backup.created', name, 'manual');
  res.json({ ok: true, name });
});
router.get('/backups/full.zip', (req, res, next) => {
  ownerOnly(req);
  // a fresh snapshot of the database + every uploaded file, streamed as one zip
  const snap = path.join(DATA_DIR, `zip-snapshot-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
  const zip = archiver('zip', { zlib: { level: 6 } });
  res.attachment(`ezro-full-backup-${stamp()}.zip`);
  zip.on('error', (e) => { fs.rmSync(snap, { force: true }); next(e); });
  res.on('close', () => fs.rmSync(snap, { force: true }));
  zip.pipe(res);
  zip.file(snap, { name: 'ezro.db' });
  zip.directory(UPLOAD_DIR, 'uploads');
  zip.directory(SECURE_DIR, 'secure');
  zip.append('Ezro full backup\n\nezro.db  – the database (products, orders, texts, settings, logins)\nuploads/ – images and public videos\nsecure/  – paid videos and download files\n\nTo restore everything: stop the site, put these into the data folder, start the site.\n', { name: 'README.txt' });
  zip.finalize();
  log(req, 'backup.downloaded', 'full zip');
});
router.get('/backups/:name/download', (req, res) => {
  ownerOnly(req);
  const file = pick(req.params.name);
  log(req, 'backup.downloaded', req.params.name);
  res.download(file, `ezro-${req.params.name}`);
});
router.delete('/backups/:name', (req, res) => {
  ownerOnly(req);
  fs.rmSync(pick(req.params.name), { force: true });
  log(req, 'backup.deleted', req.params.name);
  res.json({ ok: true });
});
// restore: the backup is staged, the server restarts, and db.js swaps it in before opening the database
router.post('/backups/:name/restore', (req, res) => {
  ownerOnly(req);
  if (String(req.body?.confirm || '') !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm.');
  const file = pick(req.params.name);
  fs.copyFileSync(file, path.join(DATA_DIR, 'restore-pending.db'));
  log(req, 'backup.restored', req.params.name);
  res.json({ ok: true, restarting: true });
  setTimeout(() => { try { db.close(); } catch { /* ignore */ } process.exit(75); }, 400);
});

module.exports = { router, makeBackup };
