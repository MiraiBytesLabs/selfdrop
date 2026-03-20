"use strict";

const { verifyToken } = require("../utils/session");

/**
 * Express middleware that enforces authentication on protected routes.
 *
 * Reads the session token from either:
 *   1. Authorization header:  "Bearer <token>"
 *   2. Cookie:                "session=<token>"
 *
 * On success: attaches decoded claims to req.admin and calls next().
 * On failure: returns 401 JSON — never redirects (API-only middleware).
 *
 * Usage:
 *   router.get('/protected', requireAuth, handler)
 *   app.use('/api/shares', requireAuth, sharesRouter)
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.admin = verifyToken(token);
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────

function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie: session=<token>
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

module.exports = requireAuth;
