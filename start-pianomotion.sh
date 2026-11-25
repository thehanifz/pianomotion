#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

export PORT="${PORT:-4000}"
export HOST="${HOST:-0.0.0.0}"

if [ ! -d "node_modules" ]; then
  echo "[PianoMotion] Installing Node.js dependencies..."
  npm install
fi

if [ ! -f "dist/web/index.html" ]; then
  echo "[PianoMotion] Building Web UI..."
  npm run app:build
fi

echo "[PianoMotion] Starting server on http://${HOST}:${PORT}"
exec npm run app:start
