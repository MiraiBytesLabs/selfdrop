import { describe, test, expect, afterAll, beforeAll } from "vitest";
import { setupTestEnv, cleanupTestEnv, createTestFile } from "./helpers.js";

setupTestEnv();

// Must import AFTER setupTestEnv sets env vars
const { resolveSafePath } = await import("../src/middleware/pathGuard.js");
const { default: config } = await import("../src/config.js");

beforeAll(() => {
  createTestFile("file.txt", "hello");
  createTestFile("track.mp3", "audio", "music/album");
  createTestFile("track.mp3", "audio", "music");
  createTestFile("passwd", "not-really", "etc");
});

afterAll(cleanupTestEnv);

describe("resolveSafePath", () => {
  describe("valid paths", () => {
    test('accepts root path "/"', () => {
      expect(resolveSafePath("/")).toBe(config.filesRoot);
    });

    test("accepts a simple filename", async () => {
      const { join } = await import("path");
      expect(resolveSafePath("/file.txt")).toBe(
        join(config.filesRoot, "file.txt"),
      );
    });

    test("accepts a nested path", async () => {
      const { join } = await import("path");
      expect(resolveSafePath("/music/album/track.mp3")).toBe(
        join(config.filesRoot, "music/album/track.mp3"),
      );
    });

    test("normalises redundant dots", async () => {
      const { join } = await import("path");
      expect(resolveSafePath("/music/./track.mp3")).toBe(
        join(config.filesRoot, "music/track.mp3"),
      );
    });
  });

  describe("path traversal rejects and throws", () => {
    test("rejects traversal that escapes root", () => {
      expect(() => resolveSafePath("../../outside")).toThrow("Invalid path.");
    });

    test("treats /etc/passwd as relative to files root", async () => {
      const { join } = await import("path");
      const result = resolveSafePath("/etc/passwd");
      expect(result).toBe(join(config.filesRoot, "etc", "passwd"));
    });

    test("rejects path resolving to parent via deep traversal", () => {
      expect(() =>
        resolveSafePath("../../../../../../../../../../../../etc/passwd"),
      ).toThrow();
    });

    test("missing traversal targets return status 'Invalid path.'", () => {
      expect(() => resolveSafePath("../../outside")).toThrowError();
      try {
        resolveSafePath("../../outside");
      } catch (err) {
        expect(err.message).toBe("Invalid path.");
      }
    });

    test("traversal mixed with valid path prefix is rejected", () => {
      expect(() => resolveSafePath("/music/../../../etc/passwd")).toThrow();
    });
  });

  describe("type validation", () => {
    test("rejects null", () => {
      expect(() => resolveSafePath(null)).toThrow();
    });

    test("rejects undefined", () => {
      expect(() => resolveSafePath(undefined)).toThrow();
    });

    test("rejects number", () => {
      expect(() => resolveSafePath(42)).toThrow();
    });

    test("thrown error has status 'Path must be a string.' for non-string", () => {
      try {
        resolveSafePath(null);
      } catch (err) {
        expect(err.message).toBe("Path must be a string.");
      }
    });

    test("rejects null bytes", () => {
      expect(() => resolveSafePath("/file.txt\0evil")).toThrow("Invalid path.");
    });
  });
});
