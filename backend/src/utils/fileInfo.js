import { promises as fsp } from 'fs';
import { basename, join, relative } from 'path';
import { lookup } from 'mime-types';
import config from '../config.js';

function formatEntry(absolutePath, stat) {
  const name         = basename(absolutePath);
  const relativePath = '/' + relative(config.filesRoot, absolutePath);

  if (stat.isDirectory()) {
    return { type: 'directory', name, path: relativePath, modifiedAt: stat.mtime.toISOString() };
  }
  return {
    type: 'file', name, path: relativePath,
    size: stat.size, sizeHuman: humanSize(stat.size),
    mimeType: lookup(name) || 'application/octet-stream',
    modifiedAt: stat.mtime.toISOString(),
  };
}

export async function listDirectory(dirPath) {
  const names   = await fsp.readdir(dirPath);
  const entries = (await Promise.all(
    names.map(async name => {
      try {
        const stat = await fsp.stat(join(dirPath, name));
        return formatEntry(join(dirPath, name), stat);
      } catch { return null; }
    })
  )).filter(Boolean);

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const current = formatEntry(dirPath, await fsp.stat(dirPath));
  return { current, entries };
}

export async function getFileInfo(filePath) {
  const stat = await fsp.stat(filePath);
  if (stat.isDirectory()) {
    const err = new Error('Path is a directory, not a file.');
    err.status = 400;
    throw err;
  }
  return formatEntry(filePath, stat);
}

export { formatEntry };

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
