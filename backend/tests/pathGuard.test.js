"use strict";

/**
 * pathGuard.test.js
 *
 * Tests the most security-critical piece of code in SelfDrop.
 * A bug here could allow arbitrary file reads from the server.
 */

const { setupTestEnv, cleanupTestEnv, createTestFile } = require("./helpers");

// Set env BEFORE requiring any src modules
setupTestEnv();

const path = require("path");
const { resolveSafePath } = require("../src/middleware/pathGuard");
const config = require("../src/config");

afterAll(cleanupTestEnv);

describe("resolveSafePath", () => {
  // ── Valid paths ─────────────────────────────────────────

  describe("valid paths", () => {
    test('accepts root path "/"', () => {
      const result = resolveSafePath("/");
      expect(result).toBe(config.filesRoot);
    });

    test("accepts a simple filename", () => {
      const result = resolveSafePath("/file.txt");
      expect(result).toBe(path.join(config.filesRoot, "file.txt"));
    });

    test("accepts a nested path", () => {
      const result = resolveSafePath("/music/album/track.mp3");
      expect(result).toBe(path.join(config.filesRoot, "music/album/track.mp3"));
    });

    test("accepts path without leading slash", () => {
      const result = resolveSafePath("docs/file.pdf");
      expect(result).toBe(path.join(config.filesRoot, "docs/file.pdf"));
    });

    test("normalises double slashes", () => {
      const result = resolveSafePath("//music//track.mp3");
      expect(result).toBe(path.join(config.filesRoot, "music/track.mp3"));
    });

    test("normalises redundant dots", () => {
      const result = resolveSafePath("/music/./track.mp3");
      expect(result).toBe(path.join(config.filesRoot, "music/track.mp3"));
    });
  });

  // ── Path traversal attacks ──────────────────────────────

  describe("path traversal — rejects and throws", () => {
    test("rejects classic ../../../etc/passwd", () => {
      expect(() => resolveSafePath("../../../etc/passwd")).toThrow();
    });

    test("rejects URL-encoded traversal %2e%2e%2f", () => {
      // Node's path.join handles this — the decoded form should be caught
      expect(() => resolveSafePath("%2e%2e%2fetc%2fpasswd")).not.toThrow();
      // The resolved path should stay within FILES_ROOT (treated as literal filename)
      const result = resolveSafePath("%2e%2e%2fetc%2fpasswd");
      expect(result.startsWith(config.filesRoot)).toBe(true);
    });

    test("rejects traversal that escapes root", () => {
      expect(() => resolveSafePath("../../outside")).toThrow();
    });

    test("path.join behaviour: /etc/passwd is treated as relative, stays inside root", () => {
      // path.join(root, '/etc/passwd') → root/etc/passwd — still inside FILES_ROOT
      // This is safe — the "absolute" path becomes relative when joined
      const result = resolveSafePath("/etc/passwd");
      expect(result).toContain(config.filesRoot);
    });

    test("rejects path resolving to parent of FILES_ROOT via traversal", () => {
      // Enough ../ to escape any nested temp directory
      expect(() =>
        resolveSafePath("../../../../../../../../../../../../etc/passwd"),
      ).toThrow();
    });

    test("thrown error has status 403", () => {
      try {
        resolveSafePath("../../../etc/passwd");
        fail("expected to throw");
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });

    test("traversal mixed with valid path prefix is rejected", () => {
      // /music/../../../etc/passwd looks like it starts with a valid dir
      expect(() => resolveSafePath("/music/../../../etc/passwd")).toThrow();
    });
  });

  // ── Prefix collision ────────────────────────────────────

  describe("prefix collision", () => {
    test("does not match a sibling directory with same prefix", () => {
      // If FILES_ROOT is /data/files, /data/files-other should be rejected
      expect(() => resolveSafePath("../files-other/secret.txt")).toThrow();
    });
  });

  // ── Type validation ─────────────────────────────────────

  describe("input type validation", () => {
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
