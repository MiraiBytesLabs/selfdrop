import { describe, test, expect, afterAll, beforeAll } from "vitest";
import { setupTestEnv, cleanupTestEnv } from "./helpers.js";

setupTestEnv();

// Must import AFTER setupTestEnv sets env vars
const { resolveSafePath } = await import("../src/middleware/pathGuard.js");
const { default: config } = await import("../src/config.js");

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

  describe("path traversal — rejects and throws", () => {
    test("rejects traversal that escapes root", () => {
      expect(() => resolveSafePath("../../outside")).toThrow();
    });

    test("path.join behaviour: /etc/passwd treated as relative, stays inside root", () => {
      const result = resolveSafePath("/etc/passwd");
      expect(result).toContain(config.filesRoot);
    });

    test("rejects path resolving to parent via deep traversal", () => {
      expect(() =>
        resolveSafePath("../../../../../../../../../../../../etc/passwd"),
      ).toThrow();
    });

    test("thrown error has status 403", () => {
      expect(() => resolveSafePath("../../outside")).toThrowError();
      try {
        resolveSafePath("../../outside");
      } catch (err) {
        expect(err.status).toBe(403);
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
    test("thrown error has status 400 for non-string", () => {
      try {
        resolveSafePath(null);
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });
  });
});
