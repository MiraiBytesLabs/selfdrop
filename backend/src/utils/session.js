"use strict";

const crypto = require("crypto");
const config = require("../config");

/**
 * Minimal JWT-like session token implementation using HMAC-SHA256.
 * We avoid pulling in a full JWT library — the use case is simple:
 * sign a payload on login, verify it on each request.
 *
 * Token format: base64(header).base64(payload).base64(signature)
 *
 * We use the same structure as JWT so tooling can inspect tokens,
 * but we only support HS256 and don't implement the full JWT spec.
 */

const ALGORITHM = "sha256";

/**
 * Signs a payload and returns a token string.
 *
 * @param {object} payload   - data to embed (e.g. { sub: 'admin', iat: ... })
 * @param {object} [options]
 * @param {number} [options.expiresInSeconds] - omit for non-expiring tokens
 * @returns {string} signed token
 */
function signToken(payload, options = {}) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const claims = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
  };

  if (options.expiresInSeconds) {
    claims.exp = claims.iat + options.expiresInSeconds;
  }

  const body = base64url(JSON.stringify(claims));
  const signature = sign(`${header}.${body}`);

  return `${header}.${body}.${signature}`;
}

/**
 * Verifies a token and returns its payload.
 * Throws a descriptive error if the token is invalid or expired.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw authError("No token provided.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw authError("Malformed token.");
  }

  const [header, body, signature] = parts;

  // Verify signature using timing-safe comparison
  const expected = sign(`${header}.${body}`);
  if (!timingSafeEqual(signature, expected)) {
    throw authError("Invalid token signature.");
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw authError("Malformed token payload.");
  }

  // Check expiry if present
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) {
    throw authError("Token has expired.");
  }

  return claims;
}

// ── Helpers ───────────────────────────────────────────────

function sign(data) {
  return crypto
    .createHmac(ALGORITHM, config.sessionSecret)
    .update(data)
    .digest("base64url");
}

function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

function timingSafeEqual(a, b) {
  // Pad to same length to avoid length leakage, then use crypto comparison
  const bufA = Buffer.from(a.padEnd(128));
  const bufB = Buffer.from(b.padEnd(128));
  return crypto.timingSafeEqual(bufA, bufB);
}

function authError(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}

module.exports = { signToken, verifyToken };
