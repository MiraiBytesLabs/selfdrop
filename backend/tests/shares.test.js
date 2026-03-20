'use strict';

/**
 * shares.test.js
 *
 * Tests share creation, validation, expiry, download limits,
 * masking, and the validateCreatePayload logic.
 */

const { setupTestEnv, cleanupTestEnv, futureDate, pastDate } = require('./helpers');
setupTestEnv();

const sharesDb = require('../src/db/shares');

afterAll(cleanupTestEnv);

// ── Helpers ───────────────────────────────────────────────

function makeShare(overrides = {}) {
  return sharesDb.createShare({
    uuid:          require('crypto').randomUUID(),
    filePaths:     ['/test-file.txt'],
    expiresAt:     futureDate(24),
    downloadLimit: null,
    passwordHash:  null,
    maskFilenames: false,
    name:          null,
    ...overrides,
  });
}

// ── createShare ───────────────────────────────────────────

describe('createShare', () => {
  test('creates a share and returns it with filePaths', () => {
    const share = makeShare();
    expect(share).toBeDefined();
    expect(share.uuid).toBeDefined();
    expect(share.filePaths).toEqual(['/test-file.txt']);
  });

  test('creates a multi-file share', () => {
    const share = makeShare({ filePaths: ['/a.txt', '/b.txt', '/c.txt'] });
    expect(share.filePaths).toHaveLength(3);
  });

  test('stores hasPassword as false when no hash', () => {
    const share = makeShare({ passwordHash: null });
    expect(share.hasPassword).toBe(false);
  });

  test('stores hasPassword as true when hash provided', () => {
    const share = makeShare({ passwordHash: '$2b$10$fakehashfortest' });
    expect(share.hasPassword).toBe(true);
  });

  test('stores maskFilenames correctly', () => {
    const masked   = makeShare({ maskFilenames: true });
    const unmasked = makeShare({ maskFilenames: false });
    expect(masked.maskFilenames).toBe(true);
    expect(unmasked.maskFilenames).toBe(false);
  });

  test('stores share name', () => {
    const share = makeShare({ name: 'My Music Pack' });
    expect(share.name).toBe('My Music Pack');
  });

  test('download_count starts at 0', () => {
    const share = makeShare();
    expect(share.download_count).toBe(0);
  });

  test('filePaths are returned in insertion order', () => {
    const paths = ['/c.mp3', '/a.pdf', '/b.jpg'];
    const share = makeShare({ filePaths: paths });
    expect(share.filePaths).toEqual(paths);
  });
});

// ── validateShare ─────────────────────────────────────────

describe('validateShare', () => {
  test('returns valid: true for an active share', () => {
    const share  = makeShare();
    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(true);
    expect(result.share.uuid).toBe(share.uuid);
  });

  test('returns valid: false with reason not_found for unknown UUID', () => {
    const result = sharesDb.validateShare('00000000-0000-0000-0000-000000000000');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  test('returns valid: false with reason expired for past expiresAt', () => {
    const share  = makeShare({ expiresAt: pastDate(1) });
    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  test('returns valid: false with reason limit_reached when count >= limit', () => {
    const share = makeShare({ downloadLimit: 2 });
    sharesDb.incrementDownloadCount(share.uuid);
    sharesDb.incrementDownloadCount(share.uuid);
    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('limit_reached');
  });

  test('is still valid when count is below limit', () => {
    const share = makeShare({ downloadLimit: 3 });
    sharesDb.incrementDownloadCount(share.uuid);
    sharesDb.incrementDownloadCount(share.uuid);
    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(true);
  });

  test('is valid when downloadLimit is null (unlimited)', () => {
    const share = makeShare({ downloadLimit: null });
    for (let i = 0; i < 100; i++) sharesDb.incrementDownloadCount(share.uuid);
    const result = sharesDb.validateShare(share.uuid);
    expect(result.valid).toBe(true);
  });
});

// ── incrementDownloadCount ────────────────────────────────

describe('incrementDownloadCount', () => {
  test('increments count by 1', () => {
    const share = makeShare();
    sharesDb.incrementDownloadCount(share.uuid);
    const updated = sharesDb.getShareByUuid(share.uuid);
    expect(updated.download_count).toBe(1);
  });

  test('can be called multiple times', () => {
    const share = makeShare();
    sharesDb.incrementDownloadCount(share.uuid);
    sharesDb.incrementDownloadCount(share.uuid);
    sharesDb.incrementDownloadCount(share.uuid);
    const updated = sharesDb.getShareByUuid(share.uuid);
    expect(updated.download_count).toBe(3);
  });
});

// ── deleteShare ───────────────────────────────────────────

describe('deleteShare', () => {
  test('returns true when share exists and is deleted', () => {
    const share  = makeShare();
    const result = sharesDb.deleteShare(share.uuid);
    expect(result).toBe(true);
  });

  test('returns false for unknown UUID', () => {
    const result = sharesDb.deleteShare('00000000-0000-0000-0000-000000000000');
    expect(result).toBe(false);
  });

  test('share is no longer findable after deletion', () => {
    const share = makeShare();
    sharesDb.deleteShare(share.uuid);
    expect(sharesDb.getShareByUuid(share.uuid)).toBeNull();
  });

  test('cascades to share_files — no orphaned records', () => {
    const share = makeShare({ filePaths: ['/a.txt', '/b.txt'] });
    sharesDb.deleteShare(share.uuid);
    const db = require('../src/db/index');
    const files = db.prepare('SELECT * FROM share_files WHERE share_id = ?').all(share.id || 0);
    expect(files).toHaveLength(0);
  });
});

// ── listShares ────────────────────────────────────────────

describe('listShares', () => {
  test('returns an array', () => {
    const shares = sharesDb.listShares();
    expect(Array.isArray(shares)).toBe(true);
  });

  test('includes newly created shares', () => {
    const share  = makeShare({ name: 'list-test-share' });
    const shares = sharesDb.listShares();
    expect(shares.some(s => s.uuid === share.uuid)).toBe(true);
  });

  test('each share has filePaths attached', () => {
    makeShare();
    const shares = sharesDb.listShares();
    shares.forEach(s => {
      expect(Array.isArray(s.filePaths)).toBe(true);
    });
  });
});
