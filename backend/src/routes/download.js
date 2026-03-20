"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const archiver = require("archiver");
const sharesDb = require("../db/shares");
const { resolveSafePath } = require("../middleware/pathGuard");
const config = require("../config");

const router = express.Router();

// ── Startup ───────────────────────────────────────────────
// Ensure temp ZIP directory exists at module load time.
// Also recreated lazily before each ZIP build in case config changed.
try {
  fs.mkdirSync(config.zipTempDir, { recursive: true });
} catch {
  /* already exists */
}

// ── Cleanup job ───────────────────────────────────────────
// Runs every 5 minutes. Deletes temp ZIPs whose TTL has elapsed.
// TTL is stored in the filename: selfdrop-{uuid}-{deleteAfterMs}.zip
setInterval(
  () => {
    const now = Date.now();
    let cleaned = 0;
    try {
      const files = fs.readdirSync(config.zipTempDir);
      for (const file of files) {
        const match = file.match(/^selfdrop-.+-(\d+)\.zip$/);
        if (!match) continue;
        const deleteAfter = parseInt(match[1], 10);
        if (now >= deleteAfter) {
          try {
            fs.unlinkSync(path.join(config.zipTempDir, file));
            cleaned++;
          } catch {
            /* already deleted, skip */
          }
        }
      }
      if (cleaned > 0)
        console.log(`[zip-cleanup] removed ${cleaned} temp file(s)`);
    } catch (err) {
      console.error("[zip-cleanup] error:", err.message);
    }
  },
  5 * 60 * 1000,
);

// ── Routes ────────────────────────────────────────────────

/**
 * GET /s/:uuid/info
 *
 * Returns share metadata for the download page.
 * Works for both single-file and multi-file shares.
 * Password not required to view metadata — only for download.
 *
 * Response 200:
 * {
 *   shareTitle:    string         "3 files" or filename for single-file
 *   fileCount:     number
 *   totalSize:     number         sum of all file sizes in bytes
 *   totalSizeHuman:string
 *   expiresAt:     string
 *   hasPassword:   boolean
 *   downloadLimit: number | null
 *   downloadCount: number
 *   zipAvailable:  boolean        false if total size exceeds ZIP_MAX_BYTES
 *   zipMaxBytes:   number         so frontend can show the limit
 *   files: [
 *     { filename, size, sizeHuman, mimeType, path }
 *   ]
 * }
 */
router.get("/:uuid/info", async (req, res) => {
  const validation = sharesDb.validateShare(req.params.uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;

  // Resolve and stat all files
  const files = [];
  let totalSize = 0;

  for (const filePath of share.filePaths) {
    let resolvedPath;
    try {
      resolvedPath = resolveSafePath(filePath);
    } catch {
      return res.status(404).json({ error: "Not found." });
    }

    let stat;
    try {
      stat = await fs.promises.stat(resolvedPath);
    } catch {
      return res.status(404).json({ error: "Not found." });
    }

    const filename = path.basename(resolvedPath);
    totalSize += stat.size;

    const displayName = share.maskFilenames
      ? maskedFilename(share.uuid, filename, files.length)
      : filename;

    files.push({
      filename: displayName,
      path: filePath,
      size: stat.size,
      sizeHuman: humanSize(stat.size),
      mimeType: getMimeType(filename), // always use real name for MIME
    });
  }

  const isSingle = files.length === 1;

  // Title priority: explicit name > filename (single) > "N files" (multi)
  const shareTitle =
    share.name || (isSingle ? files[0].filename : `${files.length} files`);

  res.json({
    shareTitle,
    shareName: share.name,
    maskFilenames: share.maskFilenames,
    fileCount: files.length,
    totalSize,
    totalSizeHuman: humanSize(totalSize),
    expiresAt: share.expires_at,
    hasPassword: share.hasPassword,
    downloadLimit: share.download_limit,
    downloadCount: share.download_count,
    zipAvailable: totalSize <= config.zipMaxBytes,
    zipMaxBytes: config.zipMaxBytes,
    files,
  });
});

/**
 * GET /s/:uuid
 *
 * Single-file download. Only valid for single-file shares.
 * Multi-file shares must use POST /s/:uuid/zip or GET /s/:uuid/file/:filename.
 *
 * Requires X-Share-Password header for password-protected shares.
 */
router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;

  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;

  // Password check
  const passwordError = await checkPassword(
    share,
    req.headers["x-share-password"],
  );
  if (passwordError) return res.status(401).json(passwordError);

  // Multi-file shares cannot be downloaded via this route
  if (share.filePaths.length > 1) {
    return res.status(400).json({
      error: "This share contains multiple files. Use /zip or /file/:filename.",
      code: "MULTI_FILE_SHARE",
    });
  }

  const filePath = share.filePaths[0];
  const resolvedPath = safeResolve(filePath);
  if (!resolvedPath) return res.status(404).json({ error: "Not found." });

  const accessible = await isAccessible(resolvedPath);
  if (!accessible) return res.status(404).json({ error: "Not found." });

  sharesDb.incrementDownloadCount(uuid);

  // Determine display name — masked or real (single-file route)
  const fileIndex = share.filePaths.indexOf(filePath);
  const displayName = share.maskFilenames
    ? maskedFilename(share.uuid, path.basename(filePath), fileIndex)
    : null;

  return serveFile(res, resolvedPath, displayName);
});

/**
 * GET /s/:uuid/file/:filename
 *
 * Downloads a single specific file from a multi-file share.
 * The :filename param is matched against the share's file list by basename.
 *
 * Requires X-Share-Password header for password-protected shares.
 */
router.get("/:uuid/file/:filename", async (req, res) => {
  const { uuid, filename } = req.params;

  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;

  const passwordError = await checkPassword(
    share,
    req.headers["x-share-password"],
  );
  if (passwordError) return res.status(401).json(passwordError);

  // Find the matching file path — supports both real and masked names.
  // We check against real basename first, then against masked name.
  // DB paths are the source of truth — the :filename param is only used for matching.
  let matchedPath = share.filePaths.find(
    (fp) => path.basename(fp) === filename,
  );

  if (!matchedPath && share.maskFilenames) {
    // Try matching against masked names by index
    matchedPath = share.filePaths.find((fp, i) => {
      return maskedFilename(share.uuid, path.basename(fp), i) === filename;
    });
  }

  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  const resolvedPath = safeResolve(matchedPath);
  if (!resolvedPath) return res.status(404).json({ error: "Not found." });

  const accessible = await isAccessible(resolvedPath);
  if (!accessible) return res.status(404).json({ error: "Not found." });

  // Only increment count on first file of a multi-file share per session
  // For simplicity we increment per-file download — revisit if needed
  sharesDb.incrementDownloadCount(uuid);
  return serveFile(res, resolvedPath);
});

/**
 * GET /s/:uuid/preview/:filename
 *
 * Streams a file directly through Node for in-browser preview.
 * Unlike /file/:filename which uses X-Accel-Redirect, this endpoint
 * always streams through Node so blob URLs work correctly in the browser.
 *
 * Limited to previewable file types and files under 50MB.
 * Requires X-Share-Password header for password-protected shares.
 */
router.get("/:uuid/preview/:filename", async (req, res) => {
  const { uuid, filename } = req.params;

  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;

  const passwordError = await checkPassword(
    share,
    req.headers["x-share-password"],
  );
  if (passwordError) return res.status(401).json(passwordError);

  // Match filename against real or masked names
  let matchedPath = share.filePaths.find(
    (fp) => path.basename(fp) === filename,
  );
  if (!matchedPath && share.maskFilenames) {
    matchedPath = share.filePaths.find(
      (fp, i) => maskedFilename(share.uuid, path.basename(fp), i) === filename,
    );
  }
  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  const resolvedPath = safeResolve(matchedPath);
  if (!resolvedPath) return res.status(404).json({ error: "Not found." });

  const accessible = await isAccessible(resolvedPath);
  if (!accessible) return res.status(404).json({ error: "Not found." });

  const stat = await fs.promises.stat(resolvedPath);
  if (stat.size > config.previewMaxBytes) {
    return res
      .status(413)
      .json({
        error: `File too large to preview (limit: ${humanSize(config.previewMaxBytes)}).`,
      });
  }

  // Always stream through Node — never X-Accel-Redirect
  // This ensures the browser fetch() receives actual file bytes for blob URL creation
  const realName = path.basename(resolvedPath);
  const mimeType = getMimeType(realName);

  res.set({
    "Content-Type": mimeType,
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
  });

  fs.createReadStream(resolvedPath).pipe(res);
});

/**
 * POST /s/:uuid/zip
 *
 * Builds a ZIP of selected files (or all files if none specified),
 * writes it to a temp file, then serves it via X-Accel-Redirect.
 * Node never streams the ZIP to the client — Nginx handles transfer.
 *
 * Body (optional):
 * {
 *   filenames: string[]   // basenames to include — omit for all files
 * }
 *
 * Requires X-Share-Password header for password-protected shares.
 *
 * Response 200: X-Accel-Redirect to /internal-zips/<tempfile>
 *   Content-Disposition: attachment; filename="selfdrop.zip"
 *   Content-Type: application/zip
 */
router.post("/:uuid/zip", async (req, res) => {
  const { uuid } = req.params;

  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;

  const passwordError = await checkPassword(
    share,
    req.headers["x-share-password"],
  );
  if (passwordError) return res.status(401).json(passwordError);

  // Determine which files to include
  const { filenames } = req.body || {};
  let targetPaths = share.filePaths;

  if (Array.isArray(filenames) && filenames.length > 0) {
    // Filter to requested filenames — support both real and masked names
    targetPaths = share.filePaths.filter((fp, i) => {
      const real = path.basename(fp);
      const masked = share.maskFilenames
        ? maskedFilename(share.uuid, real, i)
        : real;
      return filenames.includes(real) || filenames.includes(masked);
    });
    if (targetPaths.length === 0) {
      return res
        .status(400)
        .json({
          error: "None of the requested filenames exist in this share.",
        });
    }
  }

  // Resolve all paths
  const resolvedPaths = [];
  for (const fp of targetPaths) {
    const resolved = safeResolve(fp);
    if (!resolved) return res.status(404).json({ error: "Not found." });
    const accessible = await isAccessible(resolved);
    if (!accessible)
      return res
        .status(404)
        .json({ error: `File not accessible: ${path.basename(fp)}` });
    resolvedPaths.push(resolved);
  }

  // Check total size against ZIP limit
  let totalSize = 0;
  for (const rp of resolvedPaths) {
    const stat = await fs.promises.stat(rp);
    totalSize += stat.size;
  }

  if (totalSize > config.zipMaxBytes) {
    return res.status(400).json({
      error: `Total size (${humanSize(totalSize)}) exceeds ZIP limit (${humanSize(config.zipMaxBytes)}).`,
      code: "ZIP_SIZE_EXCEEDED",
      totalSize,
      zipMaxBytes: config.zipMaxBytes,
    });
  }

  // Build ZIP filename with TTL encoded
  // Format: selfdrop-{uuid}-{deleteAfterMs}.zip
  const ttlSeconds = config.zipTtlForSize(totalSize);
  const deleteAfter = Date.now() + ttlSeconds * 1000;
  const tempFilename = `selfdrop-${uuid}-${deleteAfter}.zip`;
  const tempPath = path.join(config.zipTempDir, tempFilename);

  // Ensure temp dir exists (handles test env where config may reload)
  fs.mkdirSync(config.zipTempDir, { recursive: true });

  // Build the ZIP — write to disk, never to memory
  try {
    await buildZip(resolvedPaths, tempPath, share);
  } catch (err) {
    console.error("[zip] build error:", err);
    // Clean up partial file if it exists
    try {
      fs.unlinkSync(tempPath);
    } catch {}
    return res.status(500).json({ error: "Failed to create ZIP." });
  }

  // Increment download count after successful ZIP build
  sharesDb.incrementDownloadCount(uuid);

  const sendfileMode = config.sendfileMode;

  if (sendfileMode === "stream" || process.env.NODE_ENV !== "production") {
    // Dev / non-Nginx: stream the temp file then delete it
    res.set({
      "Content-Disposition": 'attachment; filename="selfdrop.zip"',
      "Content-Type": "application/zip",
    });
    const stream = fs.createReadStream(tempPath);
    stream.pipe(res);
    stream.on("end", () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    });
    return;
  }

  // Production: X-Accel-Redirect — Nginx serves the temp file directly
  res.set({
    "X-Accel-Redirect": `/internal-zips/${tempFilename}`,
    "Content-Disposition": 'attachment; filename="selfdrop.zip"',
    "Content-Type": "application/zip",
  });
  res.status(200).send();
});

/**
 * POST /s/:uuid/verify-password
 *
 * Validates a password before the download page commits to downloading.
 */
router.post("/:uuid/verify-password", async (req, res) => {
  const validation = sharesDb.validateShare(req.params.uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });

  const { share } = validation;
  if (!share.hasPassword) {
    return res
      .status(400)
      .json({ error: "This share is not password protected." });
  }

  const { password } = req.body;
  if (!password)
    return res.status(400).json({ error: "Password is required." });

  const valid = await verifySharePassword(share.uuid, password);
  if (!valid)
    return res.status(401).json({ valid: false, error: "Incorrect password." });

  res.json({ valid: true });
});

// ── Helpers ───────────────────────────────────────────────

/**
 * Checks password for a share. Returns null if ok, or an error object.
 */
async function checkPassword(share, providedPassword) {
  if (!share.hasPassword) return null;

  if (!providedPassword) {
    return { error: "Password required.", code: "PASSWORD_REQUIRED" };
  }

  const valid = await verifySharePassword(share.uuid, providedPassword);
  if (!valid) {
    return { error: "Incorrect password.", code: "PASSWORD_INCORRECT" };
  }

  return null;
}

/**
 * Safely resolves a DB file path. Returns null on failure.
 */
function safeResolve(filePath) {
  try {
    return resolveSafePath(filePath);
  } catch {
    return null;
  }
}

/**
 * Checks if a path is readable. Returns boolean.
 */
async function isAccessible(resolvedPath) {
  try {
    await fs.promises.access(resolvedPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serves a single file via X-Accel-Redirect or Node stream.
 *
 * @param {object} res
 * @param {string} resolvedPath  - absolute path on disk
 * @param {string} [displayName] - filename to use in Content-Disposition
 *                                 defaults to the real basename
 */
function serveFile(res, resolvedPath, displayName) {
  const realName = path.basename(resolvedPath);
  const serveAs = displayName || realName;
  const mimeType = getMimeType(realName); // MIME from real name
  const sendfileMode = config.sendfileMode;

  if (sendfileMode === "stream" || process.env.NODE_ENV !== "production") {
    res.set({
      "Content-Disposition": `attachment; filename="${sanitizeFilename(serveAs)}"`,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });
    return res.download(resolvedPath, serveAs);
  }

  const accelPath =
    "/internal-files/" + path.relative(config.filesRoot, resolvedPath);
  res.set({
    "X-Accel-Redirect": accelPath,
    "Content-Disposition": `attachment; filename="${sanitizeFilename(serveAs)}"`,
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
  });
  res.status(200).send();
}

/**
 * Builds a ZIP archive from an array of resolved file paths.
 * Uses level 0 (store only) — no compression, minimal CPU.
 * Writes to tempPath on disk. Never buffers in memory.
 *
 * @param {string[]} resolvedPaths
 * @param {string}   tempPath
 * @returns {Promise<void>}
 */
function buildZip(resolvedPaths, tempPath, share) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(tempPath);
    const archive = archiver("zip", {
      zlib: { level: config.zipCompressionLevel },
    });

    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);

    archive.pipe(output);

    for (let i = 0; i < resolvedPaths.length; i++) {
      const rp = resolvedPaths[i];
      const realName = path.basename(rp);
      const zipName = share.maskFilenames
        ? maskedFilename(share.uuid, realName, i)
        : realName;
      archive.file(rp, { name: zipName });
    }

    archive.finalize();
  });
}

/**
 * Verifies a plaintext password against the stored bcrypt hash.
 */
async function verifySharePassword(uuid, plaintext) {
  const db = require("../db/index");
  const row = db
    .prepare("SELECT password_hash FROM shares WHERE uuid = ?")
    .get(uuid);
  if (!row || !row.password_hash) return false;
  return bcrypt.compare(plaintext, row.password_hash);
}

/**
 * Generates a masked filename for a file at a given index in a share.
 * Format: sdrop-{first6ofUUID}-{index+1}.{ext}
 * e.g. sdrop-a3f9c2-1.pdf, sdrop-a3f9c2-2.mp3
 *
 * @param {string} shareUuid
 * @param {string} realFilename
 * @param {number} index  0-based position in the share's file list
 * @returns {string}
 */
function maskedFilename(shareUuid, realFilename, index) {
  const token = shareUuid.replace(/-/g, "").slice(0, 6);
  const ext = path.extname(realFilename).toLowerCase();
  return `sdrop-${token}-${index + 1}${ext}`;
}

/**
 * Returns MIME type for a filename.
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".csv": "text/csv",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return types[ext] || "application/octet-stream";
}

/**
 * Strips unsafe characters from Content-Disposition filenames.
 */
function sanitizeFilename(filename) {
  return filename.replace(/["\\\r\n]/g, "_");
}

/**
 * Converts bytes to human-readable string.
 */
function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

module.exports = router;
