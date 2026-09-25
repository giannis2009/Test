// Σύνδεση με τη βάση δεδομένων (SQLite), αρχικές ρυθμίσεις και μεταφορά από παλιές εκδόσεις.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const DB_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DB_DIR, 'boostcars.db');
fs.mkdirSync(DB_DIR, { recursive: true });

// Earlier versions kept the database in ./data/site.db — copy it over once so no listings are lost.
const LEGACY_FILE = path.join(ROOT, 'data', 'site.db');
if (!process.env.DATA_DIR && !fs.existsSync(DB_FILE) && fs.existsSync(LEGACY_FILE)) {
  const legacy = new DatabaseSync(LEGACY_FILE);
  legacy.exec(`VACUUM INTO '${DB_FILE.replace(/'/g, "''")}'`);
  legacy.close();
  console.log('Η βάση δεδομένων μεταφέρθηκε από data/site.db σε database/boostcars.db');
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/** Adds columns introduced after the first release to existing databases. */
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('inquiries', 'type', "TEXT NOT NULL DEFAULT 'car'");
addColumn('inquiries', 'details', 'TEXT');

const DEFAULT_SETTINGS = {
  dealer_name: 'Boost Cars',
  tagline: 'Μεταχειρισμένα & καινούργια αυτοκίνητα με εγγύηση',
  hero_title: 'Βρείτε το επόμενο αυτοκίνητό σας',
  hero_subtitle: 'Ελεγμένα αυτοκίνητα, διαφανείς τιμές, εγγύηση και χρηματοδότηση, όλα σε ένα μέρος.',
  phone: '210 0000000',
  mobile: '690 0000000',
  whatsapp: '',
  viber: '',
  email: 'info@example.gr',
  address: 'Λεωφ. Παραδείγματος 1',
  city: 'Αθήνα',
  hours: 'Δευ–Παρ 09:00–20:00\nΣάβ 09:00–15:00',
  about: 'Η Boost Cars δραστηριοποιείται στην αγοραπωλησία αυτοκινήτων με πολυετή εμπειρία. Κάθε αυτοκίνητο περνά από πλήρη τεχνικό έλεγχο πριν την πώληση και συνοδεύεται από ιστορικό και εγγύηση.',
  years_experience: '15',
  warranty_months: '12',
  happy_customers: '500',
  finance_rate: '8.9',
  finance_enabled: '1',
  map_embed_query: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  logo: '',
  logo_wide: '',
  cover: '',
  primary_color: '#0c5ba6',
  secondary_color: '#e7e7e7',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);
// Databases created before the brand colours were set still carry the old default red.
db.prepare("UPDATE settings SET value = ? WHERE key = 'primary_color' AND value = '#e30613'").run(DEFAULT_SETTINGS.primary_color);

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

module.exports = { db, getSettings, saveSettings, DEFAULT_SETTINGS, DB_FILE, ROOT };
