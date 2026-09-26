// Streams paid videos from Google Drive (service account) or from the private upload folder,
// with HTTP Range support. The Drive file ID / file path is never sent to the browser.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { GoogleAuth } = require('google-auth-library');
const { SECURE_DIR } = require('./db');

let auth = null;
function driveAuth() {
  if (auth) return auth;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return null;
  const credentials = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(fs.readFileSync(raw, 'utf8'));
  auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return auth;
}
const driveConfigured = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// Accepts a raw file ID or any Drive share URL and returns the file ID.
function driveId(ref = '') {
  const m = String(ref).match(/(?:\/d\/|id=|\/file\/d\/)([\w-]{20,})/);
  return m ? m[1] : String(ref).trim();
}

const metaCache = new Map();
async function driveMeta(id) {
  const c = metaCache.get(id);
  if (c && Date.now() - c.at < 10 * 60_000) return c;
  const token = await driveAuth().getAccessToken();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=size,mimeType,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Drive metadata failed (${r.status}). Share the file with the service account email.`);
  const j = await r.json();
  const m = { size: Number(j.size), mime: j.mimeType || 'video/mp4', at: Date.now() };
  metaCache.set(id, m);
  return m;
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m) return null;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Number(m[2]);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || start >= size) return 'invalid';
  end = Math.min(end, size - 1, start + 8 * 1024 * 1024 - 1); // max 8 MB per chunk
  return { start, end };
}

function secureHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Accept-Ranges', 'bytes');
}

async function stream(product, req, res) {
  secureHeaders(res);
  let size, mime, open;
  if (product.video_source === 'drive') {
    if (!driveAuth()) { res.status(503).end('Drive not configured'); return; }
    const id = driveId(product.video_ref);
    ({ size, mime } = await driveMeta(id));
    open = async (start, end) => {
      const token = await driveAuth().getAccessToken();
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` } });
      if (!r.ok && r.status !== 206) throw new Error(`Drive stream failed (${r.status})`);
      return Readable.fromWeb(r.body);
    };
  } else if (product.video_source === 'upload') {
    const file = path.join(SECURE_DIR, path.basename(product.video_ref || ''));
    if (!product.video_ref || !fs.existsSync(file)) { res.status(404).end(); return; }
    size = fs.statSync(file).size;
    mime = /\.webm$/i.test(file) ? 'video/webm' : /\.mov$/i.test(file) ? 'video/quicktime' : 'video/mp4';
    open = async (start, end) => fs.createReadStream(file, { start, end });
  } else { res.status(404).end(); return; }

  let range = parseRange(req.headers.range, size);
  if (range === 'invalid') { res.status(416).setHeader('Content-Range', `bytes */${size}`); res.end(); return; }
  if (!range) range = { start: 0, end: Math.min(size - 1, 2 * 1024 * 1024 - 1) };
  res.status(206);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  res.setHeader('Content-Length', range.end - range.start + 1);
  const body = await open(range.start, range.end);
  body.on('error', () => res.destroy());
  req.on('close', () => body.destroy());
  body.pipe(res);
}

module.exports = { stream, driveConfigured, driveId };
