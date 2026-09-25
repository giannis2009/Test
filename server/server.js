const path = require('node:path');
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { db, getSettings } = require('../database/database');
const SqliteStore = require('../database/session-store');
const { UPLOAD_DIR } = require('./upload');
const saveChanges = require('../save-changes/save-changes');
const { fmt, qs, csrfToken } = require('./helpers');
const { carUrl, carTitle } = require('./cars');
const constants = require('./constants');
const { icon } = require('./icons');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Persist a random secret so sessions survive restarts without configuration.
  let row = db.prepare("SELECT value FROM settings WHERE key = '_session_secret'").get();
  if (!row) {
    const value = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO settings (key, value) VALUES ('_session_secret', ?)").run(value);
    row = { value };
  }
  return row.value;
}

const ROOT = path.join(__dirname, '..');

// Pages are plain .html files with EJS tags, kept in the html/ folder.
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', path.join(ROOT, 'html'));
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const staticOpts = { maxAge: isProd ? '7d' : 0 };
app.use('/css', express.static(path.join(ROOT, 'css'), staticOpts));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOpts));
app.use('/images', express.static(path.join(ROOT, 'images'), staticOpts));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  store: new SqliteStore(),
  secret: sessionSecret(),
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 3600 * 1000 },
}));

app.use((req, res, next) => {
  const settings = getSettings();
  delete settings._session_secret;
  settings.logoUrl = settings.logo ? `/uploads/${settings.logo}` : '/images/logo-icon.png';
  settings.logoWideUrl = settings.logo_wide ? `/uploads/${settings.logo_wide}` : '/images/logo-wordmark.png';
  Object.assign(res.locals, {
    site: settings,
    fmt,
    icon,
    qs,
    carUrl,
    carTitle,
    C: constants,
    path: req.path,
    query: req.query,
    csrf: () => csrfToken(req),
    user: req.session.userId ? { id: req.session.userId, username: req.session.username } : null,
    flashes: req.session.flash || [],
    baseUrl: `${req.protocol}://${req.get('host')}`,
    year: new Date().getFullYear(),
  });
  if (req.session.flash) delete req.session.flash;
  next();
});

app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/public'));

app.use((req, res) => res.status(404).render('error', { title: 'Η σελίδα δεν βρέθηκε', message: 'Η σελίδα που ζητήσατε δεν υπάρχει ή έχει αφαιρεθεί.' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Κάποια φωτογραφία ξεπερνά τα 15MB.' : 'Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.';
  res.status(err.status || 500).render('error', { title: 'Σφάλμα', message });
});

if (require.main === module) {
  saveChanges.start();
  app.listen(PORT, () => console.log(`Το site τρέχει στο http://localhost:${PORT} (admin: /admin)`));
}

module.exports = app;
