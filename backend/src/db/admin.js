import db from './index.js';

export function isAdminConfigured() {
  return db.prepare('SELECT id FROM admin WHERE id = 1').get() !== undefined;
}

export function createAdmin(username, passwordHash) {
  db.prepare(`
    INSERT INTO admin (id, username, password_hash)
    VALUES (1, @username, @passwordHash)
  `).run({ username, passwordHash });
}

export function getAdmin() {
  return db.prepare('SELECT * FROM admin WHERE id = 1').get() ?? null;
}

export function updateAdmin({ username, passwordHash }) {
  if (username && passwordHash) {
    db.prepare(`UPDATE admin SET username = @username, password_hash = @passwordHash WHERE id = 1`)
      .run({ username, passwordHash });
  } else if (username) {
    db.prepare('UPDATE admin SET username = @username WHERE id = 1').run({ username });
  } else if (passwordHash) {
    db.prepare('UPDATE admin SET password_hash = @passwordHash WHERE id = 1').run({ passwordHash });
  }
}
