const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 40 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT[file.mimetype])),
});

function removeUpload(filename) {
  if (!filename) return;
  const file = path.join(UPLOAD_DIR, path.basename(filename));
  fs.rm(file, { force: true }, () => {});
}

module.exports = { upload, removeUpload, UPLOAD_DIR };
