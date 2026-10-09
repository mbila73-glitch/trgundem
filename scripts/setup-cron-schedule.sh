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

# Mevcut cron'u oku, tüm bizim cron satırlarımızı çıkar, gerisini koru
# Bu filtreler olmadan her setup'ta cron'lar çoğalır (her satır bir kez daha eklenir)
(crontab -l 2>/dev/null | grep -v "pipeline-all" | grep -v "cleanup-duplicates" | grep -v "altin-takip" | grep -v "fetch-harem-altin-cache" | grep -v "export-old-archives" | grep -v "^CRON_TZ=" || true

# Istanbul zaman dilimi
echo "CRON_TZ=Europe/Istanbul"

# Pipeline — 00:00-05:00 saat başı (gece düşük trafik)
echo "0 0-5 * * * cd /var/www && node --expose-gc scripts/pipeline-all.js --once >> /var/www/pipeline-once.log 2>&1"

# Pipeline — 06:00-23:40 her 20 dakika (gündüz yüksek trafik)
echo "*/20 6-23 * * * cd /var/www && node --expose-gc scripts/pipeline-all.js --once >> /var/www/pipeline-once.log 2>&1"

# Cleanup — İPTAL EDİLDİ, artık pipeline sonrası otomatik çalışıyor
# echo "5,25,45 * * * * cd /var/www && node scripts/cleanup-duplicates.js >> /var/www/cleanup.log 2>&1"

# Altın takip — hafta içi 09:00'da
echo "0 9 * * 1-5 cd /var/www && node scripts/altin-takip.js >> /var/www/altin-takip.log 2>&1"

# Harem Altın fiyat çekme — her 5 dakikada 1 (InfoBands'da GRAM ALTIN için)
echo "*/5 * * * * cd /var/www && node scripts/fetch-harem-altin-cache.js >> /var/www/harem-altin-fetch.log 2>&1"

# Günlük arşiv sıkıştırma — 00:30'da önceki günün haberlerini gzip'e aktar + DB'den sil
# (00:00 pipeline cycle'ı 16 dk sürer, çakışmayı önlemek için 00:30)
echo "30 0 * * * cd /var/www && node scripts/export-old-archives.js --days=1 --delete >> /var/www/archive-export.log 2>&1"

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
