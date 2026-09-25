const express = require('express');
const { db } = require('../db');
const {
  searchCars, getCar, similarCars, facetValues, carUrl, toInt, SORT_LABELS, PUBLIC_STATUSES,
} = require('../cars');
const { verifyCsrf, flash } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const result = searchCars(req.query);
  const featured = db.prepare(
    `SELECT c.*, (SELECT filename FROM car_images i WHERE i.car_id = c.id ORDER BY position, id LIMIT 1) AS cover
     FROM cars c WHERE c.featured = 1 AND c.status IN ('active','reserved') ORDER BY c.updated_at DESC LIMIT 8`,
  ).all();
  const totalActive = db.prepare("SELECT COUNT(*) AS n FROM cars WHERE status IN ('active','reserved')").get().n;
  res.render('index', {
    title: null, ...result, facets: facetValues(), sortLabels: SORT_LABELS, featured, totalActive,
  });
});

router.get('/car/:idslug', (req, res, next) => {
  const car = getCar(toInt(req.params.idslug.split('-')[0]));
  const isAdmin = Boolean(req.session.userId);
  if (!car || (!PUBLIC_STATUSES.includes(car.status) && car.status !== 'sold' && !isAdmin)) return next();

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

function saveInquiry(req, carId) {
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().slice(0, 200);
  const phone = String(req.body.phone || '').trim().slice(0, 40);
  const message = String(req.body.message || '').trim().slice(0, 4000);
  // Honeypot field: real users never fill it in.
  if (req.body.website) return true;
  if (!name || !message || (!email && !phone)) return false;
  db.prepare('INSERT INTO inquiries (car_id, name, email, phone, message) VALUES (?, ?, ?, ?, ?)')
    .run(carId, name, email || null, phone || null, message);
  return true;
}

router.post('/car/:id/inquiry', verifyCsrf, (req, res, next) => {
  const car = getCar(req.params.id);
  if (!car) return next();
  if (!saveInquiry(req, car.id)) {
    flash(req, 'error', 'Συμπληρώστε όνομα, μήνυμα και τηλέφωνο ή email.');
    return res.redirect(`${carUrl(car)}#contact`);
  }
  res.redirect(`${carUrl(car)}?sent=1#contact`);
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Επικοινωνία', sent: req.query.sent === '1' });
});

router.post('/contact', verifyCsrf, (req, res) => {
  if (!saveInquiry(req, null)) {
    flash(req, 'error', 'Συμπληρώστε όνομα, μήνυμα και τηλέφωνο ή email.');
    return res.redirect('/contact');
  }
  res.redirect('/contact?sent=1');
});

router.get('/api/models', (req, res) => {
  res.json(facetValues().modelsByMake[req.query.make] || []);
});

module.exports = router;
