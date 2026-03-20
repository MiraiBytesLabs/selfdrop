#!/bin/sh
set -e

# ── SelfDrop container entrypoint ─────────────────────────
#
# Supports two modes via PROXY_MODE env var:
#
#   PROXY_MODE=internal (default)
#     Starts Node backend + embedded Nginx.
#     Nginx serves the frontend, proxies API requests,
#     and handles file downloads via X-Accel-Redirect.
#
#   PROXY_MODE=external
#     Starts Node backend only on PORT (default 3000).
#     Your own Nginx/Traefik/Caddy handles routing.
#     Set SENDFILE_MODE=stream if not using Nginx.

PROXY_MODE="${PROXY_MODE:-internal}"
echo "Starting SelfDrop (PROXY_MODE=${PROXY_MODE})..."

# Ensure data directories exist
mkdir -p /data/files
mkdir -p /data/db

# ── Start Node backend ────────────────────────────────────
echo "Starting Node backend on port ${PORT:-3000}..."
node /app/backend/src/app.js &
NODE_PID=$!

# Wait for Node to be ready before starting the proxy
sleep 1

if ! kill -0 $NODE_PID 2>/dev/null; then
  echo "ERROR: Node backend failed to start"
  exit 1
fi

echo "Node backend started (PID $NODE_PID)"

# ── Start Nginx (internal mode only) ─────────────────────
if [ "$PROXY_MODE" = "internal" ]; then
  echo "Starting Nginx on port 80..."
  nginx -g "daemon off;" &
  NGINX_PID=$!

  sleep 1

  if ! kill -0 $NGINX_PID 2>/dev/null; then
    echo "ERROR: Nginx failed to start"
    kill $NODE_PID 2>/dev/null
    exit 1
  fi

  echo "Nginx started (PID $NGINX_PID)"
else
  echo "External proxy mode — Nginx not started."
  echo "Node is listening on port ${PORT:-3000}."
  NGINX_PID=""
fi

echo "SelfDrop is ready."

# ── Watch processes ───────────────────────────────────────
wait_for_exit() {
  while true; do
    if ! kill -0 $NODE_PID 2>/dev/null; then
      echo "ERROR: Node backend exited unexpectedly"
      [ -n "$NGINX_PID" ] && kill $NGINX_PID 2>/dev/null
      exit 1
    fi
    if [ -n "$NGINX_PID" ] && ! kill -0 $NGINX_PID 2>/dev/null; then
      echo "ERROR: Nginx exited unexpectedly"
      kill $NODE_PID 2>/dev/null
      exit 1
    fi
    sleep 5
  done
}

# Graceful shutdown on SIGTERM (docker stop)
trap 'echo "Shutting down..."; kill $NODE_PID 2>/dev/null; [ -n "$NGINX_PID" ] && kill $NGINX_PID 2>/dev/null; exit 0' TERM INT

wait_for_exit