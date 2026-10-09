#!/bin/bash
# Cron schedule — pipeline + cleanup + altın takip
# Istanbul saati ile (CRON_TZ=Europe/Istanbul)
#
# Schedule:
#   00:00-05:00 arası SAAT BAŞI (6 run: 00, 01, 02, 03, 04, 05)
#   06:00-23:40 arası HER 20 DAKİKA (54 run)
#   Toplam: 60 run/gün
#
# Cleanup: her saatte 3 kez (5, 25, 45. dakikalarda)
# Altın takip: hafta içi her gün 09:00

set -e

echo "=== MEVCUT CRON ==="
crontab -l 2>/dev/null || echo "(boş)"

echo ""
echo "=== YENİ CRON YAZILIOR ==="

# Mevcut cron'u oku, pipeline/cleanup/altin satırlarını çıkar, gerisini koru
(crontab -l 2>/dev/null | grep -v "pipeline-all" | grep -v "cleanup-duplicates" | grep -v "altin-takip" | grep -v "^CRON_TZ=" || true

# Istanbul zaman dilimi
echo "CRON_TZ=Europe/Istanbul"

# Pipeline — 00:00-05:00 saat başı (gece düşük trafik)
echo "0 0-5 * * * cd /var/www && node --expose-gc scripts/pipeline-all.js --once >> /var/www/pipeline-once.log 2>&1"

# Pipeline — 06:00-23:40 her 20 dakika (gündüz yüksek trafik)
echo "*/20 6-23 * * * cd /var/www && node --expose-gc scripts/pipeline-all.js --once >> /var/www/pipeline-once.log 2>&1"

# Cleanup — her saatte 3 kez
echo "5,25,45 * * * * cd /var/www && node scripts/cleanup-duplicates.js >> /var/www/cleanup.log 2>&1"

# Altın takip — hafta içi 09:00'da
echo "0 9 * * 1-5 cd /var/www && node scripts/altin-takip.js >> /var/www/altin-takip.log 2>&1"

) | crontab -

echo ""
echo "=== YENİ CRON YAZILDI ==="
crontab -l

echo ""
echo "=== CRON SERVİSİ DURUMU ==="
systemctl status cron 2>&1 | head -5 || service cron status 2>&1 | head -5

echo ""
echo "=== HISTORY LOG DOSYASI KONTROL ==="
ls -la /var/www/pipeline-history.log 2>&1 || echo "(yok — ilk pipeline çalıştığında oluşturulur)"

echo ""
echo "=== TEST: PIPELINE TETİKLE ==="
echo "Pipeline'ı manuel tetikleyip history'e yazıp yazmadığını test edelim..."
curl -s -X POST "http://localhost:3000/api/pipeline/run" 2>&1
echo ""
sleep 3
echo ""
echo "=== STATUS (3 sn sonra) ==="
curl -s "http://localhost:3000/api/pipeline/status" 2>&1 | python3 -m json.tool 2>&1 | head -10
