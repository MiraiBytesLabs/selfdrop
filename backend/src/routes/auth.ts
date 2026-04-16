import { Router } from "express";
import bcrypt from "bcrypt";
import {
  isAdminConfigured,
  createAdmin,
  getAdmin,
  updateAdmin,
  type IAdmin,
} from "../db/admin.js";
import { signToken, verifyToken } from "../utils/session.js";
import requireAuth from "../middleware/requireAuth.js";
import config from "../config.js";

import type { Request } from "express";

const router = Router();
const BCRYPT_ROUNDS = 10;
const PERSISTENT_TTL = 90 * 24 * 60 * 60;

router.get("/status", (req, res) => {
  const configured = isAdminConfigured();
  let authenticated = false;
  try {
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

router.post("/setup", async (req, res) => {
  if (isAdminConfigured())
    return res.status(409).json({ error: "Admin account already exists." });
  const { username, password } = req.body;
  const validationError = validateCredentials(username, password);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    createAdmin(username.trim(), passwordHash);
    res.status(201).json({
      message: "Admin account created.",
      token: issueToken(username.trim()),
    });
  } catch (err) {
    console.error("[auth] setup error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  if (!isAdminConfigured())
    return res.status(403).json({ error: "No admin account configured." });
  try {
    const admin = getAdmin() as IAdmin;
    const invalidMsg = "Invalid username or password.";
    if (admin.username !== username.trim())
      return res.status(401).json({ error: invalidMsg });
    if (!(await bcrypt.compare(password, admin.password_hash)))
      return res.status(401).json({ error: invalidMsg });
    const expiresAt =
      config.sessionMode === "persistent"
        ? new Date(Date.now() + PERSISTENT_TTL * 1000).toISOString()
        : null;
    res.json({ token: issueToken(username.trim()), expiresAt });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/logout", requireAuth, (_, res) =>
  res.json({ message: "Logged out." }),
);

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body;
  if (!currentPassword || !newPassword)
    return res
      .status(400)
      .json({ error: "currentPassword and newPassword are required." });
  try {
    const admin = getAdmin() as IAdmin;
    if (!(await bcrypt.compare(currentPassword, admin.password_hash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const validationError = validateCredentials(
      newUsername || admin.username,
      newPassword,
    );
    if (validationError)
      return res.status(400).json({ error: validationError });
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    updateAdmin({ username: newUsername?.trim(), passwordHash: newHash });
    res.json({ message: "Credentials updated." });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

function issueToken(username: string) {
  const options =
    config.sessionMode === "persistent"
      ? { expiresInSeconds: PERSISTENT_TTL }
      : {};
  return signToken({ sub: username }, options);
}

function validateCredentials(username: string, password: string) {
  if (!username || typeof username !== "string" || username.trim().length < 2)
    return "Username must be at least 2 characters.";
  if (!password || typeof password !== "string" || password.length < 8)
    return "Password must be at least 8 characters.";
  return null;
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

export default router;
