const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'site.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT,
  category TEXT,
  price INTEGER,
  price_negotiable INTEGER NOT NULL DEFAULT 0,
  vat_deductible INTEGER NOT NULL DEFAULT 0,
  year INTEGER,
  month INTEGER,
  mileage INTEGER,
  fuel TEXT,
  gearbox TEXT,
  engine_cc INTEGER,
  power_hp INTEGER,
  drivetrain TEXT,
  body_type TEXT,
  doors INTEGER,
  seats INTEGER,
  color TEXT,
  interior_color TEXT,
  condition TEXT,
  emission_class TEXT,
  co2 INTEGER,
  consumption REAL,
  previous_owners INTEGER,
  service_book INTEGER NOT NULL DEFAULT 0,
  no_accident INTEGER NOT NULL DEFAULT 0,
  features TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  featured INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS car_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_car_images_car ON car_images(car_id, position);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER REFERENCES cars(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

const DEFAULT_SETTINGS = {
  dealer_name: 'Boost Cars',
  tagline: 'Μεταχειρισμένα & καινούργια αυτοκίνητα με εγγύηση',
  phone: '210 0000000',
  mobile: '690 0000000',
  whatsapp: '',
  email: 'info@example.gr',
  address: 'Λεωφ. Παραδείγματος 1',
  city: 'Αθήνα',
  hours: 'Δευ–Παρ 09:00–20:00\nΣάβ 09:00–15:00',
  about: 'Είμαστε έμπορος αυτοκινήτων με πολυετή εμπειρία. Όλα τα αυτοκίνητα ελέγχονται πριν την πώληση και συνοδεύονται από πλήρες ιστορικό.',
  map_embed_query: '',
  facebook: '',
  instagram: '',
  logo: '',
  cover: '',
  primary_color: '#e30613',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

// First run: create the admin account. Password must be changed at first login
// unless ADMIN_PASSWORD was provided explicitly.
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 10), process.env.ADMIN_PASSWORD ? 0 : 1);
  console.log(`Δημιουργήθηκε διαχειριστής: ${username}`);
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
}

function saveSettings(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(values)) stmt.run(k, v);
}

module.exports = { db, getSettings, saveSettings, DATA_DIR, DEFAULT_SETTINGS };
