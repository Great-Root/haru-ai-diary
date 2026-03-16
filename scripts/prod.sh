#!/bin/bash
# Haru PROD — Vite build + FastAPI (systemd)
# Usage: bash scripts/prod.sh
set -e

cd /home/icujoa/haru

# 1. Stop server + Vite + kill dev mode
echo "[prod] Stopping server..."
systemctl --user stop haru-server.service 2>/dev/null || true
pkill -9 -f "uvicorn.*--reload" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
systemctl --user stop haru-watchdog.timer 2>/dev/null || true
sleep 1

# 2. Build frontend
echo "[prod] Building frontend..."
cd client && npx vite build && cd ..

# 3. Rotate log on deploy
if [ -f logs/haru-server.log ]; then
    mv logs/haru-server.log "logs/haru-server.$(date +%Y%m%d-%H%M%S).log"
fi

# 4. Start server via systemd
echo "[prod] Starting server..."
systemctl --user daemon-reload
systemctl --user start haru-server.service

# 4. Caddy → static files + API proxy
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDY'
34.22.82.6.nip.io {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle /ws {
        reverse_proxy localhost:8080
    }
    handle /health {
        reverse_proxy localhost:8080
    }
    handle /uploads/* {
        root * /home/icujoa/haru
        file_server
    }
    handle /generated/* {
        root * /home/icujoa/haru
        file_server
    }
    handle /avatars/* {
        root * /home/icujoa/haru
        file_server
    }
    handle {
        root * /home/icujoa/haru/client/dist
        try_files {path} /index.html
        file_server
    }
}
CADDY
sudo systemctl reload caddy

# 5. Health check (retry up to 15 seconds)
for i in $(seq 1 15); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo "[prod] Server running (PID: $(systemctl --user show haru-server.service -p MainPID --value))"
    exit 0
  fi
  sleep 1
done

echo "[prod] Server failed."
systemctl --user status haru-server.service
exit 1
