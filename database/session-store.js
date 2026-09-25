const session = require('express-session');
const { db } = require('./database');

/** Minimal express-session store backed by the app's SQLite database. */
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires');
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.pruneStmt = db.prepare('DELETE FROM sessions WHERE expires < ?');
    setInterval(() => this.pruneStmt.run(Date.now()), 60 * 60 * 1000).unref();
  }

  static expiry(sess) {
    return sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try { this.setStmt.run(sid, JSON.stringify(sess), SqliteStore.expiry(sess)); cb?.(null); } catch (e) { cb?.(e); }
  }

  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }

  touch(sid, sess, cb) {
    try { this.touchStmt.run(SqliteStore.expiry(sess), sid); cb?.(null); } catch (e) { cb?.(e); }
  }
}

module.exports = SqliteStore;
