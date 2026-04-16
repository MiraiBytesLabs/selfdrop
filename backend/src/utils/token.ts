import { randomUUID } from 'crypto';

/**
 * Generates a new UUID v4 for use as a share token.
 * Uses Node's built-in crypto.randomUUID() — no external dependency needed.
 */
export function generateToken() {
  return randomUUID();
}
