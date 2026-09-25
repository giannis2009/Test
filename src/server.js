const path = require('node:path');
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { db, getSettings } = require('./db');
const SqliteStore = require('./session-store');
const { UPLOAD_DIR } = require('./upload');
const { fmt, qs, csrfToken } = require('./helpers');
const { carUrl, carTitle } = require('./cars');
const constants = require('./constants');

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: isProd ? '7d' : 0 }));
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
  Object.assign(res.locals, {
    site: settings,
    fmt,
    qs,
    carUrl,
    carTitle,
    C: constants,
    path: req.path,
    query: req.query,
    csrf: () => csrfToken(req),
    user: req.session.userId ? { id: req.session.userId, username: req.session.username } : null,
    flashes: req.session.flash || [],
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
  app.listen(PORT, () => console.log(`Το site τρέχει στο http://localhost:${PORT} (admin: /admin)`));
}

module.exports = app;
