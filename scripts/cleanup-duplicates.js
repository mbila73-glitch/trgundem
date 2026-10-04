// Ana sayfa tekrar temizliği — AI (Gemini) ile
// 3, 18, 33, 48. dakikalarda cron tetikler
// Pipeline (0,15,30,45) bittikten 1-2 dk sonra çalışır
// AI 50 başlığı okur, tekrar olan eskileri siler

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

// 3 Gemini API key
var GEMINI_KEYS = [];
try { var k1 = fs.readFileSync('/var/www/.gemini-key', 'utf8').trim(); if (k1) GEMINI_KEYS.push(k1); } catch (e) {}
try { var k2 = fs.readFileSync('/var/www/.gemini-key2', 'utf8').trim(); if (k2) GEMINI_KEYS.push(k2); } catch (e) {}
try { var k3 = fs.readFileSync('/var/www/.gemini-key3', 'utf8').trim(); if (k3) GEMINI_KEYS.push(k3); } catch (e) {}
if (GEMINI_KEYS.length === 0) {
  var ek1 = process.env.GEMINI_API_KEY || ''; if (ek1) GEMINI_KEYS.push(ek1);
}
var GEMINI_MODEL = 'gemini-flash-lite-latest';
var keyIndex = 0;

// fetch override
globalThis.fetch = function(url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var lib = url.indexOf('https') === 0 ? require('https') : require('http');
    var urlObj = new URL(url);
    var headers = Object.assign({}, options.headers || {});
    if (options.body) headers['Content-Length'] = Buffer.byteLength(options.body);
    var req = lib.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: headers
    }, function(resp) {
      if ([301, 302, 307, 308].includes(resp.statusCode) && resp.headers.location) {
        var newUrl = resp.headers.location;
        if (newUrl.startsWith('/')) newUrl = urlObj.protocol + '//' + urlObj.host + newUrl;
        resolve(globalThis.fetch(newUrl, options, 0));
        return;
      }
      var chunks = [];
      resp.on('data', function(c) { chunks.push(c); });
      resp.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: resp.statusCode, ok: resp.statusCode >= 200 && resp.statusCode < 300, json: function() { return Promise.resolve(JSON.parse(text)); }, text: function() { return Promise.resolve(text); } });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

// HTML entity decode
function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// AI'ya tekrar kontrolü yaptır
async function aiFindDuplicates(titles) {
  if (titles.length < 2) return [];

  var prompt = 'Aşağıdaki haber başlıklarından hangileri AYNI haberi anlatıyor?\n' +
    'Sadece tekrar olanları grupla. Her grupta en düşük numara en yeni (tutulacak),\n' +
    'yüksek numaralar silinecek.\n\n' +
    'Format: JSON array, her grup [tutulacak_index, silinecek_index1, silinecek_index2, ...]\n' +
    'Örnek: [[0, 2, 5], [1, 3]]\n' +
    'Tekrar yoksa: []\n\n' +
    'ÖNEMLI KURALLAR:\n' +
    '1. Sadece AYNI haberi anlatanları grupla\n' +
    '2. Benzer ama FARKLI haberleri gruplama\n' +
    '3. Bu başlıklar ana sayfadaki 50 haberdir\n' +
    '4. Bir haber hem ana sayfada hem kategori sekmesinde görünebilir — bu TEKRAR DEĞİLDİR\n' +
    '5. Sadece listede aynı içeriğe sahip birden fazla kayıt varsa tekrardır\n' +
    '6. "İstanbul baskını" ile "İstanbul gastronomi" FARKLI haberlerdir\n' +
    '7. "KPSS sınavı başladı" ile "KPSS sonuçları açıklandı" FARKLI haberlerdir\n\n' +
    'Başlıklar:\n';

  titles.forEach(function(t, i) {
    prompt += i + '. ' + decodeHtmlEntities(t).slice(0, 100) + '\n';
  });

  prompt += '\nSadece JSON array döndür, başka hiçbir şey yazma.';

  for (var attempt = 1; attempt <= 3; attempt++) {
    var currentKey = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
    keyIndex++;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + currentKey;
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2000, temperature: 0.3 } })
      });
      var result = await resp.json();
      if (result.error) { console.log('AI error:', result.error.code, result.error.message); if (attempt < 3) { await new Promise(r => setTimeout(r, 3000)); continue; } return []; }
      if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0]) {
        var text = result.candidates[0].content.parts[0].text.trim();
        // JSON parse et
        // Önce markdown ```json ... ``` temizle
        text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        var match = text.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            var groups = JSON.parse(match[0]);
            if (Array.isArray(groups)) return groups;
          } catch (e) { console.log('JSON parse hatası:', e.message); }
        }
        return [];
      }
      if (attempt < 3) { await new Promise(r => setTimeout(r, 3000)); continue; }
      return [];
    } catch (e) {
      console.log('AI hata (deneme ' + attempt + '/3):', e.message);
      if (attempt < 3) { await new Promise(r => setTimeout(r, 5000)); continue; }
      return [];
    }
  }
  return [];
}

// Algoritma ile de hızlı kontrol (birebir)
function quickDuplicateCheck(titles) {
  var seen = {};
  var dupes = [];
  for (var i = 0; i < titles.length; i++) {
    var key = decodeHtmlEntities(titles[i]).toLowerCase().replace(/[^a-z0-9çğıöşü\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (seen[key] !== undefined) {
      dupes.push([seen[key], i]); // eskisini tut (düşük index), bunu sil
    } else {
      seen[key] = i;
    }
  }
  return dupes;
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  console.log('=== ANA SAYFA TEKRAR TEMİZLİĞİ (AI) ===');
  console.log('Tarih:', new Date().toISOString());

  // Tüm published'ları getir (en yeniden eskiye)
  const allPublished = await db.publishedArticle.findMany({
    where: { status: 'published' },
    select: { id: true, aiTitle: true, aiSummary: true, category: true, latestPublishedAt: true },
    orderBy: { latestPublishedAt: 'desc' }
  });
  console.log('Toplam published:', allPublished.length);

  if (allPublished.length < 2) {
    console.log('2\'den az haber, cik');
    await db.$disconnect();
    return;
  }

  // 1. Hızlı algoritma ile birebir tekrar kontrolü
  var titles = allPublished.map(a => a.aiTitle);
  var quickDupes = quickDuplicateCheck(titles);
  console.log('Hızlı kontrol (birebir):', quickDupes.length, 'tekrar');

  var toDeleteIds = new Set();

  // Hızlı kontrol sonucu: eskileri sil
  quickDupes.forEach(function(group) {
    var keepIdx = group[0];
    for (var i = 1; i < group.length; i++) {
      toDeleteIds.add(allPublished[group[i]].id);
    }
  });

  // 2. AI ile benzer tekrar kontrolü
  console.log('AI kontrol ediliyor...');
  var aiGroups = await aiFindDuplicates(titles);
  console.log('AI buldu:', aiGroups.length, 'tekrar grubu');

  if (aiGroups.length > 0) {
    aiGroups.forEach(function(group) {
      if (!Array.isArray(group) || group.length < 2) return;
      // En düşük index = en yeni = tutulacak
      var keepIdx = Math.min.apply(null, group);
      console.log('  Grup: tut=' + keepIdx + ', sil=' + group.filter(function(x) { return x !== keepIdx; }).join(','));
      group.forEach(function(idx) {
        if (idx !== keepIdx && idx >= 0 && idx < allPublished.length) {
          toDeleteIds.add(allPublished[idx].id);
        }
      });
    });
  }

  // Sil
  if (toDeleteIds.size > 0) {
    console.log('');
    console.log('Silinen haberler:');
    toDeleteIds.forEach(async function(id) {
      var a = allPublished.find(x => x.id === id);
      if (a) console.log('  - ' + decodeHtmlEntities(a.aiTitle).slice(0, 60));
    });

    var delResult = await db.publishedArticle.deleteMany({
      where: { id: { in: Array.from(toDeleteIds) } }
    });
    console.log('');
    console.log('Toplam silinen:', delResult.count);
  } else {
    console.log('Tekrar bulunamadı.');
  }

  // Son durum
  const remaining = await db.publishedArticle.count({ where: { status: 'published' } });
  console.log('Kalan published:', remaining);

  await db.$disconnect();
}

main().catch(e => { console.error('Hata:', e.message); process.exit(1); });
