import { join, resolve, sep } from "path";
import fs from "fs";
import config from "../config.js";
import type { Request, Response, NextFunction } from "express";

export function resolveSafePathDeprecated(userPath: string) {
  if (typeof userPath !== "string") {
    throw new Error("Path must be a string.");
  }
  const joined = join(config.filesRoot, userPath);
  const resolved = resolve(joined);
  const root = config.filesRoot.endsWith(sep)
    ? config.filesRoot
    : config.filesRoot + sep;

  if (resolved !== config.filesRoot && !resolved.startsWith(root)) {
    throw new Error("Access denied: path is outside the allowed directory.");
  }
  return resolved;
}

export function resolveSafePath(userPath: string) {
  if (typeof userPath !== "string") {
    throw new Error("Path must be a string.");
  }

  if (userPath.includes("\0")) {
    throw new Error("Invalid path.");
  }

  const joined = join(config.filesRoot, userPath);
  const resolved = resolve(joined);

  let real, rootReal;

  try {
    real = fs.realpathSync(resolved);
    rootReal = fs.realpathSync(config.filesRoot);
  } catch {
    throw new Error("Invalid path.");
  }

  const normalize = (p: string) =>
    process.platform === "win32" ? p.toLowerCase() : p;

  const rootWithSep = rootReal.endsWith(sep) ? rootReal : rootReal + sep;

  if (
    normalize(real) !== normalize(rootReal) &&
    !normalize(real).startsWith(normalize(rootWithSep))
  ) {
    throw new Error("Access denied.");
  }

  return real;
}

export function pathGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const userPath = req.query.path?.toString() || "/";
    req.safePath = resolveSafePath(userPath);
    next();
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(400).json({ error: "Unknown Error Occurred." });
    }
  }
}
