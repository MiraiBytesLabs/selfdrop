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

async function getShareInfo(uuid) {
  const res = await request(app).get(`/s/${uuid}/info`);
  expect(res.status).toBe(200);
  return res.body;
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

describe("GET /s/:uuid/file/:fileUuid", () => {
  test("404 for unknown share", async () => {
    expect(
      (
        await request(app).get(
          "/s/00000000-0000-0000-0000-000000000000/file/00000000-0000-0000-0000-000000000000",
        )
      ).status,
    ).toBe(404);
  });

  test("404 for wrong file UUID", async () => {
    const share = await createShare();
    expect(
      (
        await request(app).get(
          `/s/${share.uuid}/file/00000000-0000-0000-0000-000000000000`,
        )
      ).status,
    ).toBe(404);
  });

  test("serves file content", async () => {
    const filePath = createTestFile("dl-me.txt", "file contents here");
    const share = await createShare({ filePaths: [`/${filePath}`] });
    const info = await getShareInfo(share.uuid);
    const fileUuid = info.files[0].uuid;
    const res = await request(app).get(`/s/${share.uuid}/file/${fileUuid}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("file contents here");
  });

  test("401 without password for protected share", async () => {
    const filePath = createTestFile("test.txt", "hello world");
    const protectedShare = await createShare({
      filePaths: [`/${filePath}`],
      passwordHash: await bcrypt.hash("secret123", 4),
    });
    const verifyRes = await request(app)
      .post(`/s/${protectedShare.uuid}/verify-password`)
      .send({ password: "secret123" });
    expect(verifyRes.status).toBe(200);
    const fileUuid = verifyRes.body.files[0].uuid;

    const res = await request(app).get(
      `/s/${protectedShare.uuid}/file/${fileUuid}`,
    );
    expect(res.status).toBe(401);
  });

  test("401 with wrong password", async () => {
    const share = await createPasswordShare("correct");
    // verify-password with wrong password returns 401
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "wrong" });
    expect(res.status).toBe(401);
  });

  test("serves file with correct password via signed URL", async () => {
    const filePath = createTestFile("protected.txt", "secret data");
    const hash = await bcrypt.hash("mypassword", 4);
    const share = await createShare({
      filePaths: [`/${filePath}`],
      passwordHash: hash,
    });
    // First verify password to get signed URL
    const verifyRes = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "mypassword" });
    expect(verifyRes.status).toBe(200);

    // Extract signed URL for the file from the response
    const signedUrl = verifyRes.body.files[0].signedUrl;
    expect(signedUrl).toBeDefined();

    // Use the signed URL to access the file
    const res = await request(app).get(signedUrl);
    expect(res.status).toBe(200);
    expect(res.text).toBe("secret data");
  });

  test("accepts masked filename", async () => {
    const filePath = createTestFile("real-name.txt", "masked content");
    const share = await createShare({
      filePaths: [`/${filePath}`],
      maskFilenames: true,
    });
    const info = await getShareInfo(share.uuid);
    const masked = info.files[0].filename;
    expect(masked).toMatch(/^sdrop-/);
    const fileUuid = info.files[0].uuid;
    const res = await request(app).get(
      `/s/${share.uuid}/file/${fileUuid}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("masked content");
  });

  test("401 for expired signed URL", async () => {
    const filePath = createTestFile("expired.txt", "content");
    const hash = await bcrypt.hash("pass", 4);
    const share = await createShare({
      filePaths: [`/${filePath}`],
      passwordHash: hash,
    });

    const verifyRes = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "pass" });
    expect(verifyRes.status).toBe(200);
    const fileUuid = verifyRes.body.files[0].uuid;

    const expires = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
    const res = await request(app).get(
      `/s/${share.uuid}/file/${fileUuid}?expires=${expires}&signature=invalidsig`,
    );
    expect(res.status).toBe(401);
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

  test("200 with share info for correct password", async () => {
    const share = await createPasswordShare("mypassword");
    const res = await request(app)
      .post(`/s/${share.uuid}/verify-password`)
      .send({ password: "mypassword" });
    expect(res.status).toBe(200);
    // Now returns full share info instead of { valid: true }
    expect(res.body.files).toBeDefined();
    expect(res.body.shareTitle).toBeDefined();
    expect(res.body.files[0].signedUrl).toBeDefined();
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
    const missingUuid = "00000000-0000-0000-0000-000000000000";
    expect(
      (
        await request(app)
          .post(`/s/${share.uuid}/zip`)
          .send({ uuids: [missingUuid] })
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
    const info = await getShareInfo(share.uuid);
    const res = await request(app)
      .post(`/s/${share.uuid}/zip`)
      .send({ uuids: info.files.map((file) => file.uuid) });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/zip/);
  }, 30000);
});
