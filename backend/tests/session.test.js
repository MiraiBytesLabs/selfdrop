import { describe, test, expect, afterAll } from "vitest";
import { setupTestEnv, cleanupTestEnv } from "./helpers.js";

setupTestEnv();

const { signToken, verifyToken } = await import("../src/utils/session.js");

afterAll(cleanupTestEnv);

describe("signToken", () => {
  test("returns a three-part dot-separated string", () => {
    expect(signToken({ sub: "admin" }).split(".")).toHaveLength(3);
  });

  test("embeds the payload sub claim", () => {
    expect(verifyToken(signToken({ sub: "admin" })).sub).toBe("admin");
  });

  test("adds iat claim automatically", () => {
    const before = Math.floor(Date.now() / 1000);
    const claims = verifyToken(signToken({ sub: "admin" }));
    expect(claims.iat).toBeGreaterThanOrEqual(before);
  });

  test("adds exp claim when expiresInSeconds is provided", () => {
    const claims = verifyToken(
      signToken({ sub: "admin" }, { expiresInSeconds: 3600 }),
    );
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test("does not add exp when expiresInSeconds is omitted", () => {
    expect(verifyToken(signToken({ sub: "admin" })).exp).toBeUndefined();
  });
});

describe("verifyToken", () => {
  test("returns claims for a valid token", () => {
    const claims = verifyToken(signToken({ sub: "admin", role: "admin" }));
    expect(claims.sub).toBe("admin");
  });

  test("throws for empty string", () => {
    expect(() => verifyToken("")).toThrow();
  });
  test("throws for null", () => {
    expect(() => verifyToken(null)).toThrow();
  });
  test("throws for token with wrong part count", () => {
    expect(() => verifyToken("a.b")).toThrow();
    expect(() => verifyToken("a.b.c.d")).toThrow();
  });

  test("throws with status 'Invalid token signature.'", () => {
    try {
      verifyToken("invalid.token.here");
    } catch (err) {
      expect(err.message).toBe("Invalid token signature.");
    }
  });

  test("throws for tampered payload", () => {
    const parts = signToken({ sub: "admin" }).split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ sub: "hacker", iat: 999 }),
    ).toString("base64url");
    expect(() => verifyToken(parts.join("."))).toThrow(
      "Invalid token signature.",
    );
  });

  test("throws for expired token", () => {
    expect(() =>
      verifyToken(signToken({ sub: "admin" }, { expiresInSeconds: -1 })),
    ).toThrow("Token has expired.");
  });
});
