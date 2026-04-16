import { Router } from "express";
import { promises as fsp } from "fs";
import { relative, dirname } from "path";
import { pathGuard } from "../middleware/pathGuard.js";
import { listDirectory, getFileInfo } from "../utils/fileInfo.js";
import config from "../config.js";

const router = Router();

router.get("/", pathGuard, async (req, res) => {
  try {
    const stat = await fsp.stat(req.safePath);
    if (!stat.isDirectory()) {
      return res
        .status(400)
        .json({ error: "Path is a file, not a directory." });
    }
    const { current, entries } = await listDirectory(req.safePath);
    const isRoot = req.safePath === config.filesRoot;
    const parent = isRoot
      ? null
      : "/" + relative(config.filesRoot, dirname(req.safePath));
    res.json({ current, parent, entries });
  } catch (err) {
    if (err instanceof Error) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT")
        return res.status(404).json({ error: "Path not found." });
      if (error.code === "EACCES")
        return res.status(403).json({ error: "Permission denied." });
    } else {
      console.error("[fs] list error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

router.get("/info", pathGuard, async (req, res) => {
  try {
    res.json(await getFileInfo(req.safePath));
  } catch (err) {
    if (err instanceof Error) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT")
        return res.status(404).json({ error: "File not found." });
      if (error.code === "EACCES")
        return res.status(403).json({ error: "Permission denied." });
    } else {
      console.error("[fs] info error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

export default router;
