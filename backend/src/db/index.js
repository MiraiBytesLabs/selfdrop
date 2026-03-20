"use strict";

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const config = require("../config");

// Ensure the directory for the DB file exists.
// In Docker this will be the mounted /data/db volume.
const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.dbPath);

// Enable WAL mode — better concurrency and performance for SQLite.
db.pragma("journal_mode = WAL");

// Enforce foreign keys — SQLite disables them by default.
db.pragma("foreign_keys = ON");

/**
 * Create tables if they don't exist.
 * This runs on every startup — safe to call multiple times.
 */
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
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    file_path TEXT   NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Migrations ───────────────────────────────────────────
// Safe to run on every startup — silently ignored if column already exists.

const migrations = [
  // v1.1 — filename masking
  `ALTER TABLE shares ADD COLUMN mask_filenames INTEGER NOT NULL DEFAULT 0`,
  // v1.2 — share name
  `ALTER TABLE shares ADD COLUMN name TEXT`,
];

for (const migration of migrations) {
  try {
    db.exec(migration);
  } catch {
    // Column/index already exists — expected on all startups after first
  }
}

console.log(`[db] SQLite connected: ${config.dbPath}`);

module.exports = db;
