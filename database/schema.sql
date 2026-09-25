-- Boost Cars: σχήμα βάσης δεδομένων (SQLite)
-- Εκτελείται αυτόματα σε κάθε εκκίνηση. Όλες οι εντολές είναι IF NOT EXISTS, οπότε δεν σβήνουν δεδομένα.

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
  type TEXT NOT NULL DEFAULT 'car',
  details TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires INTEGER NOT NULL
);
