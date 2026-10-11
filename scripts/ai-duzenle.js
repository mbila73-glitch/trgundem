// Düzenleme AI — Clear AI bitince devreye girer
// User: "rss ai ve clear ai'nin zorlama/karmaşık ifadelerini akıcı, popüler güncel kelimelerle haber diline çevirir"
// Alt kelime: 100, Üst kelime: 300
//
// Akış: pipeline-cron.ts → build-rss-ozet → cleanup-duplicates → ai-duzenle (BU)
//
// Çalıştırma:
//   node scripts/ai-duzenle.js                    (tüm published'ları düzenle)
//   node scripts/ai-duzenle.js --limit=20        (son 20 haber)
//   node scripts/ai-duzenle.js --recent=60        (son 60 dk'da oluşturulanlar)

const path = require('path');
const fs = require('fs');

// .env oku
const envPath = process.env.ENV_PATH || '/var/www/.env';
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

// === EVREN API — öncelik (pipeline-all.js ve cleanup-duplicates.js ile aynı mantık) ===
// User: "tüm ai çalışmalarında evren i başa alalım"
var EVREN_API_BASE = process.env.EVREN_API_BASE || 'https://evren-llmapi.ssyz.org.tr/v1';
var EVREN_MODEL = process.env.EVREN_MODEL || 'gemma-4-31b';
var EVREN_KEY = '';
try { EVREN_KEY = fs.readFileSync('/var/www/.evren-key', 'utf8').trim(); } catch (e) {}
if (EVREN_KEY === '') EVREN_KEY = process.env.EVREN_API_KEY || process.env.EVREN_KEY || '';

// EVREN çağrısı — 3 kez retry (content boş dönerse)
async function callEvren(prompt, maxTokens) {
  var MAX_EVREN_RETRIES = 1; // 3→1: retry faydasız (gemma-4-31b content boş her zaman boş)
  var lastError = null;
  for (var attempt = 0; attempt < MAX_EVREN_RETRIES; attempt++) {
    var url = EVREN_API_BASE.replace(/\/+$/, '') + '/chat/completions';
    var resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + EVREN_KEY },
        body: JSON.stringify({
          model: EVREN_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: Math.min(Math.max(maxTokens, 1500), 4000),
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(60000)
      });
    } catch (e) {
      lastError = new Error('EVREN fetch hatası: ' + e.message);
      if (attempt < MAX_EVREN_RETRIES - 1) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw lastError;
    }
    if (!resp.ok) {
      var errText = '';
      try { errText = await resp.text(); } catch (e) {}
      var err = new Error('EVREN HTTP ' + resp.status + ': ' + errText.slice(0, 200));
      err.statusCode = resp.status;
      throw err;
    }
    var result = await resp.json();
    if (result.error) {
      var e = new Error('EVREN API error: ' + (result.error.message || JSON.stringify(result.error)));
      e.statusCode = result.error.code || 500;
      throw e;
    }
    var choice = result.choices && result.choices[0];
    if (!choice) {
      lastError = new Error('EVREN: choices bos');
      if (attempt < MAX_EVREN_RETRIES - 1) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw lastError;
    }
    var msg = choice.message || {};
    var text = msg.content;
    if (!text) {
      lastError = new Error('EVREN: content bos (reasoning modeli duzgun cevap uretmedi)');
      if (attempt < MAX_EVREN_RETRIES - 1) {
        console.log('  EVREN content bos - deneme ' + (attempt + 1) + '/' + MAX_EVREN_RETRIES + ', 2 sn bekle');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw lastError;
    }
    return text;
  }
  throw lastError || new Error('EVREN: tum denemeler basarisiz');
}

// 5 Gemini API key (fallback — EVREN basarisiz olursa)
var GEMINI_KEYS = [];
try { var k1 = fs.readFileSync('/var/www/.gemini-key', 'utf8').trim(); if (k1) GEMINI_KEYS.push(k1); } catch (e) {}
try { var k2 = fs.readFileSync('/var/www/.gemini-key2', 'utf8').trim(); if (k2) GEMINI_KEYS.push(k2); } catch (e) {}
try { var k3 = fs.readFileSync('/var/www/.gemini-key3', 'utf8').trim(); if (k3) GEMINI_KEYS.push(k3); } catch (e) {}
try { var k4 = fs.readFileSync('/var/www/.gemini-key4', 'utf8').trim(); if (k4) GEMINI_KEYS.push(k4); } catch (e) {}
try { var k5 = fs.readFileSync('/var/www/.gemini-key5', 'utf8').trim(); if (k5) GEMINI_KEYS.push(k5); } catch (e) {}
if (GEMINI_KEYS.length === 0) {
  var ek1 = process.env.GEMINI_API_KEY || ''; if (ek1) GEMINI_KEYS.push(ek1);
  var ek2 = process.env.GEMINI_API_KEY_2 || ''; if (ek2) GEMINI_KEYS.push(ek2);
  var ek3 = process.env.GEMINI_API_KEY_3 || ''; if (ek3) GEMINI_KEYS.push(ek3);
  var ek4 = process.env.GEMINI_API_KEY_4 || ''; if (ek4) GEMINI_KEYS.push(ek4);
  var ek5 = process.env.GEMINI_API_KEY_5 || ''; if (ek5) GEMINI_KEYS.push(ek5);
}
var GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
var keyIndex = 0;
var deadKeys = new Set();

// fetch override — IPv4 zorla (Node.js fetch IPv6 sorununu önler)
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
      headers: headers,
      family: 4, // IPv4 zorla
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
        resolve({
          status: resp.statusCode,
          ok: resp.statusCode >= 200 && resp.statusCode < 300,
          json: function() { return Promise.resolve(JSON.parse(text)); },
          text: function() { return Promise.resolve(text); }
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

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

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

// DÜZENLEME AI PROMPTU
// User: "rss ai ve clear ai zorlama/karmaşık ifadeler içeriyor. Düzenle AI bunu akıcı, popüler güncel kelimelerle haber diline çevirir"
// Alt kelime: 100, Üst kelime: 300
var MIN_WORDS = 100;
var MAX_WORDS = 300;
var MAX_TOKENS = 4000;

function buildPrompt(originalTitle, originalSummary) {
  var prompt = 'Sen profesyonel bir haber editörüsün. Aşağıda bir haberin AI tarafından üretilmiş özet metni var.\n' +
    'Bu metin ZORLAMA VE KARIŞIK İFADELER içeriyor (kelime prosedürleri nedeniyle).\n' +
    'Senin görevin: BU METNİ AKICI, GÜNCEL VE POPÜLER HABER DİLİNE ÇEVİRMEK.\n\n' +
    'KURALLAR — ZORUNLU:\n' +
    '1. AKICILIK: Metni okuyan okuyucu tek nefeste okuyabilmeli. Uzun,bürokratik dolambaçlı cümleleri böl.\n' +
    '   Her cümle 15-25 kelimeyi geçmesin. Birden çok noktalama işaretiyle uzatılmış cümleleri kısalt.\n' +
    '2. POPÜLER/GÜNCEL KELİMELER: Günlük hayatta kullanılan, gazetecilerin tercih ettiği kelimeleri kullan.\n' +
    '   - "müstakbel" yerine "gelecekteki", "vaki" yerine "olan", "istikbal" yerine "gelecek"\n' +
    '   - "ezaadiyle" yerine "tamamen", "pürüz" yerine "sorun", "inanılmaz derecede" yerine "çok"\n' +
    '   - Bürokratik/dilencil değildir, doğal Türkçe yaz.\n' +
    '3. HABER DİLİ: 3. şahıs (o, onlar), nesnel, tarafsız, kısa-fakat-bilgi-dolu cümleler.\n' +
    '   Yorum yapma, sadece haberi anlat. Aktif cümle kullan (pasif kaçın).\n' +
    '4. ANLAMI KORU: Olay, kişiler, kurumlar, sayılar, tarihler, bahsedilen her şey KORUNMALI.\n' +
    '   "İçişleri Bakanı" → "İçişleri Bakanı" (aynen). Sadece İFADEYİ değiştir, ANLAMI değiştirme.\n' +
    '5. ÖZET DEĞİL, HABER: Kaynağı "özetleme". Bu bir haber metni. Haberin tüm önemli detaylarını koru.\n' +
    '6. TELİF: Kaynak metnin birebir kopyası olmasın. Cümleleri yeniden kur, ama anlamı koru.\n' +
    '7. UZUNLUK: EN AZ ' + MIN_WORDS + ' kelime, EN ÇOK ' + MAX_WORDS + ' kelime. ' +
    'ASLA ' + MAX_WORDS + ' kelimeyi geçme. Haberi doğal bir sonuca ulaştır, yarım cümle bırakma.\n' +
    '8. REKLAM/CTA: Kaynak metinde "abone ol", "üye ol", "takip et", "için tıklayın" gibi ifadeler varsa,\n' +
    '   bunları ASLA çıktına dahil etme. Sadece haber içeriğini yaz.\n' +
    '9. BAŞLIK UYUMU: Metnin başlığı "' + originalTitle + '" ile AYNI konuyu anlatmalı.\n' +
    '   Başka bir habere kayma.\n\n' +
    'ÇIKTI FORMATI:\n' +
    'Sadece yeniden yazılmış haber metnini yaz. Başlık, etiket, markdown, açıklama ekleme.\n' +
    'Türkçe yaz. Doğrudan metne başla.\n\n' +
    'HABER BAŞLIĞI (referans): ' + originalTitle + '\n\n' +
    'DÜZENLENECEK METİN (AI özet — zorlama/karmaşık):\n' + originalSummary;
  return prompt;
}

// AI çağrısı — tüm key'leri sırayla dener, 403/429 durumda diğerine geçer
async function aiEdit(title, summary) {
  if (!summary || summary.length < 50) return null;
  var cleanSummary = decodeHtmlEntities(summary).trim();
  var cleanTitle = decodeHtmlEntities(title).trim();
  if (cleanSummary.length < 50) return null;

  var promptText = buildPrompt(cleanTitle, cleanSummary);

  // === EVREN ÖNCELİK (Gemini fallback) ===
  // User: "tüm ai çalışmalarında evren i başa alalım"
  if (EVREN_KEY) {
    try {
      var evrenText = await callEvren(promptText, MAX_TOKENS);
      if (evrenText) {
        var clean = evrenText.trim();
        var wc = countWords(clean);
        if (wc >= MIN_WORDS) {
          console.log('  ✓ [EVREN] başarılı — ' + wc + ' kelime');
          return { text: clean, wordCount: wc };
        }
        console.log('  ⚠ [EVREN] yetersiz kelime: ' + wc + ' (min: ' + MIN_WORDS + ')');
      }
    } catch (e) {
      console.log('  ✗ [EVREN] hata: ' + e.message.slice(0, 80) + ' — Geminiye geçiliyor');
    }
  }

  // === GEMINI FALLBACK ===
  if (GEMINI_KEYS.length === 0) {
    console.log('  ✗ Gemini key yok — atla');
    return null;
  }

  for (var attempt = 0; attempt < GEMINI_KEYS.length * 2; attempt++) {
    var keyIdx = attempt % GEMINI_KEYS.length;
    if (deadKeys.has(keyIdx)) continue;
    var key = GEMINI_KEYS[keyIdx];
    var apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;

    try {
      var resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 }
        })
      });
      var result = await resp.json();
      if (result.error) {
        // 403/429 → bu key'i öldür, diğer dene
        if (result.error.code === 403 || result.error.code === 429) {
          console.log('  ⚠ Key ' + (keyIdx + 1) + ': ' + result.error.code + ' — öldürülüyor');
          deadKeys.add(keyIdx);
          continue;
        }
        console.log('  ⚠ AI error:', result.error.code, result.error.message);
        continue;
      }
      var text = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text;
      if (!text) continue;
      var clean = text.trim();
      var wc = countWords(clean);

      // Üst limit — 300'den fazla varsa truncate
      if (wc > MAX_WORDS) {
        var words = clean.split(/\s+/);
        clean = words.slice(0, MAX_WORDS).join(' ');
        var lastPeriod = clean.lastIndexOf('.');
        if (lastPeriod > MAX_WORDS * 0.7) {
          clean = clean.slice(0, lastPeriod + 1);
        }
        wc = countWords(clean);
      }

      // Alt limit — 100'den azsa retry başarısız say
      if (wc < MIN_WORDS) {
        console.log('  ⚠ Yetersiz kelime: ' + wc + ' (min: ' + MIN_WORDS + ') — retry');
        continue;
      }

      return { text: clean, wordCount: wc };
    } catch (e) {
      console.log('  ⚠ Hata (deneme ' + (attempt + 1) + '): ' + e.message);
      continue;
    }
  }

  // Tüm key'ler başarısız
  if (deadKeys.size === GEMINI_KEYS.length) {
    console.log('  ✗ Tüm key\'ler başarısız (kota dolu) — AI Düzenle atlanıyor');
  }
  return null;
}

async function main() {
  var args = process.argv.slice(2);
  var limit = 0;       // 0 = limitsiz
  var recent = 0;       // 0 = tüm zamanlar
  for (var i = 0; i < args.length; i++) {
    if (args[i].indexOf('--limit=') === 0) limit = parseInt(args[i].split('=')[1], 10) || 0;
    if (args[i].indexOf('--recent=') === 0) recent = parseInt(args[i].split('=')[1], 10) || 0;
  }

  var { PrismaClient } = require('@prisma/client');
  var db = new PrismaClient();

  console.log('=== DÜZENLEME AI (Akıcı + Popüler + Haber Dili) ===');
  console.log('Tarih:', new Date().toISOString());
  console.log('Kelime aralığı: ' + MIN_WORDS + '-' + MAX_WORDS);

  var where = { status: 'published' };
  if (recent > 0) {
    var cutoff = new Date(Date.now() - recent * 60 * 1000);
    where.createdAt = { gte: cutoff };
    console.log('Son ' + recent + ' dk içinde oluşturulanlar');
  }

  var articles = await db.publishedArticle.findMany({
    where: where,
    select: { id: true, aiTitle: true, aiSummary: true, wordCount: true, category: true },
    orderBy: { latestPublishedAt: 'desc' },
    take: limit || undefined
  });

  console.log('Toplam published:', articles.length);
  console.log('');

  if (articles.length === 0) {
    await db.$disconnect();
    return;
  }

  var success = 0;
  var failed = 0;
  var skipped = 0;

  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    var title = decodeHtmlEntities(a.aiTitle || '').trim();
    var summary = (a.aiSummary || '').trim();

    if (!summary || summary.length < 50) {
      console.log('[' + (i + 1) + '/' + articles.length + '] ATLA — özet boş/kısa: ' + title.slice(0, 50));
      skipped++;
      continue;
    }

    console.log('[' + (i + 1) + '/' + articles.length + '] Düzenle: ' + title.slice(0, 50));

    // 15 saniye bekleme — rate limit ve özet kalitesi için (pipeline ile aynı)
    if (i > 0) {
      await new Promise(function(r) { setTimeout(r, 15000); });
    }

    var result = await aiEdit(title, summary);
    if (!result) {
      console.log('  ✗ AI düzenleme başarısız');
      failed++;
      continue;
    }

    // DB güncelle
    try {
      await db.publishedArticle.update({
        where: { id: a.id },
        data: {
          aiSummary: result.text,
          wordCount: result.wordCount
        }
      });
      console.log('  ✓ Düzenlendi: ' + result.wordCount + ' kelime');
      success++;
    } catch (e) {
      console.log('  ✗ DB hatası: ' + e.message);
      failed++;
    }
  }

  console.log('');
  console.log('=== DÜZENLEME AI TAMAM ===');
  console.log('Toplam: ' + articles.length);
  console.log('Başarılı: ' + success);
  console.log('Başarısız: ' + failed);
  console.log('Atlanan: ' + skipped);

  await db.$disconnect();
}

main().catch(function(e) {
  console.error('Düzenleme AI ölümcül hata:', e);
  process.exit(1);
});
