import db from "./index.js";
import { generateToken } from "../utils/token.js";

export const createShare = db.transaction((params) => {
  const {
    uuid,
    filePaths,
    expiresAt,
    downloadLimit,
    passwordHash,
    maskFilenames,
    name,
  } = params;

  const { lastInsertRowid } = db
    .prepare(
      `
    INSERT INTO shares (uuid, expires_at, download_limit, password_hash, mask_filenames, name)
    VALUES (@uuid, @expiresAt, @downloadLimit, @passwordHash, @maskFilenames, @name)
  `,
    )
    .run({
      uuid,
      expiresAt,
      downloadLimit: downloadLimit ?? null,
      passwordHash: passwordHash ?? null,
      maskFilenames: maskFilenames ? 1 : 0,
      name: name ?? null,
    });

  const insertFile = db.prepare(
    "INSERT INTO share_files (share_id, file_path, uuid) VALUES (@shareId, @filePath, @fileUUID)",
  );
  for (const filePath of filePaths) {
    const fileUUID = generateToken();
    insertFile.run({ shareId: lastInsertRowid, filePath, fileUUID });
  }

  return getShareById(lastInsertRowid);
});

export function getShareById(id) {
  const share = db.prepare("SELECT * FROM shares WHERE id = ?").get(id);
  return share ? attachFiles(share, false) : null;
}

export function getShareByUuid(uuid) {
  const share = db.prepare("SELECT * FROM shares WHERE uuid = ?").get(uuid);
  return share ? attachFiles(share) : null;
}

export function listShares() {
  return db
    .prepare("SELECT * FROM shares ORDER BY created_at DESC")
    .all()
    .map(attachFiles);
}

export function incrementDownloadCount(uuid) {
  db.prepare(
    "UPDATE shares SET download_count = download_count + 1 WHERE uuid = ?",
  ).run(uuid);
}

export function deleteShare(uuid) {
  const { changes } = db.prepare("DELETE FROM shares WHERE uuid = ?").run(uuid);
  return changes > 0;
}

export function validateShare(uuid) {
  const share = getShareByUuid(uuid);
  if (!share) return { valid: false, reason: "not_found" };
  if (new Date() > new Date(share.expires_at))
    return { valid: false, reason: "expired" };
  if (
    share.download_limit !== null &&
    share.download_count >= share.download_limit
  ) {
    return { valid: false, reason: "limit_reached" };
  }
  return { valid: true, share };
}

function attachFiles(share, sendFileDetails = true) {
  const files = db
    .prepare(
      "SELECT file_path, uuid FROM share_files WHERE share_id = ? ORDER BY id ASC",
    )
    .all(share.id);

  let shareDetails = {
    ...share,
    password_hash: undefined,
    hasPassword: share.password_hash !== null,
    maskFilenames: share.mask_filenames === 1,
    name: share.name ?? null,
  };

  if (sendFileDetails) {
    shareDetails = {
      ...shareDetails,
      filePaths: files.map((f) => f.file_path),
      files: files,
    };
  }

  return shareDetails;
}
