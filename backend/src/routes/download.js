import { Router } from "express";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "fs";
import { promises as fsp } from "fs";
import { join, basename, relative, extname } from "path";
import bcrypt from "bcrypt";
import archiver from "archiver";
import * as sharesDb from "../db/shares.js";
import db from "../db/index.js";
import { resolveSafePath } from "../middleware/pathGuard.js";
import config from "../config.js";

const router = Router();

// ── Startup ───────────────────────────────────────────────
try {
  mkdirSync(config.zipTempDir, { recursive: true });
} catch {}

// ── Cleanup job — runs every 5 minutes ───────────────────
setInterval(
  () => {
    const now = Date.now();
    let cleaned = 0;
    try {
      for (const file of readdirSync(config.zipTempDir)) {
        const match = file.match(/^selfdrop-.+-(\d+)\.zip$/);
        if (!match) continue;
        if (now >= parseInt(match[1], 10)) {
          try {
            unlinkSync(join(config.zipTempDir, file));
            cleaned++;
          } catch {}
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

router.get("/:uuid/info", async (req, res) => {
  const validation = sharesDb.validateShare(req.params.uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;
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
      stat = await fsp.stat(resolvedPath);
    } catch {
      return res.status(404).json({ error: "Not found." });
    }
    const filename = basename(resolvedPath);
    totalSize += stat.size;
    const displayName = share.maskFilenames
      ? maskedFilename(share.uuid, filename, files.length)
      : filename;
    files.push({
      filename: displayName,
      path: filePath,
      size: stat.size,
      sizeHuman: humanSize(stat.size),
      mimeType: getMimeType(filename),
    });
  }

  const isSingle = files.length === 1;
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

router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;
  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;
  const passwordError = await checkPassword(
    share,
    req.headers["x-share-password"],
  );
  if (passwordError) return res.status(401).json(passwordError);
  if (share.filePaths.length > 1) {
    return res.status(400).json({
      error: "This share contains multiple files. Use /zip or /file/:filename.",
      code: "MULTI_FILE_SHARE",
    });
  }
  const filePath = share.filePaths[0];
  const resolvedPath = safeResolve(filePath);
  if (!resolvedPath || !(await isAccessible(resolvedPath)))
    return res.status(404).json({ error: "Not found." });
  sharesDb.incrementDownloadCount(uuid);
  const fileIndex = share.filePaths.indexOf(filePath);
  const displayName = share.maskFilenames
    ? maskedFilename(share.uuid, basename(filePath), fileIndex)
    : null;
  return serveFile(res, resolvedPath, displayName);
});

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

  let matchedPath = share.filePaths.find((fp) => basename(fp) === filename);
  if (!matchedPath && share.maskFilenames) {
    matchedPath = share.filePaths.find(
      (fp, i) => maskedFilename(share.uuid, basename(fp), i) === filename,
    );
  }
  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  const resolvedPath = safeResolve(matchedPath);
  if (!resolvedPath || !(await isAccessible(resolvedPath)))
    return res.status(404).json({ error: "Not found." });

  sharesDb.incrementDownloadCount(uuid);
  const fileIndex = share.filePaths.indexOf(matchedPath);
  const displayName = share.maskFilenames
    ? maskedFilename(share.uuid, basename(matchedPath), fileIndex)
    : null;
  return serveFile(res, resolvedPath, displayName);
});

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

  let matchedPath = share.filePaths.find((fp) => basename(fp) === filename);
  if (!matchedPath && share.maskFilenames) {
    matchedPath = share.filePaths.find(
      (fp, i) => maskedFilename(share.uuid, basename(fp), i) === filename,
    );
  }
  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  const resolvedPath = safeResolve(matchedPath);
  if (!resolvedPath || !(await isAccessible(resolvedPath)))
    return res.status(404).json({ error: "Not found." });

  const stat = await fsp.stat(resolvedPath);
  if (stat.size > config.previewMaxBytes) {
    return res.status(413).json({
      error: `File too large to preview (limit: ${humanSize(config.previewMaxBytes)}).`,
    });
  }

  const realName = basename(resolvedPath);
  res.set({
    "Content-Type": getMimeType(realName),
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
  });
  createReadStream(resolvedPath).pipe(res);
});

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

  const { filenames } = req.body || {};
  let targetPaths = share.filePaths;

  if (Array.isArray(filenames) && filenames.length > 0) {
    targetPaths = share.filePaths.filter((fp, i) => {
      const real = basename(fp);
      const masked = share.maskFilenames
        ? maskedFilename(share.uuid, real, i)
        : real;
      return filenames.includes(real) || filenames.includes(masked);
    });
    if (targetPaths.length === 0) {
      return res.status(400).json({
        error: "None of the requested filenames exist in this share.",
      });
    }
  }

  const resolvedPaths = [];
  for (const fp of targetPaths) {
    const resolved = safeResolve(fp);
    if (!resolved || !(await isAccessible(resolved)))
      return res.status(404).json({ error: "Not found." });
    resolvedPaths.push(resolved);
  }

  let totalSize = 0;
  for (const rp of resolvedPaths) {
    totalSize += (await fsp.stat(rp)).size;
  }

  if (totalSize > config.zipMaxBytes) {
    return res.status(400).json({
      error: `Total size (${humanSize(totalSize)}) exceeds ZIP limit (${humanSize(config.zipMaxBytes)}).`,
      code: "ZIP_SIZE_EXCEEDED",
      totalSize,
      zipMaxBytes: config.zipMaxBytes,
    });
  }

  const ttlSeconds = config.zipTtlForSize(totalSize);
  const deleteAfter = Date.now() + ttlSeconds * 1000;
  const tempFilename = `selfdrop-${uuid}-${deleteAfter}.zip`;
  const tempPath = join(config.zipTempDir, tempFilename);

  mkdirSync(config.zipTempDir, { recursive: true });

  try {
    await buildZip(resolvedPaths, tempPath, share);
  } catch (err) {
    console.error("[zip] build error:", err);
    try {
      unlinkSync(tempPath);
    } catch {}
    return res.status(500).json({ error: "Failed to create ZIP." });
  }

  sharesDb.incrementDownloadCount(uuid);

  if (
    config.sendfileMode === "stream" ||
    process.env.NODE_ENV !== "production"
  ) {
    res.set({
      "Content-Disposition": 'attachment; filename="selfdrop.zip"',
      "Content-Type": "application/zip",
    });
    const stream = createReadStream(tempPath);
    stream.pipe(res);
    stream.on("end", () => {
      try {
        unlinkSync(tempPath);
      } catch {}
    });
    return;
  }

  res.set({
    "X-Accel-Redirect": `/internal-zips/${tempFilename}`,
    "Content-Disposition": 'attachment; filename="selfdrop.zip"',
    "Content-Type": "application/zip",
  });
  res.status(200).send();
});

router.post("/:uuid/verify-password", async (req, res) => {
  const validation = sharesDb.validateShare(req.params.uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;
  if (!share.hasPassword)
    return res
      .status(400)
      .json({ error: "This share is not password protected." });
  const { password } = req.body;
  if (!password)
    return res.status(400).json({ error: "Password is required." });
  if (!(await verifySharePassword(share.uuid, password))) {
    return res.status(401).json({ valid: false, error: "Incorrect password." });
  }
  res.json({ valid: true });
});

// ── Helpers ───────────────────────────────────────────────

async function checkPassword(share, providedPassword) {
  if (!share.hasPassword) return null;
  if (!providedPassword)
    return { error: "Password required.", code: "PASSWORD_REQUIRED" };
  if (!(await verifySharePassword(share.uuid, providedPassword))) {
    return { error: "Incorrect password.", code: "PASSWORD_INCORRECT" };
  }
  return null;
}

function safeResolve(filePath) {
  try {
    return resolveSafePath(filePath);
  } catch {
    return null;
  }
}

async function isAccessible(resolvedPath) {
  try {
    await fsp.access(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

function serveFile(res, resolvedPath, displayName) {
  const realName = basename(resolvedPath);
  const serveAs = displayName || realName;
  const mimeType = getMimeType(realName);

  res.set({
    "Content-Disposition": `attachment; filename="${sanitizeFilename(serveAs)}"`,
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
  });

  if (
    config.sendfileMode === "stream" ||
    process.env.NODE_ENV !== "production"
  ) {
    const stream = createReadStream(resolvedPath);
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).end();
    });
    stream.pipe(res);
    return;
  }

  const accelPath =
    "/internal-files/" + relative(config.filesRoot, resolvedPath);
  res.set({ "X-Accel-Redirect": accelPath });
  res.removeHeader("Content-Length");
  res.status(200).end();
}

function buildZip(resolvedPaths, tempPath, share) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(tempPath);
    const archive = archiver("zip", {
      zlib: { level: config.zipCompressionLevel },
    });
    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);
    archive.pipe(output);
    for (let i = 0; i < resolvedPaths.length; i++) {
      const rp = resolvedPaths[i];
      const zipName = share.maskFilenames
        ? maskedFilename(share.uuid, basename(rp), i)
        : basename(rp);
      archive.file(rp, { name: zipName });
    }
    archive.finalize();
  });
}

async function verifySharePassword(uuid, plaintext) {
  const row = db
    .prepare("SELECT password_hash FROM shares WHERE uuid = ?")
    .get(uuid);
  if (!row?.password_hash) return false;
  return bcrypt.compare(plaintext, row.password_hash);
}

function maskedFilename(shareUuid, realFilename, index) {
  const token = shareUuid.replace(/-/g, "").slice(0, 6);
  return `sdrop-${token}-${index + 1}${extname(realFilename).toLowerCase()}`;
}

function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
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

function sanitizeFilename(filename) {
  return filename.replace(/["\\\r\n]/g, "_");
}

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

export default router;
