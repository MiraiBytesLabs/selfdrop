'use strict';

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const config = require('../config');

/**
 * Formats a single filesystem entry (file or directory) into a clean
 * object suitable for API responses.
 *
 * @param {string} absolutePath - resolved, validated absolute path
 * @param {fs.Stats} stat       - result of fs.statSync / fs.promises.stat
 * @returns {object}
 */
function formatEntry(absolutePath, stat) {
  const name = path.basename(absolutePath);

  // Express relative path from FILES_ROOT for client use.
  // Clients send this back as the `path` query param.
  const relativePath = '/' + path.relative(config.filesRoot, absolutePath);

  if (stat.isDirectory()) {
    return {
      type: 'directory',
      name,
      path: relativePath,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  return {
    type: 'file',
    name,
    path: relativePath,
    size: stat.size,
    sizeHuman: humanSize(stat.size),
    mimeType: mime.lookup(name) || 'application/octet-stream',
    modifiedAt: stat.mtime.toISOString(),
  };
}

/**
 * Lists the contents of a directory.
 * Directories are returned first, then files, both sorted alphabetically.
 *
 * @param {string} dirPath - resolved absolute path to directory
 * @returns {Promise<{ current: object, entries: object[] }>}
 */
async function listDirectory(dirPath) {
  const names = await fs.promises.readdir(dirPath);

  const entries = await Promise.all(
    names.map(async (name) => {
      const fullPath = path.join(dirPath, name);
      try {
        const stat = await fs.promises.stat(fullPath);
        return formatEntry(fullPath, stat);
      } catch {
        // Skip entries we can't stat (e.g. broken symlinks).
        return null;
      }
    })
  );

  const valid = entries.filter(Boolean);

  // Directories first, then files. Each group sorted A→Z.
  valid.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const currentStat = await fs.promises.stat(dirPath);
  const current = formatEntry(dirPath, currentStat);

  return { current, entries: valid };
}

/**
 * Returns metadata for a single file.
 *
 * @param {string} filePath - resolved absolute path to file
 * @returns {Promise<object>}
 */
async function getFileInfo(filePath) {
  const stat = await fs.promises.stat(filePath);

  if (stat.isDirectory()) {
    const err = new Error('Path is a directory, not a file.');
    err.status = 400;
    throw err;
  }

  return formatEntry(filePath, stat);
}

/**
 * Converts bytes to a human-readable string.
 * e.g. 1536 → "1.5 KB"
 */
function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

module.exports = { listDirectory, getFileInfo, formatEntry };
