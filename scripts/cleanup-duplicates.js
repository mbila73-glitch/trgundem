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

// 5 Gemini API key
var GEMINI_KEYS = [];
try { var k1 = fs.readFileSync('/var/www/.gemini-key', 'utf8').trim(); if (k1) GEMINI_KEYS.push(k1); } catch (e) {}
try { var k2 = fs.readFileSync('/var/www/.gemini-key2', 'utf8').trim(); if (k2) GEMINI_KEYS.push(k2); } catch (e) {}
try { var k3 = fs.readFileSync('/var/www/.gemini-key3', 'utf8').trim(); if (k3) GEMINI_KEYS.push(k3); } catch (e) {}
try { var k4 = fs.readFileSync('/var/www/.gemini-key4', 'utf8').trim(); if (k4) GEMINI_KEYS.push(k4); } catch (e) {}
try { var k5 = fs.readFileSync('/var/www/.gemini-key5', 'utf8').trim(); if (k5) GEMINI_KEYS.push(k5); } catch (e) {}
if (GEMINI_KEYS.length === 0) {
  var ek1 = process.env.GEMINI_API_KEY || ''; if (ek1) GEMINI_KEYS.push(ek1);
}
var GEMINI_MODEL = 'gemini-flash-lite-latest';
var keyIndex = 0;
var deadKeys = new Set(); // bu cycle'da ölü key'ler (403/429) — atlanır

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
    'Sadece tekrar olanları grupla. Her grupta en düşük numara EN YENİ (TUTULACAK),\n' +
    'yüksek numaralar DAHA ESKİ (SİLİNECEK).\n\n' +
    'Liste sıralaması: 0 = en yeni (en üstte), 49 = en eski (en altta).\n' +
    'Tekrar varsa, en yeni olanı (en düşük numara) TUT, eskileri (yüksek numara) SİL.\n\n' +
    'Format: JSON array, her grup [tutulacak_index, silinecek_index1, silinecek_index2, ...]\n' +
    'Örnek: [[0, 2, 5], [1, 3]] → 0 numarayi tut 2 ve 5 sil, 1 tut 3 sil\n' +
    'Tekrar yoksa: []\n\n' +
    'ÖNEMLI KURALLAR — TEKRAR KABUL EDÜLMEMELIDIR:\n' +
    '1. SADECE AYNI olayı anlatanları grupla. AYNI OLAY = aynı kişi/kurum + aynı eylem + aynı zaman.\n' +
    '2. FARKLI haberleri ASLA gruplama. Örnek farklı haberler:\n' +
    '   - "Ataşehir Belediyesi soruşturması" vs "Mersin belediyeleri soruşturması" → FARKLI (farklı il, farklı iddialar)\n' +
    '   - "Vahap Seçer adliyeye sevk" vs "Yasin Kol adliyeye sevk" → FARKLI (farklı kişiler, farklı soruşturma)\n' +
    '   - "Ataşehir yolsuzluk" vs "MHK hakemler soruşturması" → FARKLI (farklı iddialar)\n' +
    '   - "Emekli enflasyon farkı belli oldu" vs "Ekim kira zam oranı belli oldu" → FARKLI (farklı konu)\n' +
    '   - "MasterChef veda" vs "YENİ Parti Ayvalık başkanı" → FARKLI (farklı konu)\n' +
    '   - "BIST 100 haftaya başladı" vs "Gram altın haftaya başladı" → FARKLI (farklı finansal araç)\n' +
    '3. JENERIK KELIMELER tekrar demek DEĞIL: "adliyeye sevk", "belli oldu", "haftaya başladı",\n' +
    '   "soruşturma", "operasyon" gibi jenerik ifadeler farklı haberlerde geçer.\n' +
    '4. AYNI kişiler + AYNI eylem + AYNI zaman = TEKRAR. Sadece bu durumda grupla.\n' +
    '5. "Süper Lig hakemi Yasin Kol" vs "Hakem Yasin Kol adliyeye sevk" → TEKRAR (aynı kişi, aynı olay).\n' +
    '6. Bir haber hem ana sayfada hem kategori sekmesinde görünebilir — bu TEKRAR DEĞILDIR.\n' +
    '7. Eğer emin değilsen, GRUP YAPMA. Belirsizlik durumunda tek tek tut.\n' +
    '8. Listedeki başlıkların hepsi benzer kelimeler içerebilir (Türkçe haber dili) ama aynı haber değildir.\n\n' +
    'Başlıklar (en yeni en üstte):\n';

  titles.forEach(function(t, i) {
    prompt += i + '. ' + decodeHtmlEntities(t).slice(0, 100) + '\n';
  });

  prompt += '\nSadece JSON array döndür, başka hiçbir şey yazma.';

  for (var attempt = 1; attempt <= GEMINI_KEYS.length; attempt++) {
    var currentKey = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
    keyIndex++;
    if (deadKeys.has(currentKey)) { continue; }
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + currentKey;
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2000, temperature: 0.3 } })
      });
      var result = await resp.json();
      if (result.error) {
        console.log('AI error:', result.error.code, result.error.message);
        if (result.error.code === 403 || result.error.code === 429) {
          deadKeys.add(currentKey);
          continue;
        }
        if (attempt < GEMINI_KEYS.length) { await new Promise(r => setTimeout(r, 3000)); continue; }
        return [];
      }
      deadKeys.delete(currentKey);
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
      if (attempt < GEMINI_KEYS.length) { await new Promise(r => setTimeout(r, 3000)); continue; }
      return [];
    } catch (e) {
      console.log('AI hata (deneme ' + attempt + '/' + GEMINI_KEYS.length + '):', e.message);
      deadKeys.add(currentKey);
      if (attempt < GEMINI_KEYS.length) { await new Promise(r => setTimeout(r, 5000)); continue; }
      return [];
    }
  }
  return [];
}

// VLM ile görsel kontrolü — görselde medya logosu/watermark var mı?
// Gemini flash lite görsel destekler (inline_data base64)
async function checkImageForLogo(imageUrl) {
  try {
    // Görseli çek, base64'e çevir
    var resp = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    var buffer = await resp.arrayBuffer();
    var base64 = Buffer.from(buffer).toString('base64');
    
    // MIME type tespit
    var mime = 'image/jpeg';
    if (imageUrl.toLowerCase().includes('.png')) mime = 'image/png';
    if (imageUrl.toLowerCase().includes('.webp')) mime = 'image/webp';
    if (imageUrl.toLowerCase().includes('.gif')) mime = 'image/gif';
    
    var prompt = 'Bu görseli DİKKATLE incele. Görselin HERHANGİ BİR yerinde şu öğelerden biri var mı?\n' +
      '1. Haber sitesi adı: Oda TV, Odatv, CNN Türk, HaberTürk, Sözcü, Hürriyet, NTV, TRT, AA, Milliyet, Posta, Sabah, BirGün, Cumhuriyet, Evrensel, Karar, Dünya, Ensonhaber, Mynet, İnternet Haber, Fotomaç, ShiftDelete, Chip, Webtekno, Donanım Haber, A Haber, Açık Gazete, Bianet, Medyascope, Halk TV, Sputnik, Bloomberg HT, Foreks, CNBCE, Investing, Takvim, Yeni Şafak, Aydınlık, vb.\n' +
      '2. TV kanal logosu veya adı\n' +
      '3. Web sitesi domain adresi (örn: odatv.com, cnnturk.com)\n' +
      '4. Watermark (şeffaf veya yarı şeffaf metin/logo, genelde köşede)\n' +
      '5. Kanal başlığı, jeneraği veya overlay metin\n' +
      '6. Görselin altında/üstünde kaynak site adı yazısı\n\n' +
      'ÇOK ÖNEMLİ: Bu öğeler çok küçük bile olsa, köşede bile olsa, soluk/watermark olarak da olsa VARSAA "hasLogo": true döndür.\n' +
      'Görselin ana konusu bir logoyu gösteriyorsa (örn: "Oda TV logosu kaldırıldı" haberi) bile hasLogo: true döndür.\n' +
      'SADECE hiçbir yazı/logo/watermark yoksa "hasLogo": false döndür.\n' +
      'Cevap formatı: {"hasLogo": true} veya {"hasLogo": false}';
    
    for (var attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
      var currentKey = GEMINI_KEYS[attempt % GEMINI_KEYS.length];
      if (deadKeys.has(currentKey)) continue;
      
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + currentKey;
      try {
        var vlmResp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inline_data: { mime_type: mime, data: base64 } }
            ]}],
            generationConfig: { maxOutputTokens: 50, temperature: 0.1 }
          }),
          signal: AbortSignal.timeout(10000),
        });
        var result = await vlmResp.json();
        if (result.error) {
          if (result.error.code === 403 || result.error.code === 429) {
            deadKeys.add(currentKey);
            continue;
          }
          continue;
        }
        deadKeys.delete(currentKey);
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0]) {
          var text = result.candidates[0].content.parts[0].text;
          var match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              var parsed = JSON.parse(match[0]);
              return parsed.hasLogo === true;
            } catch (e) {}
          }
          // JSON parse edilemezse metin kontrolü
          if (text.toLowerCase().includes('true') || text.toLowerCase().includes('evet')) return true;
          if (text.toLowerCase().includes('false') || text.toLowerCase().includes('hayır')) return false;
        }
      } catch (e) { continue; }
    }
    return null; // tüm key'ler denendi, hata
  } catch (e) {
    return null; // görsel çekilemedi
  }
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

  // Tüm published'ları getir (en yeniden eskiye) — take: 50 limit
  // User: "clean up temizleme deki haber sayısını 50 yapalım"
  const allPublished = await db.publishedArticle.findMany({
    where: { status: 'published' },
    select: { id: true, aiTitle: true, aiSummary: true, category: true, latestPublishedAt: true },
    orderBy: { latestPublishedAt: 'desc' },
    take: 50  // en yeni 50 haber — eski haberler zaten daha önce temizlenmiş
  });
  console.log('Toplam published (max 50):', allPublished.length);

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

  // 3. VLM ile görsel kontrolü — son 30 dk'da create edilen haberler
  // Görselde medya logosu/watermark varsa imageUrl'yi null yap (logo fallback göster)
  console.log('');
  console.log('--- VLM GÖRSEL KONTROLÜ ---');
  var recentCutoff = new Date(Date.now() - 30 * 60 * 1000);
  var recentWithImages = await db.publishedArticle.findMany({
    where: { status: 'published', imageUrl: { not: null }, createdAt: { gte: recentCutoff } },
    select: { id: true, aiTitle: true, imageUrl: true },
  });
  console.log('Son 30 dk görselli yeni haber:', recentWithImages.length);
  
  var imageFixed = 0;
  for (var ri = 0; ri < recentWithImages.length; ri++) {
    var article = recentWithImages[ri];
    if (!article.imageUrl) continue;
    console.log('  [' + (ri+1) + '/' + recentWithImages.length + '] Görsel kontrol: ' + article.aiTitle.slice(0, 50));
    var hasLogo = await checkImageForLogo(article.imageUrl);
    if (hasLogo === true) {
      console.log('    ⚠ Logo tespit edildi (VLM) — görsel korundu, manuel kontrol önerilir');
      // imageUrl null YAPILMIYOR — VLM false positive riski var
      // Manuel kontrol için logla, otomatik silme
      // imageFixed++; (devre dışı)
    } else if (hasLogo === false) {
      console.log('    ✓ Logo yok, görsel korundu');
    } else {
      console.log('    ? VLM hatası (tüm key\'ler başarısız veya timeout), görsel korundu');
    }
  }
  if (imageFixed > 0) {
    console.log('Logo içeren görsel temizlendi: ' + imageFixed + ' haber → logo fallback gösterilecek');
  } else if (recentWithImages.length > 0) {
    console.log('Logo bulunan görsel yok (hepsi temiz veya VLM hatası)');
  }

  // Son durum
  const remaining = await db.publishedArticle.count({ where: { status: 'published' } });
  console.log('Kalan published:', remaining);

  await db.$disconnect();
}

// CRITICAL: module.exports = main() — pipeline-all.js runScript() bunu gerektirir.
// Aksi halde runScript() Promise dönmüyor sanıp 60 sn sabit bekler (script 5 sn'de bitse bile).
// User: "clear ai si neden tam 1 dakika 0 saniye çalışıyor sürekli? garip değil mi?"
module.exports = main().catch(e => { console.error('Hata:', e.message); process.exit(1); });
