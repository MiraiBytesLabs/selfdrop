import { mkdirSync, mkdtempSync, rmSync, unlinkSync } from "fs";
import { writeFileSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";

let tmpFilesRoot;
let tmpDbPath;
let tmpZipDir;

/**
 * Sets env vars BEFORE any src/ modules are imported.
 * Call at the top of each test file.
 */
export function setupTestEnv() {
  const testBase = join(homedir(), ".selfdrop-test");
  mkdirSync(testBase, { recursive: true });

  tmpFilesRoot = mkdtempSync(join(testBase, "files-"));
  tmpDbPath = join(
    testBase,
    `db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  tmpZipDir = join(testBase, `zips-${Date.now()}`);

  mkdirSync(tmpZipDir, { recursive: true });

  process.env.FILES_ROOT = tmpFilesRoot;
  process.env.DB_PATH = tmpDbPath;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
  process.env.SENDFILE_MODE = "stream";
  process.env.ZIP_TEMP_DIR = tmpZipDir;
}

export function cleanupTestEnv() {
  try {
    rmSync(tmpFilesRoot, { recursive: true, force: true });
  } catch {}
  try {
    unlinkSync(tmpDbPath);
  } catch {}
  try {
    unlinkSync(tmpDbPath + "-wal");
  } catch {}
  try {
    unlinkSync(tmpDbPath + "-shm");
  } catch {}
  try {
    rmSync(tmpZipDir, { recursive: true, force: true });
  } catch {}
}

export function createTestFile(name, content = "test content", subdir = "") {
  const dir = subdir ? join(tmpFilesRoot, subdir) : tmpFilesRoot;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
  return subdir ? `${subdir}/${name}` : name;
}

export const futureDate = (hoursFromNow = 24) =>
  new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();

export const pastDate = (hoursAgo = 1) =>
  new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

export const getFilesRoot = () => tmpFilesRoot;
