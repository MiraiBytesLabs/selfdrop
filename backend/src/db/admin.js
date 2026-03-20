"use strict";

const db = require("./index");

/**
 * All database interactions for the admin account live here.
 *
 * There is only ever one admin row (id = 1 enforced by the schema CHECK constraint).
 */

/**
 * Returns true if an admin account has been created.
 *
 * @returns {boolean}
 */
function isAdminConfigured() {
  const row = db.prepare("SELECT id FROM admin WHERE id = 1").get();
  return row !== undefined;
}

/**
 * Creates the admin account. Should only be called once during first-run setup.
 * Throws if an admin already exists.
 *
 * @param {string} username
 * @param {string} passwordHash - bcrypt hash
 */
function createAdmin(username, passwordHash) {
  db.prepare(
    `
    INSERT INTO admin (id, username, password_hash)
    VALUES (1, @username, @passwordHash)
  `,
  ).run({ username, passwordHash });
}

/**
 * Returns the admin record (username + password_hash).
 * Returns null if no admin has been configured yet.
 *
 * @returns {{ id, username, password_hash, created_at } | null}
 */
function getAdmin() {
  return db.prepare("SELECT * FROM admin WHERE id = 1").get() ?? null;
}

/**
 * Updates the admin username and/or password hash.
 * Only updates fields that are provided.
 *
 * @param {object} fields
 * @param {string} [fields.username]
 * @param {string} [fields.passwordHash]
 */
function updateAdmin({ username, passwordHash }) {
  if (username && passwordHash) {
    db.prepare(
      `
      UPDATE admin SET username = @username, password_hash = @passwordHash WHERE id = 1
    `,
    ).run({ username, passwordHash });
  } else if (username) {
    db.prepare("UPDATE admin SET username = @username WHERE id = 1").run({
      username,
    });
  } else if (passwordHash) {
    db.prepare(
      "UPDATE admin SET password_hash = @passwordHash WHERE id = 1",
    ).run({ passwordHash });
  }
}

module.exports = { isAdminConfigured, createAdmin, getAdmin, updateAdmin };
