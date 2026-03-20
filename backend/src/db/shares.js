"use strict";

const db = require("./index");

/**
 * All database interactions for shares live here.
 * Routes never touch `db` directly — they go through these functions.
 */

/**
 * Creates a new share with its associated file(s).
 * Wrapped in a transaction so both inserts succeed or neither does.
 *
 * @param {object} params
 * @param {string}      params.uuid           - UUID for the share link
 * @param {string[]}    params.filePaths      - array of relative file paths
 * @param {string}      params.expiresAt      - ISO 8601 UTC string
 * @param {number|null} params.downloadLimit  - null = unlimited
 * @param {string|null} params.passwordHash   - bcrypt hash or null
 * @param {boolean}     params.maskFilenames  - whether to mask filenames
 * @param {string|null} params.name           - optional share name
 * @returns {object} the created share record
 */
const createShare = db.transaction((params) => {
  const {
    uuid,
    filePaths,
    expiresAt,
    downloadLimit,
    passwordHash,
    maskFilenames,
    name,
  } = params;

  const insertShare = db.prepare(`
    INSERT INTO shares (uuid, expires_at, download_limit, password_hash, mask_filenames, name)
    VALUES (@uuid, @expiresAt, @downloadLimit, @passwordHash, @maskFilenames, @name)
  `);

  const insertFile = db.prepare(`
    INSERT INTO share_files (share_id, file_path)
    VALUES (@shareId, @filePath)
  `);

  const { lastInsertRowid } = insertShare.run({
    uuid,
    expiresAt,
    downloadLimit: downloadLimit ?? null,
    passwordHash: passwordHash ?? null,
    maskFilenames: maskFilenames ? 1 : 0,
    name: name ?? null,
  });

  for (const filePath of filePaths) {
    insertFile.run({ shareId: lastInsertRowid, filePath });
  }

  return getShareById(lastInsertRowid);
});

/**
 * Returns a single share by its internal row ID, with file paths attached.
 */
function getShareById(id) {
  const share = db.prepare("SELECT * FROM shares WHERE id = ?").get(id);
  if (!share) return null;
  return attachFiles(share);
}

/**
 * Returns a single share by its public UUID, with file paths attached.
 */
function getShareByUuid(uuid) {
  const share = db.prepare("SELECT * FROM shares WHERE uuid = ?").get(uuid);
  if (!share) return null;
  return attachFiles(share);
}

/**
 * Returns all shares ordered by creation date descending.
 */
function listShares() {
  const shares = db
    .prepare("SELECT * FROM shares ORDER BY created_at DESC")
    .all();
  return shares.map(attachFiles);
}

/**
 * Increments the download count for a share by 1.
 */
function incrementDownloadCount(uuid) {
  db.prepare(
    "UPDATE shares SET download_count = download_count + 1 WHERE uuid = ?",
  ).run(uuid);
}

/**
 * Deletes a share and its associated files (CASCADE handles share_files).
 */
function deleteShare(uuid) {
  const { changes } = db.prepare("DELETE FROM shares WHERE uuid = ?").run(uuid);
  return changes > 0;
}

/**
 * Validates a share for download:
 * - exists
 * - not expired
 * - download limit not reached
 */
function validateShare(uuid) {
  const share = getShareByUuid(uuid);

  if (!share) return { valid: false, reason: "not_found" };

  if (new Date() > new Date(share.expires_at)) {
    return { valid: false, reason: "expired" };
  }

  if (
    share.download_limit !== null &&
    share.download_count >= share.download_limit
  ) {
    return { valid: false, reason: "limit_reached" };
  }

  return { valid: true, share };
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Attaches file paths and normalises fields on a raw DB share record.
 * password_hash is stripped here — never leaves this file.
 */
function attachFiles(share) {
  const files = db
    .prepare(
      "SELECT file_path FROM share_files WHERE share_id = ? ORDER BY id ASC",
    )
    .all(share.id);

  return {
    ...share,
    password_hash: undefined,
    hasPassword: share.password_hash !== null,
    maskFilenames: share.mask_filenames === 1,
    name: share.name ?? null,
    filePaths: files.map((f) => f.file_path),
  };
}

module.exports = {
  createShare,
  getShareById,
  getShareByUuid,
  listShares,
  incrementDownloadCount,
  deleteShare,
  validateShare,
};
