const express = require('express');
const { db } = require('../../database/database');
const {
  searchCars, getCar, similarCars, facetValues, carUrl, toInt, SORT_LABELS, PUBLIC_STATUSES, COVER_SQL,
} = require('../cars');
const { verifyCsrf, flash } = require('../helpers');

const router = express.Router();

const countActive = () => db.prepare("SELECT COUNT(*) AS n FROM cars WHERE status IN ('active','reserved')").get().n;
const countSold = () => db.prepare("SELECT COUNT(*) AS n FROM cars WHERE status = 'sold'").get().n;

router.get('/', (req, res) => {
  const facets = facetValues();
  const featured = db.prepare(
    `SELECT c.*, ${COVER_SQL} FROM cars c WHERE c.featured = 1 AND c.status IN ('active','reserved') ORDER BY c.updated_at DESC LIMIT 8`,
  ).all();
  const featuredIds = featured.map((c) => c.id);
  const latest = db.prepare(
    `SELECT c.*, ${COVER_SQL} FROM cars c WHERE c.status IN ('active','reserved') ORDER BY c.created_at DESC, c.id DESC LIMIT 12`,
  ).all().filter((c) => !featuredIds.includes(c.id)).slice(0, 8);
  res.render('index', {
    title: null, facets, featured, latest, bodyTypes: facets.bodyTypes, totalActive: countActive(), soldCount: countSold(),
  });
});

router.get('/cars', (req, res) => {
  res.render('cars', {
    title: 'Αυτοκίνητα', ...searchCars(req.query), facets: facetValues(), sortLabels: SORT_LABELS,
  });
});

router.get('/car/:idslug', (req, res, next) => {
  const car = getCar(toInt(req.params.idslug.split('-')[0]));
  const isAdmin = Boolean(req.session.userId);
  if (!car || (car.status === 'draft' && !isAdmin)) return next();

  const canonical = carUrl(car);
  if (req.path !== canonical) return res.redirect(301, canonical);

  // Count one view per visitor session, ignoring the admin's own visits.
  const seen = (req.session.seen ||= []);
  if (!isAdmin && !seen.includes(car.id)) {
    seen.push(car.id);
    if (seen.length > 200) seen.shift();
    db.prepare('UPDATE cars SET views = views + 1 WHERE id = ?').run(car.id);
  }

  res.render('car', { title: null, car, similar: similarCars(car), sent: req.query.sent === '1' });
});

const DETAIL_LABELS = {
  d_make: 'Μάρκα', d_model: 'Μοντέλο', d_year: 'Έτος', d_km: 'Χιλιόμετρα', d_fuel: 'Καύσιμο',
  d_price: 'Ζητούμενη τιμή', d_trade: 'Ανταλλαγή', d_down: 'Προκαταβολή', d_months: 'Διάρκεια (μήνες)',
};

/** Stores a customer message. Returns false when required fields are missing. */
function saveInquiry(req, { carId = null, type = 'car', requirePhone = false, defaultMessage = '' } = {}) {
  // Honeypot field: real users never fill it in.
  if (req.body.website) return true;
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().slice(0, 200);
  const phone = String(req.body.phone || '').trim().slice(0, 40);
  const message = (String(req.body.message || '').trim() || defaultMessage).slice(0, 4000);
  if (!name || !message || (!email && !phone) || (requirePhone && !phone)) return false;

  const details = {};
  for (const [k, label] of Object.entries(DETAIL_LABELS)) {
    const v = String(req.body[k] || '').trim().slice(0, 100);
    if (v) details[label] = v;
  }
  db.prepare('INSERT INTO inquiries (car_id, name, email, phone, message, type, details) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(carId, name, email || null, phone || null, message, type, Object.keys(details).length ? JSON.stringify(details) : null);
  return true;
}

const REQUIRED_MSG = 'Συμπληρώστε τα υποχρεωτικά πεδία (όνομα, μήνυμα και τηλέφωνο ή email).';

router.post('/car/:id/inquiry', verifyCsrf, (req, res, next) => {
  const car = getCar(req.params.id);
  if (!car) return next();
  if (!saveInquiry(req, { carId: car.id })) {
    flash(req, 'error', REQUIRED_MSG);
    return res.redirect(`${carUrl(car)}#contact`);
  }
  res.redirect(`${carUrl(car)}?sent=1#contact`);
});

router.get('/contact', (req, res) => res.render('contact', { title: 'Επικοινωνία', sent: req.query.sent === '1' }));

router.post('/contact', verifyCsrf, (req, res) => {
  if (!saveInquiry(req, { type: 'contact' })) {
    flash(req, 'error', REQUIRED_MSG);
    return res.redirect('/contact');
  }
  res.redirect('/contact?sent=1');
});

router.get('/about', (req, res) => {
  res.render('about', { title: 'Η εταιρεία', totalActive: countActive(), soldCount: countSold() });
});

router.get('/sell', (req, res) => res.render('sell', { title: 'Πούλησε το αυτοκίνητό σου', sent: req.query.sent === '1' }));

router.post('/sell', verifyCsrf, (req, res) => {
  const ok = req.body.d_make && req.body.d_model
    && saveInquiry(req, { type: 'sell', requirePhone: true, defaultMessage: `Εκτίμηση για ${req.body.d_make} ${req.body.d_model}` });
  if (!ok) {
    flash(req, 'error', 'Συμπληρώστε μάρκα, μοντέλο, ονοματεπώνυμο και τηλέφωνο.');
    return res.redirect('/sell');
  }
  res.redirect('/sell?sent=1');
});

function financeCar(id) {
  const car = id ? getCar(id) : null;
  return car && PUBLIC_STATUSES.includes(car.status) ? car : null;
}

router.get('/finance', (req, res, next) => {
  if (res.locals.site.finance_enabled !== '1') return next();
  res.render('finance', { title: 'Χρηματοδότηση', car: financeCar(req.query.car), sent: req.query.sent === '1' });
});

router.post('/finance', verifyCsrf, (req, res) => {
  const car = financeCar(req.body.car_id);
  const ok = saveInquiry(req, {
    carId: car?.id ?? null, type: 'finance', requirePhone: true, defaultMessage: 'Αίτηση χρηματοδότησης',
  });
  const back = `/finance${car ? `?car=${car.id}&` : '?'}`;
  if (!ok) {
    flash(req, 'error', 'Συμπληρώστε ονοματεπώνυμο και τηλέφωνο.');
    return res.redirect(back.replace(/[?&]$/, ''));
  }
  res.redirect(`${back}sent=1`);
});

router.get('/favorites', (req, res) => res.render('favorites', { title: 'Αγαπημένα' }));

/* ---------- JSON endpoints used by the browser scripts ---------- */

router.get('/api/models', (req, res) => {
  res.json(facetValues().modelsByMake[req.query.make] || []);
});

router.get('/api/cards', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(toInt).filter(Boolean).slice(0, 60);
  if (!ids.length) return res.send('');
  const cars = db.prepare(
    `SELECT c.*, ${COVER_SQL} FROM cars c WHERE c.id IN (${ids.map(() => '?').join(',')}) AND c.status != 'draft'`,
  ).all(...ids);
  cars.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  res.render('partials/car-cards', { cars });
});

/* ---------- SEO ---------- */

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const base = res.locals.baseUrl;
  const pages = ['/', '/cars', '/sell', '/about', '/contact', ...(res.locals.site.finance_enabled === '1' ? ['/finance'] : [])];
  const cars = db.prepare("SELECT id, make, model, version, updated_at FROM cars WHERE status IN ('active','reserved')").all();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [
    ...pages.map((p) => `<url><loc>${esc(base + p)}</loc></url>`),
    ...cars.map((c) => `<url><loc>${esc(base + carUrl(c))}</loc><lastmod>${c.updated_at.slice(0, 10)}</lastmod></url>`),
  ];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});

module.exports = router;
