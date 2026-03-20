"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Generates a new UUID v4 for use as a share token.
 * e.g. "a3f9c2d1-4b5e-4f6a-8c7d-9e0f1a2b3c4d"
 *
 * The full UUID is used as the share identifier.
 * Share URLs take the form: /s/<uuid>
 *
 * @returns {string}
 */
function generateToken() {
  return uuidv4();
}

module.exports = { generateToken };
