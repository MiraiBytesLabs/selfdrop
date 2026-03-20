"use strict";

const express = require("express");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { generateToken } = require("../utils/token");
const { resolveSafePath } = require("../middleware/pathGuard");
const sharesDb = require("../db/shares");

const router = express.Router();

const BCRYPT_ROUNDS = 10;

// ── Helpers ───────────────────────────────────────────────

/**
 * Validates and normalises share creation input.
 * Returns { error } on failure or { data } on success.
 */
function validateCreatePayload(body) {
  const { filePaths, expiresAt, downloadLimit, password, maskFilenames, name } =
    body;

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { error: "filePaths must be a non-empty array." };
  }

  if (filePaths.some((p) => typeof p !== "string" || p.trim() === "")) {
    return { error: "Each filePath must be a non-empty string." };
  }

  // Name is required for multi-file shares, optional for single-file
  if (filePaths.length > 1 && (!name || !name.trim())) {
    return { error: "A share name is required when sharing multiple files." };
  }

  if (name && name.trim().length > 100) {
    return { error: "Share name must be 100 characters or fewer." };
  }

  if (!expiresAt || isNaN(Date.parse(expiresAt))) {
    return { error: "expiresAt must be a valid ISO 8601 date string." };
  }

  if (new Date(expiresAt) <= new Date()) {
    return { error: "expiresAt must be in the future." };
  }

  if (downloadLimit !== undefined && downloadLimit !== null) {
    const limit = parseInt(downloadLimit, 10);
    if (isNaN(limit) || limit < 1) {
      return { error: "downloadLimit must be a positive integer or null." };
    }
  }

  return {
    data: {
      filePaths: filePaths.map((p) => p.trim()),
      expiresAt: new Date(expiresAt).toISOString(),
      downloadLimit: downloadLimit ? parseInt(downloadLimit, 10) : null,
      password: password || null,
      maskFilenames: maskFilenames === true || maskFilenames === 1,
      name: name ? name.trim() : null,
    },
  };
}

/**
 * Verifies all provided file paths exist within FILES_ROOT.
 * Returns null on success or an error string on first bad path.
 */
function verifyFilePaths(filePaths) {
  for (const filePath of filePaths) {
    let resolved;

    try {
      resolved = resolveSafePath(filePath);
    } catch (err) {
      return err.message;
    }

    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return `Path is a directory, not a file: ${filePath}`;
      }
    } catch {
      return `File not found: ${filePath}`;
    }
  }
  return null;
}

/**
 * Shapes a raw DB share record into the API response format.
 * Adds computed fields and never exposes password_hash.
 */
function formatShare(share) {
  const now = new Date();
  const isExpired = now > new Date(share.expires_at);
  const isLimitReached =
    share.download_limit !== null &&
    share.download_count >= share.download_limit;

  return {
    uuid: share.uuid,
    shareUrl: `/s/${share.uuid}`,
    filePaths: share.filePaths,
    name: share.name,
    expiresAt: share.expires_at,
    downloadLimit: share.download_limit,
    downloadCount: share.download_count,
    hasPassword: share.hasPassword,
    maskFilenames: share.maskFilenames,
    createdAt: share.created_at,
    status: isExpired ? "expired" : isLimitReached ? "limit_reached" : "active",
  };
}

// ── Routes ────────────────────────────────────────────────

/**
 * POST /api/shares
 *
 * Creates a new share.
 *
 * Body:
 * {
 *   filePaths:     string[]       relative paths from FILES_ROOT
 *   expiresAt:     string         ISO 8601 UTC datetime
 *   downloadLimit: number | null  null = unlimited
 *   password:      string | null  plain text, will be hashed
 * }
 *
 * Response 201: ShareObject
 */
router.post("/", async (req, res) => {
  const { error, data } = validateCreatePayload(req.body);
  if (error) return res.status(400).json({ error });

  const pathError = verifyFilePaths(data.filePaths);
  if (pathError) return res.status(400).json({ error: pathError });

  try {
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, BCRYPT_ROUNDS)
      : null;

    const share = sharesDb.createShare({
      uuid: generateToken(),
      filePaths: data.filePaths,
      expiresAt: data.expiresAt,
      downloadLimit: data.downloadLimit,
      maskFilenames: data.maskFilenames,
      name: data.name,
      passwordHash,
    });

    res.status(201).json(formatShare(share));
  } catch (err) {
    console.error("[shares] create error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * GET /api/shares
 *
 * Lists all shares ordered by creation date descending.
 *
 * Response 200: { shares: ShareObject[] }
 */
router.get("/", (_req, res) => {
  try {
    const shares = sharesDb.listShares();
    res.json({ shares: shares.map(formatShare) });
  } catch (err) {
    console.error("[shares] list error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * GET /api/shares/:uuid
 *
 * Returns a single share by UUID.
 *
 * Response 200: ShareObject
 * Response 404: { error }
 */
router.get("/:uuid", (req, res) => {
  try {
    const share = sharesDb.getShareByUuid(req.params.uuid);
    if (!share) return res.status(404).json({ error: "Share not found." });
    res.json(formatShare(share));
  } catch (err) {
    console.error("[shares] get error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * DELETE /api/shares/:uuid
 *
 * Revokes (deletes) a share and its associated files records.
 *
 * Response 200: { message }
 * Response 404: { error }
 */
router.delete("/:uuid", (req, res) => {
  try {
    const deleted = sharesDb.deleteShare(req.params.uuid);
    if (!deleted) return res.status(404).json({ error: "Share not found." });
    res.json({ message: "Share revoked." });
  } catch (err) {
    console.error("[shares] delete error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
