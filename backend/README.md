# spore-backend

Node.js + Express backend for Spore — a self-hosted file sharing service.

## Architecture

```
Lighttpd (port 80)
  ├── /           → serves compiled frontend
  ├── /api/*      → reverse proxied to this backend (port 3000)
  └── /s/*        → X-Sendfile file delivery (authorised by this backend)
```

## Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Database**: SQLite via better-sqlite3
- **Auth**: bcrypt password hashing, signed session tokens
- **File delivery**: X-Sendfile header (Lighttpd serves the actual bytes)

## Getting started

```bash
cp .env.example .env
# Edit .env — set FILES_ROOT and SESSION_SECRET at minimum

npm install
npm run dev     # development (nodemon)
npm start       # production
```

## Environment variables

| Variable         | Default              | Description                                      |
|------------------|----------------------|--------------------------------------------------|
| `PORT`           | `3000`               | Port the Express server listens on               |
| `FILES_ROOT`     | `/data/files`        | Absolute path to the files directory             |
| `DB_PATH`        | `/data/db/shares.db` | Absolute path to the SQLite database file        |
| `SESSION_SECRET` | —                    | Secret for signing session tokens. **Required.** |
| `SESSION_MODE`   | `persistent`         | `persistent` or `session`                        |

## API — Phase 1: Filesystem

### `GET /api/fs?path=/`
List directory contents.

**Query params**
| Param  | Type   | Default | Description                              |
|--------|--------|---------|------------------------------------------|
| `path` | string | `/`     | Relative path from `FILES_ROOT`          |

**Response**
```json
{
  "current": { "type": "directory", "name": "files", "path": "/", "modifiedAt": "..." },
  "parent": null,
  "entries": [
    { "type": "directory", "name": "documents", "path": "/documents", "modifiedAt": "..." },
    { "type": "file", "name": "photo.jpg", "path": "/photo.jpg", "size": 204800, "sizeHuman": "200 KB", "mimeType": "image/jpeg", "modifiedAt": "..." }
  ]
}
```

### `GET /api/fs/info?path=/documents/file.pdf`
Get metadata for a single file.

**Response**
```json
{
  "type": "file",
  "name": "file.pdf",
  "path": "/documents/file.pdf",
  "size": 2457600,
  "sizeHuman": "2.3 MB",
  "mimeType": "application/pdf",
  "modifiedAt": "2026-03-12T10:00:00.000Z"
}
```

### `GET /health`
Returns `{ "status": "ok" }`. Used by Docker HEALTHCHECK.

## Phases

| Phase | Status      | Scope                                              |
|-------|-------------|----------------------------------------------------|
| 1     | ✅ Complete | Filesystem API (list, info)                        |
| 2     | 🔜 Next     | Share management (create, list, revoke)            |
| 3     | 🔜 Planned  | Admin auth (setup, login, session)                 |
| 4     | 🔜 Planned  | Download handler (token validation, X-Sendfile)    |

## Security notes

- All paths are resolved and checked against `FILES_ROOT` before any filesystem access.
- Path traversal (`../`) is rejected at the middleware level.
- The filesystem API will require admin auth once Phase 3 is complete.
- Files are never streamed through the Node process — X-Sendfile delegates delivery to Lighttpd.
