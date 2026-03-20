"use strict";

const express = require("express");
const config = require("./config");

const fsRouter = require("./routes/fs");
const sharesRouter = require("./routes/shares");
const authRouter = require("./routes/auth");
const downloadRouter = require("./routes/download");
const requireAuth = require("./middleware/requireAuth");

const app = express();

app.disable("x-powered-by");

// ── Middleware ────────────────────────────────────────────
app.use(express.json());

// Basic request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.npm_package_version || "0.1.0",
  });
});

// Auth — public
app.use("/api/auth", authRouter);

// Filesystem API — protected
app.use("/api/fs", requireAuth, fsRouter);

// Share management — protected
app.use("/api/shares", requireAuth, sharesRouter);

// Download handler — public, self-validates via share token
app.use("/s", downloadRouter);

// ── 404 catch-all ────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// ── Global error handler ─────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal server error." });
});

// ── Start ─────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`SelfDrop backend listening on port ${config.port}`);
  console.log(`FILES_ROOT: ${config.filesRoot}`);
  console.log(`DB_PATH:    ${config.dbPath}`);
});

module.exports = app;
