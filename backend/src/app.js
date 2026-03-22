import express from 'express';
import { fileURLToPath } from 'url';
import config from './config.js';
import fsRouter       from './routes/fs.js';
import sharesRouter   from './routes/shares.js';
import authRouter     from './routes/auth.js';
import downloadRouter from './routes/download.js';
import settingsRouter from './routes/settings.js';
import requireAuth    from './middleware/requireAuth.js';

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0' }));

app.use('/api/auth',     authRouter);
app.use('/api/fs',       requireAuth, fsRouter);
app.use('/api/shares',   requireAuth, sharesRouter);
app.use('/s',            downloadRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin',    settingsRouter);

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Global error handler ──────────────────────────────────
// Express 5 passes async errors automatically — no need for next(err) wrappers
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

// ── Start — only when run directly, not when imported by tests ──────────
// ESM equivalent of `if (require.main === module)`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(config.port, () => {
    console.log(`SelfDrop backend listening on port ${config.port}`);
    console.log(`FILES_ROOT: ${config.filesRoot}`);
    console.log(`DB_PATH:    ${config.dbPath}`);
  });
}

export default app;
