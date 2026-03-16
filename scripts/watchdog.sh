#!/bin/bash
# Haru watchdog — restart server if health check fails (prod only)
cd /home/icujoa/haru
mkdir -p logs

# Skip if dev mode (nohup --reload process running)
if pgrep -f "uvicorn.*--reload" > /dev/null 2>&1; then
  exit 0
fi

if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
  exit 0
fi

echo "[watchdog] $(date) — Server down, restarting..." >> logs/watchdog.log
systemctl --user restart haru-server.service

for i in $(seq 1 15); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo "[watchdog] $(date) — Server recovered" >> logs/watchdog.log
    exit 0
  fi
  sleep 1
done

echo "[watchdog] $(date) — Server failed to recover" >> logs/watchdog.log
exit 1
