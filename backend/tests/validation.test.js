import { describe, test, expect, afterAll } from "vitest";
import {
  setupTestEnv,
  cleanupTestEnv,
  futureDate,
  pastDate,
} from "./helpers.js";

setupTestEnv();
afterAll(cleanupTestEnv);

// Inline the validation logic — it's not exported from the route
function validateCreatePayload(body) {
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

describe("validateCreatePayload — filePaths", () => {
  test("rejects missing filePaths", () =>
    expect(validateCreatePayload({ expiresAt: futureDate() }).error).toMatch(
      /filePaths/,
    ));
  test("rejects empty array", () =>
    expect(
      validateCreatePayload({ filePaths: [], expiresAt: futureDate() }).error,
    ).toMatch(/non-empty/));
  test("rejects non-array", () =>
    expect(
      validateCreatePayload({ filePaths: "f.txt", expiresAt: futureDate() })
        .error,
    ).toMatch(/filePaths/));
  test("rejects empty string in array", () =>
    expect(
      validateCreatePayload({
        filePaths: ["a.txt", ""],
        expiresAt: futureDate(),
        name: "x",
      }).error,
    ).toMatch(/non-empty string/));
  test("accepts single valid path", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/music/track.mp3"],
        expiresAt: futureDate(),
      }).data,
    ).toBeDefined());
  test("trims whitespace from paths", () =>
    expect(
      validateCreatePayload({
        filePaths: ["  /music/track.mp3  "],
        expiresAt: futureDate(),
      }).data.filePaths,
    ).toEqual(["/music/track.mp3"]));
});

describe("validateCreatePayload — name", () => {
  test("required for multi-file", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt", "/b.txt"],
        expiresAt: futureDate(),
      }).error,
    ).toMatch(/share name is required/));
  test("required non-empty for multi-file", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt", "/b.txt"],
        expiresAt: futureDate(),
        name: "   ",
      }).error,
    ).toMatch(/share name is required/));
  test("optional for single-file", () =>
    expect(
      validateCreatePayload({ filePaths: ["/a.txt"], expiresAt: futureDate() })
        .data.name,
    ).toBeNull());
  test("rejects name > 100 chars", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        name: "x".repeat(101),
      }).error,
    ).toMatch(/100 characters/));
  test("accepts name of 100 chars", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        name: "x".repeat(100),
      }).data.name,
    ).toHaveLength(100));
  test("trims name", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        name: "  Pack  ",
      }).data.name,
    ).toBe("Pack"));
});

describe("validateCreatePayload — expiresAt", () => {
  test("rejects missing", () =>
    expect(validateCreatePayload({ filePaths: ["/a.txt"] }).error).toMatch(
      /expiresAt/,
    ));
  test("rejects invalid date", () =>
    expect(
      validateCreatePayload({ filePaths: ["/a.txt"], expiresAt: "not-a-date" })
        .error,
    ).toMatch(/ISO 8601/));
  test("rejects past date", () =>
    expect(
      validateCreatePayload({ filePaths: ["/a.txt"], expiresAt: pastDate() })
        .error,
    ).toMatch(/future/));
  test("accepts future date", () =>
    expect(
      validateCreatePayload({ filePaths: ["/a.txt"], expiresAt: futureDate() })
        .data,
    ).toBeDefined());
});

describe("validateCreatePayload — downloadLimit", () => {
  test("accepts null", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        downloadLimit: null,
      }).data.downloadLimit,
    ).toBeNull());
  test("accepts positive integer", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        downloadLimit: 5,
      }).data.downloadLimit,
    ).toBe(5));
  test("rejects 0", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        downloadLimit: 0,
      }).error,
    ).toMatch(/positive integer/));
  test("rejects negative", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        downloadLimit: -1,
      }).error,
    ).toMatch(/positive integer/));
});

describe("validateCreatePayload — maskFilenames", () => {
  test("defaults to false", () =>
    expect(
      validateCreatePayload({ filePaths: ["/a.txt"], expiresAt: futureDate() })
        .data.maskFilenames,
    ).toBe(false));
  test("accepts true", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        maskFilenames: true,
      }).data.maskFilenames,
    ).toBe(true));
  test("accepts 1", () =>
    expect(
      validateCreatePayload({
        filePaths: ["/a.txt"],
        expiresAt: futureDate(),
        maskFilenames: 1,
      }).data.maskFilenames,
    ).toBe(true));
});
