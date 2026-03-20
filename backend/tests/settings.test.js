'use strict';

/**
 * settings.test.js
 *
 * Tests the settings API endpoints — reading, writing, and validation.
 * Also tests the danger zone (revoke-all, clear-expired).
 */

const { setupTestEnv, cleanupTestEnv, createTestFile, futureDate, pastDate } = require('./helpers');
setupTestEnv();

const request  = require('supertest');
const app      = require('../src/app');
const sharesDb = require('../src/db/shares');
const { signToken } = require('../src/utils/session');

afterAll(cleanupTestEnv);

// ── Auth helper ───────────────────────────────────────────
// Settings routes require admin auth. We sign a token directly.

function authHeader() {
  const token = signToken({ sub: 'admin' });
  return { Authorization: `Bearer ${token}` };
}

// ── GET /api/settings ─────────────────────────────────────

describe('GET /api/settings', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  test('returns settings object with defaults', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.default_expiry_hours).toBeDefined();
    expect(res.body.default_download_limit).toBeDefined();
    expect(res.body.default_mask_filenames).toBeDefined();
    expect(res.body.public_url).toBeDefined();
  });

  test('default_expiry_hours is "24"', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set(authHeader());
    expect(res.body.default_expiry_hours).toBe('24');
  });
});

// ── PUT /api/settings ─────────────────────────────────────

describe('PUT /api/settings', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).put('/api/settings').send({ public_url: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  test('saves and returns updated default_expiry_hours', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ default_expiry_hours: 72 });
    expect(res.status).toBe(200);
    expect(res.body.default_expiry_hours).toBe('72');
  });

  test('saves and returns updated public_url', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: 'https://files.example.com' });
    expect(res.status).toBe(200);
    expect(res.body.public_url).toBe('https://files.example.com');
  });

  test('strips trailing slash from public_url', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: 'https://files.example.com/' });
    expect(res.status).toBe(200);
    expect(res.body.public_url).toBe('https://files.example.com');
  });

  test('accepts empty string for public_url (clears it)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: '' });
    expect(res.status).toBe(200);
    expect(res.body.public_url).toBe('');
  });

  test('rejects invalid public_url', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid URL/);
  });

  test('rejects non-http protocol in public_url', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: 'ftp://files.example.com' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid default_expiry_hours', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ default_expiry_hours: -1 });
    expect(res.status).toBe(400);
  });

  test('rejects negative default_download_limit', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ default_download_limit: -5 });
    expect(res.status).toBe(400);
  });

  test('accepts 0 for default_download_limit (unlimited)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ default_download_limit: 0 });
    expect(res.status).toBe(200);
    expect(res.body.default_download_limit).toBe('0');
  });

  test('saves default_mask_filenames as boolean', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ default_mask_filenames: true });
    expect(res.status).toBe(200);
    expect(res.body.default_mask_filenames).toBe('1');
  });

  test('returns 400 when no valid settings provided', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ unknown_key: 'value' });
    expect(res.status).toBe(400);
  });

  test('persists settings across requests', async () => {
    await request(app)
      .put('/api/settings')
      .set(authHeader())
      .send({ public_url: 'https://persist-test.example.com' });

    const res = await request(app)
      .get('/api/settings')
      .set(authHeader());
    expect(res.body.public_url).toBe('https://persist-test.example.com');
  });
});

// ── GET /api/settings/storage ─────────────────────────────

describe('GET /api/settings/storage', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/settings/storage');
    expect(res.status).toBe(401);
  });

  test('returns storage info object', async () => {
    const res = await request(app)
      .get('/api/settings/storage')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.filesRoot).toBeDefined();
    expect(res.body.database).toBeDefined();
    expect(res.body.system).toBeDefined();
  });

  test('includes system node version', async () => {
    const res = await request(app)
      .get('/api/settings/storage')
      .set(authHeader());
    expect(res.body.system.nodeVersion).toBe(process.version);
  });

  test('filesRoot.exists is true for test directory', async () => {
    const res = await request(app)
      .get('/api/settings/storage')
      .set(authHeader());
    expect(res.body.filesRoot.exists).toBe(true);
  });

  test('database.exists is true', async () => {
    const res = await request(app)
      .get('/api/settings/storage')
      .set(authHeader());
    expect(res.body.database.exists).toBe(true);
  });
});

// ── POST /api/admin/revoke-all ────────────────────────────

describe('POST /api/admin/revoke-all', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/admin/revoke-all');
    expect(res.status).toBe(401);
  });

  test('returns count of revoked shares', async () => {
    // Create a couple of active shares
    const f1 = createTestFile('revoke1.txt', 'a');
    const f2 = createTestFile('revoke2.txt', 'b');
    sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f1}`], expiresAt: futureDate(24), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });
    sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f2}`], expiresAt: futureDate(24), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });

    const res = await request(app)
      .post('/api/admin/revoke-all')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    expect(res.body.message).toMatch(/revoked/);
  });

  test('active shares no longer valid after revoke-all', async () => {
    const f = createTestFile('post-revoke.txt', 'x');
    const share = sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f}`], expiresAt: futureDate(24), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });

    await request(app).post('/api/admin/revoke-all').set(authHeader());

    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(false);
  });
});

// ── POST /api/admin/clear-expired ─────────────────────────

describe('POST /api/admin/clear-expired', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/admin/clear-expired');
    expect(res.status).toBe(401);
  });

  test('returns count of cleared shares', async () => {
    // Create expired shares
    const f1 = createTestFile('expired1.txt', 'a');
    const f2 = createTestFile('expired2.txt', 'b');
    sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f1}`], expiresAt: pastDate(2), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });
    sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f2}`], expiresAt: pastDate(2), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });

    const res = await request(app)
      .post('/api/admin/clear-expired')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    expect(res.body.message).toMatch(/cleared/);
  });

  test('does not remove active shares', async () => {
    const f = createTestFile('active-safe.txt', 'safe');
    const share = sharesDb.createShare({ uuid: require('crypto').randomUUID(), filePaths: [`/${f}`], expiresAt: futureDate(48), downloadLimit: null, passwordHash: null, maskFilenames: false, name: null });

    await request(app).post('/api/admin/clear-expired').set(authHeader());

    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(true);
  });
});
