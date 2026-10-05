#!/bin/bash
# TRGUNDEM — Hızlı Yedek (DB + config + uploads)
# Kullanım: bash /var/www/scripts/yedek-al.sh
# Çıktı: /root/yedek-trgundem-YYYYMMDD-HHMM.tar.gz
# Ayrıca GitHub'a tag atar (kod yedeği)

set -e

DATE=$(date +%Y%m%d-%H%M)
BACKUP_DIR="/tmp/yedek-trgundem-${DATE}"
BACKUP_FILE="/root/yedek-trgundem-${DATE}.tar.gz"

echo "=== TRGUNDEM YEDEK ==="
echo "Tarih: ${DATE}"
echo ""

# 1. Yedek dizini oluştur
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

echo "--- 1. SQLite DB yedeği ---"
if [ -f /var/www/db/custom.db ]; then
  # SQLite online backup (corruption önlemek için .backup komutu)
  if command -v sqlite3 &> /dev/null; then
    sqlite3 /var/www/db/custom.db ".backup '${BACKUP_DIR}/db-${DATE}.db'"
    echo "  ✓ DB yedeği (sqlite3 .backup): db-${DATE}.db"
  else
    cp /var/www/db/custom.db "./db-${DATE}.db"
    echo "  ✓ DB yedeği (file copy): db-${DATE}.db"
  fi
else
  echo "  ! DB dosyası bulunamadı: /var/www/db/custom.db"
fi

echo "--- 2. .env dosyası ---"
if [ -f /var/www/.env ]; then
  cp /var/www/.env "./.env"
  echo "  ✓ .env kopyalandı"
else
  echo "  ! .env bulunamadı"
fi

echo "--- 3. .gemini-key dosyaları ---"
KEY_COUNT=0
for f in /var/www/.gemini-key /var/www/.gemini-key2 /var/www/.gemini-key3 /var/www/.gemini-key4 /var/www/.gemini-key5; do
  if [ -f "$f" ]; then
    cp "$f" "./$(basename $f)"
    KEY_COUNT=$((KEY_COUNT+1))
  fi
done
echo "  ✓ ${KEY_COUNT} adet .gemini-key dosyası kopyalandı"

echo "--- 4. Nginx config ---"
if [ -d /etc/nginx/sites-enabled ]; then
  mkdir -p ./nginx-sites-enabled
  cp -r /etc/nginx/sites-enabled/* ./nginx-sites-enabled/ 2>/dev/null || true
  echo "  ✓ nginx sites-enabled kopyalandı"
fi
if [ -f /etc/nginx/nginx.conf ]; then
  cp /etc/nginx/nginx.conf ./nginx.conf
  echo "  ✓ nginx.conf kopyalandı"
fi

echo "--- 5. PM2 config ---"
if command -v pm2 &> /dev/null; then
  pm2 save 2>/dev/null || true
  if [ -f /root/.pm2/dump.pm2 ]; then
    cp /root/.pm2/dump.pm2 ./pm2-dump.pm2
    echo "  ✓ PM2 dump kopyalandı"
  fi
fi

echo "--- 6. uploads klasörü (yönetici görselleri) ---"
if [ -d /var/www/public/uploads ]; then
  cp -r /var/www/public/uploads ./uploads
  echo "  ✓ uploads kopyalandı"
else
  echo "  ! uploads klasörü yok"
fi

echo "--- 7. Pipeline status ---"
if [ -f /var/www/.pipeline-status.json ]; then
  cp /var/www/.pipeline-status.json ./pipeline-status.json
  echo "  ✓ pipeline status kopyalandı"
fi

echo "--- 8. Son commit hash ---"
cd /var/www
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "$COMMIT" > "$BACKUP_DIR/git-commit.txt"
echo "  ✓ Son commit: ${COMMIT:0:7}"

echo "--- 9. Yedek README ---"
cat > "$BACKUP_DIR/README.txt" <<EOF
TRGUNDEM YEDEK
Tarih: $(date)
Son commit: ${COMMIT}
DB: db-${DATE}.db
İçerik:
- .env (SMTP, ALTIN_MAIL_LIST, vs.)
- .gemini-key.. dosyaları (5 adet)
- nginx config
- PM2 dump
- uploads (yönetici görselleri)
- pipeline status
- SQLite DB

GERİ YÜKLEME:
1. DB: cp db-*.db /var/www/db/custom.db
2. .env: cp .env /var/www/
3. .gemini-key: cp .gemini-key* /var/www/
4. nginx: cp nginx-sites-enabled/* /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
5. PM2: cp pm2-dump.pm2 /root/.pm2/dump.pm2 && pm2 resurrect
6. uploads: cp -r uploads /var/www/public/
7. cd /var/www && git checkout ${COMMIT}
8. npm run build && pm2 restart trgundem
EOF
echo "  ✓ README.txt oluşturuldu"

echo "--- 10. TAR.GZ oluştur ---"
cd /tmp
tar czf "$BACKUP_FILE" "yedek-trgundem-${DATE}"
echo "  ✓ Yedek: ${BACKUP_FILE}"
ls -lh "$BACKUP_FILE" | awk '{print "  Boyut: " $5}'

# 11. Geçici dizini temizle
rm -rf "$BACKUP_DIR"

echo ""
echo "=== YEDEK TAMAMLANDI ==="
echo "  Dosya: ${BACKUP_FILE}"
echo "  GitHub'da kod zaten pushlanmış durumda"
echo ""
echo "GitHub'a tag atmak için (opsiyonel):"
echo "  cd /var/www && git tag -a backup-${DATE} -m 'Yedek noktası' && git push origin backup-${DATE}"
