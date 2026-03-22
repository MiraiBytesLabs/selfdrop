import { describe, test, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import {
  setupTestEnv,
  cleanupTestEnv,
  futureDate,
  pastDate,
} from "./helpers.js";

setupTestEnv();

const sharesDb = await import("../src/db/shares.js");

afterAll(cleanupTestEnv);

function makeShare(overrides = {}) {
  return sharesDb.createShare({
    uuid: randomUUID(),
    filePaths: ["/test-file.txt"],
    expiresAt: futureDate(24),
    downloadLimit: null,
    passwordHash: null,
    maskFilenames: false,
    name: null,
    ...overrides,
  });
}

describe("createShare", () => {
  test("creates and returns share with filePaths", () => {
    const share = makeShare();
    expect(share.uuid).toBeDefined();
    expect(share.filePaths).toEqual(["/test-file.txt"]);
  });

  test("creates multi-file share", () => {
    expect(
      makeShare({ filePaths: ["/a.txt", "/b.txt"] }).filePaths,
    ).toHaveLength(2);
  });

  test("hasPassword is false when no hash", () => {
    expect(makeShare().hasPassword).toBe(false);
  });

  test("hasPassword is true when hash provided", () => {
    expect(makeShare({ passwordHash: "$2b$10$fakehash" }).hasPassword).toBe(
      true,
    );
  });

  test("stores maskFilenames correctly", () => {
    expect(makeShare({ maskFilenames: true }).maskFilenames).toBe(true);
    expect(makeShare({ maskFilenames: false }).maskFilenames).toBe(false);
  });

  test("stores share name", () => {
    expect(makeShare({ name: "My Pack" }).name).toBe("My Pack");
  });

  test("download_count starts at 0", () => {
    expect(makeShare().download_count).toBe(0);
  });

  test("filePaths returned in insertion order", () => {
    const paths = ["/c.mp3", "/a.pdf", "/b.jpg"];
    expect(makeShare({ filePaths: paths }).filePaths).toEqual(paths);
  });
});

describe("validateShare", () => {
  test("valid for active share", () => {
    const share = makeShare();
    expect(sharesDb.validateShare(share.uuid).valid).toBe(true);
  });

  test("not_found for unknown UUID", () => {
    expect(
      sharesDb.validateShare("00000000-0000-0000-0000-000000000000").reason,
    ).toBe("not_found");
  });

  test("expired for past expiresAt", () => {
    expect(
      sharesDb.validateShare(makeShare({ expiresAt: pastDate() }).uuid).reason,
    ).toBe("expired");
  });

  test("limit_reached when count >= limit", () => {
    const share = makeShare({ downloadLimit: 2 });
    sharesDb.incrementDownloadCount(share.uuid);
    sharesDb.incrementDownloadCount(share.uuid);
    expect(sharesDb.validateShare(share.uuid).reason).toBe("limit_reached");
  });

  test("still valid when count below limit", () => {
    const share = makeShare({ downloadLimit: 3 });
    sharesDb.incrementDownloadCount(share.uuid);
    expect(sharesDb.validateShare(share.uuid).valid).toBe(true);
  });

  test("unlimited when downloadLimit is null", () => {
    const share = makeShare({ downloadLimit: null });
    for (let i = 0; i < 100; i++) sharesDb.incrementDownloadCount(share.uuid);
    expect(sharesDb.validateShare(share.uuid).valid).toBe(true);
  });
});

describe("deleteShare", () => {
  test("returns true when deleted", () => {
    expect(sharesDb.deleteShare(makeShare().uuid)).toBe(true);
  });

  test("returns false for unknown UUID", () => {
    expect(sharesDb.deleteShare("00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });

  test("share not findable after deletion", () => {
    const share = makeShare();
    sharesDb.deleteShare(share.uuid);
    expect(sharesDb.getShareByUuid(share.uuid)).toBeNull();
  });
});
