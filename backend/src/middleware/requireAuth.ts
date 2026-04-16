import { verifyToken } from "../utils/session.js";
import type { Request, Response, NextFunction } from "express";

export default function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);
  if (!token)
    return res.status(401).json({ error: "Authentication required." });
  try {
    req.admin = verifyToken(token);
    next();
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.status(401).json({ error: err.message });
    } else {
      res.status(400).json({ error: "Unknown Error Occurred." });
    }
  }
}

function extractToken(req: Request) {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}
