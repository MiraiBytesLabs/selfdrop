"use strict";

const express = require("express");
const os = require("os");
const fs = require("fs");
const path = require("path");
const https = require("https");
const db = require("../db/index");
const { getAllSettings, saveSettings } = require("../db/settings");
const requireAuth = require("../middleware/requireAuth");
const config = require("../config");

const router = express.Router();

// All settings routes require admin auth
router.use(requireAuth);

// ── GET /api/settings ─────────────────────────────────────
// Returns all current settings merged with defaults.
router.get("/", (_req, res) => {
  try {
    res.json(getAllSettings());
  } catch (err) {
    console.error("[settings] get error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── PUT /api/settings ─────────────────────────────────────
// Updates one or more settings.
//
// Body: {
//   default_expiry_hours?:   number
//   default_download_limit?: number
//   default_mask_filenames?: boolean
//   public_url?:             string
// }
router.put("/", (req, res) => {
  const allowed = [
    "default_expiry_hours",
    "default_download_limit",
    "default_mask_filenames",
    "public_url",
  ];

  const updates = {};

  for (const key of allowed) {
    if (req.body[key] === undefined) continue;

    switch (key) {
      case "default_expiry_hours": {
        const h = parseInt(req.body[key], 10);
        if (isNaN(h) || h < 1)
          return res
            .status(400)
            .json({
              error: "default_expiry_hours must be a positive integer.",
            });
        updates[key] = String(h);
        break;
      }
      case "default_download_limit": {
        const l = parseInt(req.body[key], 10);
        if (isNaN(l) || l < 0)
          return res
            .status(400)
            .json({
              error:
                "default_download_limit must be 0 (unlimited) or a positive integer.",
            });
        updates[key] = String(l);
        break;
      }
      case "default_mask_filenames": {
        updates[key] = req.body[key] ? "1" : "0";
        break;
      }
      case "public_url": {
        const url = req.body[key]?.trim() ?? "";
        if (url && !isValidUrl(url)) {
          return res
            .status(400)
            .json({
              error:
                "public_url must be a valid URL (e.g. https://files.yourdomain.com).",
            });
        }
        // Strip trailing slash
        updates[key] = url.replace(/\/$/, "");
        break;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid settings provided." });
  }

  try {
    saveSettings(updates);
    res.json(getAllSettings());
  } catch (err) {
    console.error("[settings] save error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /api/settings/storage ─────────────────────────────
// Returns read-only storage and system information.
router.get("/storage", async (_req, res) => {
  try {
    const filesRoot = config.filesRoot;
    const dbPath = config.dbPath;
    const zipDir = config.zipTempDir;

    // Get disk usage stats where available
    const filesRootStat = await statDir(filesRoot);
    const dbStat = await statFile(dbPath);

    res.json({
      filesRoot: {
        path: filesRoot,
        exists: filesRootStat.exists,
        fileCount: filesRootStat.count,
      },
      database: {
        path: dbPath,
        exists: dbStat.exists,
        sizeHuman: dbStat.sizeHuman,
        size: dbStat.size,
      },
      zipTempDir: {
        path: zipDir,
        exists: fs.existsSync(zipDir),
        fileCount: await statDir(zipDir).then((s) => s.count),
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      },
    });
  } catch (err) {
    console.error("[settings] storage error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── POST /api/admin/revoke-all ────────────────────────────
// Deletes all active (non-expired) shares.
router.post("/revoke-all", (req, res) => {
  try {
    const now = new Date().toISOString();
    const { changes } = db
      .prepare(
        `DELETE FROM shares WHERE expires_at > ? AND download_count < COALESCE(download_limit, 999999999)`,
      )
      .run(now);
    res.json({
      message: `${changes} active share${changes !== 1 ? "s" : ""} revoked.`,
      count: changes,
    });
  } catch (err) {
    console.error("[settings] revoke-all error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── POST /api/admin/clear-expired ─────────────────────────
// Deletes all expired or limit-reached shares from the DB.
router.post("/clear-expired", (req, res) => {
  try {
    const now = new Date().toISOString();
    const { changes } = db
      .prepare(
        `
      DELETE FROM shares WHERE
        expires_at <= ? OR
        (download_limit IS NOT NULL AND download_count >= download_limit)
    `,
      )
      .run(now);
    res.json({
      message: `${changes} expired share${changes !== 1 ? "s" : ""} cleared.`,
      count: changes,
    });
  } catch (err) {
    console.error("[settings] clear-expired error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── POST /api/admin/clear-tmp ────────────────────────────
// Deletes all temp ZIP files from the ZIP temp directory.
router.post("/clear-tmp", async (req, res) => {
  try {
    const zipDir = config.zipTempDir;

    if (!fs.existsSync(zipDir)) {
      return res.json({
        message: "Temp directory is already empty.",
        count: 0,
      });
    }

    const files = await fs.promises.readdir(zipDir);
    const zips = files.filter((f) => f.endsWith(".zip"));
    let deleted = 0;

    for (const file of zips) {
      try {
        await fs.promises.unlink(path.join(zipDir, file));
        deleted++;
      } catch {
        /* skip locked/already deleted */
      }
    }

    res.json({
      message: `${deleted} temp file${deleted !== 1 ? "s" : ""} cleared.`,
      count: deleted,
    });
  } catch (err) {
    console.error("[settings] clear-tmp error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /api/settings/app-info ────────────────────────
// Returns current version and checks GitHub for latest release.
// Fetch is done server-side to avoid CORS issues.
router.get("/app-info", async (_req, res) => {
  const pkg = require("../../package.json");
  const currentVersion = pkg.version;

  let latestVersion = null;
  let latestUrl = null;
  let upToDate = null;
  let updateError = null;

  try {
    const release = await fetchGitHubRelease("MiraiBytesLabs", "selfdrop");
    latestVersion = release.tag_name?.replace(/^v/, "") ?? null;
    latestUrl = release.html_url ?? null;
    upToDate = latestVersion
      ? !isNewerVersion(latestVersion, currentVersion)
      : null;
  } catch (err) {
    updateError = err.message;
  }

  res.json({
    currentVersion,
    latestVersion,
    latestUrl,
    upToDate,
    updateError,
  });
});

// ── Helpers ───────────────────────────────────────────────

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

async function statDir(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath);
    return { exists: true, count: entries.length };
  } catch {
    return { exists: false, count: 0 };
  }
}

async function statFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return { exists: true, size: stat.size, sizeHuman: humanSize(stat.size) };
  } catch {
    return { exists: false, size: 0, sizeHuman: "0 B" };
  }
}

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Fetches the latest release from GitHub API.
 * Returns a promise resolving to the release object.
 */
function fetchGitHubRelease(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/releases/latest`,
      headers: {
        "User-Agent": "selfdrop-app",
        Accept: "application/vnd.github.v3+json",
      },
      timeout: 5000,
    };

    const req = https.get(options, (resp) => {
      if (resp.statusCode === 404) {
        return reject(new Error("No releases found."));
      }
      if (resp.statusCode !== 200) {
        return reject(new Error(`GitHub API returned ${resp.statusCode}.`));
      }

      let data = "";
      resp.on("data", (chunk) => {
        data += chunk;
      });
      resp.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse GitHub response."));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("GitHub API request timed out."));
    });
  });
}

/**
 * Returns true if `candidate` is a newer semver than `current`.
 * Simple major.minor.patch comparison — no pre-release handling.
 */
function isNewerVersion(candidate, current) {
  const parse = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(candidate);
  const [eMaj, eMin, ePat] = parse(current);
  if (cMaj !== eMaj) return cMaj > eMaj;
  if (cMin !== eMin) return cMin > eMin;
  return cPat > ePat;
}

module.exports = router;
