"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const adminDb = require("../db/admin");
const { signToken } = require("../utils/session");
const requireAuth = require("../middleware/requireAuth");
const config = require("../config");

const router = express.Router();

const BCRYPT_ROUNDS = 10;

// How long a persistent token lasts: 90 days in seconds
const PERSISTENT_TTL = 90 * 24 * 60 * 60;

// ── Routes ────────────────────────────────────────────────

/**
 * GET /api/auth/status
 *
 * Returns two things:
 *   - whether an admin account has been configured (for first-run detection)
 *   - whether the current request carries a valid session
 *
 * This is the first endpoint the frontend calls on load to decide
 * which screen to show: setup → login → dashboard.
 *
 * Response 200:
 * {
 *   configured: boolean   // false = show setup screen
 *   authenticated: boolean // false = show login screen
 * }
 */
router.get("/status", (req, res) => {
  const configured = adminDb.isAdminConfigured();

  // Try to read a token without hard-failing
  let authenticated = false;
  try {
    const { verifyToken } = require("../utils/session");
    const token = extractToken(req);
    if (token) {
      verifyToken(token);
      authenticated = true;
    }
  } catch {
    authenticated = false;
  }

  res.json({ configured, authenticated });
});

/**
 * POST /api/auth/setup
 *
 * First-run only. Creates the admin account.
 * Returns 409 if an admin already exists.
 *
 * Body: { username: string, password: string }
 *
 * Response 201: { message, token }
 */
router.post("/setup", async (req, res) => {
  if (adminDb.isAdminConfigured()) {
    return res.status(409).json({ error: "Admin account already exists." });
  }

  const { username, password } = req.body;

  const validationError = validateCredentials(username, password);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    adminDb.createAdmin(username.trim(), passwordHash);

    const token = issueToken(username.trim());
    res.status(201).json({ message: "Admin account created.", token });
  } catch (err) {
    console.error("[auth] setup error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /api/auth/login
 *
 * Authenticates the admin and returns a session token.
 *
 * Body: { username: string, password: string }
 *
 * Response 200: { token, expiresAt | null }
 *   expiresAt is null when SESSION_MODE=persistent (no expiry)
 *
 * Response 401: { error }  — always a generic message to avoid enumeration
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  if (!adminDb.isAdminConfigured()) {
    return res
      .status(403)
      .json({ error: "No admin account configured. Complete setup first." });
  }

  try {
    const admin = adminDb.getAdmin();

    // Generic error message — don't reveal whether username or password was wrong
    const invalidMsg = "Invalid username or password.";

    if (admin.username !== username.trim()) {
      return res.status(401).json({ error: invalidMsg });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: invalidMsg });
    }

    const token = issueToken(username.trim());

    // Calculate expiresAt for the client to store if needed
    const expiresAt =
      config.sessionMode === "persistent"
        ? new Date(Date.now() + PERSISTENT_TTL * 1000).toISOString()
        : null;

    res.json({ token, expiresAt });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /api/auth/logout
 *
 * Protected route — requires a valid session.
 *
 * Since tokens are stateless (no server-side session store), logout is
 * handled client-side by discarding the token. This endpoint exists so
 * the frontend has a clean logout action to call.
 *
 * In a future iteration, a token denylist could be added here.
 *
 * Response 200: { message }
 */
router.post("/logout", requireAuth, (_req, res) => {
  res.json({ message: "Logged out." });
});

/**
 * POST /api/auth/change-password
 *
 * Protected route. Updates admin credentials.
 *
 * Body: { currentPassword: string, newPassword: string, newUsername?: string }
 *
 * Response 200: { message }
 */
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "currentPassword and newPassword are required." });
  }

  try {
    const admin = adminDb.getAdmin();
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      admin.password_hash,
    );

    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const validationError = validateCredentials(
      newUsername || admin.username,
      newPassword,
    );
    if (validationError)
      return res.status(400).json({ error: validationError });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    adminDb.updateAdmin({
      username: newUsername ? newUsername.trim() : undefined,
      passwordHash: newHash,
    });

    res.json({ message: "Credentials updated." });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── Helpers ───────────────────────────────────────────────

/**
 * Issues a signed session token.
 * TTL depends on SESSION_MODE from config.
 */
function issueToken(username) {
  const options =
    config.sessionMode === "persistent"
      ? { expiresInSeconds: PERSISTENT_TTL }
      : {}; // no expiry — client discards on tab close

  return signToken({ sub: username }, options);
}

/**
 * Basic credential validation.
 * Returns an error string or null.
 */
function validateCredentials(username, password) {
  if (!username || typeof username !== "string" || username.trim().length < 2) {
    return "Username must be at least 2 characters.";
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

/**
 * Extracts a token from Authorization header or cookie.
 * Duplicated from requireAuth to allow soft token checking in /status.
 */
function extractToken(req) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

module.exports = router;
