#!/bin/bash
# Haru DEV — FastAPI (--reload) + Vite HMR
# Usage: bash scripts/dev.sh
set -e

cd /home/icujoa/haru

# 1. Stop existing + disable watchdog
systemctl --user stop haru-server.service 2>/dev/null || true
systemctl --user stop haru-watchdog.timer 2>/dev/null || true
pkill -9 -f "uvicorn server.main:app" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
# Kill any orphan processes on port 8080
PID=$(ss -tlnp | grep ':8080' | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$PID" ]; then kill -9 "$PID" 2>/dev/null || true; fi
sleep 1

# 2. Start API server with hot reload
echo "[dev] Starting API server on :8080 (--reload)"
mkdir -p logs
source .venv/bin/activate
nohup python -m uvicorn server.main:app --host 0.0.0.0 --port 8080 --reload --reload-dir server --timeout-graceful-shutdown 0 > logs/haru-server.log 2>&1 &
disown

# 3. Start Vite HMR
echo "[dev] Starting Vite HMR on :5173"
cd client && nohup npx vite > /home/icujoa/haru/logs/vite.log 2>&1 &
disown
cd ..

# 4. Caddy → Vite
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDY'
34.22.82.6.nip.io {
    reverse_proxy localhost:5173
}
CADDY
sudo systemctl reload caddy

# 5. Health check
for i in $(seq 1 15); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo "[dev] API server running"
    break
  fi
  sleep 1
done

for i in $(seq 1 10); do
  if curl -sf http://localhost:5173 > /dev/null 2>&1; then
    echo "[dev] Vite running"
    break
  fi
  sleep 1
done

echo ""
echo "[dev] Ready!"
echo "  URL:  https://34.22.82.6.nip.io"
echo "  Logs: tail -f logs/haru-server.log"
echo "  Vite: tail -f logs/vite.log"
