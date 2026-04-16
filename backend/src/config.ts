import { config as loadEnv } from "dotenv";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

loadEnv();

export interface IConfig {
  port: number;
  filesRoot: string;
  dbPath: string;
  sessionSecret: string;
  sessionMode: string;
  sendfileMode: string;
  zipMaxBytes: number;
  zipCompressionLevel: number;
  zipTempDir: string;
  zipMinTtlSeconds: number;
  zipTtlSpeedBytesPs: number;
  previewMaxBytes: number;
  zipTtlForSize(sizeBytes: number): number;
}

const __dirname: string = dirname(fileURLToPath(import.meta.url));

const FILES_ROOT: string = resolve(
  process.env.FILES_ROOT || join(__dirname, "..", "data", "files"),
);

const config: IConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  filesRoot: FILES_ROOT,
  dbPath: resolve(
    process.env.DB_PATH || join(__dirname, "..", "data", "db", "shares.db"),
  ),
  sessionSecret: process.env.SESSION_SECRET || "change-me",
  sessionMode:
    process.env.SESSION_MODE === "session" ? "session" : "persistent",
  sendfileMode: process.env.SENDFILE_MODE || "x-accel-redirect",

  zipMaxBytes: parseInt(
    process.env.ZIP_MAX_BYTES || String(10 * 1024 * 1024 * 1024),
  ),
  zipCompressionLevel: parseInt(process.env.ZIP_COMPRESSION_LEVEL || "0"),
  zipTempDir: process.env.ZIP_TEMP_DIR || join(tmpdir(), "selfdrop-zips"),
  zipMinTtlSeconds: parseInt(process.env.ZIP_MIN_TTL_SECONDS || "900"),
  zipTtlSpeedBytesPs: parseInt(
    process.env.ZIP_TTL_SPEED || String(5 * 1024 * 1024),
  ),

  previewMaxBytes: parseInt(
    process.env.PREVIEW_MAX_BYTES || String(200 * 1024 * 1024),
  ),

  zipTtlForSize(sizeBytes: number) {
    const theoretical = sizeBytes / this.zipTtlSpeedBytesPs;
    return Math.ceil(Math.max(this.zipMinTtlSeconds, theoretical * 2));
  },
};

export default config;
