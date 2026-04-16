import db from "./index.js";

const DEFAULTS = {
  default_expiry_hours: "24",
  default_download_limit: "0",
  default_mask_filenames: "0",
  public_url: "",
};

type SettingKey = keyof typeof DEFAULTS;

type SettingRow = {
  key: string;
  value: string;
};

export function getAllSettings() {
  const rows = db
    .prepare("SELECT key, value FROM settings")
    .all() as SettingRow[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

export function getSetting(key: SettingKey): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;

  return row?.value ?? DEFAULTS[key];
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
