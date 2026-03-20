"use strict";

/**
 * download.test.js
 *
 * Integration tests for the public download endpoints via supertest.
 * Tests share info, file downloads, password protection,
 * ZIP building, preview, and masked filenames.
 */

const {
  setupTestEnv,
  cleanupTestEnv,
  createTestFile,
  futureDate,
  pastDate,
} = require("./helpers");
setupTestEnv();

const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../src/app");
const sharesDb = require("../src/db/shares");

afterAll(cleanupTestEnv);

// ── Helpers ───────────────────────────────────────────────

async function createShare(overrides = {}) {
  const filePath =
    overrides.filePath || createTestFile("test.txt", "hello world");
  return sharesDb.createShare({
    uuid: require("crypto").randomUUID(),
    filePaths: overrides.filePaths || [`/${filePath}`],
    expiresAt: overrides.expiresAt || futureDate(24),
    downloadLimit: overrides.downloadLimit ?? null,
    passwordHash: overrides.passwordHash ?? null,
    maskFilenames: overrides.maskFilenames ?? false,
    name: overrides.name ?? null,
  });
}

async function createPasswordShare(password = "secret123") {
  const hash = await bcrypt.hash(password, 4); // low rounds for test speed
  return createShare({ passwordHash: hash });
}

// ── GET /s/:uuid/info ─────────────────────────────────────

describe("GET /s/:uuid/info", () => {
  test("returns 404 for unknown UUID", async () => {
    const res = await request(app).get(
      "/s/00000000-0000-0000-0000-000000000000/info",
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 for expired share", async () => {
    const share = await createShare({ expiresAt: pastDate(1) });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.status).toBe(404);
  });

  test("returns share info for valid share", async () => {
    const share = await createShare();
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(1);
    expect(res.body.hasPassword).toBe(false);
  });

  test("returns hasPassword true for protected share", async () => {
    const share = await createPasswordShare();
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.status).toBe(200);
    expect(res.body.hasPassword).toBe(true);
  });

  test("returns file list with filename and size", async () => {
    const share = await createShare();
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].filename).toBeDefined();
    expect(res.body.files[0].size).toBeGreaterThan(0);
    expect(res.body.files[0].sizeHuman).toBeDefined();
  });

  test("returns masked filenames when maskFilenames is true", async () => {
    const share = await createShare({ maskFilenames: true });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.files[0].filename).toMatch(/^sdrop-/);
  });

  test("returns real filenames when maskFilenames is false", async () => {
    const share = await createShare({ maskFilenames: false });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.files[0].filename).toBe("test.txt");
  });

  test("returns zipAvailable true when under ZIP limit", async () => {
    const share = await createShare();
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.zipAvailable).toBe(true);
  });

  test("returns share name when set", async () => {
    const share = await createShare({ name: "My Test Share" });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.shareTitle).toBe("My Test Share");
  });

  test("uses filename as shareTitle for unnamed single-file share", async () => {
    const share = await createShare({ name: null });
    const res = await request(app).get(`/s/${share.uuid}/info`);
    expect(res.body.shareTitle).toBe("test.txt");
  });
});

// ── GET /s/:uuid/file/:filename ───────────────────────────

describe("GET /s/:uuid/file/:filename", () => {
  test("returns 404 for unknown share", async () => {
    const res = await request(app).get(
      "/s/00000000-0000-0000-0000-000000000000/file/test.txt",
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 for wrong filename", async () => {
    const share = await createShare();
    const res = await request(app).get(`/s/${share.uuid}/file/wrong.txt`);
    expect(res.status).toBe(404);
  });

  test("returns file content for valid request", async () => {
    const filePath = createTestFile("download-me.txt", "file contents here");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const res = await request(app).get(`/s/${share.uuid}/file/download-me.txt`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("file contents here");
  });

  test("returns 401 without password for protected share", async () => {
    const share = await createPasswordShare();
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const fname = info.body.files[0].filename;
    const res = await request(app).get(`/s/${share.uuid}/file/${fname}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PASSWORD_REQUIRED");
  });

  test("returns 401 with wrong password", async () => {
    const share = await createPasswordShare("correct-password");
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const fname = info.body.files[0].filename;
    const res = await request(app)
      .get(`/s/${share.uuid}/file/${fname}`)
      .set("X-Share-Password", "wrong-password");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PASSWORD_INCORRECT");
  });

  test("returns file with correct password", async () => {
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

  test("accepts masked filename for masked share", async () => {
    const filePath = createTestFile("real-name.txt", "masked content");
    const share = await createShare({
      filePaths: [`/${filePath}`],
      maskFilenames: true,
    });
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const maskedName = info.body.files[0].filename;

    expect(maskedName).toMatch(/^sdrop-/);

    const res = await request(app).get(
      `/s/${share.uuid}/file/${encodeURIComponent(maskedName)}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("masked content");
  });

  test("returns 404 for expired share", async () => {
    const share = await createShare({ expiresAt: pastDate(1) });
    const res = await request(app).get(`/s/${share.uuid}/file/test.txt`);
    expect(res.status).toBe(404);
  });
});

// ── GET /s/:uuid (single-file download) ──────────────────

describe("GET /s/:uuid", () => {
  test("returns 404 for unknown share", async () => {
    const res = await request(app).get(
      "/s/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  test("returns 400 for multi-file share (must use /file/:name)", async () => {
    const f1 = createTestFile("file1.txt", "a");
    const f2 = createTestFile("file2.txt", "b");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      name: "Multi",
    });
    const res = await request(app).get(`/s/${share.uuid}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MULTI_FILE_SHARE");
  });

  test("serves single-file share", async () => {
    const filePath = createTestFile("single.txt", "single file content");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const res = await request(app).get(`/s/${share.uuid}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("single file content");
  });
});

// ── POST /s/:uuid/verify-password ────────────────────────

describe("POST /s/:uuid/verify-password", () => {
  test("returns 400 for non-password-protected share", async () => {
    const share = await createShare();
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "anything" });
    expect(res.status).toBe(400);
  });

  test("returns 401 for wrong password", async () => {
    const share = await createPasswordShare("correct");
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });

  test("returns 200 for correct password", async () => {
    const share = await createPasswordShare("mypassword");
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "mypassword" });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test("returns 404 for unknown share", async () => {
    const res = await request(app)
      .post("/s/00000000-0000-0000-0000-000000000000/verify-password")
      .send({ password: "test" });
    expect(res.status).toBe(404);
  });
});

// ── GET /s/:uuid/preview/:filename ────────────────────────

describe("GET /s/:uuid/preview/:filename", () => {
  test("returns 404 for unknown share", async () => {
    const res = await request(app).get(
      "/s/00000000-0000-0000-0000-000000000000/preview/file.txt",
    );
    expect(res.status).toBe(404);
  });

  test("streams file content for valid request", async () => {
    const filePath = createTestFile("preview.txt", "preview content");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const res = await request(app).get(`/s/${share.uuid}/preview/preview.txt`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("preview content");
  });

  test("returns 401 for password-protected share without password", async () => {
    const share = await createPasswordShare();
    const info = await request(app).get(`/s/${share.uuid}/info`);
    const fname = info.body.files[0].filename;
    const res = await request(app).get(`/s/${share.uuid}/preview/${fname}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /s/:uuid/zip ─────────────────────────────────────

describe("POST /s/:uuid/zip", () => {
  test("returns 404 for unknown share", async () => {
    const res = await request(app)
      .post("/s/00000000-0000-0000-0000-000000000000/zip")
      .send({});
    expect(res.status).toBe(404);
  });

  test("returns 400 when requested filenames not in share", async () => {
    const share = await createShare();
    const res = await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ filenames: ["nonexistent.txt"] });
    expect(res.status).toBe(400);
  });

  test("returns 401 for password-protected share without password", async () => {
    const share = await createPasswordShare();
    const res = await request(app).post(`/s/${share.uuid}/zip`).send({});
    expect(res.status).toBe(401);
  });

  test("returns 404 for expired share", async () => {
    const f = createTestFile("exp-zip.txt", "x");
    const share = await createShare({
      expiresAt: pastDate(1),
      filePaths: [`/${f}`],
    });
    const res = await request(app).post(`/s/${share.uuid}/zip`).send({});
    expect(res.status).toBe(404);
  });

  test("builds and returns a ZIP for a multi-file share", async () => {
    const f1 = createTestFile("zip-a.txt", "content a");
    const f2 = createTestFile("zip-b.txt", "content b");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      name: "zip test",
    });

    const res = await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ filenames: ["zip-a.txt", "zip-b.txt"] })
      .timeout(30000);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/zip/);
    expect(res.headers["content-disposition"]).toMatch(/selfdrop\.zip/);
  }, 30000);

  test("uses masked names in ZIP when maskFilenames is true", async () => {
    const f1 = createTestFile("real-a.txt", "a content");
    const f2 = createTestFile("real-b.txt", "b content");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      maskFilenames: true,
      name: "masked zip",
    });

    const info = await request(app).get(`/s/${share.uuid}/info`);
    const maskedNames = info.body.files.map((f) => f.filename);

    const res = await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ filenames: maskedNames })
      .timeout(30000);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/zip/);
  }, 30000);

  test("increments download count after successful ZIP", async () => {
    const f1 = createTestFile("count-a.txt", "a");
    const f2 = createTestFile("count-b.txt", "b");
    const share = await createShare({
      filePaths: [`/${f1}`, `/${f2}`],
      name: "count test",
    });

    const before = sharesDb.getShareByUuid(share.uuid).download_count;
    await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ filenames: ["count-a.txt", "count-b.txt"] })
      .timeout(30000);
    const after = sharesDb.getShareByUuid(share.uuid).download_count;

    expect(after).toBe(before + 1);
  }, 30000);
});
