// Post-cycle cleanup debug script — tekrar olan published'ları sil
// Kullanım: node /var/www/scripts/cleanup-duplicates.js

const path = require('path');
const fs = require('fs');

// .env oku
const envPath = '/var/www/.env';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
      process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
} catch (e) {}

// HTML entity decode + normalize
function normalizeTitle(t) {
  if (!t) return '';
  return String(t)
    .replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^\w\sçğıöşü]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

var STOP_WORDS = new Set([
  'erdoğan','erdogan','bahçeli','bahceli','akşener','aksener','kılıçdaroğlu','kilicdaroglu',
  'soylu','pelin','cumhurbaşkanı','cumhurbaskani','bakan','başkan','baskan','genel','merkezi',
  'türkiye','turkiye','türk','turk','ankara','istanbul','izmir','bugün','bugun','yarın','yarin',
  'haber','son','dakika','gelen','yapan','olarak','için','ile','bin','yıl','yılın','ilan','etti','açıklama'
]);

function titleSimilar(t1, t2) {
  var n1 = normalizeTitle(t1), n2 = normalizeTitle(t2);
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1.0;
  var w1 = n1.split(' ').filter(function(w) { return w.length > 3 && !STOP_WORDS.has(w); });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 3 && !STOP_WORDS.has(w); });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2); var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  if (common < 2) return 0;
  return common / Math.max(w1.length, w2.length);
}

function contentSimilar(c1, c2) {
  if (!c1 || !c2) return 0;
  var n1 = normalizeTitle(c1.slice(0, 1500));
  var n2 = normalizeTitle(c2.slice(0, 1500));
  var w1 = n1.split(' ').filter(function(w) { return w.length > 4 && !STOP_WORDS.has(w); });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 4 && !STOP_WORDS.has(w); });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2); var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  return common / Math.max(w1.length, w2.length);
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  console.log('=== TEKRAR HABER TEMİZLİĞİ ===');
  const allPublished = await db.publishedArticle.findMany({
    where: { status: 'published' },
    select: { id: true, aiTitle: true, aiSummary: true, category: true, latestPublishedAt: true, publishedAt: true },
    orderBy: { latestPublishedAt: 'desc' }
  });
  console.log('Toplam published:', allPublished.length);
  console.log('');

  // Tekrarları bul
  const seenTitles = [];
  const toDelete = [];
  const duplicatesFound = [];

  for (let i = 0; i < allPublished.length; i++) {
    const pub = allPublished[i];
    let isDuplicate = false;
    let matchedWith = null;

    for (let j = 0; j < seenTitles.length; j++) {
      const sim = titleSimilar(pub.aiTitle, seenTitles[j].aiTitle || '');
      const simC = contentSimilar(pub.aiSummary || '', seenTitles[j].aiSummary || '');
      if (sim >= 0.3 || (sim >= 0.15 && simC >= 0.3)) {
        isDuplicate = true;
        matchedWith = { title: seenTitles[j].aiTitle, sim, simC };
        break;
      }
    }

    if (isDuplicate) {
      toDelete.push(pub.id);
      duplicatesFound.push({
        title: pub.aiTitle,
        matchedWith: matchedWith.title,
        sim: Math.round(matchedWith.sim * 100),
        simC: Math.round(matchedWith.simC * 100),
        pubDate: pub.publishedAt
      });
    } else {
      seenTitles.push(pub);
    }
  }

  console.log('Tekrar bulundu (silinecek):', toDelete.length);
  console.log('');
  console.log('=== TEKRAR OLAN HABERLER ===');
  duplicatesFound.slice(0, 20).forEach((d, i) => {
    console.log((i+1) + '. ' + d.title.slice(0, 60));
    console.log('   Eşleşti: ' + d.matchedWith.slice(0, 60));
    console.log('   Benzerlik: ' + d.sim + '% (title), ' + d.simC + '% (content)');
  });

  if (toDelete.length > 0) {
    console.log('');
    console.log('=== SİLİYOR ===');
    const result = await db.publishedArticle.deleteMany({
      where: { id: { in: toDelete } }
    });
    console.log('Silindi:', result.count);

    const remaining = await db.publishedArticle.count({ where: { status: 'published' } });
    console.log('Kalan published:', remaining);
  } else {
    console.log('');
    console.log('Tekrar bulunamadı — hiçbir şey silinmedi.');
  }

  await db.$disconnect();
}

main().catch(e => { console.error('Hata:', e.message); process.exit(1); });
