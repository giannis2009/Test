const crypto = require('node:crypto');
const multer = require('multer');
const { UPLOAD_DIR, trashPhoto } = require('../save-changes/save-changes');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 40 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT[file.mimetype])),
});

module.exports = { upload, removeUpload: trashPhoto, UPLOAD_DIR };
