"use strict";

const path = require("path");
const config = require("../config");

/**
 * Resolves and validates a user-supplied path against FILES_ROOT.
 *
 * Returns the safe absolute path on success.
 * Throws an error with a `status` property on failure — callers can use this
 * directly in Express error handlers.
 *
 * @param {string} userPath - raw path from request (e.g. "/" or "/docs/file.pdf")
 * @returns {string} resolved absolute path guaranteed to be within FILES_ROOT
 */
function resolveSafePath(userPath) {
  if (typeof userPath !== "string") {
    const err = new Error("Path must be a string.");
    err.status = 400;
    throw err;
  }

  // Normalise and join against FILES_ROOT.
  // path.join + path.resolve will collapse any "../" sequences.
  const joined = path.join(config.filesRoot, userPath);
  const resolved = path.resolve(joined);

  // The resolved path must start with FILES_ROOT.
  // We append path.sep to avoid a prefix like /data/files-other matching /data/files.
  const root = config.filesRoot.endsWith(path.sep)
    ? config.filesRoot
    : config.filesRoot + path.sep;

  if (resolved !== config.filesRoot && !resolved.startsWith(root)) {
    const err = new Error(
      "Access denied: path is outside the allowed directory.",
    );
    err.status = 403;
    throw err;
  }

  return resolved;
}

/**
 * Express middleware that reads `req.query.path`, validates it, and attaches
 * the resolved absolute path as `req.safePath`.
 *
 * Usage: router.get('/fs', pathGuard, handler)
 */
function pathGuard(req, res, next) {
  try {
    const userPath = req.query.path || "/";
    req.safePath = resolveSafePath(userPath);
    next();
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = { pathGuard, resolveSafePath };
