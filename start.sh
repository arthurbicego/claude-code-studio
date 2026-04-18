#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PORT=3000
WEB_PORT=5173
URL="http://localhost:${WEB_PORT}"

if lsof -ti:${SERVER_PORT} >/dev/null 2>&1; then
  echo "[start] porta ${SERVER_PORT} ocupada — encerrando processo existente"
  lsof -ti:${SERVER_PORT} | xargs kill -9 2>/dev/null || true
  sleep 0.3
fi
if lsof -ti:${WEB_PORT} >/dev/null 2>&1; then
  echo "[start] porta ${WEB_PORT} ocupada — encerrando processo existente"
  lsof -ti:${WEB_PORT} | xargs kill -9 2>/dev/null || true
  sleep 0.3
fi

if [ ! -d "${ROOT}/node_modules" ]; then
  echo "[start] instalando deps do server..."
  (cd "${ROOT}" && npm install)
fi
if [ ! -d "${ROOT}/web/node_modules" ]; then
  echo "[start] instalando deps do web..."
  (cd "${ROOT}/web" && npm install)
fi

PIDS=()
cleanup() {
  echo ""
  echo "[start] encerrando..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "[start] subindo backend (porta ${SERVER_PORT})..."
(cd "${ROOT}" && node server/index.js) &
PIDS+=($!)

echo "[start] subindo frontend (porta ${WEB_PORT})..."
(cd "${ROOT}/web" && npm run dev --silent) &
PIDS+=($!)

# espera o vite responder antes de abrir o browser
for _ in {1..30}; do
  if curl -sf "${URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

echo "[start] abrindo ${URL}"
if command -v open >/dev/null 2>&1; then
  open "${URL}" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" || true
fi

echo "[start] tudo no ar. Ctrl+C pra encerrar."
wait
