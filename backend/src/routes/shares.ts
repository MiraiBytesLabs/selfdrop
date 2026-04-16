import { Router } from "express";
import { statSync } from "fs";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/token.js";
import { resolveSafePath } from "../middleware/pathGuard.js";
import * as sharesDb from "../db/shares.js";

export interface IPayloadBody {
  filePaths: string;
  expiresAt: string;
  downloadLimit: string;
  password: string;
  maskFilenames: boolean | number;
  name: string;
}

const router = Router();
const BCRYPT_ROUNDS = 10;

// ── Helpers ───────────────────────────────────────────────

function validateCreatePayload(body: IPayloadBody) {
  const { filePaths, expiresAt, downloadLimit, password, maskFilenames, name } =
    body;

  if (!Array.isArray(filePaths) || filePaths.length === 0)
    return { error: "filePaths must be a non-empty array." };

  if (filePaths.some((p) => typeof p !== "string" || p.trim() === ""))
    return { error: "Each filePath must be a non-empty string." };

  if (filePaths.length > 1 && (!name || !name.trim()))
    return { error: "A share name is required when sharing multiple files." };

  if (name && name.trim().length > 100)
    return { error: "Share name must be 100 characters or fewer." };

  if (!expiresAt || isNaN(Date.parse(expiresAt)))
    return { error: "expiresAt must be a valid ISO 8601 date string." };

  if (new Date(expiresAt) <= new Date())
    return { error: "expiresAt must be in the future." };

  if (downloadLimit !== undefined && downloadLimit !== null) {
    const limit = parseInt(downloadLimit, 10);
    if (isNaN(limit) || limit < 1)
      return { error: "downloadLimit must be a positive integer or null." };
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

function verifyFilePaths(filePaths: string[]) {
  for (const filePath of filePaths) {
    let resolved;
    try {
      resolved = resolveSafePath(filePath);
    } catch (err) {
      if (err instanceof Error) {
        return err.message;
      } else {
        return "Unknown Error Occurred.";
      }
    }
    try {
      const stat = statSync(resolved);
      if (stat.isDirectory())
        return `Path is a directory, not a file: ${filePath}`;
    } catch {
      return `File not found: ${filePath}`;
    }
  }
  return null;
}

function formatShare(share: sharesDb.IShareDTO) {
  const now = new Date();
  const isExpired = now > new Date(share.expires_at);
  const isLimitReached =
    share.download_limit !== null &&
    share.download_count >= share.download_limit;
  return {
    uuid: share.uuid,
    shareUrl: `/s/${share.uuid}`,
    filePaths: share.filePaths,
    files: share.files,
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

router.post("/", async (req, res) => {
  const { error, data } = validateCreatePayload(req.body);
  if (error) return res.status(400).json({ error });

  if (!data) return res.status(400).json({ error: "Unknown Error Occured." });

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
    }) as sharesDb.IShareDTO;
    res.status(201).json(formatShare(share));
  } catch (err) {
    console.error("[shares] create error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/", (_req, res) => {
  try {
    res.json({ shares: sharesDb.listShares().map(formatShare) });
  } catch (err) {
    console.error("[shares] list error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

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

router.delete("/:uuid", (req, res) => {
  try {
    if (!sharesDb.deleteShare(req.params.uuid))
      return res.status(404).json({ error: "Share not found." });
    res.json({ message: "Share revoked." });
  } catch (err) {
    console.error("[shares] delete error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
