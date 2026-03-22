import { describe, test, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import {
  setupTestEnv,
  cleanupTestEnv,
  createTestFile,
  futureDate,
  pastDate,
} from "./helpers.js";

setupTestEnv();

// Force fresh module imports AFTER env vars are set — prevents stale config.filesRoot
vi.resetModules();

const request = (await import("supertest")).default;
const bcrypt = (await import("bcrypt")).default;
const app = (await import("../src/app.js")).default;
const sharesDb = await import("../src/db/shares.js");

afterAll(cleanupTestEnv);

async function createShare(overrides = {}) {
  const filePath =
    overrides.filePath || createTestFile("test.txt", "hello world");
  return sharesDb.createShare({
    uuid: randomUUID(),
    filePaths: overrides.filePaths || [`/${filePath}`],
    expiresAt: overrides.expiresAt || futureDate(24),
    downloadLimit: overrides.downloadLimit ?? null,
    passwordHash: overrides.passwordHash ?? null,
    maskFilenames: overrides.maskFilenames ?? false,
    name: overrides.name ?? null,
  });
}

async function createPasswordShare(password = "secret123") {
  return createShare({ passwordHash: await bcrypt.hash(password, 4) });
}

describe("GET /s/:uuid/info", () => {
  test("404 for unknown UUID", async () => {
    const res = await request(app).get(
      "/s/00000000-0000-0000-0000-000000000000/info",
    );
    expect(res.status).toBe(404);
  });

  test("404 for expired share", async () => {
    const share = await createShare({ expiresAt: pastDate() });
    expect((await request(app).get(`/s/${share.uuid}/info`)).status).toBe(404);
  });

  test("200 with file list for valid share", async () => {
    const share = await createShare();
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(1);
    expect(res.body.files[0].filename).toBeDefined();
  });

  test("hasPassword true for protected share", async () => {
    const share = await createPasswordShare();
    expect(
      (await request(app).get(`/s/${share.uuid}/info`)).body.hasPassword,
    ).toBe(true);
  });

  test("returns masked filenames when enabled", async () => {
    const share = await createShare({ maskFilenames: true });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.files[0].filename).toMatch(/^sdrop-/);
  });

  test("uses share name as shareTitle when set", async () => {
    const share = await createShare({ name: "Test Pack" });
    expect(
      (await request(app).get(`/s/${share.uuid}/info`)).body.shareTitle,
    ).toBe("Test Pack");
  });
});

describe("GET /s/:uuid/file/:filename", () => {
  test("404 for unknown share", async () => {
    expect(
      (
        await request(app).get(
          "/s/00000000-0000-0000-0000-000000000000/file/test.txt",
        )
      ).status,
    ).toBe(404);
  });

  test("404 for wrong filename", async () => {
    const share = await createShare();
    expect(
      (await request(app).get(`/s/${share.uuid}/file/wrong.txt`)).status,
    ).toBe(404);
  });

  test("serves file content", async () => {
    const filePath = createTestFile("dl-me.txt", "file contents here");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const res = await request(app).get(`/s/${share.uuid}/file/dl-me.txt`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("file contents here");
  });

  test("401 without password for protected share", async () => {
    const share = await createPasswordShare();
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const res = await request(app).get(
      `/s/${share.uuid}/file/${info.body.files[0].filename}`,
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PASSWORD_REQUIRED");
  });

  test("401 with wrong password", async () => {
    const share = await createPasswordShare("correct");
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const res = await request(app)
      .get(`/s/${share.uuid}/file/${info.body.files[0].filename}`)
      .set("X-Share-Password", "wrong");
    expect(res.status).toBe(401);
  });

  test("serves file with correct password", async () => {
    const filePath = createTestFile("protected.txt", "secret data");
    const hash = await bcrypt.hash("mypassword", 4);
    const share = await createShare({
      filePaths: [`/${filePath}`],
      passwordHash: hash,
    });
    const res = await request(app)
      .get(`/s/${share.uuid}/file/protected.txt`)
      .set("X-Share-Password", "mypassword");
    expect(res.status).toBe(200);
    expect(res.text).toBe("secret data");
  });

  test("accepts masked filename", async () => {
    const filePath = createTestFile("real-name.txt", "masked content");
    const share = await createShare({
      filePaths: [`/${filePath}`],
      maskFilenames: true,
    });
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const masked = info.body.files[0].filename;
    expect(masked).toMatch(/^sdrop-/);
    const res = await request(app).get(
      `/s/${share.uuid}/file/${encodeURIComponent(masked)}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("masked content");
  });
});

describe("GET /s/:uuid", () => {
  test("404 for unknown share", async () => {
    expect(
      (await request(app).get("/s/00000000-0000-0000-0000-000000000000"))
        .status,
    ).toBe(404);
  });

  test("400 for multi-file share", async () => {
    const f1 = createTestFile("f1.txt", "a");
    const f2 = createTestFile("f2.txt", "b");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      name: "Multi",
    });
    expect((await request(app).get(`/s/${share.uuid}`)).body.code).toBe(
      "MULTI_FILE_SHARE",
    );
  });

  test("serves single-file share", async () => {
    const filePath = createTestFile("single.txt", "single content");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const res = await request(app).get(`/s/${share.uuid}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("single content");
  });
});

describe("POST /s/:uuid/verify-password", () => {
  test("400 for non-protected share", async () => {
    const share = await createShare();
    expect(
      (
        await request(app)
          .post(`/s/${share.uuid}/verify-password`)
          .send({ password: "x" })
      ).status,
    ).toBe(400);
  });

  test("401 for wrong password", async () => {
    const share = await createPasswordShare("correct");
    expect(
      (
        await request(app)
          .post(`/s/${share.uuid}/verify-password`)
          .send({ password: "wrong" })
      ).status,
    ).toBe(401);
  });

  test("200 for correct password", async () => {
    const share = await createPasswordShare("mypassword");
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "mypassword" });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});

describe("POST /s/:uuid/zip", () => {
  test("404 for unknown share", async () => {
    expect(
      (
        await request(app)
          .post("/s/00000000-0000-0000-0000-000000000000/zip")
          .send({})
      ).status,
    ).toBe(404);
  });

  test("400 for nonexistent filenames", async () => {
    const share = await createShare();
    expect(
      (
        await request(app)
          .post(`/s/${share.uuid}/zip`)
          .send({ filenames: ["nonexistent.txt"] })
      ).status,
    ).toBe(400);
  });

  test("401 for password-protected share without password", async () => {
    const share = await createPasswordShare();
    expect(
      (await request(app).post(`/s/${share.uuid}/zip`).send({})).status,
    ).toBe(401);
  });

  test("builds and returns a ZIP", async () => {
    const f1 = createTestFile("zip-a.txt", "content a");
    const f2 = createTestFile("zip-b.txt", "content b");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      name: "zip test",
    });
    const res = await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ filenames: ["zip-a.txt", "zip-b.txt"] });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/zip/);
  }, 30000);
});
