#!/bin/bash
# TRGUNDEM — Veri temizliği + Güvenlik + Yedek
# Kullanım: bash /var/www/scripts/backup-and-cleanup.sh
# Çıktı: /var/www/backup-trgundem-YYYY-MM-DD-HHMM.zip

set -e
cd /var/www

DATE=$(date +"%Y-%m-%d-%H%M")
BACKUP_FILE="/var/www/backup-trgundem-${DATE}.zip"
TMP_DIR="/tmp/trgundem-backup-${DATE}"

echo "=== TRGUNDEM YEDEK + TEMİZLİK ==="
echo "Tarih: ${DATE}"
echo ""

# 1. TEMİZLİK
echo "--- 1. VERİ TEMİZLİĞİ ---"

# 1a. Eski archived haberler (30 günden eski)
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const r1 = await db.publishedArticle.deleteMany({
    where: { status: 'archived', archivedAt: { lt: cutoff } }
  });
  console.log('Eski archived haber silindi: ' + r1.count);

  // 1b. Eski pending_review (30 günden eski) — artık modası geçmiş
  const r2 = await db.publishedArticle.deleteMany({
    where: { status: 'pending_review', updatedAt: { lt: cutoff } }
  });
  console.log('Eski pending_review silindi: ' + r2.count);

  // 1c. Eski Article'lar (7 günden eski raw makaleler)
  const cutoffArticles = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const r3 = await db.article.deleteMany({
    where: { publishedAt: { lt: cutoffArticles } }
  });
  console.log('Eski makale (Article) silindi: ' + r3.count);

  // 1d. Eski okuyucu mesajları (90 günden eski)
  const cutoffMsg = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const r4 = await db.readerMessage.deleteMany({
    where: { createdAt: { lt: cutoffMsg } }
  });
  console.log('Eski okuyucu mesajı silindi: ' + r4.count);

  await db.\$disconnect();
})().catch(e => { console.error('Temizlik hatasi:', e.message); process.exit(1); });
"

echo ""

# 1e. Eski log dosyaları
echo "--- Log temizliği ---"
find /var/www -name "*.log" -mtime +7 -delete 2>/dev/null || true
find /var/www -name "pipeline-*.json" -mtime +7 -delete 2>/dev/null || true
echo "Eski log dosyaları silindi (7 günden eski)"

# 1f. PM2 log temizliği
pm2 flush trgundem 2>/dev/null || true
echo "PM2 log temizlendi"

echo ""

# 2. GÜVENLİK KONTROL
echo "--- 2. GÜVENLİK KONTROLU ---"

# 2a. .env dosyası izinleri
chmod 600 /var/www/.env
chmod 600 /var/www/.gemini-key* 2>/dev/null || true
echo ".env ve .gemini-key* izinleri 600 (sadece root)"

# 2b. DB dosyası izinleri
chmod 600 /var/www/db/custom.db 2>/dev/null || true
chmod 600 /var/www/db/custom.db-journal 2>/dev/null || true
echo "DB dosyası izinleri 600"

# 2c. /var/www/scripts çalıştırma izni
chmod 700 /var/www/scripts 2>/dev/null || true

# 2d. GitHub token var mı kontrol et
echo ""
echo "GitHub token kontrolu:"
if grep -q "ghp_\|github_pat_" /var/www/.env 2>/dev/null; then
  echo "  ⚠ .env'de GitHub token var — script'lere commit etme!"
else
  echo "  ✓ .env'de GitHub token yok"
fi

# 2e. Admin şifre kontrolu
ADMIN_PASS=$(grep "^ADMIN_PASSWORD=" /var/www/.env 2>/dev/null | cut -d'=' -f2)
if [ "$ADMIN_PASS" = "Trgundem123" ]; then
  echo "  ⚠ Admin şifre varsayılan (Trgundem123) — değiştir!"
else
  echo "  ✓ Admin şifre değiştirilmiş"
fi

echo ""

# 3. YEDEK
echo "--- 3. YEDEK ALINIYOR ---"

mkdir -p "$TMP_DIR"
mkdir -p "$TMP_DIR/db"
mkdir -p "$TMP_DIR/uploads"
mkdir -p "$TMP_DIR/config"
mkdir -p "$TMP_DIR/logs"

# 3a. SQLite DB yedeği (online backup — corruption önlemek için)
echo "SQLite DB yedeği alınıyor..."
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  // Tüm publishedArticle'ları JSON'a aktar
  const published = await db.publishedArticle.findMany();
  const articles = await db.article.findMany({ take: 1000 });
  const sources = await db.source.findMany();
  const messages = await db.readerMessage.findMany();
  const fs = require('fs');
  fs.writeFileSync('$TMP_DIR/db/published.json', JSON.stringify(published, null, 2));
  fs.writeFileSync('$TMP_DIR/db/articles.json', JSON.stringify(articles, null, 2));
  fs.writeFileSync('$TMP_DIR/db/sources.json', JSON.stringify(sources, null, 2));
  fs.writeFileSync('$TMP_DIR/db/messages.json', JSON.stringify(messages, null, 2));
  console.log('  - published: ' + published.length + ' kayıt');
  console.log('  - articles: ' + articles.length + ' kayıt');
  console.log('  - sources: ' + sources.length + ' kayıt');
  console.log('  - messages: ' + messages.length + ' kayıt');
  await db.\$disconnect();
})().catch(e => { console.error('Hata:', e.message); process.exit(1); });
"

# 3b. SQLite raw DB dosyası da kopyala
if [ -f /var/www/db/custom.db ]; then
  cp /var/www/db/custom.db "$TMP_DIR/db/custom.db"
  echo "  - custom.db raw kopyalandı"
fi

# 3c. Config dosyaları (.env + .gemini-key*)
cp /var/www/.env "$TMP_DIR/config/.env" 2>/dev/null || true
cp /var/www/.gemini-key "$TMP_DIR/config/.gemini-key" 2>/dev/null || true
cp /var/www/.gemini-key2 "$TMP_DIR/config/.gemini-key2" 2>/dev/null || true
cp /var/www/.gemini-key3 "$TMP_DIR/config/.gemini-key3" 2>/dev/null || true
cp /var/www/ecosystem.config.cjs "$TMP_DIR/config/" 2>/dev/null || true
echo "Config dosyaları kopyalandı"

# 3d. Uploads klasörü (yönetici tarafından yüklenen fotoğraflar)
if [ -d /var/www/public/uploads ]; then
  cp -r /var/www/public/uploads "$TMP_DIR/uploads/" 2>/dev/null || true
  UPLOAD_COUNT=$(find /var/www/public/uploads -type f 2>/dev/null | wc -l)
  echo "Uploads: $UPLOAD_COUNT dosya kopyalandı"
else
  echo "Uploads klasörü yok"
fi

# 3e. Loglar
cp /var/www/pipeline-spawn.log "$TMP_DIR/logs/" 2>/dev/null || true
cp /var/www/pipeline-once.log "$TMP_DIR/logs/" 2>/dev/null || true
cp /var/www/pipeline-status.json "$TMP_DIR/logs/" 2>/dev/null || true
pm2 logs trgundem --nostream --lines 200 > "$TMP_DIR/logs/pm2-trgundem.log" 2>/dev/null || true
echo "Loglar kopyalandı"

# 3f. Manifest
cat > "$TMP_DIR/MANIFEST.txt" << EOF
TRGUNDEM.NET YEDEK
Tarih: $(date)
Sunucu: $(hostname)
IP: $(hostname -I | awk '{print $1}')

IÇERIK:
- db/custom.db (SQLite raw)
- db/published.json (yayınlanan haberler)
- db/articles.json (raw RSS makaleler, son 1000)
- db/sources.json (RSS kaynakları)
- db/messages.json (okuyucu mesajları)
- config/.env (DATABASE_URL, GEMINI, SMTP, ADMIN_PASSWORD)
- config/.gemini-key, .gemini-key2, .gemini-key3 (3 Gemini API key)
- config/ecosystem.config.cjs (PM2 config)
- uploads/ (yönetici yüklediği fotoğraflar)
- logs/ (pipeline + pm2 log)

GERI YÜKLEME:
1. /var/www/db/custom.db dosyasını bu yedekten kopyala
2. config/.env dosyasını /var/www/.env olarak kopyala
3. config/.gemini-key* dosyalarını /var/www/ altına kopyala
4. uploads/ klasörünü /var/www/public/uploads/ altına kopyala
5. pm2 restart trgundem

GÜVENLIK:
- Bu yedek hassas veri içerir (API key'ler, SMTP şifreleri)
- Asla GitHub'a veya herkese açık alana gönderme
- Sadece yerel bilgisayarında şifreli diskte sakla
EOF

# 3g. ZIP oluştur (zip yoksa tar.gz kullan)
echo ""
echo "Sıkıştırma yapılıyor..."
cd /tmp
if command -v zip &> /dev/null; then
  zip -r -q "$BACKUP_FILE" "$(basename $TMP_DIR)"
  BACKUP_EXT="zip"
else
  # zip yoksa tar.gz kullan
  BACKUP_FILE="${BACKUP_FILE%.zip}.tar.gz"
  tar -czf "$BACKUP_FILE" "$(basename $TMP_DIR)"
  BACKUP_EXT="tar.gz"
fi
cd /var/www

# 3h. Geçici dizini temizle
rm -rf "$TMP_DIR"

# 4. SONUÇ
echo ""
echo "=== YEDEK TAMAMLANDI ==="
echo "Yedek dosya: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"
echo ""
echo "Bu dosyayı bilgisayarına indirmek için (kendi bilgisayarında):"
echo "  scp root@31.40.205.148:$BACKUP_FILE ~/Downloads/"
echo ""
echo "=== GÜVENLIK ÖNERILERI ==="
echo "1. .env ve .gemini-key* dosyalarını asla GitHub'a gönderme"
echo "2. Admin şifreyi (Trgundem123) değiştir (.env: ADMIN_PASSWORD)"
echo "3. Bu yedek dosyayı şifreli diskte sakla"
echo "4. Yedeği 1 hafta boyunca takip et, sorun olursa geri yükle"
