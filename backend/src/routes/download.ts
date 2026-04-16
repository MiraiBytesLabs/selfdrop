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
import crypto from "crypto";

import type { Response } from "express";

export interface IFileTypes {
  [key: string]: string;
  ".pdf": string;
  ".zip": string;
  ".tar": string;
  ".gz": string;
  ".mp4": string;
  ".mkv": string;
  ".mp3": string;
  ".aac": string;
  ".wav": string;
  ".flac": string;
  ".m4a": string;
  ".png": string;
  ".jpg": string;
  ".jpeg": string;
  ".gif": string;
  ".webp": string;
  ".txt": string;
  ".md": string;
  ".json": string;
  ".csv": string;
  ".docx": string;
  ".xlsx": string;
  ".pptx": string;
}

export interface IFileDetails {
  filename: string;
  uuid: string;
  size: number;
  sizeHuman: string;
  mimeType: string;
  signedUrl?: string;
}

export interface IShareDetails {
  shareTitle: string;
  shareName: string | null;
  maskFilenames: boolean;
  fileCount: number;
  totalSize: number;
  totalSizeHuman: string;
  expiresAt: string;
  hasPassword: boolean;
  downloadLimit: number | null;
  downloadCount: number;
  zipAvailable: boolean;
  zipMaxBytes: number;
  files: IFileDetails[];
  signedUrl?: string;
}

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
        const expiry = match[1];
        if (!expiry) continue;

        if (now >= parseInt(expiry, 10)) {
          try {
            unlinkSync(join(config.zipTempDir, file));
            cleaned++;
          } catch {}
        }
      }
      if (cleaned > 0)
        console.log(`[zip-cleanup] removed ${cleaned} temp file(s)`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("[zip-cleanup] error:", err.message);
      } else {
        console.error("[zip-cleanup] error:", "Unknown Error Occurred.");
      }
    }
  },
  5 * 60 * 1000,
);

// ── Routes ────────────────────────────────────────────────

router.get("/:uuid/info", async (req, res) => {
  const validation = sharesDb.validateShare(req.params.uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;

  if (share.hasPassword) {
    return res.json({ hasPassword: true });
  } else {
    return getShareInfo(share, res);
  }
});

router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;
  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;

  if (share.files.length > 1) {
    return res.status(400).json({
      error: "This share contains multiple files. Use /zip or /file/:fileUuid.",
      code: "MULTI_FILE_SHARE",
    });
  }

  const file = share.files[0];
  if (!file?.file_path) {
    return res.status(404).json({ error: "Not found." });
  }

  const resolvedPath = safeResolve(file.file_path);
  if (!resolvedPath || !(await isAccessible(resolvedPath))) {
    return res.status(404).json({ error: "Not found." });
  }

  sharesDb.incrementDownloadCount(uuid);
  const displayName = share.maskFilenames
    ? maskedFilename(share.uuid, basename(file.file_path), 0)
    : null;

  return serveFile(res, resolvedPath, displayName);
});

router.get("/:uuid/file/:fileUuid", async (req, res) => {
  const { uuid, fileUuid } = req.params;
  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;

  const file = share.files.find((file) => file.uuid === fileUuid);

  if (!file) {
    return res.status(404).json({ error: "File not found in this share." });
  }

  let matchedPath = file.file_path;

  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  if (share.hasPassword) {
    const { expires, signature } = req.query;

    if (!expires || !signature) {
      return res.status(401).json({ error: "Invalid request." });
    }

    const isValid = verifySignedUrl(
      fileUuid,
      parseInt(expires as string),
      signature as string,
    );

    if (!isValid) {
      return res.status(401).json({ error: "Request has expired." });
    }
  }

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

router.get("/:uuid/preview/:fileUuid", async (req, res) => {
  const { uuid, fileUuid } = req.params;
  const validation = sharesDb.validateShare(uuid);
  if (!validation.valid) return res.status(404).json({ error: "Not found." });
  const { share } = validation;

  const file = share.files.find((file) => file.uuid === fileUuid);

  if (!file) {
    return res.status(404).json({ error: "File not found in this share." });
  }

  let matchedPath = file.file_path;

  if (!matchedPath)
    return res.status(404).json({ error: "File not found in this share." });

  if (share.hasPassword) {
    const { expires, signature } = req.query;

    if (!expires || !signature) {
      return res.status(401).json({ error: "Invalid request." });
    }

    const isValid = verifySignedUrl(
      fileUuid,
      parseInt(expires as string),
      signature as string,
    );

    if (!isValid) {
      return res.status(401).json({ error: "Request has expired." });
    }
  }

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

  const { uuids } = req.body || {};
  let targetFiles: sharesDb.IFileDTO[] = [];

  if (Array.isArray(uuids) && uuids.length > 0) {
    targetFiles = share.files.filter((file, i) => {
      return uuids.includes(file.uuid);
    });
    if (targetFiles.length === 0) {
      return res.status(400).json({
        error: "None of the requested files exist in this share.",
      });
    }
  }

  if (share.hasPassword) {
    const { expires, signature } = req.query;

    if (!expires || !signature) {
      return res.status(401).json({ error: "Invalid request." });
    }

    const isValid = verifySignedUrl(
      uuid,
      parseInt(expires as string),
      signature as string,
    );

    if (!isValid) {
      return res.status(401).json({ error: "Request has expired." });
    }
  }

  const resolvedPaths = [];
  for (const files of targetFiles) {
    const resolved = safeResolve(files.file_path);
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

  return getShareInfo(share, res);
});

// ── Helpers ───────────────────────────────────────────────

// async function checkPassword(share, providedPassword: string) {
//   if (!share.hasPassword) return null;
//   if (!providedPassword)
//     return { error: "Password required.", code: "PASSWORD_REQUIRED" };
//   if (!(await verifySharePassword(share.uuid, providedPassword))) {
//     return { error: "Incorrect password.", code: "PASSWORD_INCORRECT" };
//   }
//   return null;
// }

function safeResolve(filePath: string) {
  try {
    return resolveSafePath(filePath);
  } catch {
    return null;
  }
}

async function isAccessible(resolvedPath: string) {
  try {
    await fsp.access(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

function serveFile(
  res: Response,
  resolvedPath: string,
  displayName: string | null,
) {
  const realName = basename(resolvedPath);
  const serveAs = displayName || realName;
  const mimeType = getMimeType(realName);

  res.set({
    "Content-Disposition": `attachment; filename="${sanitizeFilename(serveAs)}"`,
    "Content-Type": mimeType,
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

function buildZip(
  resolvedPaths: string[],
  tempPath: string,
  share: sharesDb.IShareDTO,
) {
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

      if (!rp) continue;

      const zipName = share.maskFilenames
        ? maskedFilename(share.uuid, basename(rp), i)
        : basename(rp);
      archive.file(rp, { name: zipName });
    }
    archive.finalize();
  });
}

async function verifySharePassword(uuid: string, plaintext: string) {
  const row = db
    .prepare("SELECT password_hash FROM shares WHERE uuid = ?")
    .get(uuid) as { password_hash: string | null } | undefined;

  if (!row?.password_hash) return false;
  return bcrypt.compare(plaintext, row.password_hash);
}

function maskedFilename(
  shareUuid: string,
  realFilename: string,
  index: number,
) {
  const token = shareUuid.replace(/-/g, "").slice(0, 6);
  return `sdrop-${token}-${index + 1}${extname(realFilename).toLowerCase()}`;
}

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const types: IFileTypes = {
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

function sanitizeFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, "_");
}

function humanSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function generateSignedUrl(
  uuid: string,
  fileUuid: string,
  expiresInSeconds: number,
  isZip: boolean = false,
) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const data = isZip ? `${uuid}:${expires}` : `${fileUuid}:${expires}`;
  const signature = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(data)
    .digest("hex");

  const signedUrl = isZip
    ? `/s/${uuid}/zip?expires=${expires}&signature=${signature}`
    : `/s/${uuid}/file/${fileUuid}?expires=${expires}&signature=${signature}`;

  return signedUrl;
}

function verifySignedUrl(uuid: string, expires: number, signature: string) {
  const now = Math.floor(Date.now() / 1000);

  if (now > expires) return false;

  const data = `${uuid}:${expires}`;
  const expectedSignature = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(data)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

async function getShareInfo(share: sharesDb.IShareDTO, res: Response) {
  const files: IFileDetails[] = [];
  let totalSize = 0;

  for (const { file_path, uuid } of share.files) {
    let resolvedPath;
    try {
      resolvedPath = resolveSafePath(file_path);
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
    const displayName: string = share.maskFilenames
      ? maskedFilename(share.uuid, filename, files.length)
      : filename;

    const fileDetails: IFileDetails = {
      filename: displayName,
      // path: file_path,
      uuid: uuid,
      size: stat.size,
      sizeHuman: humanSize(stat.size),
      mimeType: getMimeType(filename),
    };

    if (share.hasPassword) {
      // signedUrl for downloading invidiual file.
      const signedUrl = generateSignedUrl(share.uuid, uuid, 300);
      fileDetails.signedUrl = signedUrl;
    }

    files.push(fileDetails);
  }

  const isSingle = files.length === 1;
  const singleFile = isSingle ? files[0] : null;
  const shareTitle =
    share.name ||
    (singleFile ? singleFile.filename : `${files.length} files`);

  const shareDetais: IShareDetails = {
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
  };

  if (share.hasPassword) {
    // signedUrl for downloading the entire share through zip.
    const signedUrl = generateSignedUrl(share.uuid, "", 300, true);
    shareDetais.signedUrl = signedUrl;
  }

  return res.json(shareDetais);
}

export default router;
