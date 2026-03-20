"use strict";

const db = require("./index");

/**
 * All settings are stored as key-value pairs in the settings table.
 * Values are always strings — callers parse as needed.
 *
 * Known keys:
 *   default_expiry_hours    number  — default expiry preset in hours
 *   default_download_limit  number  — 0 = unlimited
 *   default_mask_filenames  "0"|"1"
 *   public_url              string  — base URL for share links (optional)
 */

const DEFAULTS = {
  default_expiry_hours: "24",
  default_download_limit: "0",
  default_mask_filenames: "0",
  public_url: "",
};

/**
 * Returns all settings merged with defaults.
 * Missing keys fall back to their default values.
 *
 * @returns {object} { default_expiry_hours, default_download_limit, default_mask_filenames, public_url }
 */
function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

/**
 * Returns a single setting value, or the default if not set.
 *
 * @param {string} key
 * @returns {string}
 */
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : (DEFAULTS[key] ?? "");
}

/**
 * Saves one or more settings.
 * Uses upsert — inserts if missing, updates if exists.
 *
 * @param {object} updates — { key: value, ... }
 */
const saveSettings = db.transaction((updates) => {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of Object.entries(updates)) {
    upsert.run({ key, value: String(value) });
  }
});

module.exports = { getAllSettings, getSetting, saveSettings, DEFAULTS };
