# ── SelfDrop Dockerfile ───────────────────────────────────
#
# Single container: Nginx + Node.js backend + compiled frontend.
#
# Build:
#   docker build -t selfdrop .
#
# Run (standalone):
#   docker run -p 8080:80 \
#     -v /host/path/to/files:/data/files:ro \
#     -v /host/path/to/db:/data/db \
#     -e SESSION_SECRET=your-secret-here \
#     selfdrop
#
# Run (external proxy):
#   docker run -p 3000:3000 \
#     -v /host/path/to/files:/data/files:ro \
#     -v /host/path/to/db:/data/db \
#     -e SESSION_SECRET=your-secret-here \
#     -e PROXY_MODE=external \
#     selfdrop

# ── Stage 1: Frontend (React + Vite) ─────────────────────
FROM node:24-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Backend ──────────────────────────────────────
FROM node:24-alpine AS backend-build
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/src ./src

# ── Stage 3: Final image ──────────────────────────────────
FROM node:24-alpine

LABEL org.opencontainers.image.title="SelfDrop"
LABEL org.opencontainers.image.description="Self-hosted file sharing"
LABEL org.opencontainers.image.source="https://github.com/yourusername/selfdrop"

# Install Nginx
RUN apk add --no-cache nginx

RUN mkdir -p /app/frontend /app/backend /data/files /data/db /run/nginx /tmp/selfdrop-zips

# Copy frontend
COPY --from=frontend-build /build/frontend/dist /app/frontend

# Copy backend
COPY --from=backend-build /build/backend/node_modules /app/backend/node_modules
COPY --from=backend-build /build/backend/src /app/backend/src
COPY backend/package.json /app/backend/package.json

# Nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Entrypoint
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# ── Environment defaults ──────────────────────────────────
ENV PORT=3000
ENV FILES_ROOT=/data/files
ENV DB_PATH=/data/db/selfdrop.db
ENV SESSION_SECRET=change-me-in-production
ENV SESSION_MODE=persistent
ENV NODE_ENV=production
ENV PROXY_MODE=internal
ENV SENDFILE_MODE=x-accel-redirect

# ── Volumes ───────────────────────────────────────────────
VOLUME ["/data/files", "/data/db"]

# ── Ports ─────────────────────────────────────────────────
# Internal mode:  port 80  (Nginx)
# External mode:  port 3000 (Node directly)
EXPOSE 80 3000

# ── Health check ──────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/start.sh"]


