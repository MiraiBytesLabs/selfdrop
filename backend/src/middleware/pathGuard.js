import { join, resolve, sep } from 'path';
import config from '../config.js';

export function resolveSafePath(userPath) {
  if (typeof userPath !== 'string') {
    const err = new Error('Path must be a string.');
    err.status = 400;
    throw err;
  }
  const joined  = join(config.filesRoot, userPath);
  const resolved = resolve(joined);
  const root = config.filesRoot.endsWith(sep) ? config.filesRoot : config.filesRoot + sep;

  if (resolved !== config.filesRoot && !resolved.startsWith(root)) {
    const err = new Error('Access denied: path is outside the allowed directory.');
    err.status = 403;
    throw err;
  }
  return resolved;
}

export function pathGuard(req, res, next) {
  try {
    const userPath = req.query.path || '/';
    req.safePath   = resolveSafePath(userPath);
    next();
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}
