import db from './index.js';

const DEFAULTS = {
  default_expiry_hours:   '24',
  default_download_limit: '0',
  default_mask_filenames: '0',
  public_url:             '',
};

export function getAllSettings() {
  const rows   = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : (DEFAULTS[key] ?? '');
}

export const saveSettings = db.transaction((updates) => {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of Object.entries(updates)) {
    upsert.run({ key, value: String(value) });
  }
});

export { DEFAULTS };
