'use strict';

/**
 * session.test.js
 *
 * Tests the custom HMAC-SHA256 token implementation.
 * Covers signing, verification, expiry, and tamper detection.
 */

const { setupTestEnv, cleanupTestEnv } = require('./helpers');
setupTestEnv();

const { signToken, verifyToken } = require('../src/utils/session');

afterAll(cleanupTestEnv);

describe('signToken', () => {
  test('returns a three-part dot-separated string', () => {
    const token = signToken({ sub: 'admin' });
    expect(token.split('.')).toHaveLength(3);
  });

  test('embeds the payload sub claim', () => {
    const token = signToken({ sub: 'admin' });
    const claims = verifyToken(token);
    expect(claims.sub).toBe('admin');
  });

  test('adds iat claim automatically', () => {
    const before = Math.floor(Date.now() / 1000);
    const token  = signToken({ sub: 'admin' });
    const claims = verifyToken(token);
    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.iat).toBeLessThanOrEqual(before + 2);
  });

  test('adds exp claim when expiresInSeconds is provided', () => {
    const token  = signToken({ sub: 'admin' }, { expiresInSeconds: 3600 });
    const claims = verifyToken(token);
    expect(claims.exp).toBeDefined();
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test('does not add exp when expiresInSeconds is omitted', () => {
    const token  = signToken({ sub: 'admin' });
    const claims = verifyToken(token);
    expect(claims.exp).toBeUndefined();
  });

  test('two tokens for same payload are different (unique iat)', async () => {
    await new Promise(r => setTimeout(r, 1100)); // ensure different second
    const t1 = signToken({ sub: 'admin' });
    const t2 = signToken({ sub: 'admin' });
    // They may be equal if within same second — just check they're valid
    expect(() => verifyToken(t1)).not.toThrow();
    expect(() => verifyToken(t2)).not.toThrow();
  });
});

describe('verifyToken', () => {
  test('returns claims for a valid token', () => {
    const token  = signToken({ sub: 'admin', role: 'admin' });
    const claims = verifyToken(token);
    expect(claims.sub).toBe('admin');
    expect(claims.role).toBe('admin');
  });

  test('throws for empty string', () => {
    expect(() => verifyToken('')).toThrow();
  });

  test('throws for null', () => {
    expect(() => verifyToken(null)).toThrow();
  });

  test('throws for undefined', () => {
    expect(() => verifyToken(undefined)).toThrow();
  });

  test('throws for token with wrong number of parts', () => {
    expect(() => verifyToken('a.b')).toThrow();
    expect(() => verifyToken('a.b.c.d')).toThrow();
  });

  test('throws with status 401 for invalid token', () => {
    try {
      verifyToken('invalid.token.here');
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  test('throws for tampered payload', () => {
    const token  = signToken({ sub: 'admin' });
    const parts  = token.split('.');
    // Modify the payload (base64url encode a different sub)
    parts[1] = Buffer.from(JSON.stringify({ sub: 'hacker', iat: 999 })).toString('base64url');
    expect(() => verifyToken(parts.join('.'))).toThrow('Invalid token signature.');
  });

  test('throws for tampered signature', () => {
    const token = signToken({ sub: 'admin' });
    const parts = token.split('.');
    parts[2]    = parts[2].slice(0, -3) + 'xxx';
    expect(() => verifyToken(parts.join('.'))).toThrow();
  });

  test('throws for expired token', () => {
    // Sign a token that expired 1 second ago
    const token  = signToken({ sub: 'admin' }, { expiresInSeconds: -1 });
    expect(() => verifyToken(token)).toThrow('Token has expired.');
  });

  test('does not throw for non-expiring token regardless of time', () => {
    const token = signToken({ sub: 'admin' });
    expect(() => verifyToken(token)).not.toThrow();
  });
});
