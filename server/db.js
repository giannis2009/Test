const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');   // public images / gallery videos
const SECURE_DIR = path.join(DATA_DIR, 'secure');    // paid videos, never served statically
const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');    // emails saved here when SMTP is not configured
for (const d of [DATA_DIR, UPLOAD_DIR, SECURE_DIR, OUTBOX_DIR]) fs.mkdirSync(d, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ezro.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, picture TEXT,
  google_sub TEXT, created_at INTEGER NOT NULL, last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS admins (email TEXT PRIMARY KEY, added_at INTEGER NOT NULL, added_by TEXT);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, icon TEXT DEFAULT 'sparkles',
  description TEXT DEFAULT '', sort INTEGER DEFAULT 0, visible INTEGER DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  type TEXT NOT NULL, url TEXT NOT NULL, poster TEXT, title TEXT DEFAULT '', caption TEXT DEFAULT '',
  sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, subtitle TEXT DEFAULT '',
  description TEXT DEFAULT '', category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price_cents INTEGER NOT NULL DEFAULT 0, compare_cents INTEGER, cover_url TEXT, gallery TEXT DEFAULT '[]',
  preview_url TEXT, features TEXT DEFAULT '[]', tags TEXT DEFAULT '[]', badge TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', release_at INTEGER, stock INTEGER,
  video_source TEXT DEFAULT 'none', video_ref TEXT, deliver_note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS product_notify (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, email TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (product_id, email)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, user_id INTEGER REFERENCES users(id), email TEXT NOT NULL,
  name TEXT, status TEXT NOT NULL DEFAULT 'pending', method TEXT NOT NULL, method_label TEXT,
  subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL, currency TEXT NOT NULL, discount_code TEXT, items TEXT NOT NULL,
  paypal_order_id TEXT UNIQUE, paypal_capture_id TEXT, payer_email TEXT, admin_note TEXT DEFAULT '',
  created_at INTEGER NOT NULL, paid_at INTEGER, invoice_sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_title TEXT, user_id INTEGER, email TEXT NOT NULL,
  created_at INTEGER NOT NULL, revoked INTEGER DEFAULT 0, views INTEGER DEFAULT 0, last_view_at INTEGER
);
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL DEFAULT 'percent', value INTEGER NOT NULL,
  min_cents INTEGER DEFAULT 0, max_uses INTEGER, uses INTEGER DEFAULT 0, starts_at INTEGER, ends_at INTEGER,
  active INTEGER DEFAULT 1, product_ids TEXT, note TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'bank', description TEXT DEFAULT '',
  instructions TEXT DEFAULT '', enabled INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS socials (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, url TEXT NOT NULL,
  sort INTEGER DEFAULT 0, visible INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS texts (
  id INTEGER PRIMARY KEY, page TEXT NOT NULL DEFAULT 'all', original TEXT NOT NULL, replacement TEXT DEFAULT '',
  deleted INTEGER DEFAULT 0, updated_at INTEGER NOT NULL, UNIQUE (page, original)
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium', due_at INTEGER, assignee TEXT, visibility TEXT DEFAULT 'team',
  created_by TEXT, sort REAL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, details TEXT, ip TEXT
);
CREATE TABLE IF NOT EXISTS views (
  day TEXT NOT NULL, visitor TEXT NOT NULL, path TEXT NOT NULL, hits INTEGER DEFAULT 1,
  PRIMARY KEY (day, visitor, path)
);
CREATE INDEX IF NOT EXISTS idx_logs_at ON logs(at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
`);

/* ---------- helpers ---------- */
const now = () => Date.now();
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---------- settings (JSON values, merged over defaults) ---------- */
const DEFAULTS = {
  site: {
    name: 'Ezro', handle: '@ezrovfx', tagline: 'VFX & Creative Studio',
    bio: 'Cover art, 3D, branding and VFX — crafted to stand out.',
    status: 'Open for commissions', showStatus: true, projectName: 'Ezro Studio',
    footer: 'All rights reserved.',
  },
  appearance: {
    primary: '#905abd', secondary: '#b491dc', defaultTheme: 'system', radius: 18,
    font: 'Helvetica', orbs: true, grid: true, logoUrl: '/assets/logo.webp', faviconUrl: '/assets/favicon.png',
    heroSize: 420, glass: true,
  },
  checkout: {
    currency: 'EUR', taxPercent: 0, taxLabel: 'VAT', taxIncluded: true, requireTerms: true,
    termsText: 'I agree that this is a digital product and access is delivered instantly.',
    successTitle: 'Payment complete', successMessage: 'Your access key has been sent to your email.',
    paypalEnabled: true, paypalLabel: 'PayPal', paypalDescription: 'Pay securely with PayPal or card.',
    buttonText: 'Checkout',
  },
  invoice: {
    companyName: 'Ezro', logoUrl: '/assets/logo-email.png', address: '', vatId: '', email: '', website: '',
    subject: 'Your Ezro invoice {number}', heading: 'Thank you for your purchase!',
    intro: 'Here is your invoice and your personal access key. Keep it private — it only works with your Google account.',
    footer: 'Questions? Just reply to this email.', notes: '', accent: '#905abd', prefix: 'EZR-', nextNumber: 1001,
    showTax: true, showKeys: true, showPayer: true, bannerUrl: '',
  },
  shop: { title: 'Shop', subtitle: 'Premium packs, presets and project files.', showSoldOut: true },
  security: { watermark: true, blurOnFocusLoss: true, maxViewsPerKey: 0, blockDevtools: true },
};

function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  const stored = row ? JSON.parse(row.value) : {};
  return { ...(DEFAULTS[key] || {}), ...stored };
}
function setSetting(key, value) {
  const merged = { ...getSetting(key), ...value };
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, JSON.stringify(merged));
  return merged;
}

/* ---------- seed ---------- */
function seed() {
  if (!get('SELECT 1 FROM categories LIMIT 1')) {
    const cats = [['COVER ART', 'cover-art', 'image'], ['3D ART', '3d-art', 'cube'], ['BRANDING', 'branding', 'pen'], ['PRODUCTS', 'products', 'bag']];
    cats.forEach(([n, s, i], idx) => run('INSERT INTO categories (name, slug, icon, sort, created_at) VALUES (?, ?, ?, ?, ?)', n, s, i, idx, now()));
  }
  if (!get('SELECT 1 FROM socials LIMIT 1')) {
    [['YouTube', 'youtube'], ['TikTok', 'tiktok'], ['Instagram', 'instagram'], ['Discord', 'discord'], ['X', 'x']]
      .forEach(([n, i], idx) => run('INSERT INTO socials (name, icon, url, sort) VALUES (?, ?, ?, ?)', n, i, '#', idx));
  }
  if (!get('SELECT 1 FROM payment_methods LIMIT 1')) {
    run(`INSERT INTO payment_methods (name, icon, description, instructions, enabled, sort, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)`,
      'Bank transfer', 'bank', 'Pay by IBAN transfer',
      'Send the total to:\nIBAN: GR00 0000 0000 0000 0000 0000 000\nName: Ezro\nReference: your order number ({number})\n\nYour key is sent as soon as the payment is confirmed.', now());
  }
}
/* ---------- migrations ---------- */
// Albums: a cover + many photos, grouped under a category.
db.exec(`CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', cover_url TEXT, sort INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1, created_at INTEGER NOT NULL
)`);
if (!all('PRAGMA table_info(media)').some((c) => c.name === 'album_id')) {
  db.exec('ALTER TABLE media ADD COLUMN album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE');
}

seed();

module.exports = { db, all, get, run, tx, now, getSetting, setSetting, DEFAULTS, DATA_DIR, UPLOAD_DIR, SECURE_DIR, OUTBOX_DIR };
