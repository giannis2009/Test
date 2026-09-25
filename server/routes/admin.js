const express = require('express');
const bcrypt = require('bcryptjs');
const { db, saveSettings, DEFAULT_SETTINGS } = require('../../database/database');
const {
  searchCars, getCar, carFromForm, validateCar, insertCar, updateCar, addImages, carUrl, toInt,
} = require('../cars');
const { verifyCsrf, flash } = require('../helpers');
const { upload, removeUpload } = require('../upload');
const { STATUSES, INQUIRY_TYPES } = require('../constants');
const saveChanges = require('../../save-changes/save-changes');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.admin = true;
  res.locals.path = req.path;
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  res.locals.unreadCount = req.session.userId
    ? db.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE is_read = 0').get().n
    : 0;
  next();
});

/* ---------- Authentication ---------- */

const attempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Σύνδεση διαχειριστή', error: null });
});

router.post('/login', verifyCsrf, (req, res) => {
  const key = req.ip;
  const rec = attempts.get(key);
  if (rec && rec.count >= MAX_ATTEMPTS && Date.now() - rec.first < LOCK_MS) {
    return res.status(429).render('admin/login', { title: 'Σύνδεση διαχειριστή', error: 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    const r = rec && Date.now() - rec.first < LOCK_MS ? rec : { count: 0, first: Date.now() };
    r.count += 1;
    attempts.set(key, r);
    return res.status(401).render('admin/login', { title: 'Σύνδεση διαχειριστή', error: 'Λάθος όνομα χρήστη ή κωδικός.' });
  }
  attempts.delete(key);
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect(user.must_change_password ? '/admin/account' : '/admin');
  });
});

router.post('/logout', verifyCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use((req, res, next) => {
  if (!req.session.userId) return res.redirect('/admin/login');
  const user = db.prepare('SELECT id, username, must_change_password FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return req.session.destroy(() => res.redirect('/admin/login'));
  if (user.must_change_password && req.path !== '/account') {
    flash(req, 'warning', 'Για λόγους ασφαλείας, αλλάξτε τον προεπιλεγμένο κωδικό πριν συνεχίσετε.');
    return res.redirect('/admin/account');
  }
  res.locals.mustChangePassword = Boolean(user.must_change_password);
  next();
});

/** Runs multer, then CSRF validation; discards uploaded files if CSRF fails. */
function multipart(fields) {
  const parse = upload.fields(fields);
  return (req, res, next) => parse(req, res, (err) => {
    if (err) return next(err);
    let valid = false;
    verifyCsrf(req, res, () => { valid = true; });
    if (!valid) {
      Object.values(req.files || {}).flat().forEach((f) => removeUpload(f.filename));
      return undefined;
    }
    return next();
  });
}

/* ---------- Dashboard ---------- */

router.get('/', (req, res) => {
  const count = (where) => db.prepare(`SELECT COUNT(*) AS n FROM cars ${where}`).get().n;
  const stats = {
    total: count(''),
    active: count("WHERE status = 'active'"),
    reserved: count("WHERE status = 'reserved'"),
    sold: count("WHERE status = 'sold'"),
    draft: count("WHERE status = 'draft'"),
    views: db.prepare('SELECT IFNULL(SUM(views),0) AS n FROM cars').get().n,
    inquiries: db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n,
    stockValue: db.prepare("SELECT IFNULL(SUM(price),0) AS n FROM cars WHERE status IN ('active','reserved')").get().n,
  };
  const topViewed = db.prepare(
    `SELECT c.*, (SELECT filename FROM car_images i WHERE i.car_id = c.id ORDER BY position, id LIMIT 1) AS cover
     FROM cars c WHERE status != 'draft' ORDER BY views DESC LIMIT 5`,
  ).all();
  const latestInquiries = db.prepare(
    'SELECT q.*, c.make, c.model FROM inquiries q LEFT JOIN cars c ON c.id = q.car_id ORDER BY q.created_at DESC LIMIT 5',
  ).all();
  const noPhotos = db.prepare(
    "SELECT * FROM cars c WHERE status IN ('active','reserved') AND NOT EXISTS (SELECT 1 FROM car_images i WHERE i.car_id = c.id) LIMIT 10",
  ).all();
  res.render('admin/dashboard', {
    title: 'Πίνακας ελέγχου', stats, topViewed, latestInquiries, noPhotos, lastBackup: saveChanges.listBackups()[0],
  });
});

/* ---------- Cars ---------- */

router.get('/cars', (req, res) => {
  const statuses = STATUSES[req.query.status] ? [req.query.status] : Object.keys(STATUSES);
  const result = searchCars({ sort: 'recent', ...req.query }, { statuses, perPage: 25 });
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM cars GROUP BY status').all().map((r) => [r.status, r.n]));
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  res.render('admin/cars', { title: 'Αγγελίες', ...result, counts });
});

router.get('/cars/new', (req, res) => {
  const car = { status: 'active', condition: 'Μεταχειρισμένο', category: 'Αυτοκίνητο', images: [], featureList: [] };
  if (req.query.from) {
    const src = getCar(req.query.from);
    if (src) Object.assign(car, src, { id: undefined, images: [], views: 0, status: 'draft' });
  }
  res.render('admin/car-form', { title: 'Νέα αγγελία', car, errors: [] });
});

const carUpload = multipart([{ name: 'images', maxCount: 40 }]);

function uploadedNames(req) {
  return (req.files?.images || []).map((f) => f.filename);
}

router.post('/cars', carUpload, (req, res) => {
  const car = carFromForm(req.body);
  const errors = validateCar(car);
  if (errors.length) {
    uploadedNames(req).forEach(removeUpload);
    return res.status(400).render('admin/car-form', {
      title: 'Νέα αγγελία', car: { ...car, images: [], featureList: JSON.parse(car.features) }, errors,
    });
  }
  const id = insertCar(car);
  addImages(id, uploadedNames(req));
  flash(req, 'success', 'Η αγγελία δημιουργήθηκε.');
  res.redirect(req.body.after === 'new' ? '/admin/cars/new' : `/admin/cars/${id}/edit`);
});

router.get('/cars/:id/edit', (req, res, next) => {
  const car = getCar(req.params.id);
  if (!car) return next();
  res.render('admin/car-form', { title: `Επεξεργασία #${car.id}`, car, errors: [] });
});

router.post('/cars/:id', carUpload, (req, res, next) => {
  const existing = getCar(req.params.id);
  if (!existing) { uploadedNames(req).forEach(removeUpload); return next(); }
  const car = carFromForm(req.body);
  const errors = validateCar(car);
  if (errors.length) {
    uploadedNames(req).forEach(removeUpload);
    return res.status(400).render('admin/car-form', {
      title: `Επεξεργασία #${existing.id}`,
      car: { ...car, id: existing.id, images: existing.images, featureList: JSON.parse(car.features) },
      errors,
    });
  }

  db.exec('BEGIN');
  try {
    updateCar(existing.id, car);

    const toDelete = new Set([].concat(req.body.delete_images || []).map(Number));
    for (const img of existing.images) {
      if (toDelete.has(img.id)) {
        db.prepare('DELETE FROM car_images WHERE id = ? AND car_id = ?').run(img.id, existing.id);
        removeUpload(img.filename);
      }
    }
    const order = String(req.body.image_order || '').split(',').map(Number).filter(Boolean);
    const setPos = db.prepare('UPDATE car_images SET position = ? WHERE id = ? AND car_id = ?');
    order.forEach((imgId, i) => setPos.run(i, imgId, existing.id));

    addImages(existing.id, uploadedNames(req));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  flash(req, 'success', 'Οι αλλαγές αποθηκεύτηκαν.');
  res.redirect(`/admin/cars/${existing.id}/edit`);
});

router.post('/cars/:id/status', verifyCsrf, (req, res) => {
  const id = toInt(req.params.id);
  if (STATUSES[req.body.status]) {
    db.prepare("UPDATE cars SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, id);
  }
  if (req.body.featured !== undefined) {
    db.prepare('UPDATE cars SET featured = ? WHERE id = ?').run(req.body.featured === '1' ? 1 : 0, id);
  }
  res.redirect(req.get('referer') || '/admin/cars');
});

router.post('/cars/:id/delete', verifyCsrf, (req, res) => {
  const car = getCar(req.params.id);
  if (car) {
    db.prepare('DELETE FROM cars WHERE id = ?').run(car.id);
    car.images.forEach((img) => removeUpload(img.filename));
    flash(req, 'success', `Η αγγελία «${car.make} ${car.model}» διαγράφηκε.`);
  }
  res.redirect('/admin/cars');
});

/* ---------- Inquiries ---------- */

router.get('/inquiries', (req, res) => {
  const type = INQUIRY_TYPES[req.query.type] ? req.query.type : '';
  const inquiries = db.prepare(
    `SELECT q.*, c.make, c.model, c.version, c.id AS cid FROM inquiries q
     LEFT JOIN cars c ON c.id = q.car_id ${type ? 'WHERE q.type = ?' : ''}
     ORDER BY q.is_read ASC, q.created_at DESC LIMIT 500`,
  ).all(...(type ? [type] : []));
  const typeCounts = Object.fromEntries(db.prepare('SELECT type, COUNT(*) AS n FROM inquiries GROUP BY type').all().map((r) => [r.type, r.n]));
  typeCounts.all = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  res.render('admin/inquiries', { title: 'Μηνύματα', inquiries, type, typeCounts });
});

router.post('/inquiries/:id/read', verifyCsrf, (req, res) => {
  db.prepare('UPDATE inquiries SET is_read = ? WHERE id = ?').run(req.body.read === '0' ? 0 : 1, toInt(req.params.id));
  res.redirect(req.get('referer') || '/admin/inquiries');
});

router.post('/inquiries/:id/delete', verifyCsrf, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(toInt(req.params.id));
  flash(req, 'success', 'Το μήνυμα διαγράφηκε.');
  res.redirect('/admin/inquiries');
});

/* ---------- Settings ---------- */

const IMAGE_SETTINGS = ['logo', 'logo_wide', 'cover'];
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter((k) => !IMAGE_SETTINGS.includes(k));

router.get('/settings', (req, res) => res.render('admin/settings', { title: 'Ρυθμίσεις εμπόρου' }));

router.post('/settings', multipart(IMAGE_SETTINGS.map((name) => ({ name, maxCount: 1 }))), (req, res) => {
  const values = {};
  for (const k of SETTING_KEYS) values[k] = String(req.body[k] ?? '').trim();
  values.finance_enabled = req.body.finance_enabled ? '1' : '0';
  values.finance_rate = String(parseFloat(String(values.finance_rate).replace(',', '.')) || 0);
  for (const k of ['primary_color', 'secondary_color']) {
    if (!/^#[0-9a-f]{6}$/i.test(values[k])) values[k] = DEFAULT_SETTINGS[k];
  }
  for (const k of ['facebook', 'instagram', 'tiktok']) {
    if (values[k] && !/^https?:\/\//i.test(values[k])) values[k] = `https://${values[k]}`;
  }

  const current = res.locals.site;
  for (const k of IMAGE_SETTINGS) {
    const file = req.files?.[k]?.[0];
    if (file || req.body[`remove_${k}`]) {
      removeUpload(current[k]);
      values[k] = file ? file.filename : '';
    }
  }
  saveSettings(values);
  flash(req, 'success', 'Οι ρυθμίσεις αποθηκεύτηκαν.');
  res.redirect('/admin/settings');
});

/* ---------- Account ---------- */

router.get('/account', (req, res) => res.render('admin/account', { title: 'Λογαριασμός', errors: [] }));

router.post('/account', verifyCsrf, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const { current_password: cur = '', new_password: pw = '', confirm_password: pw2 = '' } = req.body;
  const username = String(req.body.username || '').trim();
  const errors = [];
  if (!bcrypt.compareSync(String(cur), user.password_hash)) errors.push('Ο τρέχων κωδικός δεν είναι σωστός.');
  if (!/^[\w.@-]{3,40}$/.test(username)) errors.push('Το όνομα χρήστη πρέπει να έχει 3–40 λατινικούς χαρακτήρες.');
  if (pw || user.must_change_password) {
    if (String(pw).length < 8) errors.push('Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    if (pw !== pw2) errors.push('Η επιβεβαίωση κωδικού δεν ταιριάζει.');
    if (pw && bcrypt.compareSync(String(pw), user.password_hash)) errors.push('Ο νέος κωδικός πρέπει να διαφέρει από τον τρέχοντα.');
  }
  if (errors.length) return res.status(400).render('admin/account', { title: 'Λογαριασμός', errors });

  const hash = pw ? bcrypt.hashSync(String(pw), 10) : user.password_hash;
  db.prepare('UPDATE users SET username = ?, password_hash = ?, must_change_password = 0 WHERE id = ?').run(username, hash, user.id);
  // Invalidate every other session of this user after a credential change.
  db.prepare("DELETE FROM sessions WHERE sid != ? AND json_extract(data, '$.userId') = ?").run(req.sessionID, user.id);
  req.session.username = username;
  flash(req, 'success', 'Τα στοιχεία λογαριασμού ενημερώθηκαν.');
  res.redirect('/admin');
});

/* ---------- Save changes (backups) ---------- */

router.get('/backups', (req, res) => {
  res.render('admin/backups', { title: 'Αποθήκευση αλλαγών', backups: saveChanges.listBackups() });
});

router.post('/backups', verifyCsrf, (req, res) => {
  saveChanges.createBackup('manual');
  flash(req, 'success', 'Όλες οι αλλαγές αποθηκεύτηκαν σε νέο αντίγραφο ασφαλείας.');
  res.redirect('/admin/backups');
});

router.get('/backups/:name/download', (req, res, next) => {
  const file = saveChanges.backupPath(req.params.name);
  if (!file) return next();
  res.download(file);
});

router.post('/backups/:name/restore', verifyCsrf, (req, res) => {
  try {
    const safety = saveChanges.restoreBackup(req.params.name);
    flash(req, 'success', `Έγινε επαναφορά. Η προηγούμενη κατάσταση φυλάχτηκε ως «${safety}».`);
  } catch (e) {
    flash(req, 'error', `Η επαναφορά απέτυχε: ${e.message}`);
  }
  res.redirect('/admin/backups');
});

router.post('/backups/:name/delete', verifyCsrf, (req, res) => {
  if (saveChanges.deleteBackup(req.params.name)) flash(req, 'success', 'Το αντίγραφο διαγράφηκε.');
  res.redirect('/admin/backups');
});

router.get('/preview/:id', (req, res, next) => {
  const car = getCar(req.params.id);
  if (!car) return next();
  res.redirect(carUrl(car));
});

module.exports = router;
