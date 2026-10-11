#!/bin/bash
# Dev server watchdog — her öldüğünde 5 saniye sonra yeniden başlatır.
# Sandbox'ta nohup/setsid tek başına yeterli değil, bu yüzden while-true döngüsü.

cd /home/z/my-project

while true; do
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Dev server başlatılıyor..."
  npm run dev > /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Dev server öldü (exit: $EXIT_CODE), 5 saniye sonra yeniden başlatılıyor..."
  sleep 5
done
