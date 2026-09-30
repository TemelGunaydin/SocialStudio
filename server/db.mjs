import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = join(dataDir, 'studio.sqlite');
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      text TEXT NOT NULL,
      url TEXT NOT NULL,
      media_kind TEXT NOT NULL DEFAULT 'none',
      media_path TEXT,
      media_alt TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_date TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      published_at TEXT,
      x_post_id TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily_runs (day TEXT PRIMARY KEY, result TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL);
  `);
  // A process may stop after sending a Post but before recording X's response.
  // Never retry such a draft automatically because that can publish a duplicate.
  db.prepare(`UPDATE drafts SET status = 'uncertain', error = 'Sunucu yayın sırasında durdu. X hesabındaki son gönderiyi kontrol edin.' WHERE status = 'publishing'`).run();
  db.prepare(`UPDATE daily_runs SET result = 'failed', error = 'Sunucu taslak üretimi sırasında durdu.' WHERE result = 'running'`).run();
  const statements = {
    list: db.prepare('SELECT * FROM drafts ORDER BY created_at DESC LIMIT 120'),
    get: db.prepare('SELECT * FROM drafts WHERE id = ?'),
    create: db.prepare(`INSERT INTO drafts
      (id, app_id, feature, text, url, scheduled_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    edit: db.prepare(`UPDATE drafts SET text = ?, media_kind = ?, media_path = ?, media_alt = ?, updated_at = ?, error = NULL
      WHERE id = ? AND status = 'draft'`),
    markPublishing: db.prepare(`UPDATE drafts SET status = 'publishing', approved_at = ?, updated_at = ?, error = NULL
      WHERE id = ? AND status = 'draft'`),
    markPublished: db.prepare(`UPDATE drafts SET status = 'published', x_post_id = ?, published_at = ?, updated_at = ?, error = NULL
      WHERE id = ? AND status = 'publishing'`),
    markFailed: db.prepare(`UPDATE drafts SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'publishing'`),
    reject: db.prepare(`UPDATE drafts SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'draft'`),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
    dailyRun: db.prepare('SELECT * FROM daily_runs WHERE day = ?'),
    dailyStart: db.prepare(`INSERT OR IGNORE INTO daily_runs (day, result, created_at) VALUES (?, 'running', ?)`),
    dailyFinish: db.prepare('UPDATE daily_runs SET result = ?, error = ? WHERE day = ?'),
    appCount: db.prepare('SELECT COUNT(*) AS count FROM drafts WHERE app_id = ?'),
    publishedUsage: db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN published_at >= ? THEN 1 ELSE 0 END), 0) AS today,
      COUNT(*) AS month FROM drafts
      WHERE status = 'published' AND published_at >= ? AND published_at <= ?`),
    lastApp: db.prepare('SELECT app_id FROM drafts ORDER BY created_at DESC LIMIT 1')
  };
  return { db, ...statements };
}
