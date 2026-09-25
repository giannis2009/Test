// Αντίγραφα ασφαλείας (backups) της βάσης και «κάδος» για διαγραμμένες φωτογραφίες.
//   save-changes/backups/         αντίγραφα της βάσης (.db)
//   save-changes/deleted-photos/  φωτογραφίες που διαγράφηκαν, ώστε να επανέρχονται με την επαναφορά
const path = require('node:path');
const fs = require('node:fs');
const { db, DB_FILE } = require('../database/database');

const BASE = process.env.SAVE_DIR || __dirname;
const BACKUP_DIR = path.join(BASE, 'backups');
const TRASH_DIR = path.join(BASE, 'deleted-photos');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(TRASH_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const KEEP_AUTO = 30;
const TRASH_DAYS = 120;
const NAME_RE = /^boostcars_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_(manual|auto|before-restore)\.db$/;
const TYPE_LABELS = { manual: 'Χειροκίνητο', auto: 'Αυτόματο', 'before-restore': 'Πριν από επαναφορά' };
// Tables restored from a backup; sessions stay untouched so the admin remains logged in.
const TABLES = ['settings', 'users', 'cars', 'car_images', 'inquiries'];

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function createBackup(type = 'manual') {
  let name = `boostcars_${stamp()}_${type}.db`;
  for (let i = 1; fs.existsSync(path.join(BACKUP_DIR, name)); i++) {
    name = `boostcars_${stamp(new Date(Date.now() + i * 1000))}_${type}.db`;
  }
  db.exec(`VACUUM INTO '${path.join(BACKUP_DIR, name).replace(/'/g, "''")}'`);
  if (type === 'auto') pruneAuto();
  return name;
}

function listBackups() {
  return fs.readdirSync(BACKUP_DIR)
    .map((name) => ({ name, m: NAME_RE.exec(name) }))
    .filter((b) => b.m)
    .map(({ name, m }) => {
      const [date, time] = m[1].split('_');
      return {
        name,
        type: m[2],
        typeLabel: TYPE_LABELS[m[2]],
        date: `${date.split('-').reverse().join('/')} ${time.replace(/-/g, ':')}`,
        size: fs.statSync(path.join(BACKUP_DIR, name)).size,
      };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function backupPath(name) {
  if (!NAME_RE.test(String(name))) return null;
  const file = path.join(BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

function deleteBackup(name) {
  const file = backupPath(name);
  if (file) fs.rmSync(file);
  return Boolean(file);
}

function pruneAuto() {
  listBackups().filter((b) => b.type === 'auto').slice(KEEP_AUTO).forEach((b) => deleteBackup(b.name));
}

/** Takes an automatic backup once per day (checked at start-up and hourly). */
function autoBackup() {
  const today = stamp().slice(0, 10);
  if (!listBackups().some((b) => b.type === 'auto' && b.name.includes(today))) createBackup('auto');
}

/** Moves a photo to the trash instead of deleting it, so a restored backup still has its photos. */
function trashPhoto(filename) {
  if (!filename) return;
  const base = path.basename(filename);
  const src = path.join(UPLOAD_DIR, base);
  if (fs.existsSync(src)) fs.rename(src, path.join(TRASH_DIR, base), () => {});
}

function restoreBackup(name) {
  const file = backupPath(name);
  if (!file) throw new Error('Το αντίγραφο δεν βρέθηκε.');
  const safety = createBackup('before-restore');

  db.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS bk`);
  try {
    db.exec('PRAGMA foreign_keys = OFF; BEGIN');
    try {
      for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM main.${t}`);
      for (const t of TABLES) {
        const mainCols = db.prepare(`PRAGMA main.table_info(${t})`).all().map((c) => c.name);
        const bkCols = new Set(db.prepare(`PRAGMA bk.table_info(${t})`).all().map((c) => c.name));
        const cols = mainCols.filter((c) => bkCols.has(c)).join(', ');
        if (cols) db.exec(`INSERT INTO main.${t} (${cols}) SELECT ${cols} FROM bk.${t}`);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('DETACH DATABASE bk');
  }

  // Bring back photos the restored listings still reference.
  for (const { filename } of db.prepare('SELECT filename FROM car_images').all()) {
    const dest = path.join(UPLOAD_DIR, filename);
    const trashed = path.join(TRASH_DIR, filename);
    if (!fs.existsSync(dest) && fs.existsSync(trashed)) fs.renameSync(trashed, dest);
  }
  return safety;
}

function purgeOldTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  for (const f of fs.readdirSync(TRASH_DIR)) {
    const file = path.join(TRASH_DIR, f);
    if (fs.statSync(file).mtimeMs < limit) fs.rmSync(file, { force: true });
  }
}

function start() {
  try {
    autoBackup();
    purgeOldTrash();
  } catch (e) {
    console.error('Σφάλμα αυτόματου αντιγράφου:', e.message);
  }
  setInterval(() => { try { autoBackup(); } catch (e) { console.error(e.message); } }, 3600 * 1000).unref();
}

module.exports = {
  createBackup, listBackups, backupPath, deleteBackup, restoreBackup, trashPhoto, start,
  BACKUP_DIR, UPLOAD_DIR, DB_FILE,
};
