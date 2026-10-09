// Eski arşiv kayıtlarını gzip JSON dosyasına sıkıştırır.
// Delil amaçlı tutuluyor — silinmez, sadece sıkıştırılır (yer kazandırır).
//
// Kullanım:
//   node scripts/export-old-archives.js                # 24 saatten eskiyi dışa aktar
//   node scripts/export-old-archives.js --days=7       # 7 günden eskiyi dışa aktar
//   node scripts/export-old-archives.js --dry-run      # sadece say, dosya yazma
//   node scripts/export-old-archives.js --delete       # sıkıştırma sonrası DB'den SİL
//
// Çıktı: /var/www/archives/archives-YYYY-MM-DD_HHMM.json.gz
//   - Her kayıt: { id, aiTitle, aiSummary, imageUrl, category, wordCount,
//                  sourceArticleIds, sourceCount, earliestPublishedAt,
//                  latestPublishedAt, status, publishedAt, archivedAt,
//                  initialHearts, clickHearts, createdAt, updatedAt }
//   - gzip ile sıkıştırılmış (~5-10x küçülme)
//
// Geri yükleme (gerekirse):
//   gunzip -c /var/www/archives/archives-2026-10-09_1200.json.gz | \
//     node scripts/import-archives.js

var path = require('path');
var fs = require('fs');
var zlib = require('zlib');

// .env oku
var envPath = path.join(__dirname, '..', '.env');
try {
  var envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(function(line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    var idx = line.indexOf('=');
    if (idx > 0) { process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim(); }
  });
} catch (e) {}

var { PrismaClient } = require('@prisma/client');
var prisma = new PrismaClient();

var DRY_RUN = process.argv.includes('--dry-run');
var DELETE_AFTER = process.argv.includes('--delete');

// --days=N argümanını parse et
var daysArg = 24 / 24; // default 1 gün (24 saat)
var daysMatch = process.argv.find(function(a) { return a.startsWith('--days='); });
if (daysMatch) {
  var parsed = parseInt(daysMatch.split('=')[1], 10);
  if (!isNaN(parsed) && parsed > 0) daysArg = parsed;
}

var ARCHIVES_DIR = '/var/www/archives';

async function main() {
  console.log('=== Eski Arşiv Dışa Aktarım ===');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN' : (DELETE_AFTER ? 'DELETE AFTER EXPORT' : 'EXPORT ONLY'));
  console.log('Eşik: ' + daysArg + ' günden eski arşivler');
  console.log('');

  // Sıkıştırma klasörü
  if (!DRY_RUN) {
    try { fs.mkdirSync(ARCHIVES_DIR, { recursive: true }); } catch (e) {}
  }

  // Eşik tarihi hesapla
  var cutoff = new Date(Date.now() - daysArg * 24 * 60 * 60 * 1000);
  console.log('Eşik tarihi: ' + cutoff.toISOString());
  console.log('');

  // Toplam arşiv sayısı
  var totalCount = await prisma.publishedArticle.count({ where: { status: 'archived' } });
  console.log('Toplam arşiv kaydı: ' + totalCount);

  // Eşikten eski arşiv sayısı
  var oldCount = await prisma.publishedArticle.count({
    where: {
      status: 'archived',
      archivedAt: { lt: cutoff }
    }
  });
  console.log('Eşikten eski kayıt: ' + oldCount);
  console.log('');

  if (oldCount === 0) {
    console.log('✓ Dışa aktarılacak kayıt yok (hepsi ' + daysArg + ' günden yeni).');
    return;
  }

  if (DRY_RUN) {
    console.log('=== DRY-RUN — dosya yazılmadı ===');
    return;
  }

  // Kayıtları çek
  console.log('Kayıtlar çekiliyor...');
  var oldArticles = await prisma.publishedArticle.findMany({
    where: {
      status: 'archived',
      archivedAt: { lt: cutoff }
    },
    orderBy: { archivedAt: 'asc' }
  });
  console.log('✓ ' + oldArticles.length + ' kayıt çekildi');

  // Dosya adı: timestamp
  var now = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate());
  var timeStr = pad(now.getHours()) + pad(now.getMinutes());
  var fileName = 'archives-' + dateStr + '_' + timeStr + '-days' + daysArg + '.json.gz';
  var filePath = path.join(ARCHIVES_DIR, fileName);

  console.log('Sıkıştırma: ' + filePath);

  // JSON stringify (tüm alanları dahil et)
  var jsonStr = JSON.stringify({
    exportedAt: now.toISOString(),
    cutoff: cutoff.toISOString(),
    thresholdDays: daysArg,
    count: oldArticles.length,
    articles: oldArticles
  });

  // gzip sıkıştır
  var gzipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });
  fs.writeFileSync(filePath, gzipped);

  var origSizeKB = Math.round(Buffer.byteLength(jsonStr, 'utf8') / 1024);
  var compSizeKB = Math.round(gzipped.length / 1024);
  var ratio = Math.round((1 - compSizeKB / origSizeKB) * 100);

  console.log('✓ Sıkıştırma tamam');
  console.log('  Orijinal boyut: ' + origSizeKB + ' KB');
  console.log('  Sıkıştırılmış:  ' + compSizeKB + ' KB');
  console.log('  Tasarruf:       ' + ratio + '%');
  console.log('');

  // Dosyayı doğrula
  var stats = fs.statSync(filePath);
  console.log('Dosya boyutu: ' + Math.round(stats.size / 1024) + ' KB');
  console.log('Dosya yolu: ' + filePath);
  console.log('');

  // DB'den sil (--delete flag ile)
  if (DELETE_AFTER) {
    console.log('=== DB\'DEN SİLİNİYOR ===');
    console.log('DİKKAT: Bu işlem geri alınamaz. Sıkıştırılmış dosyadan geri yüklenebilir.');
    var deleted = await prisma.publishedArticle.deleteMany({
      where: {
        status: 'archived',
        archivedAt: { lt: cutoff }
      }
    });
    console.log('✓ ' + deleted.count + ' kayıt DB\'den silindi (sıkıştırılmış dosyada saklı)');

    // DB'yi VACUUM (SQLite disk boyutunu küçült)
    console.log('DB VACUUM...');
    try {
      await prisma.$executeRawUnsafe('VACUUM');
      console.log('✓ VACUUM tamam — disk boyutu küçüldü');
    } catch (e) {
      console.log('⚠ VACUUM hatası: ' + e.message);
    }
  } else {
    console.log('ℹ Kayıtlar DB\'de duruyor (silinmedi). --delete flag\'iyle çalıştırırsanız');
    console.log('  sıkıştırma sonrası DB\'den silinir ve VACUUM ile disk boyutu küçülür.');
  }

  console.log('');
  console.log('=== ÖZET ===');
  console.log('Dışa aktarılan: ' + oldArticles.length + ' kayıt');
  console.log('Dosya: ' + filePath);
  console.log('Boyut: ' + Math.round(stats.size / 1024) + ' KB');
  console.log('Sıkıştırma oranı: ' + ratio + '%');
  console.log('');
  console.log('Geri yükleme (gerekirse):');
  console.log('  gunzip -c ' + filePath + ' | python3 -m json.tool | head -50');
}

main()
  .catch(function(e) { console.error('Fatal:', e); process.exit(1); })
  .finally(function() { prisma.$disconnect(); });
