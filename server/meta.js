/* =========================================================
   Link previews — when a link to the site is pasted in Instagram, Discord, Viber, WhatsApp, Messenger, X…,
   their bots read these <meta> tags (they don't run JavaScript), so every shareable page gets its own
   title, description and big image, filled in on the server.
   ========================================================= */
const fs = require('node:fs');
const path = require('node:path');
const { get, getSetting } = require('./db');
const { escapeHtml: e } = require('./util');

const INDEX = path.join(__dirname, '..', 'public', 'index.html');
let cached = null;
const template = () => (process.env.NODE_ENV === 'production' && cached) || (cached = fs.readFileSync(INDEX, 'utf8'));

function baseUrl(req) {
  if (process.env.PUBLIC_URL && !/localhost|example\.com/.test(process.env.PUBLIC_URL)) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
const abs = (req, u) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${baseUrl(req)}${u.startsWith('/') ? '' : '/'}${u}`);

function render(req, res, m, status = 200) {
  const site = getSetting('site');
  const name = site.name || 'Ezro';
  const title = m.title ? `${m.title} — ${name}` : `${name} — Creative Studio`;
  const desc = (m.description || site.tagline || 'Cover art, 3D art, branding and VFX. Portfolio and shop.').replace(/\s+/g, ' ').slice(0, 200);
  const image = abs(req, m.image || getSetting('appearance').logoUrl || '/assets/logo.webp');
  const url = `${baseUrl(req)}${req.originalUrl.split('?')[0]}`;
  const tags = [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(desc)}">`,
    '<meta name="theme-color" content="#905abd">',
    `<link rel="canonical" href="${e(url)}">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:site_name" content="${e(name)}">`,
    `<meta property="og:url" content="${e(url)}">`,
    `<meta property="og:title" content="${e(m.title || title)}">`,
    `<meta property="og:description" content="${e(desc)}">`,
    `<meta property="og:image" content="${e(image)}">`,
    `<meta property="og:image:alt" content="${e(m.title || name)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${e(m.title || title)}">`,
    `<meta name="twitter:description" content="${e(desc)}">`,
    `<meta name="twitter:image" content="${e(image)}">`,
  ].join('\n  ');
  // replace the static head tags with the page's own
  const html = template()
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace(/<meta name="theme-color"[^>]*>\s*/, '')
    .replace(/<meta property="og:[^>]*>\s*/g, '')
    .replace('<meta name="viewport"', `${tags}\n  <meta name="viewport"`);
  res.status(status).type('html').set('Cache-Control', 'no-cache').send(html);
}

const catName = (id) => get('SELECT name FROM categories WHERE id = ?', id)?.name || '';

function home(req, res) { render(req, res, {}); }
function album(req, res) {
  const a = get('SELECT a.*, (SELECT url FROM media m WHERE m.album_id = a.id AND m.type = \'image\' ORDER BY m.sort, m.id LIMIT 1) first_url FROM albums a WHERE a.id = ? AND a.visible = 1', Number(req.params.id));
  if (!a) return render(req, res, {}, 404);
  const song = [a.song_title, a.artist].filter(Boolean).join(' — ');
  render(req, res, { title: a.title, description: [catName(a.category_id), song, a.description].filter(Boolean).join(' · '), image: a.cover_url || a.first_url, type: 'music.album' });
}
function product(req, res) {
  const p = get("SELECT * FROM products WHERE slug = ? AND status != 'hidden'", req.params.slug);
  if (!p) return render(req, res, {}, 404);
  const gallery = JSON.parse(p.gallery || '[]');
  render(req, res, { title: p.title, description: p.subtitle || p.description, image: p.cover_url || gallery[0], type: 'product' });
}
function cover(req, res) {
  const m = get('SELECT m.*, c.name cat FROM media m JOIN categories c ON c.id = m.category_id WHERE m.id = ? AND c.visible = 1', Number(req.params.id));
  if (!m) return render(req, res, {}, 404);
  const title = m.song_title || (m.title && !/^[0-9a-f]{6,}([\s_-]+[0-9a-f]{3,}){2,}$/i.test(m.title) ? m.title : '') || m.cat;
  const by = m.artist ? `${m.artist} · ` : '';
  render(req, res, { title, description: `${by}${m.cat}${m.caption ? ` · ${m.caption}` : ''}`, image: m.type === 'video' ? m.poster : m.url });
}

module.exports = { home, album, product, cover };
