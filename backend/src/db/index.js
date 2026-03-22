import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import config from '../config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS shares (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid           TEXT    NOT NULL UNIQUE,
    download_limit INTEGER,
    download_count INTEGER NOT NULL DEFAULT 0,
    password_hash  TEXT,
    expires_at     TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS share_files (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id  INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    file_path TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Migrations ────────────────────────────────────────────
const migrations = [
  `ALTER TABLE shares ADD COLUMN mask_filenames INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE shares ADD COLUMN name TEXT`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

for (const migration of migrations) {
  try { db.exec(migration); } catch { /* already applied */ }
}

console.log(`[db] SQLite connected: ${config.dbPath}`);

export default db;
