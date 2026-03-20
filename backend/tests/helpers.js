"use strict";

/**
 * Shared test helpers.
 *
 * IMPORTANT: Call setupTestEnv() at the very top of each test file,
 * BEFORE requiring any src/ modules. config.js reads env vars at load time.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");

let tmpFilesRoot;
let tmpDbPath;

/**
 * Sets up isolated env for a test file.
 * Must be called before any src/ require().
 */
function setupTestEnv() {
  // Use a dedicated test directory under $HOME, not /tmp,
  // so path traversal tests can reliably escape to /tmp without
  // being inside FILES_ROOT themselves.
  const testBase = path.join(os.homedir(), ".selfdrop-test");
  fs.mkdirSync(testBase, { recursive: true });

  tmpFilesRoot = fs.mkdtempSync(path.join(testBase, "files-"));
  tmpDbPath = path.join(
    testBase,
    `db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  process.env.FILES_ROOT = tmpFilesRoot;
  process.env.DB_PATH = tmpDbPath;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
  process.env.SENDFILE_MODE = "stream";
  process.env.ZIP_TEMP_DIR = path.join(testBase, "zips");

  fs.mkdirSync(process.env.ZIP_TEMP_DIR, { recursive: true });
}

/**
 * Cleans up temp files after tests.
 */
function cleanupTestEnv() {
  try {
    fs.rmSync(tmpFilesRoot, { recursive: true, force: true });
  } catch {}
  try {
    fs.unlinkSync(tmpDbPath);
  } catch {}
  try {
    fs.unlinkSync(tmpDbPath + "-wal");
  } catch {}
  try {
    fs.unlinkSync(tmpDbPath + "-shm");
  } catch {}
  try {
    fs.rmSync(process.env.ZIP_TEMP_DIR, { recursive: true, force: true });
  } catch {}
}

/**
 * Creates a temp file inside FILES_ROOT and returns its relative path.
 */
function createTestFile(name, content = "test content", subdir = "") {
  const dir = subdir ? path.join(tmpFilesRoot, subdir) : tmpFilesRoot;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);

  return subdir ? `${subdir}/${name}` : name;
}

/** Returns a future ISO date (default: 24h from now) */
function futureDate(hoursFromNow = 24) {
  return new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();
}

/** Returns a past ISO date */
function pastDate(hoursAgo = 1) {
  return new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
}

module.exports = {
  setupTestEnv,
  cleanupTestEnv,
  createTestFile,
  futureDate,
  pastDate,
  get filesRoot() {
    return tmpFilesRoot;
  },
};
