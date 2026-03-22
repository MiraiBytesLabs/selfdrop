import { describe, test, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import request from "supertest";
import {
  setupTestEnv,
  cleanupTestEnv,
  createTestFile,
  futureDate,
  pastDate,
} from "./helpers.js";

setupTestEnv();

// Force fresh module registry so config.js re-reads env vars set above
vi.resetModules();

const app = (await import("../src/app.js")).default;
const sharesDb = await import("../src/db/shares.js");
const { signToken } = await import("../src/utils/session.js");

afterAll(cleanupTestEnv);

const authHeader = () => ({
  Authorization: `Bearer ${signToken({ sub: "admin" })}`,
});

function makeShare(overrides = {}) {
  return sharesDb.createShare({
    uuid: randomUUID(),
    filePaths: ["/f.txt"],
    expiresAt: futureDate(24),
    downloadLimit: null,
    passwordHash: null,
    maskFilenames: false,
    name: null,
    ...overrides,
  });
}

describe("GET /api/settings", () => {
  test("401 without auth", async () => {
    expect((await request(app).get("/api/settings")).status).toBe(401);
  });

  test("returns settings with defaults", async () => {
    const res = await request(app).get("/api/settings").set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.default_expiry_hours).toBeDefined();
    expect(res.body.public_url).toBeDefined();
  });
});

describe("PUT /api/settings", () => {
  test("401 without auth", async () => {
    expect(
      (
        await request(app)
          .put("/api/settings")
          .send({ public_url: "https://x.com" })
      ).status,
    ).toBe(401);
  });

  test("saves default_expiry_hours", async () => {
    const res = await request(app)
      .put("/api/settings")
      .set(authHeader())
      .send({ default_expiry_hours: 72 });
    expect(res.status).toBe(200);
    expect(res.body.default_expiry_hours).toBe("72");
  });

  test("strips trailing slash from public_url", async () => {
    const res = await request(app)
      .put("/api/settings")
      .set(authHeader())
      .send({ public_url: "https://files.example.com/" });
    expect(res.body.public_url).toBe("https://files.example.com");
  });

  test("rejects invalid public_url", async () => {
    expect(
      (
        await request(app)
          .put("/api/settings")
          .set(authHeader())
          .send({ public_url: "not-a-url" })
      ).status,
    ).toBe(400);
  });

  test("rejects negative default_expiry_hours", async () => {
    expect(
      (
        await request(app)
          .put("/api/settings")
          .set(authHeader())
          .send({ default_expiry_hours: -1 })
      ).status,
    ).toBe(400);
  });

  test("400 when no valid settings provided", async () => {
    expect(
      (
        await request(app)
          .put("/api/settings")
          .set(authHeader())
          .send({ unknown: "x" })
      ).status,
    ).toBe(400);
  });
});

describe("GET /api/settings/storage", () => {
  test("401 without auth", async () => {
    expect((await request(app).get("/api/settings/storage")).status).toBe(401);
  });

  test("returns storage info", async () => {
    const res = await request(app)
      .get("/api/settings/storage")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.filesRoot).toBeDefined();
    expect(res.body.system.nodeVersion).toBe(process.version);
  });
});

describe("POST /api/admin/revoke-all", () => {
  test("401 without auth", async () => {
    expect((await request(app).post("/api/admin/revoke-all")).status).toBe(401);
  });

  test("revokes active shares and returns count", async () => {
    makeShare();
    makeShare();
    const res = await request(app)
      .post("/api/admin/revoke-all")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/admin/clear-expired", () => {
  test("401 without auth", async () => {
    expect((await request(app).post("/api/admin/clear-expired")).status).toBe(
      401,
    );
  });

  test("clears expired shares", async () => {
    const f = createTestFile("exp.txt", "x");
    sharesDb.createShare({
      uuid: randomUUID(),
      filePaths: [`/${f}`],
      expiresAt: pastDate(2),
      downloadLimit: null,
      passwordHash: null,
      maskFilenames: false,
      name: null,
    });
    const res = await request(app)
      .post("/api/admin/clear-expired")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  test("does not remove active shares", async () => {
    const f = createTestFile("active.txt", "safe");
    const share = makeShare({ filePaths: [`/${f}`] });
    await request(app).post("/api/admin/clear-expired").set(authHeader());
    expect(sharesDb.validateShare(share.uuid).valid).toBe(true);
  });
});
