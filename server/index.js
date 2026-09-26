const path = require('node:path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env file */ }

const express = require('express');
const helmet = require('helmet');
const { UPLOAD_DIR } = require('./db');
const auth = require('./auth');
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
      'script-src': ["'self'", 'https://accounts.google.com/gsi/client', 'https://www.paypal.com', 'https://*.paypal.com', 'https://*.paypalobjects.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'media-src': ["'self'", 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://accounts.google.com', 'https://*.paypal.com', 'https://*.paypalobjects.com'],
      'frame-src': ["'self'", 'https://accounts.google.com', 'https://*.paypal.com', 'https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
      'frame-ancestors': ["'self'"],
      'form-action': ["'self'"],
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

// CSRF guard: state-changing API calls must come from this site.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked.' });
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'Cross-site request blocked.' });
  next();
});

app.use('/api/auth', auth.router);
app.use('/api/public', publicApi.router);
app.use('/api/shop', shop.router);
app.use('/api/watch', watch.router);
app.use('/api/admin', admin.router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.get('/invoice/:number', shop.invoicePage);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));
app.get('/album/:id', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/product/:slug', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
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
