"use strict";

require("dotenv").config();
const path = require("path");
const os = require("os");

const FILES_ROOT = path.resolve(
  process.env.FILES_ROOT || path.join(__dirname, "..", "data", "files"),
);

const config = {
  port: parseInt(process.env.PORT || "3000", 10),

  filesRoot: FILES_ROOT,

  dbPath: path.resolve(
    process.env.DB_PATH ||
      path.join(__dirname, "..", "data", "db", "shares.db"),
  ),

  sessionSecret: process.env.SESSION_SECRET || "change-me",
  sessionMode:
    process.env.SESSION_MODE === "session" ? "session" : "persistent",

  sendfileMode: process.env.SENDFILE_MODE || "x-accel-redirect",

  // ── ZIP configuration ──────────────────────────────────
  //
  // zipMaxBytes: maximum total size of files allowed in a single ZIP.
  //   Default: 10GB. Self-hosters can tune this for their hardware.
  //
  // zipCompressionLevel: 0 = store only (no compression, minimal CPU).
  //   Files like MP3, MP4, JPEG are already compressed — no benefit to
  //   compressing again. Level 0 makes the ZIP a pure container.
  //
  // zipTempDir: where temp ZIP files are written before Nginx serves them.
  //   Must be on the same filesystem as FILES_ROOT for best performance.
  //   Defaults to OS temp dir — override in Docker to a persistent volume
  //   if you want ZIPs to survive container restarts (rarely needed).
  //
  // zipMinTtlSeconds: minimum time before a temp ZIP is eligible for cleanup.
  //   Default: 15 minutes (900 seconds).
  //
  // zipTtlSpeedBytesPs: assumed download speed for TTL calculation.
  //   Default: 5MB/s (conservative — covers slow internet connections).
  //   TTL = max(minTtl, (zipSize / speed) * 2)
  //   The 2x multiplier doubles the theoretical transfer time as safety margin.

  zipMaxBytes: parseInt(
    process.env.ZIP_MAX_BYTES || String(10 * 1024 * 1024 * 1024),
  ),
  zipCompressionLevel: parseInt(process.env.ZIP_COMPRESSION_LEVEL || "0"),
  zipTempDir:
    process.env.ZIP_TEMP_DIR || path.join(os.tmpdir(), "selfdrop-zips"),
  // Preview streaming limit — files above this size won't be previewed in-browser.
  // Node streams preview files directly (no X-Accel-Redirect), so this protects
  // Node from streaming very large files. 200MB covers most audio and short videos.
  previewMaxBytes: parseInt(
    process.env.PREVIEW_MAX_BYTES || String(200 * 1024 * 1024),
  ),

  zipMinTtlSeconds: parseInt(process.env.ZIP_MIN_TTL_SECONDS || "900"),
  zipTtlSpeedBytesPs: parseInt(
    process.env.ZIP_TTL_SPEED || String(5 * 1024 * 1024),
  ),

  /**
   * Calculates TTL for a ZIP file in seconds.
   * TTL = max(minTtl, (sizeBytes / assumedSpeed) * 2)
   *
   * @param {number} sizeBytes
   * @returns {number} TTL in seconds
   */
  zipTtlForSize(sizeBytes) {
    const theoretical = sizeBytes / this.zipTtlSpeedBytesPs;
    return Math.ceil(Math.max(this.zipMinTtlSeconds, theoretical * 2));
  },
};

module.exports = config;
