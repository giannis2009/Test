const { db } = require('./db');

const PUBLIC_STATUSES = ['active', 'reserved'];

const SORTS = {
  newest: 'c.featured DESC, c.created_at DESC, c.id DESC',
  recent: 'c.created_at DESC, c.id DESC',
  price_asc: 'c.price IS NULL, c.price ASC',
  price_desc: 'c.price DESC',
  year_desc: 'c.year DESC, c.month DESC',
  year_asc: 'c.year ASC, c.month ASC',
  km_asc: 'c.mileage IS NULL, c.mileage ASC',
};

const SORT_LABELS = {
  newest: 'Πιο πρόσφατες',
  price_asc: 'Τιμή: χαμηλή → υψηλή',
  price_desc: 'Τιμή: υψηλή → χαμηλή',
  year_desc: 'Έτος: νεότερα',
  year_asc: 'Έτος: παλαιότερα',
  km_asc: 'Λιγότερα χιλιόμετρα',
};

function toInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Builds the WHERE clause for listing searches. `statuses` limits which
 * listing states are visible (public site vs. admin).
 */
function buildFilters(query, statuses) {
  const where = [];
  const params = [];

  if (statuses) {
    where.push(`c.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  const eq = (field, value) => {
    if (value) { where.push(`c.${field} = ?`); params.push(String(value)); }
  };
  eq('make', query.make);
  eq('model', query.model);
  eq('fuel', query.fuel);
  eq('gearbox', query.gearbox);
  eq('category', query.category);
  eq('body_type', query.body_type);
  eq('condition', query.condition);

  const range = (field, op, value) => {
    const n = toInt(value);
    if (n !== null) { where.push(`c.${field} ${op} ?`); params.push(n); }
  };
  range('price', '>=', query.price_min);
  range('price', '<=', query.price_max);
  range('year', '>=', query.year_min);
  range('year', '<=', query.year_max);
  range('mileage', '<=', query.km_max);
  range('power_hp', '>=', query.hp_min);

  if (query.q) {
    const terms = String(query.q).trim().split(/\s+/).slice(0, 6);
    for (const t of terms) {
      where.push("(c.make || ' ' || c.model || ' ' || IFNULL(c.version,'') || ' ' || IFNULL(c.color,'')) LIKE ?");
      params.push(`%${t}%`);
    }
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const COVER_SQL = '(SELECT filename FROM car_images i WHERE i.car_id = c.id ORDER BY position, id LIMIT 1) AS cover,'
  + ' (SELECT COUNT(*) FROM car_images i WHERE i.car_id = c.id) AS image_count';

function searchCars(query, { statuses = PUBLIC_STATUSES, perPage = 12 } = {}) {
  const { sql, params } = buildFilters(query, statuses);
  const sort = SORTS[query.sort] ? query.sort : 'newest';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cars c ${sql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, toInt(query.page) || 1), pages);
  const cars = db.prepare(
    `SELECT c.*, ${COVER_SQL} FROM cars c ${sql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`,
  ).all(...params, perPage, (page - 1) * perPage);
  return { cars, total, page, pages, sort };
}

function getCar(id) {
  const car = db.prepare(`SELECT c.*, ${COVER_SQL} FROM cars c WHERE c.id = ?`).get(toInt(id));
  if (!car) return null;
  car.images = db.prepare('SELECT * FROM car_images WHERE car_id = ? ORDER BY position, id').all(car.id);
  car.featureList = car.features ? JSON.parse(car.features) : [];
  return car;
}

function similarCars(car, limit = 4) {
  return db.prepare(
    `SELECT c.*, ${COVER_SQL} FROM cars c
     WHERE c.id != ? AND c.status IN ('active','reserved')
     ORDER BY (c.make = ?) DESC, (c.category = ?) DESC, ABS(IFNULL(c.price,0) - ?) ASC LIMIT ?`,
  ).all(car.id, car.make, car.category || '', car.price || 0, limit);
}

/** Distinct values present in public listings, used to populate filter dropdowns. */
function facetValues() {
  const distinct = (field) => db.prepare(
    `SELECT ${field} AS v, COUNT(*) AS n FROM cars WHERE status IN ('active','reserved') AND ${field} IS NOT NULL AND ${field} != '' GROUP BY ${field} ORDER BY ${field}`,
  ).all();
  const models = db.prepare(
    "SELECT make, model, COUNT(*) AS n FROM cars WHERE status IN ('active','reserved') GROUP BY make, model ORDER BY make, model",
  ).all();
  const modelsByMake = {};
  for (const m of models) (modelsByMake[m.make] ||= []).push({ v: m.model, n: m.n });
  return {
    makes: distinct('make'),
    fuels: distinct('fuel'),
    gearboxes: distinct('gearbox'),
    categories: distinct('category'),
    bodyTypes: distinct('body_type'),
    modelsByMake,
  };
}

const CAR_FIELDS = {
  make: 'text', model: 'text', version: 'text', category: 'text', price: 'int',
  price_negotiable: 'bool', vat_deductible: 'bool', year: 'int', month: 'int', mileage: 'int',
  fuel: 'text', gearbox: 'text', engine_cc: 'int', power_hp: 'int', drivetrain: 'text',
  body_type: 'text', doors: 'int', seats: 'int', color: 'text', interior_color: 'text',
  condition: 'text', emission_class: 'text', co2: 'int', consumption: 'float',
  previous_owners: 'int', service_book: 'bool', no_accident: 'bool', description: 'text',
  status: 'text', featured: 'bool',
};

/** Converts a submitted admin form body into column values for the cars table. */
function carFromForm(body) {
  const out = {};
  for (const [field, type] of Object.entries(CAR_FIELDS)) {
    const raw = body[field];
    if (type === 'bool') out[field] = raw ? 1 : 0;
    else if (type === 'int') out[field] = toInt(raw);
    else if (type === 'float') out[field] = toFloat(raw);
    else out[field] = raw === undefined ? null : String(raw).trim() || null;
  }
  let features = body.features || [];
  if (!Array.isArray(features)) features = [features];
  const extra = String(body.features_extra || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  out.features = JSON.stringify([...new Set([...features.map(String), ...extra])]);
  if (!['active', 'reserved', 'sold', 'draft'].includes(out.status)) out.status = 'active';
  return out;
}

function validateCar(car) {
  const errors = [];
  if (!car.make) errors.push('Η μάρκα είναι υποχρεωτική.');
  if (!car.model) errors.push('Το μοντέλο είναι υποχρεωτικό.');
  if (car.year && (car.year < 1900 || car.year > new Date().getFullYear() + 1)) errors.push('Μη έγκυρο έτος.');
  if (car.month && (car.month < 1 || car.month > 12)) errors.push('Μη έγκυρος μήνας.');
  if (car.price !== null && car.price < 0) errors.push('Μη έγκυρη τιμή.');
  return errors;
}

function insertCar(car) {
  const cols = Object.keys(car);
  const info = db.prepare(
    `INSERT INTO cars (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  ).run(...cols.map((c) => car[c]));
  return Number(info.lastInsertRowid);
}

function updateCar(id, car) {
  const cols = Object.keys(car);
  db.prepare(
    `UPDATE cars SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
  ).run(...cols.map((c) => car[c]), id);
}

function addImages(carId, filenames) {
  const start = db.prepare('SELECT IFNULL(MAX(position), -1) + 1 AS p FROM car_images WHERE car_id = ?').get(carId).p;
  const stmt = db.prepare('INSERT INTO car_images (car_id, filename, position) VALUES (?, ?, ?)');
  filenames.forEach((f, i) => stmt.run(carId, f, start + i));
}

function slugify(s) {
  const map = {
    α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i',
    κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y',
    ϋ: 'y', ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
  };
  return String(s || '').toLowerCase().split('').map((ch) => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function carUrl(car) {
  return `/car/${car.id}-${slugify(`${car.make} ${car.model} ${car.version || ''}`)}`;
}

function carTitle(car) {
  return [car.make, car.model, car.version].filter(Boolean).join(' ');
}

module.exports = {
  searchCars, getCar, similarCars, facetValues, carFromForm, validateCar, insertCar, updateCar,
  addImages, carUrl, carTitle, toInt, SORT_LABELS, PUBLIC_STATUSES,
};
