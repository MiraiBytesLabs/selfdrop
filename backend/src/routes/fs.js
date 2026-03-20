'use strict';

const express = require('express');
const fs = require('fs');
const { pathGuard } = require('../middleware/pathGuard');
const { listDirectory, getFileInfo } = require('../utils/fileInfo');
const config = require('../config');

const router = express.Router();

/**
 * GET /api/fs?path=/
 *
 * Lists the contents of a directory within FILES_ROOT.
 *
 * Query params:
 *   path  (string, default "/") — relative path from FILES_ROOT
 *
 * Response 200:
 * {
 *   current: { type, name, path, modifiedAt },
 *   parent:  string | null,   // relative path to parent, null if already at root
 *   entries: [
 *     { type: "directory", name, path, modifiedAt },
 *     { type: "file",      name, path, size, sizeHuman, mimeType, modifiedAt },
 *     ...
 *   ]
 * }
 */
router.get('/', pathGuard, async (req, res) => {
  try {
    const stat = await fs.promises.stat(req.safePath);

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is a file, not a directory. Use /api/fs/info for file metadata.' });
    }

    const { current, entries } = await listDirectory(req.safePath);

    // Calculate parent path — null when already at FILES_ROOT.
    const isRoot = req.safePath === config.filesRoot;
    const parent = isRoot ? null : ('/' + require('path').relative(config.filesRoot, require('path').dirname(req.safePath)));

    res.json({ current, parent, entries });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Path not found.' });
    }
    if (err.code === 'EACCES') {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    console.error('[fs] list error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/fs/info?path=/docs/file.pdf
 *
 * Returns metadata for a single file.
 *
 * Query params:
 *   path  (string, required) — relative path from FILES_ROOT
 *
 * Response 200:
 * {
 *   type: "file",
 *   name: "file.pdf",
 *   path: "/docs/file.pdf",
 *   size: 2457600,
 *   sizeHuman: "2.3 MB",
 *   mimeType: "application/pdf",
 *   modifiedAt: "2026-03-12T10:00:00.000Z"
 * }
 */
router.get('/info', pathGuard, async (req, res) => {
  try {
    const info = await getFileInfo(req.safePath);
    res.json(info);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found.' });
    }
    if (err.code === 'EACCES') {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[fs] info error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
