import { createHmac, timingSafeEqual } from 'crypto';
import config from '../config.js';

const ALGORITHM = 'sha256';

export function signToken(payload, options = {}) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = { ...payload, iat: Math.floor(Date.now() / 1000) };
  if (options.expiresInSeconds) {
    claims.exp = claims.iat + options.expiresInSeconds;
  }
  const body      = base64url(JSON.stringify(claims));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') throw authError('No token provided.');
  const parts = token.split('.');
  if (parts.length !== 3) throw authError('Malformed token.');
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  if (!timingSafeCompare(signature, expected)) throw authError('Invalid token signature.');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw authError('Malformed token payload.');
  }
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) {
    throw authError('Token has expired.');
  }
  return claims;
}

function sign(data) {
  return createHmac(ALGORITHM, config.sessionSecret).update(data).digest('base64url');
}

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a.padEnd(128));
  const bufB = Buffer.from(b.padEnd(128));
  return timingSafeEqual(bufA, bufB);
}

function authError(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}
