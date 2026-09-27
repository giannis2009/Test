const path = require('node:path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env file */ }

// Local mode (started by start-windows.bat / scripts/live.js, or a .env still holding the
// example placeholders): always runs as a local test site on http://localhost, whatever the .env says.
// Never applies on Render.
if (!process.env.RENDER && (process.env.EZRO_LOCAL === '1' || /example\.com/.test(process.env.PUBLIC_URL || ''))) {
  const port = Number(process.env.PORT) || 3000;
  process.env.NODE_ENV = 'development';
  process.env.PUBLIC_URL = `http://localhost:${port}`;
  delete process.env.TRUST_PROXY;
  if (process.env.EZRO_PUBLIC === '1') {
    // public through the tunnel: real visitors — the test login and test payments must be OFF
    process.env.DEV_LOGIN = '0';
    process.env.TRUST_PROXY = '1'; // https and the visitor's IP come from Cloudflare
    if (process.env.EZRO_PUBLIC_URL) process.env.PUBLIC_URL = process.env.EZRO_PUBLIC_URL;
    console.log(`[ezro] Public mode${process.env.EZRO_PUBLIC_URL ? ` at ${process.env.EZRO_PUBLIC_URL}` : ''}: test login and test payments are OFF.`);
  } else {
    if (!process.env.GOOGLE_CLIENT_ID) process.env.DEV_LOGIN = '1';
    console.log('[ezro] Local mode: test login and test payments are on.');
  }
}

const express = require('express');
const helmet = require('helmet');
const { UPLOAD_DIR } = require('./db');
const auth = require('./auth');
const adminAuth = require('./adminauth');
const shop = require('./shop');
const watch = require('./watch');
const publicApi = require('./public');
const admin = require('./admin');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'media-src': ["'self'", 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://accounts.google.com'],
      'frame-src': ["'self'", 'https://open.spotify.com', 'https://accounts.google.com', 'https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
      'frame-ancestors': ["'self'"],
      'form-action': ["'self'", 'https://www.paypal.com', 'https://www.sandbox.paypal.com'], // checkout posts to PayPal's payment page
      'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // needed by Google & PayPal popups
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.json({ limit: '1mb' }));
app.use(auth.sessionMiddleware);
app.use(adminAuth.adminSession);

// CSRF guard: state-changing API calls must come from this site.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked.' });
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'Cross-site request blocked.' });
  next();
});

app.use('/api/auth', auth.router);
app.use('/api/admin-auth', adminAuth.router);
app.use('/api/public', publicApi.router);
app.use('/api/public', require('./reactions').router);
app.use('/api/shop', shop.router);
app.use('/api/watch', watch.router);
app.use('/api/paypal', require('./paypal').router); // IPN listener
app.use('/api/admin', admin.router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false, setHeaders: (res, file) => { if (/\.svg$/i.test(file)) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); } }));
// Shareable pages get their own link-preview tags (title / description / image) on the server.
const meta = require('./meta');
app.get(['/', '/index.html'], meta.home);
app.get('/album/:id', meta.album);
app.get('/product/:slug', meta.product);
app.get('/cover/:id', meta.cover);
// No browser caching locally, so every change shows up on a normal refresh.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/admin/{*rest}', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/{*rest}', (_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.destroy();
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`[ezro] running on http://localhost:${PORT}`));
