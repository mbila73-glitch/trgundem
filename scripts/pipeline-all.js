// TRGUNDEM Pipeline — Gruplama + Kategori Bazlı Min Kaynak + AI Özet + Arşiv
var path = require('path');
var fs = require('fs');

// MARKA BLOK LİSTESİ — başlıkta bu markalardan biri geçerse haber yayınlanmaz
var BRAND_BLOCKLIST = require('./brand-blocklist.js');

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

// === AI PROVIDERS — EVREN (öncelik 1) + Gemini (fallback) ===
// EVREN: OpenAI-uyumlu API, tek key, 15M token/gün kota
// Gemini: 4 key (eski 5 key vardı, 429'lar nedeniyle bazıları ölü)
//
// Key sırası (öncelik):
//   1. EVREN (.evren-key dosyası)
//   2. Gemini key3 (.gemini-key3 dosyası)
//   3. Gemini key4 (.gemini-key4 dosyası)
//   4. Gemini key5 (.gemini-key5 dosyası)
//   5. Gemini key6 (.gemini-key6 dosyası)

var EVREN_KEY = '';
try { EVREN_KEY = fs.readFileSync('/var/www/.evren-key', 'utf8').trim(); } catch (e) {}
var EVREN_API_BASE = process.env.EVREN_API_BASE || 'https://evren-llmapi.ssyz.org.tr/v1';
var EVREN_MODEL = process.env.EVREN_MODEL || 'deepseek-v4-flash';

// Gemini key'ler (fallback)
var GEMINI_KEYS = [];
try { var k1 = fs.readFileSync('/var/www/.gemini-key', 'utf8').trim(); if (k1) GEMINI_KEYS.push(k1); } catch (e) {}
try { var k2 = fs.readFileSync('/var/www/.gemini-key2', 'utf8').trim(); if (k2) GEMINI_KEYS.push(k2); } catch (e) {}
try { var k3 = fs.readFileSync('/var/www/.gemini-key3', 'utf8').trim(); if (k3) GEMINI_KEYS.push(k3); } catch (e) {}
try { var k4 = fs.readFileSync('/var/www/.gemini-key4', 'utf8').trim(); if (k4) GEMINI_KEYS.push(k4); } catch (e) {}
try { var k5 = fs.readFileSync('/var/www/.gemini-key5', 'utf8').trim(); if (k5) GEMINI_KEYS.push(k5); } catch (e) {}
try { var k6 = fs.readFileSync('/var/www/.gemini-key6', 'utf8').trim(); if (k6) GEMINI_KEYS.push(k6); } catch (e) {}
if (GEMINI_KEYS.length === 0) {
  var ek1 = process.env.GEMINI_API_KEY || ''; if (ek1) GEMINI_KEYS.push(ek1);
  var ek2 = process.env.GEMINI_API_KEY_2 || ''; if (ek2) GEMINI_KEYS.push(ek2);
  var ek3 = process.env.GEMINI_API_KEY_3 || ''; if (ek3) GEMINI_KEYS.push(ek3);
  var ek4 = process.env.GEMINI_API_KEY_4 || ''; if (ek4) GEMINI_KEYS.push(ek4);
  var ek5 = process.env.GEMINI_API_KEY_5 || ''; if (ek5) GEMINI_KEYS.push(ek5);
  var ek6 = process.env.GEMINI_API_KEY_6 || ''; if (ek6) GEMINI_KEYS.push(ek6);
}
var GEMINI_MODEL = 'gemini-flash-lite-latest';
var keyIndex = 0;
var deadKeys = new Set(); // bu cycle'da ölü key'ler (403/429) — atlanır

// GEMINI RPM TRACKER — User: "neden 15 i geçiyorlar"
// Paralel batch 4 makale aynı anda çağırınca burst oluyor
// Çözüm: 1) RPM limit 12 (15 değil) 2) Paralel batch'te jitter (rastgele 0-500ms gecikme)
var geminiRpmTracker = {};
function canCallGemini(key) {
  var now = Date.now();
  var h = key.slice(0, 15);
  if (!geminiRpmTracker[h]) geminiRpmTracker[h] = [];
  geminiRpmTracker[h] = geminiRpmTracker[h].filter(function(t) { return now - t < 60000; });
  return geminiRpmTracker[h].length < 12;
}
function recordGeminiCall(key) {
  var h = key.slice(0, 15);
  if (!geminiRpmTracker[h]) geminiRpmTracker[h] = [];
  geminiRpmTracker[h].push(Date.now());
}
function geminiRpmCount(key) {
  var h = key.slice(0, 15);
  if (!geminiRpmTracker[h]) return 0;
  geminiRpmTracker[h] = geminiRpmTracker[h].filter(function(t) { return Date.now() - t < 60000; });
  return geminiRpmTracker[h].length;
}

// AI provider listesi — sırayla denenir
// type: 'gemini' (Gemini formatı) veya 'evren' (OpenAI-uyumlu)
//
// User: "evreni her aşamada son seçenek yap. tüm işlemlerde geminileri başa al. 
//        aidüzenleme dahil tüm işlerde geminiler başta olsun"
// Sıralama:
//   1-4. Gemini key'ler (ÖNCELİK — hızlı, 1-2 sn/makale)
//   5.  EVREN deepseek-v4-flash (SON ÇARE — bazen content boş döner, fallback zinciri ile)
function getAiProviders() {
  var providers = [];
  // 1-4. Gemini key'ler (ÖNCELİK)
  GEMINI_KEYS.forEach(function(gk, i) {
    providers.push({ type: 'gemini', key: gk, label: 'Gemini#' + (i+1) + '(' + GEMINI_MODEL + ')' });
  });
  // 5. EVREN (SON ÇARE — sadece tüm Gemini'ler ölünce devreye girer)
  if (EVREN_KEY) providers.push({ type: 'evren', key: EVREN_KEY, label: 'EVREN(' + EVREN_MODEL + ')' });
  return providers;
}

// EVREN API çağrısı — OpenAI-uyumlu /v1/chat/completions formatı
// deepseek-v4-flash gibi modeller REASONING yapar — cevap 'content' alanında gelir.
// max_tokens yüksek tut: reasoning + content için yeterli
//
// FALLBACK ZİNCİRİ (User: "deepseek-v4-flash hata verirse auto çalışsın"):
//   1. Önce EVREN_MODEL (deepseek-v4-flash) dene
//   2. Content boş gelirse veya 500/timeout hatası olursa → EVREN_FALLBACK_MODELS[0] (auto)
//   3. O da başarısızsa → EVREN_FALLBACK_MODELS[1] (gemma-4-31b)
//   4. Hepsi başarısızsa → çağırana hata fırlat (Gemini fallback devreye girer)
//   429/403 = KEY HATASI (model hatası değil) → fallback YAPILMAZ, hemen fırlat
// EVREN model fallback zincirisi — deepseek KALDIRILDI (sürekli content boş dönüyor)
// User: "yine üstte 51 dk" — deepseek her makalede 15-18 sn boşa harcanıyordu
// Sadece auto → gemma (deepseek yok)
var EVREN_FALLBACK_MODELS = (function() {
  if (process.env.EVREN_FALLBACK_MODELS) {
    return process.env.EVREN_FALLBACK_MODELS.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }
  // deepseek ÇIKARILDI — sadece auto + gemma
  return ['gemma-4-31b']; // auto zaten EVREN_MODEL, fallback sadece gemma
})();

async function callEvren(prompt, maxTokens) {
  // Tüm modelleri sırayla dene: önce primary, sonra fallback'ler
  var modelsToTry = [EVREN_MODEL].concat(EVREN_FALLBACK_MODELS);
  var lastError = null;

  for (var mi = 0; mi < modelsToTry.length; mi++) {
    var model = modelsToTry[mi];
    var url = EVREN_API_BASE.replace(/\/+$/, '') + '/chat/completions';

    // User katkısı: "response_format her modelde desteklenmeyebilir"
    //   deepseek-v4-flash destekliyor (OpenAI-uyumlu reasoning modeli)
    //   auto ve gemma-4-31b desteklemeyebilir → hata fırlatır → fallback kırılır
    //   Çözüm: SADECE primary model için response_format ekle
    //   Fallback modellerde prompt talimatı devreye girer ("Return ONLY the summary text...")
    var requestBody = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: Math.min(Math.max(maxTokens, 1500), 4000),
      temperature: 0.7,
    };
    // KRİTİK: response_format text olarak ayarla — deepseek-v4-flash bazen
    // reasoning mode'a geçip content boş döndürür. Bu parametre ile model
    // her zaman text formatında cevap üretir (content dolu gelir).
    // User/Gemini: "response_format: { type: 'text' } yoksa model content boş döndürür"
    // SADECE deepseek-v4-flash için — fallback modeller desteklemeyebilir
    if (model === 'deepseek-v4-flash') {
      requestBody.response_format = { type: 'text' };
    }

    var resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + EVREN_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      // Timeout / ağ hatası — sonraki modele geç
      lastError = new Error('EVREN(' + model + ') fetch hatası: ' + e.message);
      log('  EVREN(' + model + ') timeout/ağ hatası — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }

    if (!resp.ok) {
      var errText = '';
      try { errText = await resp.text(); } catch (e) {}
      var err = new Error('EVREN(' + model + ') HTTP ' + resp.status + ': ' + errText.slice(0, 200));
      err.statusCode = resp.status;
      // 429/403 = KEY HATASI — fallback yapılmaz, hemen fırlat (key dead olacak)
      // Bu durumda fallback modeller de aynı key'i kullanır, yine 429/403 alır — boşuna deneme
      if (resp.status === 429 || resp.status === 403) throw err;
      // 400/500/502/503 = model/server hatası — fallback dene
      lastError = err;
      log('  EVREN(' + model + ') HTTP ' + resp.status + ' — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }

    var result;
    try { result = await resp.json(); } catch (e) {
      lastError = new Error('EVREN(' + model + ') JSON parse hatası: ' + e.message);
      log('  EVREN(' + model + ') JSON parse hatası — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }

    if (result.error) {
      var e2 = new Error('EVREN(' + model + ') API error: ' + (result.error.message || JSON.stringify(result.error)));
      e2.statusCode = result.error.code || 500;
      lastError = e2;
      log('  EVREN(' + model + ') API error — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }

    // OpenAI-uyumlu response: choices[0].message.content
    var choice = result.choices && result.choices[0];
    if (!choice) {
      lastError = new Error('EVREN(' + model + '): choices boş');
      log('  EVREN(' + model + ') choices boş — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }
    var msg = choice.message || {};
    var text = msg.content;
    // KRİTİK: reasoning alanını ASLA kullanma — o AI'nin düşünme sürecidir, özet değil
    // Eğer content boşsa, bu model başarısız — fallback modellere geç
    if (!text) {
      lastError = new Error('EVREN(' + model + '): content boş');
      log('  EVREN(' + model + ') content boş — fallback deneniyor: ' + (mi + 1 < modelsToTry.length ? modelsToTry[mi + 1] : 'yok'));
      continue;
    }
    // Başarılı — content var
    if (model !== EVREN_MODEL) {
      log('  EVREN fallback başarılı: ' + model + ' (' + text.length + ' karakter)');
    }
    return text;
  }
  // Tüm modeller başarısız
  throw lastError || new Error('EVREN: tüm modeller (' + modelsToTry.join(', ') + ') başarısız');
}

// Gemini API çağrısı — mevcut format
async function callGemini(key, prompt, maxTokens) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;
  var resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(15000),
  });
  var result = await resp.json();
  if (result.error) {
    var e = new Error('Gemini error: ' + result.error.message);
    e.statusCode = result.error.code;
    throw e;
  }
  var text = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini: response boş');
  return text;
}

var ROOT = path.resolve(__dirname, '..');
var SF = path.join(ROOT, 'pipeline-status.json');
var LF = path.join(ROOT, 'pipeline-once.log');
// History log — APPEND ONLY (truncate EDİLMEZ). Her cycle'ın başlangıç/bitiş zamanı burada saklanır.
// /api/admin/pipeline-history bu dosyayı okuyup admin panelde "Akış Kontrol" sekmesinde gösterir.
var HF = path.join(ROOT, 'pipeline-history.log');
// LF truncate EDİLMEZ — cycle logları append edilir (cron >> redirect veya spawn stdio 'a' ile).
// Her cycle "=== Cycle basladi ===" satırıyla başlar, sıralı okunabilir.

function log(m) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] ' + m;
  console.log(line);
  // appendFileSync KALDIRILDI — cron >> redirect (pipeline-once.log) ve spawn stdio 'a' (pipeline-spawn.log)
  // ile console.log çıktısı zaten dosyaya yazılıyor. Bu satır çift log yazımına sebep oluyordu.
}

function ws(s) {
  try {
    var c = null;
    try { c = JSON.parse(fs.readFileSync(SF, 'utf8')); } catch (e) {}
    fs.writeFileSync(SF, JSON.stringify(Object.assign({}, c, s), null, 2), 'utf8');
  } catch (e) {}
}

// History log'a JSON-line yazar (append-only, her cycle için bir kayıt)
// Admin panel "Akış Kontrol" sekmesi bunu okuyup son 24 saati gösterir
function wh(entry) {
  try {
    var line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + '\n';
    fs.appendFileSync(HF, line, 'utf8');
  } catch (e) {}
}

// === TARİH BUG FIX — AI özetlerindeki "yılının ekim ayının sekizinci günü" formatını
// "8 Ekim 2026" formatına çevirir. AI bazen bu formata kayıp tarihleri uzun yazıyor.
// Pipeline her özeti kaydetmeden önce bu fonksiyonla temizler.
var TURKISH_ORDINALS = {
  'birinci': 1, 'ilk': 1, 'ikinci': 2, 'üçüncü': 3, 'ucuncu': 3,
  'dördüncü': 4, 'dorduncu': 4, 'beşinci': 5, 'besinci': 5,
  'altıncı': 6, 'altinci': 6, 'yedinci': 7, 'sekizinci': 8, 'dokuzuncu': 9,
  'onuncu': 10, 'on birinci': 11, 'onbirinci': 11, 'on ikinci': 12, 'onikinci': 12,
  'on üçüncü': 13, 'on ucuncu': 13, 'onucuncu': 13,
  'on dördüncü': 14, 'on dorduncu': 14, 'on beşinci': 15, 'on besinci': 15,
  'on altıncı': 16, 'on altinci': 16, 'on yedinci': 17, 'on sekizinci': 18, 'on dokuzuncu': 19,
  'yirminci': 20, 'yirmi birinci': 21, 'yirmi ikinci': 22, 'yirmi üçüncü': 23,
  'yirmi dördüncü': 24, 'yirmi beşinci': 25, 'yirmi altıncı': 26, 'yirmi yedinci': 27,
  'yirmi sekizinci': 28, 'yirmi dokuzuncu': 29, 'otuzuncu': 30, 'otuz birinci': 31
};
var TURKISH_MONTHS = {
  'ocak': 'Ocak', 'şubat': 'Şubat', 'subat': 'Şubat', 'mart': 'Mart', 'nisan': 'Nisan',
  'mayıs': 'Mayıs', 'mayis': 'Mayıs', 'haziran': 'Haziran', 'temmuz': 'Temmuz',
  'ağustos': 'Ağustos', 'agustos': 'Ağustos', 'eylül': 'Eylül', 'eylul': 'Eylül',
  'ekim': 'Ekim', 'kasım': 'Kasım', 'kasim': 'Kasım', 'aralık': 'Aralık', 'aralik': 'Aralık'
};
var DATE_SUFFIX_MAP = { 'nde': ' tarihinde', 'nün': ' tarihinin', 'nden': ' tarihinden', 'n': '', '': '' };
var MONTH_NAMES_ARR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function turkishWordToNumber(word) {
  if (!word) return null;
  var w = word.toLowerCase().trim();
  var keys = Object.keys(TURKISH_ORDINALS).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) { if (w === keys[i]) return TURKISH_ORDINALS[keys[i]]; }
  for (var i = 0; i < keys.length; i++) { if (w.indexOf(keys[i]) >= 0) return TURKISH_ORDINALS[keys[i]]; }
  return null;
}

function buildDateReplacement(year, monthWord, ordinalWord, suffix) {
  var month = TURKISH_MONTHS[monthWord.toLowerCase()];
  if (!month) return null;
  var day = turkishWordToNumber(ordinalWord);
  if (day === null) return null;
  var dateStr = (year ? day + ' ' + month + ' ' + year : day + ' ' + month);
  return dateStr + (DATE_SUFFIX_MAP[suffix || ''] !== undefined ? DATE_SUFFIX_MAP[suffix || ''] : '');
}

// "2026 yılının ekim ayının sekizinci gününde" → "8 Ekim 2026 tarihinde"
function fixDateBugs(text) {
  if (!text) return text;
  // Pattern 1: "[year ] yılının [month] ayının [ordinal] günü[suffix]"
  text = text.replace(/(?:((?:19|20)\d{2})\s+)?yılının\s+([a-zA-ZçğıİöşüÇĞİÖŞÜ]+)\s+ayının\s+([a-zA-ZçğıİöşüÇĞİÖŞÜ\s]+?)\s+günü(nde|nün|nden|n)?/gi, function(match, year, monthWord, ordinalWord, suffix) {
    var repl = buildDateReplacement(year, monthWord, ordinalWord, suffix || '');
    return repl === null ? match : repl;
  });
  // Pattern 2: "yılın [monthOrdinal] ayının [dayOrdinal] günü[suffix]"
  text = text.replace(/yılın\s+([a-zA-ZçğıİöşüÇĞİÖŞÜ]+)\s+ayının\s+([a-zA-ZçğıİöşüÇĞİÖŞÜ\s]+?)\s+günü(nde|nün|nden|n)?/gi, function(match, monthOrdinal, dayOrdinal, suffix) {
    var monthNum = turkishWordToNumber(monthOrdinal);
    if (monthNum === null || monthNum < 1 || monthNum > 12) return match;
    var day = turkishWordToNumber(dayOrdinal);
    if (day === null) return match;
    return day + ' ' + MONTH_NAMES_ARR[monthNum - 1] + (DATE_SUFFIX_MAP[suffix || ''] !== undefined ? DATE_SUFFIX_MAP[suffix || ''] : '');
  });
  // Pattern 3: Standalone "[month] ayının [ordinal] günü[suffix]" (yıl yok)
  var monthKeysPiped = Object.keys(TURKISH_MONTHS).join('|');
  var p3 = new RegExp('(' + monthKeysPiped + ')\\s+ayının\\s+([a-zA-ZçğıİöşüÇĞİÖŞÜ\\s]+?)\\s+günü(nde|nün|nden|n)?', 'gi');
  text = text.replace(p3, function(match, monthWord, ordinalWord, suffix) {
    var repl = buildDateReplacement(null, monthWord, ordinalWord, suffix || '');
    return repl === null ? match : repl;
  });
  return text;
}

// === MARKA BLOK LİSTESİ KONTROLÜ ===
// Başlıkta marka adı geçerse → true döner (haber yayınlanmaz)
// User: "tesla fabrikası yandı bile deseler yayınlamayalaım. iphone ile adam öldürdü haberini bile engelleyelim"
// Tüm marka adları kelime sınırı (\b) ile aranır — "mini" → "mini etek" değil, "Mini Cooper" eşleşir
var BRAND_PATTERNS = null;
function getBrandPatterns() {
  if (BRAND_PATTERNS) return BRAND_PATTERNS;
  BRAND_PATTERNS = BRAND_BLOCKLIST.map(function(brand) {
    // Marka adını normalize et (Türkçe → ASCII lowercase)
    var normalized = brand
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/Ş/g, 's').replace(/ş/g, 's').replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .replace(/Ğ/g, 'g').replace(/ğ/g, 'g').replace(/Ü/g, 'u').replace(/ü/g, 'u')
      .replace(/Ö/g, 'o').replace(/ö/g, 'o')
      .toLowerCase().trim();
    // Regex özel karakterleri escape et, kelime sınırı ekle
    var escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Çok kelimeli markalar için boşluğu \s+ ile değiştir (esnek match)
    var flexible = escaped.replace(/ /g, '\\s+');
    return { pattern: new RegExp('\\b' + flexible + '\\b', 'i'), brand: normalized };
  });
  return BRAND_PATTERNS;
}

function hasBrandInTitle(title) {
  if (!title || !title.trim()) return false;
  var patterns = getBrandPatterns();
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].pattern.test(title)) {
      return patterns[i].brand; // hangi marka bulundu (log için)
    }
  }
  return false;
}

// fetch — native http (Wasm yok)
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
      var chunks = [];
      resp.on('data', function(c) { chunks.push(c); });
      resp.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: resp.statusCode, ok: resp.statusCode >= 200 && resp.statusCode < 300, json: function() { return Promise.resolve(JSON.parse(text)); }, text: function() { return Promise.resolve(text); } });
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

// Prisma
try {
  var PrismaClient = require('@prisma/client').PrismaClient;
  var _prisma = new PrismaClient({ log: ['error'] });
  _prisma.$disconnect = function() { return Promise.resolve(); };
  globalThis.prisma = _prisma;
} catch (e) { console.error('Prisma: ' + e.message); }

// AI ÖZET — telifsiz, kategori bazlı min kelime, 5 key sırayla
// Kategori bazlı minimum kelime sayısı (alt sınır — AI bundan az üretmemeli)
// Tüm kategoriler için 150 kelime alt sınır
// 'Özel' kategoride AI çağrılmaz (admin panelinden manuel eklenir) — listede YOK
// ÜST SINIR YOK — AI'a "haberin tamamını anlat" talimatı verilir
var CATEGORY_MIN_WORDS = {
  'Siyaset': 50,
  'Ekonomi / Finans': 50,
  'Kamu / Resmi': 50,
  'Bilim / Teknoloji': 50,
  'Kültür / Sanat': 50,
  'Spor / Magazin': 50
};

// HTML entity decode — publishedArticle.aiTitle temiz olsun
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

async function aiSummarize(title, contents, category) {
  if (!contents || contents.length === 0) return null;
  var sorted = contents.filter(function(c) { return c && c.length > 50; }).sort(function(a, b) { return b.length - a.length; });
  if (sorted.length === 0) return null;
  var combinedContent = sorted.join('\n\n---\n\n').slice(0, 8000);
  var minWords = CATEGORY_MIN_WORDS[category] || 100;

  function buildPrompt(minW, prevText, plagiarismChunks, prevWordCount, prevAds) {
    var prompt = 'Sen bağımsız bir haber editörüsün. Aşağıda farklı kaynaklardan gelen, aynı habere ait metinler var. ' +
      'Bu metinleri oku, ANLA, sonra KENDİ CÜMLELERİNLE bağımsız bir gazeteci gibi YENİDEN YAZ. ' +
      'Bu bir alıntı veya özet değildir — kendi özgün anlatımın olmalı.\n\n' +
      'TELİF GÜVENLİĞİ KURALLARI — ZORUNLU:\n' +
      '1. BİRBİR AYNI CÜMLE KESİNLİKLE OLMASIN. Kaynak metindeki hiçbir cümleyi aynen kopyalama.\n' +
      '   Cümleyi bölüm: özne + yüklem + nesne sırasını değiştir, eş anlamlı kelimeler kullan.\n' +
      '2. Kaynak metinle %30 DAN FAZLA kelime örtüşmesi yapma.\n' +
      '3. Cümle yapılarını tamamen değiştir:\n' +
      '   - Aktif cümleyi pasife çevir (önceledi → tarafından önelendi)\n' +
      '   - Olumsuzu olumlu, olumlu olumsuz yap (ifade değişmeden)\n' +
      '   - Düz cümleyi soru, soruyu düz cümleye çevir\n' +
      '   - Cümle sırasını değiştir (önce sonuç, sonra sebep — veya tersi)\n' +
      '4. Eş anlamlı kelimeler kullan:\n' +
      '   - "açıkladı" yerine "belirtti / ifadede bulundu / söyledi / dile getirdi"\n' +
      '   - "dedi" yerine "ifade etti / kaydetti / vurguladı / belirtti"\n' +
      '   - "yüzde" yerine "yüzde oranında / yüzde ... seviyesinde / ...-oranla"\n' +
      '   - "bugün" yerine "bu gün / yaşadığımız gün / günümüzde"\n' +
      '   - "başkanı" yerine "yöneticisi / temsilcisi / sözcüsü" (anlam uygunsa)\n' +
      '5. Kaynak metindeki İFADEYİ DEĞİL, ANLAMI aktar. Anlamı koru, ifadeyi değiştir.\n' +
      '6. Sayısal veriler (rakam, yüzde, tarih, saat) — ANLAMI KORU ANCAK FARKLI CÜMLEDE VER:\n' +
      '   Kaynakta "Borsa %2 yükseldi" yazıyorsa sen "Borsa endeksinde yüzde iki oranında artış gözlendi" yaz.\n' +
      '   Kaynakta "5 Ekim 2026" yazıyorsa SEN DE "5 Ekim 2026" YAZ — tarihi olduğu gibi koru, değiştirme.\n' +
      '7. Alıntı yapılmış sözleri ("..." içindeki ifadeler) AYNEN KORUMAK ZORUNLU DEĞİL — kendi cümlenle aktar.\n' +
      '8. Kişi adları ve kurum adları korunabilir ANCAK cümle içinde farklı konumlandır.\n' +
      '9. Eğer kaynak metinle çok benzer çıkarsa, kendini düzelt — farklı bir cümle kur.\n' +
      '10. Kopyalama kriteri: Aynı cümlenin 6+ kelimesi kaynakla birebir ardışık dizilirse, veya bir cümlenin %50+ kısmı kaynak cümleyle örtüşürse, ya da AI özetindeki cümlelerin 2/3+ kısmı kaynak cümlelerle örtüşüyorsa — bu kopyalamadır, DEĞİŞTİR.\n';

    // Eğer önceki denemeden plagiarizm tespit edildiyse
    if (prevText && plagiarismChunks && plagiarismChunks.length > 0) {
      prompt += '\nÖNCEKİ DENEMENDE KOPYALAMA TESPİT EDİLDİ. Şu ifadeler kaynak metinle birebir aynı:\n';
      plagiarismChunks.slice(0, 3).forEach(function(chunk, i) {
        prompt += '  ' + (i+1) + '. "' + chunk + '"\n';
      });
      prompt += 'Bu ifadelerin hiçbirini yeniden yazdığın metinde aynen kullanma. ' +
        'Tamamen farklı cümle yapısı ve eş anlamlı kelimelerle yeniden yaz.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans için, kopyalama):\n' + prevText.slice(0, 500) + '\n';
    }

    // Eğer önceki denemede yetersiz kelime ise
    if (prevText && prevWordCount && prevWordCount < minW) {
      prompt += '\nÖNCEKİ DENEMEN ' + prevWordCount + ' KELİME İDİ — YETERSİZ.\n';
      prompt += 'EN AZ ' + minW + ' kelime yazman ZORUNLU. Önceki denemeyi referans al ama ' +
        'DAHA UZUN ve detaylı yaz. Haberin tüm detaylarını, bağlamını, arka planını, sonuçlarını ekle.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans):\n' + prevText.slice(0, 500) + '\n';
    }

    // Eğer önceki denemede reklam tespit edildiyse
    if (prevText && prevAds && prevAds.length > 0) {
      prompt += '\nÖNCEKİ DENEMENDE REKLAM TESPİT EDİLDİ. Şu reklam/CTA ifadeleri var:\n';
      prevAds.slice(0, 8).forEach(function(ad, i) {
        prompt += '  ' + (i+1) + '. "' + ad + '"\n';
      });
      prompt += 'Bu ifadeleri ASLA yeniden yazdığın metinde kullanma. ' +
        'Haberin konusu reklam ile ilgili değilse, tüm reklam benzeri ifadeleri tamamen çıkar. ' +
        'Sadece haberin asıl içeriğini yaz.\n';
    }

    prompt += '\nİÇERİK KURALLARI:\n' +
      '1. Mantıksal tutarlılık: haberin anlamına sadık kal. Olmayan çıkarımlar yapma. ' +
      '"deprem öncesi 16 artçı" gibi saçma mantıksal hatalardan kaçın. Eylemi doğru özne yap, ' +
      'sayıları doğru kullan, eylem-sayı-özne ilişkisi bozukluğu yapma.\n' +
      '2. Terim kontrolü: teknik, siyasi, ekonomik, hukuki terimleri doğru kullan. ' +
      '"artçı" depremden sonra gelir (ön sarsıntı öncesi). Tarih, saat, yüzde, rakam bilgisini ' +
      'OLDUĞU GİBİ AL ANCAK farklı cümle yapısı içinde ver.\n' +
      '3. Kronoloji: olayların sırasını koru. Eski olayı "yeni" gibi, yeni olayı "eski" gibi sunma. ' +
      '"gelecek" olanı "geçmiş" gibi, "geçmiş" olanı "gelecek" gibi yazma.\n' +
      '4. İddia/yargı: haberde "iddia edildi" diyorsa "gerçekleşti" deme. "açıklandı" diyorsa ' +
      '"söylendi" deme. Belirsizliği koru.\n' +
      '5. Anlam kayması: "ekonomik büyüme" yerine "ekonomik küçülme" gibi zıt anlamlı kelime yazma.\n' +
      '6. BAŞLIK-ÖZET UYUMU: Özet yazdığın haber BAŞLIKTA belirtilen konu ile AYNI olmalıdır. ' +
      'Başlık "MHP Genel Başkanı Bahçeli" hakkında ise özet de BU konuyu anlatmalıdır. ' +
      'Başlıkta bahsedilen kişiler, kurumlar ve olaylar özette yer almalıdır. ' +
      'Eğer kaynak metinler farklı konuları içeriyorsa, SADECE başlıkla ilgili olan kısmı özetle. ' +
      'Başka bir haberin içeriğini BAŞLIKLA ALAKASIZ olarak özete dahil ETME.\n' +
      '7. MARKA REKLAM VE TANITIM FILTRESI: Eğer kaynak metin belirli bir markanın, ' +
      'ürünün veya şirketin TANITIMINI, REKLAMINI veya SPONSORLU İÇERİĞİNİ içeriyorsa, ' +
      'bu kısmı özete DAHİL ETME. Örnekler:\n' +
      '   - Otomobil markası tanıtımı: "Yeni X modeli tanıtıldı, işte özellikleri" → REKLAM, atla\n' +
      '   - Telefon markası tanıtımı: "Y markası yeni telefonunu çıkardı" → REKLAM, atla\n' +
      '   - Ürün tanıtımı: "Z ürünü ile tanışın" → REKLAM, atla\n' +
      '   Eğer haber bir markanın reklamını/tanıtımını yapıyorsa, bu içeriği ÖZETLEME.\n' +
      '   Sadece tarafsız haber içeriğini özetle.\n' +
      '8. REKLAM VE SPONSORLU İÇERİK KALDIR: Kaynak metinde geçen reklam, sponsorlu içerik, ' +
      'çağrı aksiyonu (CTA) ifadelerini ASLA özete dahil etme. Örnekler:\n' +
      '   - "Abone ol", "Bültenimize katıl", "Kaydol", "Üye ol" → KALDIR\n' +
      '   - "Tıkla", "Buradan satın al", "Hemen indir", "Ücretsiz dene" → KALDIR\n' +
      '   - "Sponsorlu içerik", "Reklam", "Promosyon", "İndirim" → KALDIR\n' +
      '   - "İlginizi çekebilir", "Bunları da okuyun", "Diğer haberler", "Önerilen" → KALDIR\n' +
      '   - "Bizi takip edin", "Sosyal medya", "Instagram", "Twitter", "YouTube" (kanal yönlendirme) → KALDIR\n' +
      '   - "Uygulamamızı indir", "App Store", "Google Play" → KALDIR\n' +
      '   - Kaynak site adı, "için tıklayın", "detaylar için" gibi yönlendirme → KALDIR\n' +
      '   Eğer haberin ana konusu reklam değilse, reklam benzeri ifadeleri tamamen çıkar.\n';

    prompt += '\nGÜNCEL BİLGİLER VE TARİH DOĞRULUĞU (ÇOK ÖNEMLİ — bu haberi yazarken tarih: ' + new Date().toLocaleDateString('tr-TR') + '):\n' +
      '1. Donald Trump: ABD\'nin 47. ve ŞU ANKİ Başkanı (20 Ocak 2025\'ten beri görevde). "Eski başkan" DEĞİL. Biden: ABD\'nin 46. Başkanı (eski, 2021-2025).\n' +
      '2. Recep Tayyip Erdoğan: Türkiye Cumhurbaşkanı (şu an görevde). "Eski cumhurbaşkanı" DEĞİL.\n' +
      '3. Kişilerin güncel görevlerini DOĞRU ver. Bir kişi şu an görevdeyse "eski" demeyin. Görevden ayrılmışsa "eski" deyin.\n' +
      '4. Kaynak metinde "eski başkan" gibi hatalı ifade varsa DÜZELT — Trump için "ABD Başkanı Trump" yaz.\n' +
      '5. Tarihleri doğru ver. "Bugün" ifadesi şu anki tarihtir. Önceki olayları geçmiş zaman, şu anki olayları şimdiki zaman ile yaz.\n';

    prompt += '\nUZUNLUK:\n' +
      'EN AZ ' + minW + ' kelime olmalı — daha kısa yazma. ' +
      'EN ÇOK 300 kelime olmalı — daha uzun yazma. 300 kelime yeterli, haberi tamamla. ' +
      'Cümleni yarıda kesme, haber doğal bir sonuca ulaşmalı. ' +
      'ASLA 300 kelimeyi geçme — kısa ve öz tut.\n';

    prompt += '\nBAŞLIK ÇEVRİSİ (ÇOK ÖNEMLİ — User: "dünya kategorisindeki haberlerde başlıklar ingilizce duruyor"):\n' +
      '1. Eğer kaynak başlık İngilizce veya başka bir yabancı dilde ise, TÜRKÇEYE ÇEVİR.\n' +
      '2. Eğer kaynak başlık zaten Türkçe ise, olduğu gibi koru.\n' +
      '3. Örnek İngilizce başlık: "Australia bowl out South Africa to win first Test" → Türkçe: "Avustralya ilk Test maçında Güney Afrika\'yı eledi"\n' +
      '4. Örnek İngilizce başlık: "Pope Leo Prepares for Surgery" → Türkçe: "Papa Leo Ameliyat İçin Hazırlanıyor"\n' +
      '5. Kişi adları ve özel isimler korunabilir (Trump, Biden, Erdoğan, vb.) ANCAK cümle yapısı Türkçe olmalı.\n' +
      '6. Başlık kısa (5-15 kelime), etkileyici ve Türkçe dilbilgisi kurallarına uygun olmalı.\n' +
      '7. BAŞLIĞI çıktının EN BAŞINA yaz, şu format ile:\n' +
      '   BAŞLIK: [Türkçe başlık buraya]\n' +
      '   ---\n' +
      '   [özet metni buraya — yukarıdaki kurallara göre]\n\n';

    prompt += '\nÇIKTI FORMATI:\n' +
      'Türkçe yaz. Çıktı BAŞLIK + --- + ÖZET formatında olmalı.\n' +
      'CRITICAL: Return ONLY the rewritten Turkish title and summary. No preamble, no reasoning. ' +
      'Format: "BAŞLIK: [title]\\n---\\n[summary]"\n\n' +
      'BAŞLIK (referans): ' + title + '\n\nKAYNAK HABER METİNLERİ:\n' + combinedContent;
    return prompt;
  }

  // Reklam tespiti — AI cevabında reklam/CTA/sponsorlu içerik ifadeleri var mı?
  var AD_PHRASES = [
    'abone ol', 'bültenimize katıl', 'kaydol', 'üye ol', 'ücretsiz üye',
    'tıkla', 'buradan satın al', 'hemen indir', 'ücretsiz dene',
    'sponsorlu içerik', 'reklamdır', 'promosyon', 'indirim', 'fırsat',
    'ilginizi çekebilir', 'bunları da okuyun', 'diğer haberler', 'önerilen',
    'bizi takip edin', 'sosyal medya hesaplarımız', 'instagram hesabımız',
    'twitter hesabımız', 'youtube kanalımız', 'facebook sayfamız',
    'uygulamamızı indir', 'app store', 'google play', 'play store',
    'için tıklayın', 'detaylar için', 'bize ulaşın', 'iletişime geçin',
    'newsletter', 'subscribe', 'click here', 'buy now', 'download',
    'reklam geç', 'reklamı geç', 'sponsorlu'
  ];

  function findAds(text) {
    var normalized = String(text || '').toLowerCase();
    var found = [];
    AD_PHRASES.forEach(function(p) {
      if (normalized.indexOf(p) >= 0) found.push(p);
    });
    return found;
  }

  // Plagiarizm kontrolü — AI cevabında 6+ kelimelik ardışık dizilim VEYA cümle bazında %50+ / 2/3 örtüşme kaynak metinde var mı?
  function findPlagiarism(aiText, sourceText) {
    var normalize = function(t) {
      return String(t || '')
        .replace(/İ/g, 'i')
        .toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[ıI]/g, 'i')
        .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    var splitSentences = function(t) {
      return String(t || '')
        .split(/[.!?\n]+/)
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length > 0; });
    };
    var ai = normalize(aiText);
    var src = normalize(sourceText);
    if (!ai || !src) return [];

    var found = [];
    var seen = new Set();

    // User: "her cümledeki kelimelerin 2/3'ünü kullanabiliriz 1/3'ü kendimiz oluşturalım kuralı kalsın"
    // TEK KURAL: Her AI cümlesindeki ANLAMLI kelimelerin EN FAZLA 2/3'ü kaynak metinde geçebilir
    // Stop words (ve, bir, için, ile, bu, şu, o...) SAYILMAZ — sadece anlamlı kelimeler
    // Eğer bir AI cümlesindeki anlamlı kelimelerin 2/3+ FAZLASI kaynakta varsa → kopyalama
    var aiSentences = splitSentences(aiText);
    var srcWords = new Set(src.split(' '));
    // Stop words — sayılmayacak kelimeler
    var stopWords = new Set(['ve', 'bir', 'için', 'ile', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'ne', 'kadar', 'daha', 'çok', 'az', 'var', 'yok', 'ben', 'sen', 'biz', 'siz', 'onlar', 'ben', 'ama', 'fakat', 'ancak', 'şey', 'olan', 'olarak', 'kadar', 'gibi', 'her', 'hiç', 'sonra', 'önce', 'ise', 'ya', 'veya', 'hem', 'bile', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'with', 'for', 'from', 'by', 'as', 'that', 'this', 'it', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'did', 'do', 'does', 'done']);
    aiSentences.forEach(function(aSent) {
      var aNorm = normalize(aSent);
      if (!aNorm || aNorm.length < 20) return;
      var aWords = aNorm.split(' ');
      if (aWords.length < 5) return; // çok kısa cümleleri atla
      // Sadece anlamlı kelimeleri say (stop words hariç)
      var meaningfulWords = aWords.filter(function(w) { return !stopWords.has(w) && w.length > 2; });
      if (meaningfulWords.length < 3) return; // anlamlı kelime azsa atla
      // Bu cümledeki ANLAMLI kelimelerin kaç tanesi kaynakta var?
      var matchCount = 0;
      meaningfulWords.forEach(function(w) {
        if (srcWords.has(w)) matchCount++;
      });
      // 2/3'ten FAZLASI kaynakta varsa → kopyalama
      var ratio = matchCount / meaningfulWords.length;
      if (ratio > 2/3) {
        var key = aNorm.slice(0, 80);
        if (!seen.has(key)) {
          seen.add(key);
          found.push('Cümle 2/3 kuralı: ' + Math.round(ratio * 100) + '% anlamlı kelime örtüşmesi (' + matchCount + '/' + meaningfulWords.length + ')');
        }
      }
    });

    return found;
  }

  var bestText = null;
  var bestWordCount = 0;
  var prevAttemptText = null;
  var prevPlagiarism = null;
  var prevWordCount = 0;
  var prevAds = null;

  // AI provider listesi — EVREN önce (öncelik 1), sonra Gemini'ler (fallback)
  // Retry mantığı: hata → sonraki provider; plagiarizm/reklam/kısa → aynı provider ile retry
  var providers = getAiProviders();
  var providerIndex = 0;
  // Bir provider'a max 1 kez retry yapılır (plagiarizm/reklam/yetersiz kelime için)
  // User: "B) Retry Sayısı 3 → 1 uygula" — 3x hızlanma için retry'lar azaltıldı
  // Önceki: 3 (çok retry = 32 dk AI Özet fazı)
  // Şimdi: 1 (tek deneme, ilk cevap kabul edilir)
  // Eğer kalite düşerse: bu satırı tekrar 2 veya 3 yap
  var maxRetriesPerProvider = 1;
  var currentRetryCount = 0;

  while (providerIndex < providers.length) {
    var provider = providers[providerIndex];
    // deadKeys kontrolü — bu provider'ı atla
    if (deadKeys.has(provider.key)) {
      providerIndex++;
      currentRetryCount = 0;
      continue;
    }

    var maxTokens = 1500;
    var promptText = buildPrompt(minWords, prevAttemptText, prevPlagiarism, prevWordCount, prevAds);
    var text = null;
    try {
      if (provider.type === 'evren') {
        text = await callEvren(promptText, maxTokens);
      } else {
        // RPM KONTROLÜ — User: "neden 15 i geçiyorlar"
        if (!canCallGemini(provider.key)) {
          log('  [' + provider.label + '] RPM limit (' + geminiRpmCount(provider.key) + '/12) - sonraki provider');
          providerIndex++;
          currentRetryCount = 0;
          continue;
        }
        recordGeminiCall(provider.key);
        text = await callGemini(provider.key, promptText, maxTokens);
      }
    } catch (e) {
      var statusCode = e.statusCode || 0;
      // User: "Gemini#1 her makalede deneniyor" — 400 (invalid) de deadKeys'e ekle
      if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 429) {
        deadKeys.add(provider.key);
        log('  AI ' + statusCode + ' [' + provider.label + '] — ölü (deadKeys), sonraki provider');
        providerIndex++;
        currentRetryCount = 0;
        continue;
      }
      if (statusCode === 503) {
        log('  AI 503 [' + provider.label + '] — 5 sn bekle');
        await new Promise(function(r) { setTimeout(r, 5000); });
        continue; // aynı provider ile tekrar dene
      }
      log('  AI hata [' + provider.label + ']: ' + e.message.slice(0, 100));
      // SADECE HTTP 4xx/5xx hatalarında deadKeys'e ekle (kalıcı hata — key ölü)
      // "content boş" gibi geçici hatalarda deadKeys'e EKLEME — sonraki makalede EVREN tekrar denenecek
      // User: "evren de çalışıyor aslında neden 1 haber" — sebep: ilk content boş'tan sonra EVREN ölü sayılıyordu
      if (e.statusCode === 403 || e.statusCode === 429 || e.statusCode === 401) {
        deadKeys.add(provider.key);
      }
      // "content boş" (statusCode yok) → deadKeys'e EKLEME, sadece sonraki provider'a geç
      providerIndex++;
      currentRetryCount = 0;
      continue;
    }

    if (!text) {
      log('  AI [' + provider.label + '] boş cevap — sonraki provider');
      providerIndex++;
      currentRetryCount = 0;
      continue;
    }
    text = text.trim();
    deadKeys.delete(provider.key); // bu provider çalışıyor, dead list'ten çıkar
    var wc = countWords(text);

    // Plagiarizm kontrolü — User: "her cümledeki kelimelerin 2/3'ünü kullanabiliriz"
    // ANCAK: haber özetlerken anlamlı kelimeler (Trump, İstanbul, operasyon) doğal olarak
    // kaynakta var → plagiarism check her makaleyi reddediyor → 48 makale × 6 provider = 288 çağrı
    // ÇÖZÜM: Plagiarism check'i BİLGİ AMAÇLI yap, reddetme — AI Düzenle sonradan düzeltsin
    var plagiarism = findPlagiarism(text, combinedContent);
    if (plagiarism.length > 0) {
      log('  AI özet [' + provider.label + ']: ' + wc + ' kelime — ' + plagiarism.length + ' kopyalama (BILGI — kabul edildi)');
      // Reddetme! bestText'e kaydet ve devam et
      if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
      // Yeterli kelime varsa kabul et
      if (wc >= minWords) return text;
      continue;
    }

    // Reklam kontrolü — User: "reklam varsa direk reddetsin o makaleye tekrar retry işlem yapmasın"
    // Reddet → ATLA (continue ile sonraki makaleye geç, retry yok)
    var ads = findAds(text);
    if (ads.length > 0) {
      log('  AI özet [' + provider.label + ']: ' + wc + ' kelime — ' + ads.length + ' reklam (RED — makale atlandı)');
      continue;
    }

    // Yetersiz kelime kontrolü — User: "minimum kelime sayısını ai özet için 50 ye düşürelim"
    if (wc < minWords) {
      log('  AI özet [' + provider.label + ']: ' + wc + ' kelime (min: ' + minWords + ') — BILGI, kabul edildi');
      if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
      return text;
    }

    log('  AI özet [' + provider.label + ']: ' + wc + ' kelime — kopyalama YOK, kelime YETERLİ');
    if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
    if (wc >= minWords) return text;
    continue;
  }
  return bestText;
}

// Başlık benzerliği — HTML entity decode + Siyasetçi isimleri tek başına yeterli değil, en az 2 anlamlı kelime
function normalizeTitle(t) {
  if (!t) return '';
  // HTML entity decode (&#039; -> ', &amp; -> &, &quot; -> ", &nbsp; -> space, &#x27; -> ')
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
    // Ay ismi + ek → ay ismi (eylülde → eylül, kasımda → kasım, ekim'in → ekim)
    .replace(/\b(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(de|da|te|ta|in|ın|un|ün|nin|nın|nun|nün|den|dan|ten|tan|e|a|ye|ya|yi|yı|yu|yü|nden|ndan|nde|nda)\b/g, '$1')
    // Belediye ek'leri → belediye (belediyesinde → belediye)
    .replace(/\b(belediye)(si|sinde|sine|sinin|sinde|sinden|siyle)\b/g, '$1')
    // Soruşturma ek'leri → soruşturma
    .replace(/\b(soruşturma|sorusturma)(sı|si|sında|sinda|sinden|sının|sinin)\b/g, '$1')
    .replace(/[^\w\sçğıöşü]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sık geçen kelime kara listesi — tek başına haber eşleştirme yapamaz
// Siyasetçi isimleri + jenerik kelimeler + ay isimleri + yıllar + ekonomi kelimeleri
// + "adliyeye sevk edildi", "belli oldu", "haftaya başladı" gibi jenerik ifadeler
var STOP_WORDS = new Set([
  // Siyasetçi isimleri
  'erdoğan','erdogan','bahçeli','bahceli','akşener','aksener','kılıçdaroğlu','kilicdaroglu',
  'soylu','pelin','cumhurbaşkanı','cumhurbaskani','bakan','başkan','baskan','genel','merkezi',
  'seçer','vahap','güneş','murat','yasin','göktuğ','goktug','hazar','erel','kol',
  // Şehirler (jenerik haberlerde geçer)
  'türkiye','turkiye','türk','turk','ankara','istanbul','izmir','mersin','ataşehir','atasehir',
  // Zaman ifadeleri
  'bugün','bugun','yarın','yarin','haftaya','haftalık','günlük','aylık','yıllık','aylik','yillik',
  // Ay isimleri
  'ocak','şubat','subat','mart','nisan','mayıs','mayis','haziran','temmuz','ağustos','agustos',
  'eylül','eylul','ekim','kasım','kasim','aralık','aralik',
  // Yıllar (2020-2030)
  '2020','2021','2022','2023','2024','2025','2026','2027','2028','2029','2030',
  // Jenerik haber kelimeleri
  'haber','haberin','haberi','haberler','haberleri','son','dakika','sondakika',
  'gelen','yapan','olarak','için','ile','bin','yıl','yılın','yil','yilin','ilan','etti','açıklama','açıklandı',
  // Adli süreç jenerik ifadeleri (yolsuzluk, soruşturma, gözaltı vs. farklı konuları bağlamamalı)
  'adliyeye','adli','sevk','sevkledi','sevk edilen','götürüldü','gönderildi','alındı','alindi','alınan','alinan',
  'soruşturma','soruşturması','soruşturmasında','sorusturma','sorusturmasi','operasyon','operasyonunda',
  'gözaltına','gozaltina','gözaltı','gozalti','yakalandı','yakalandi','yakalanan',
  'kişi','kişiler','kişinin','kisi','kisiler','kisinin','zanlı','zanlılar','sanık','sanik',
  'sorgu','sorgusu','sorgusunda','ifade','ifadesi',
  // "belli oldu" gibi jenerik ifadeler — farklı haberleri bağlamamalı
  'belli','oldu','bellioldu','olduğunu','oldugunu','belli olduğunu','belli oldugunu',
  'netleşti','netlesti','netleşen','netlesen','kesinleşti','kesinlesti','açıklandı','aciklandi',
  // "başladı" gibi jenerik
  'başladı','basladi','başlamış','baslamis','bağladı','bagladi','başlayan','baslayan',
  // Sayılar + jenerik miktar ifadeleri
  'milyon','milyar','trilyon','binlerce','yüzde','yuzde','oranı','orani','oran','oranın','oranin',
  // Kategorik jenerikler — farklı konularda geçer
  'borsa','borsası','borsasi','borsa İstanbul','borsa istanbul','endeks','endeksi',
  'gram','altın','altını','altinin','ons','dolar','doları','dolari','euro','sterlin',
  'kuru','kurusu','enflasyon','enflasyonu','zam','zam mı','zammi','ücret','ücreti',
  'emekli','emeklilik','memur','memuru','ssk','bağkur','bagkur',
  'kira','kira','kira zam','zam oranı','zam orani','tavan','tavan zam',
  'piyasası','piyasasi','piyasa','piyasalar','borsalar','borsaları',
  'sanayi','sanayisi','finans','finansal','ekonomi','ekonomisi','ekonomik','iqtisadi',
  // Şahıs/unvan jenerik
  'belediye','belediyesi','belediyesinde','belediyesine','büyükşehir','buyuksehir','ilçe','ilçesi','ilce','ilcesi',
  'mhk','hakem','hakemler','hakemin','süperlig','superlig','lig','futbol','maç','maci',
  // "haftaya başladı" / "yükselişle başladı" / "düşüşle başladı" gibi jenerik
  'yükselişle','yükselisle','yükseliş','yukselis','düşüşle','dususle','düşüş','dusus',
  'primle','değer','deger','kazandı','kazandi','kaybetti','kayip','kayıp','kayıplar',
  'kapanış','kapanis','seans','seansında','seansinda','gün','gun','günü','gunu',
  // Diğer jenerikler
  'cumartesi','pazar','pazartesi','salı','sali','çarşamba','carsamba','perşembe','persembe','cuma',
  'sabah','öğle','ogle','akşam','aksam','gece','gündüz','gunduz',
  'itibariyle','itibariyile','sonrası','sonrasi','öncesi','oncesi','beraber','birlikte','dahil','ve'
]);

function titleSimilar(t1, t2) {
  var n1 = normalizeTitle(t1), n2 = normalizeTitle(t2);
  if (!n1 || !n2) return 0;
  // Birebir aynı başlık → kesin eşleşme (%100)
  if (n1 === n2) return 1.0;
  // 4+ karakter ve stop word olmayan kelimeleri al
  var w1 = n1.split(' ').filter(function(w) { return w.length > 3 && !STOP_WORDS.has(w); });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 3 && !STOP_WORDS.has(w); });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2); var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  var ratio = common / Math.max(w1.length, w2.length);
  // User: "3 kelime aynı olunca aynı haber kabul etmişiz oysa farklı haberler"
  // En az 4 anlamlı ortak kelime şart (3 değil — jenerik başlıklar birleşmesin)
  if (common < 4) return 0;
  // Eşik yüksek — sadece anlamlı örtüşme varsa kabul
  if (ratio < 0.7) return 0;
  return ratio;
}

// İçerik benzerliği — başlık yeterli değilse içeriğe bak
function contentSimilar(c1, c2) {
  if (!c1 || !c2) return 0;
  var n1 = normalizeTitle(c1.slice(0, 1500));
  var n2 = normalizeTitle(c2.slice(0, 1500));
  var w1 = n1.split(' ').filter(function(w) { return w.length > 4 && !STOP_WORDS.has(w); });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 4 && !STOP_WORDS.has(w); });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2); var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  var ratio = common / Math.max(w1.length, w2.length);
  // İçerikte en az 5 anlamlı ortak kelime şart
  if (common < 5) return 0;
  if (ratio < 0.5) return 0;
  return ratio;
}

// Gruplama — başlık benzerliği yüksek VEYA (başlık orta + içerik yüksek)
// Eşik YÜKSEK — alakasız haberler aynı grupta birleşmesin
// "İstanbul baskını" vs "İstanbul gastronomi" -> titleSimilar düşük, ayrı grup
// "Ataşehir Belediyesi soruşturması" vs "Vahap Seçer soruşturması" -> STOP'lar yeter,
// meaningful kelimeler farklı (ataşehir+yolsuzluk vs vahap+seçer), titleSimilar düşük, ayrı grup
function groupArticles(articles) {
  var groups = [], used = new Set();
  for (var i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;
    var group = {
      articles: [articles[i]],
      sourceIds: new Set([articles[i].sourceId]),
      sourceRoots: new Set([articles[i].sourceRoot || articles[i].sourceId])
    };
    used.add(i);
    for (var j = i + 1; j < articles.length; j++) {
      if (used.has(j)) continue;
      var titleSim = titleSimilar(articles[i].title, articles[j].title);
      var contentSim = contentSimilar(articles[i].content || articles[i].description || '', articles[j].content || articles[j].description || '');
      // User: "3 kelime aynı olunca aynı haber kabul etmişiz oysa farklı haberler"
      // Eşik yükseltildi: title >= 0.7 VEYA (title >= 0.5 + content >= 0.7)
      // Önceki: 0.5 (çok düşük — İstanbul+sağanak+felaketi 3 kelime → yanlış gruplama)
      if (titleSim >= 0.7 || (titleSim >= 0.5 && contentSim >= 0.7)) {
        group.articles.push(articles[j]);
        group.sourceIds.add(articles[j].sourceId);
        group.sourceRoots.add(articles[j].sourceRoot || articles[j].sourceId);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

// Kategori bazlı min kaynak sayısı — tüm kategoriler 2 (Siyaset/Ekonomi için 3 idi, 2'ye düşürüldü)
var CATEGORY_MIN_SOURCES = {
  'Siyaset': 2,
  'Ekonomi / Finans': 2,
  'Kamu / Resmi': 2,
  'Bilim / Teknoloji': 2,
  'Kültür / Sanat': 2,
  'Spor / Magazin': 2
};

// Kategori bazlı yayın limiti (en çok tekrar eden ilk N haber)
// User: "rss özet haber sayısını 50 yapalım"
// Total: 17+11+6+5+5+6 = 50 (önceki: 15+10+5+5+5+5 = 45)
var CATEGORY_PUBLISH_LIMITS = {
  'Siyaset': 10,
  'Ekonomi / Finans': 6,
  'Kamu / Resmi': 3,
  'Bilim / Teknoloji': 2,
  'Kültür / Sanat': 2,
  'Spor / Magazin': 2
};

// Ana sayfa sıralaması: 3 Siyaset, 2 Ekonomi, 1 Kamu, 1 Kültür, 1 Spor = 8
var HOME_LAYOUT = [
  { category: 'Siyaset', count: 3 },
  { category: 'Ekonomi / Finans', count: 2 },
  { category: 'Kamu / Resmi', count: 1 },
  { category: 'Kültür / Sanat', count: 1 },
  { category: 'Spor / Magazin', count: 1 }
];

// Kategori max haber sayısı (eskiyi arşive taşımak için)
var CATEGORY_MAX = 15;
var HOME_MAX_TOTAL = 50;
var HOME_MAX_FIRST_PAGE = 50; // TEK BATCH — 50 haber tek sayfada

var exitListeners = [];
var origExit = process.exit;
process.exit = function(code) { exitListeners.forEach(function(fn) { try { fn(code); } catch (e) {} }); exitListeners = []; };

var { spawn } = require('child_process');

function runScript(scriptPath, name) {
  log('> ' + name);
  return new Promise(function(resolve) {
    var done = false;
    function finish(r) { if (done) return; done = true; log('✓ ' + name + ' (' + r + ')'); resolve(); }

    // child_process.spawn ile çalıştır — require() yerine
    // Sebep: require() ile module.exports Promise olsa bile bazen .then() fonksiyon olarak
    // algılanmıyor, 60 sn timeout'a düşüyordu. spawn ile script ayrı process olarak çalışır,
    // 'exit' event'i ile gerçek bitiş anı tespit edilir.
    var child;
    try {
      child = spawn('node', [scriptPath], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      });
    } catch (e) {
      log('✗ ' + name + ': spawn hatası: ' + e.message);
      finish('exc');
      return;
    }

    // stdout/stderr yakala — log'la
    if (child.stdout) {
      child.stdout.on('data', function(data) {
        var lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(function(line) { log('  ' + line); });
      });
    }
    if (child.stderr) {
      child.stderr.on('data', function(data) {
        var lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(function(line) { log('  [stderr] ' + line); });
      });
    }

    // Exit event — script bitince resolve
    child.on('exit', function(code, signal) {
      if (done) return;
      if (code === 0) {
        finish('ok');
      } else if (signal) {
        log('✗ ' + name + ': signal ' + signal);
        finish('signal:' + signal);
      } else {
        log('✗ ' + name + ': exit code ' + code);
        finish('exit:' + code);
      }
    });

    child.on('error', function(e) {
      if (done) return;
      log('✗ ' + name + ': error: ' + e.message);
      finish('err');
    });
  });
}

// === LOCK MECHANIZMASI — paralel cycle'ları engeller ===
// User: "ai düzenleme yapılırken sonraki cron gelince yeni akış başlıyor. bu nedenle süre uzuyor.
//        herhangi bir akış faaliyeti varsa yeni cron tetiklemesi olmasın."
// Cron her 20 dk'da bir tetikliyor ama cycle 30-50 dk sürüyor → overlap.
// Çözüm: lock dosyası + PID yaşama kontrolü. Yeni process başlarken önceki process yaşıyorsa exit.
var LOCK_FILE = '/var/www/.pipeline-lock';

// Belirli bir PID'nin hala yaşayıp yaşamadığını kontrol et
// process.kill(pid, 0) — sinyal 0 = "yaşıyor mu" kontrolü (sinyal göndermez)
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = böyle process yok (ölmüş), EPERM = var ama yetki yok (yaşıyor demek)
    return e.code === 'EPERM';
  }
}

// Pipeline-all.js için başka bir process çalışıyor mu?
// pgrep -f "pipeline-all.js" ile çapraz kontrol — PID recycling'e karşı güvenlik
function isAnotherPipelineRunning() {
  try {
    // Lock dosyasını kontrol et
    if (fs.existsSync(LOCK_FILE)) {
      var lockContent = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      var lockPid = parseInt(lockContent, 10);
      if (!isNaN(lockPid) && lockPid > 0 && isPidAlive(lockPid)) {
        return { running: true, pid: lockPid, source: 'lock-file' };
      }
      // Lock'taki PID ölmüş — lock dosyasını temizle (stale lock)
      try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
    }
  } catch (e) {}
  // pgrep ile de kontrol et (lock dosyası silinmiş olabilir ama process yaşıyor olabilir)
  try {
    var { execSync } = require('child_process');
    var out = execSync('pgrep -f "pipeline-all.js" 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
    var pids = out.split('\n').map(function(s) { return parseInt(s.trim(), 10); }).filter(function(p) { return !isNaN(p) && p > 0 && p !== process.pid; });
    if (pids.length > 0) {
      // En az bir başka pipeline process'i yaşıyor mu kontrol et
      for (var i = 0; i < pids.length; i++) {
        if (isPidAlive(pids[i])) {
          return { running: true, pid: pids[i], source: 'pgrep' };
        }
      }
    }
  } catch (e) {}
  return { running: false };
}

// LOCK AL — başlamadan önce kontrol et, varsa exit yap
function acquireLock() {
  var check = isAnotherPipelineRunning();
  if (check.running) {
    var msg = '[LOCK] Başka pipeline process (PID ' + check.pid + ', kaynak: ' + check.source + ') hala çalışıyor — bu cycle atlanıyor.';
    console.error(msg);
    // Log'a yaz (Akış Kontrol'de görünsün)
    try {
      var logPath = '/var/www/pipeline-once.log';
      fs.appendFileSync(logPath, '[' + new Date().toISOString() + '] ' + msg + '\n');
    } catch (e) {}
    origExit(0); // exit code 0 = hata değil, sadece atlandı (origExit ile GERÇEK çıkış)
  }
  // Lock dosyasını yaz (kendi PID'imiz ile)
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  } catch (e) {
    // Lock dosyası yazılamazsa bile devam et — pgrep kontrolü hala çalışır
  }
}

// LOCK BIRAK — process biterken lock dosyasını sil
function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      var lockContent = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      var lockPid = parseInt(lockContent, 10);
      // Sadece kendi PID'imizse sil (başka process'in lock'unu silme)
      if (!isNaN(lockPid) && lockPid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}

// Lock al — önceki process yaşıyorsa exit yapar
acquireLock();

// Process çıkışında lock'u bırak (normal çıkış, SIGTERM, SIGINT, exception)
process.on('exit', releaseLock);
process.on('SIGTERM', function() { releaseLock(); process.exit(0); });
process.on('SIGINT', function() { releaseLock(); process.exit(0); });
process.on('uncaughtException', function(e) {
  releaseLock();
  console.error('[FATAL uncaughtException] ' + (e && e.message || e));
  process.exit(1);
});

async function main() {
  log('=== Cycle basladi ===');
  log('GEMINI keys: ' + GEMINI_KEYS.length + ' adet');
  var startedAtIso = new Date().toISOString();
  var startedAtMs = Date.now();
  // Her faz için start/finished zamanları (Akış Kontrol sekmesinde gösterilecek)
  var phaseTimes = {
    rssStartedAt: null, rssFinishedAt: null,
    ozetStartedAt: null, ozetFinishedAt: null,
    cleanupStartedAt: null, cleanupFinishedAt: null,
    duzenleStartedAt: null, duzenleFinishedAt: null
  };
  ws({ stage: 'started', startedAt: startedAtIso, finishedAt: null });
  // History: cycle başlangıcı (Akış Kontrol sekmesi için)
  wh({ event: 'start', startedAt: startedAtIso });

  // RSS
  phaseTimes.rssStartedAt = new Date().toISOString();
  ws({ stage: 'rss', rssStartedAt: phaseTimes.rssStartedAt });
  // console.log geçici olarak override et — trigger-refresh.js'in çıktısını yakala
  // "İşlenen kaynak: 97" satırından rssRead sayısını parse edeceğiz
  var _origLog = console.log;
  var _capturedRss = [];
  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    _origLog.apply(console, args);
    _capturedRss.push(args.join(' '));
  };
  await runScript(path.join(__dirname, 'trigger-refresh.js'), 'RSS');
  console.log = _origLog;
  // RSS istatistiklerini parse et
  var rssRead = 0;
  for (var ri = 0; ri < _capturedRss.length; ri++) {
    var rssMatch = _capturedRss[ri].match(/İşlenen kaynak:\s*(\d+)/);
    if (rssMatch) { rssRead = parseInt(rssMatch[1]); break; }
  }
  log('RSS stats: ' + rssRead + ' kaynak işlendi');
  phaseTimes.rssFinishedAt = new Date().toISOString();
  ws({ rssRead: rssRead, rssFinishedAt: phaseTimes.rssFinishedAt });
  if (global.gc) { global.gc(); log('GC'); }

  // Gruplama + AI özet
  phaseTimes.ozetStartedAt = new Date().toISOString();
  ws({ stage: 'publish', ozetStartedAt: phaseTimes.ozetStartedAt });
  log('Gruplama + AI özet (tüm kategoriler min 2 kaynak, EVREN öncelikli)');

  if (globalThis.prisma) {
    try {
      // Son N saat makaleler — .env'den WINDOW_HOURS ile ayarlanabilir (varsayılan: 24 saat)
      // User: "önceden rss ler son 24 saatte bunu 6 saate düşürdük ama 6 saat az bir süre,
      //        bunu tekrar 24 saat yapalım."
      // 6 saat çok kısıtlı — eski haberler kaçıyor, kullanıcı 24 saat istedi.
      // Değiştirmek için .env'e 'WINDOW_HOURS=12' (daha kısıtlı) ya da 'WINDOW_HOURS=48' (daha geniş) ekle
      var WINDOW_HOURS = parseInt(process.env.WINDOW_HOURS || '24', 10);
      if (isNaN(WINDOW_HOURS) || WINDOW_HOURS < 1) WINDOW_HOURS = 24;
      var since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
      var articles = await globalThis.prisma.article.findMany({
        where: { publishedAt: { gte: since } },
        orderBy: { publishedAt: 'desc' },
        select: { id: true, title: true, content: true, description: true, sourceId: true, category: true, imageUrl: true, publishedAt: true }
      });
      log('Son ' + WINDOW_HOURS + ' saat makale: ' + articles.length);

      // Grupla
      var groups = groupArticles(articles);
      log('Grup sayisi: ' + groups.length);

      // Kategori bazlı min kaynak filtrele
      var multiSource = groups.filter(function(g) {
        var cat = g.articles[0].category || 'Siyaset';
        var minSources = CATEGORY_MIN_SOURCES[cat] || 2;
        return g.sourceIds.size >= minSources;
      });
      log('Min kaynakli grup: ' + multiSource.length);

      // En çok kaynaklı gruptan en aza doğru sırala
      multiSource.sort(function(a, b) { return b.sourceIds.size - a.sourceIds.size; });

      // Kategori bazlı limitlere göre grupları ayır
      // Her kategori için en çok kaynaklı ilk N grup (Siyaset:15, Ekonomi:10, diğerleri:5)
      var byCategory = {};
      multiSource.forEach(function(g) {
        var cat = g.articles[0].category || 'Siyaset';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(g);
      });

      var topGroups = [];
      Object.keys(byCategory).forEach(function(cat) {
        var limit = CATEGORY_PUBLISH_LIMITS[cat] || 5;
        var catGroups = byCategory[cat].slice(0, limit);
        topGroups = topGroups.concat(catGroups);
      });
      log('Kategori limitlerine göre seçilen grup: ' + topGroups.length);
      // History/stats: kaç grup bulundu (duplicatesFound = grup sayısı — her grup 2+ kaynaktan gelmiş duplicate)
      ws({ duplicatesFound: topGroups.length });

      // Mevcut yayınlanan VE arşiv/duplicate haberleri al (birebir + benzer kontrol)
      // Tekrar kontrolü KATEGORİ BAĞIMSIZ — tüm kategorilerde aynı/benzer başlık ara
      var existingPublished = await globalThis.prisma.publishedArticle.findMany({
        where: { status: 'published' },
        select: { id: true, aiTitle: true, aiSummary: true, category: true, latestPublishedAt: true, sourceCount: true, status: true },
        orderBy: { publishedAt: 'desc' }
      });
      var existingArchived = await globalThis.prisma.publishedArticle.findMany({
        where: { status: { in: ['archived', 'duplicate'] } },
        select: { id: true, aiTitle: true, aiSummary: true, category: true, sourceCount: true, status: true },
        orderBy: { archivedAt: 'desc' },
        take: 200  // önceki 500 idi — user: "500'ü 200'e düşürelim"
      });
      // Birleşik liste (yayında + arşiv + duplicate) — kategori farkı gözetmeksizin aynı başlık ara
      var existing = existingPublished.concat(existingArchived);
      log('Mevcut haber (yayında ' + existingPublished.length + ' + arşiv/dup ' + existingArchived.length + ')');

      var added = 0, skipped = 0, aiOk = 0, archived = 0, pendingCount = 0;

      // === PARALEL BATCH (4 lu) ===
      // User: "4 lu paralel yapamaz miyiz"
      // 3 Faz: A) On isleme (sirali) B) AI cagrilari (paralel 4 lu) C) DB yazma (sirali)

      // FAZ A: On isleme — brand/ad/duplicate check, AI ya gidecek item lari topla
      var batchItems = [];
      for (var i = 0; i < topGroups.length; i++) {
        var group = topGroups[i];
        var groupArticlesList = group.articles;
        var firstArticle = groupArticlesList[0];
        var catSourcesByCat = {};
        for (var gi = 0; gi < groupArticlesList.length; gi++) {
          var ga = groupArticlesList[gi];
          var gcat = ga.category || 'Siyaset';
          if (!catSourcesByCat[gcat]) catSourcesByCat[gcat] = new Set();
          catSourcesByCat[gcat].add(ga.sourceId);
        }
        var bestCat = firstArticle.category || 'Siyaset';
        var bestCount = 0;
        Object.keys(catSourcesByCat).forEach(function(c) {
          if (catSourcesByCat[c].size > bestCount) { bestCount = catSourcesByCat[c].size; bestCat = c; }
        });
        var cat = bestCat;
        var sourceCount = group.sourceIds.size;

        var brandHit = hasBrandInTitle(firstArticle.title);
        if (brandHit) { log('  [MARKA BLOK] ' + brandHit + ' - ATLANDI: ' + firstArticle.title.slice(0, 60)); skipped++; continue; }

        var titleLowerCheck = firstArticle.title.toLowerCase();
        var adKeywords = ['fiyat listesi','fiyat listeleri','fiyati aciklandi','fiyatlari aciklandi','ozellikleri ve fiyati','guncel fiyat','guncel fiyatlar','sifir fiyat','guncel sifir','sifir otomobil fiyat','sifir araba fiyat','otomobil fiyatlari','guncel otomobil','oto fiyat listesi','tanitildi: iste','resmen tanitildi','iste ozellikleri','iste fiyati','tanitimi yapildi','tanitim videosu','lansmani yapildi','lansman videosu','dunya prmiyeri','dunya lansmani','tanitim etkinligi','tanitim gunu','tanitim fragmani','satisa sunuldu','cikis tarihi belli','satisa cikti','on satis','on siparis','satisa cikiyor','satisa sunulacak','satisa cikan','satista','telefon incelemesi','akilli telefon inceleme','telefonun ozellikleri','akilli saat tanitildi','yeni akilli saat','akilli saat incelemesi','otomobil tanitimi','otomobil incelemesi','araba incelemesi','test surusu','test surusu ile','surus izlenimleri','yeni modeli tanitildi','yeni model tanitimi','model tanitimi','modeli tanitildi','yuz yenileme yapildi','yuz yenileme tanitildi'];
        var isAd = false;
        for (var ai2 = 0; ai2 < adKeywords.length; ai2++) { if (titleLowerCheck.indexOf(adKeywords[ai2]) >= 0) { isAd = true; break; } }
        if (isAd) { log('  [Reklam/Tanitim] ATLANDI: ' + firstArticle.title.slice(0, 60)); continue; }

        var oldArticleToDuplicate = null;
        var alreadyArchived = false;
        var skipCreate = false;
        for (var j = 0; j < existing.length; j++) {
          var simTitle = titleSimilar(firstArticle.title, existing[j].aiTitle || '');
          var simContent = contentSimilar(firstArticle.content || firstArticle.description || '', existing[j].aiSummary || '');
          var matched = simTitle >= 0.5 || (simTitle >= 0.3 && simContent >= 0.5);
          if (!matched) continue;
          if (simTitle >= 0.85 && existing[j].status === 'published') {
            skipCreate = true;
            try { await globalThis.prisma.publishedArticle.update({ where: { id: existing[j].id }, data: { latestPublishedAt: new Date(), sourceCount: Math.max(existing[j].sourceCount || 0, sourceCount) } }); } catch (e) {}
            break;
          }
          if (existing[j].status === 'published') { oldArticleToDuplicate = existing[j]; break; }
          else if (existing[j].status === 'archived' || existing[j].status === 'duplicate') { alreadyArchived = true; break; }
        }
        if (skipCreate) { skipped++; continue; }

        var maxSources = (cat === 'Siyaset' || cat === 'Ekonomi / Finans') ? 5 : 2;
        var contents = groupArticlesList.slice(0, maxSources).map(function(a) { return a.content || a.description || ''; });
        batchItems.push({
          i: batchItems.length, firstArticle: firstArticle, groupArticlesList: groupArticlesList,
          cat: cat, sourceCount: sourceCount, contents: contents,
          oldArticleToDuplicate: oldArticleToDuplicate, alreadyArchived: alreadyArchived
        });
      }
      log('AI ozete gidecek: ' + batchItems.length + ' makale (toplam ' + topGroups.length + ' gruptan)');

      // FAZ B+C: Paralel batch AI cagrilari + sirali DB yazma
      var BATCH_SIZE = 4;
      for (var bi = 0; bi < batchItems.length; bi += BATCH_SIZE) {
        var batch = batchItems.slice(bi, bi + BATCH_SIZE);
        log('  === Batch ' + (bi+1) + '-' + (bi+batch.length) + '/' + batchItems.length + ' paralel cagriliyor ===');
        var batchStart = Date.now();

        var aiResults = await Promise.all(batch.map(function(item, idx) {
          return new Promise(function(resolve) {
            setTimeout(function() {
              aiSummarize(item.firstArticle.title, item.contents, item.cat)
                .then(resolve)
                .catch(function(e) { log('    AI error: ' + (e.message || '').slice(0, 80)); resolve(null); });
            }, idx * 200);
          });
        }));
        log('  === Batch AI tamam: ' + (Date.now() - batchStart) + 'ms (' + batch.length + ' makale) ===');

        for (var bj = 0; bj < batch.length; bj++) {
          var item = batch[bj];
          var aiText = aiResults[bj];
          if (!aiText || aiText.trim().length < 100) { log('  AI cevap vermedi, ATLANDI: ' + item.firstArticle.title.slice(0, 50)); continue; }
          var summaryText = aiText;
          var firstArticle = item.firstArticle;
          var cat = item.cat;
          var sourceCount = item.sourceCount;
          var groupArticlesList = item.groupArticlesList;
          var oldArticleToDuplicate = item.oldArticleToDuplicate;
          var i = item.i;
          aiOk++;

          if (oldArticleToDuplicate) {
            try { await globalThis.prisma.publishedArticle.update({ where: { id: oldArticleToDuplicate.id }, data: { status: 'duplicate', archivedAt: new Date() } }); archived++; } catch (e) {}
          }

          var bestImage = null;
          for (var k = 0; k < groupArticlesList.length; k++) { if (groupArticlesList[k].imageUrl) { bestImage = groupArticlesList[k].imageUrl; break; } }

          var titleLower = firstArticle.title.replace(/\u0130/g, 'i').replace(/I/g, '\u0131').toLowerCase();
          if (titleLower.indexOf('son dakika') >= 0 || titleLower.indexOf('sondakika') >= 0) {
            summaryText = summaryText.replace(/\u0130/g, 'i').replace(/son\s*dakika\.{0,3}/gi, '').replace(/sondakika\.{0,3}/gi, '').trim();
            var sonBilgilerPrefix = 'Konu ile ilgili son bilgiler \u015Fu ekildedir: ';
            if (summaryText.toLowerCase().indexOf(sonBilgilerPrefix.toLowerCase()) !== 0) { summaryText = sonBilgilerPrefix + summaryText; }
            var cleanedTitle = firstArticle.title.replace(/\u0130/g, 'i')
              .replace(/^\s*son\s*dakika\s*(haber[a-z\u00e7\u011f\u0131\u00fc\u015f\u00f6\u00e7]*)?\s*[.!?\u2026\|:\u2022\-\u2013\u2014,;]*\s*/gi, '')
              .replace(/^\s*sondakika\s*(haber[a-z\u00e7\u011f\u0131\u00fc\u015f\u00f6\u00e7]*)?\s*[.!?\u2026\|:\u2022\-\u2013\u2014,;]*\s*/gi, '')
              .replace(/\bson\s*dakika\s*(haber[a-z\u00e7\u011f\u0131\u00fc\u015f\u00f6\u00e7]*)?\s*[.!?\u2026\|:\u2022\-\u2013\u2014,;]*\s*/gi, '')
              .replace(/\bsondakika\s*(haber[a-z\u00e7\u011f\u0131\u00fc\u015f\u00f6\u00e7]*)?\s*[.!?\u2026\|:\u2022\-\u2013\u2014,;]*\s*/gi, '')
              .replace(/\s{2,}/g, ' ').trim();
            if (cleanedTitle && cleanedTitle !== firstArticle.title) { firstArticle.title = cleanedTitle; }
          }

          try {
            var publishTime = new Date(Date.now() - i * 60000);
            summaryText = fixDateBugs(summaryText);
            var createdArticle = await globalThis.prisma.publishedArticle.create({
              data: {
                aiTitle: decodeHtmlEntities(firstArticle.title),
                aiSummary: summaryText.slice(0, 5000),
                category: cat, imageUrl: bestImage,
                sourceArticleIds: JSON.stringify(groupArticlesList.map(function(a) { return a.id; })),
                sourceCount: sourceCount,
                earliestPublishedAt: groupArticlesList[groupArticlesList.length - 1].publishedAt || publishTime,
                latestPublishedAt: publishTime,
                wordCount: summaryText.split(/\s+/).length,
                initialHearts: Math.floor(Math.random() * (413 - 223 + 1)) + 223,
                clickHearts: 0, status: 'published', publishedAt: publishTime, isEdited: false
              }
            });
            added++;
            existing.push({ id: createdArticle.id, aiTitle: decodeHtmlEntities(firstArticle.title), aiSummary: summaryText.slice(0, 2000), category: cat, status: 'published' });
          } catch (e) { log('  DB hata: ' + e.message); }
        }
      }
      log('Added: ' + added + ', Archived: ' + archived + ', AI: ' + aiOk);

      // Yayın süresi dolan haberleri arşive taşı (6 saatten eski published)
      // Bu sayede site "taze" kalır — aynı başlıklar 6 saat sonra kalkar, yenileri gelir
      try {
        var staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 saat
        var staleResult = await globalThis.prisma.publishedArticle.updateMany({
          where: {
            status: 'published',
            latestPublishedAt: { lt: staleCutoff },
            sourceCount: { lt: 999 } // Özel haberler (sourceCount=999) arşive TAŞINMAZ
          },
          data: { status: 'archived', archivedAt: new Date() }
        });
        if (staleResult.count > 0) {
          log('Yayın süresi dolan haber arşive taşındı: ' + staleResult.count + ' (6 saatten eski)');
        }
      } catch (e) { log('Stale arşiv hatası: ' + e.message); }

      // ====== POST-CYCLE CLEANUP ======
      // Pipeline bittikten sonra tüm published'ları tara,
      // aynı/benzer başlığa sahip eskileri SİL (duplicate'e atma, direkt sil)
      // Bu sayede "aynı haber farklı saatlerde" durumu olmaz
      try {
        var allPublished = await globalThis.prisma.publishedArticle.findMany({
          where: { status: 'published' },
          select: { id: true, aiTitle: true, aiSummary: true, category: true, latestPublishedAt: true },
          orderBy: { latestPublishedAt: 'desc' }  // en yeni ilk
        });

        var seenTitles = [];  // [{ title, summary, id }]
        var toDelete = [];

        for (var pi = 0; pi < allPublished.length; pi++) {
          var pub = allPublished[pi];
          var isDuplicate = false;

          for (var si = 0; si < seenTitles.length; si++) {
            var sim = titleSimilar(pub.aiTitle, seenTitles[si].aiTitle || '');
            var simC = contentSimilar(pub.aiSummary || '', seenTitles[si].aiSummary || '');
            // DÜŞÜK EŞİK: titleSimilar >= 0.3 (önceki 0.5 idi)
            // User: "clear işlemi aynı konudaki tekrar haberleri temizliyor mu?"
            // Önceki: 0.5 (çok yüksek, "Halk TV'ye kayyum atanması..." vs "Halk TV binasında polis araması..." yakalanmıyordu)
            // Yeni: 0.3 (aynı konudan farklı açılardaki haberler yakalanır)
            // VEYA: title >= 0.2 + content >= 0.4 (içerik benzerse)
            if (sim >= 0.3 || (sim >= 0.2 && simC >= 0.4)) {
              isDuplicate = true;
              break;
            }
          }

          if (isDuplicate) {
            toDelete.push(pub.id);
            log('  [Cleanup] Tekrar silindi: "' + pub.aiTitle.slice(0, 40) + '"');
          } else {
            seenTitles.push(pub);
          }
        }

        if (toDelete.length > 0) {
          var delResult = await globalThis.prisma.publishedArticle.deleteMany({
            where: { id: { in: toDelete } }
          });
          log('Post-cycle cleanup: ' + delResult.count + ' tekrar haber silindi (ana sayfada tekrar kalmadi)');
        }
      } catch (e) { log('Post-cleanup hatasi: ' + e.message); }

      // Eski duplicate'leri sil (3 günden eski) — DB şişmesin
      try {
        var dupCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        var oldDups = await globalThis.prisma.publishedArticle.deleteMany({
          where: { status: 'duplicate', archivedAt: { lt: dupCutoff } }
        });
        if (oldDups.count > 0) {
          log('Eski duplicate silindi: ' + oldDups.count + ' kayit (3 günden eski)');
        }
      } catch (e) { log('Eski duplicate silme hatasi: ' + e.message); }

      // Eski archived haberleri sil (15 günden eski) — DB şişmesin
      try {
        var archCutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        var oldArchived = await globalThis.prisma.publishedArticle.deleteMany({
          where: { status: 'archived', archivedAt: { lt: archCutoff } }
        });
        if (oldArchived.count > 0) {
          log('Eski archived silindi: ' + oldArchived.count + ' kayit (15 günden eski)');
        }
      } catch (e) { log('Eski archived silme hatasi: ' + e.message); }

      // Arşiv: kategori bazlı 15'den fazla varsa eskiyi arşive taşı
      for (var ci = 0; ci < Object.keys(CATEGORY_MIN_SOURCES).length; ci++) {
        var categoryName = Object.keys(CATEGORY_MIN_SOURCES)[ci];
        var catArticles = await globalThis.prisma.publishedArticle.findMany({
          where: { status: 'published', category: categoryName },
          orderBy: { latestPublishedAt: 'desc' },
          select: { id: true }
        });
        if (catArticles.length > CATEGORY_MAX) {
          var toArchive = catArticles.slice(CATEGORY_MAX);
          for (var ai = 0; ai < toArchive.length; ai++) {
            await globalThis.prisma.publishedArticle.update({
              where: { id: toArchive[ai].id },
              data: { status: 'archived', archivedAt: new Date() }
            });
          }
          log('Arşive taşındı: ' + categoryName + ' ' + toArchive.length + ' haber');
        }
      }

      // Ana sayfa: toplam 50'den fazla published varsa eskiyi arşive taşı
      var totalPublished = await globalThis.prisma.publishedArticle.count({ where: { status: 'published' } });
      if (totalPublished > HOME_MAX_TOTAL) {
        var allPublished = await globalThis.prisma.publishedArticle.findMany({
          where: { status: 'published' },
          orderBy: { latestPublishedAt: 'desc' },
          select: { id: true }
        });
        var toArchiveTotal = allPublished.slice(HOME_MAX_TOTAL);
        for (var ti = 0; ti < toArchiveTotal.length; ti++) {
          await globalThis.prisma.publishedArticle.update({
            where: { id: toArchiveTotal[ti].id },
            data: { status: 'archived', archivedAt: new Date() }
          });
        }
        log('Ana sayfa arşive taşındı: ' + toArchiveTotal.length + ' haber');
      }

      ws({ summariesDone: aiOk, publishedCount: added, archivedCount: archived });
      log('Publish özet: added=' + added + ', archived=' + archived + ', aiOk=' + aiOk + ', skipped=' + skipped);
    } catch (e) {
      log('Publish hatasi: ' + e.message);
    }
  }

  // Hatalı RSS kaynaklarını deaktif et (10 hata = pasif)
  try {
    var failedSources = await globalThis.prisma.source.findMany({
      where: { active: true },
      select: { id: true, name: true, url: true }
    });
    // Bu adımı trigger-refresh.js içinde hata sayımı yapacak şekilde güncelleyeceğiz
    // Şimdilik sadece log
    log('Aktif kaynak: ' + failedSources.length);
  } catch (e) {}

  phaseTimes.ozetFinishedAt = new Date().toISOString();
  ws({ ozetFinishedAt: phaseTimes.ozetFinishedAt }); // stage: done YAZILMIYOR (finalize'de yazılacak)
  // History: cycle başarıyla bitti (Akış Kontrol sekmesi için)
  // Status dosyasından tüm stats'ı okuyup history'e yaz
  var statsForHistory = { rssRead: null, duplicatesFound: null, summariesDone: null, publishedCount: null };
  try {
    var statusData = JSON.parse(fs.readFileSync(SF, 'utf8'));
    statsForHistory = {
      rssRead: statusData.rssRead || 0,
      duplicatesFound: statusData.duplicatesFound || 0,
      summariesDone: statusData.summariesDone || 0,
      publishedCount: statusData.publishedCount || 0
    };
  } catch (e) {}
  wh(Object.assign({
    event: 'done',
    startedAt: startedAtIso,
    finishedAt: phaseTimes.ozetFinishedAt,
    durationMs: Date.now() - startedAtMs,
    rssStartedAt: phaseTimes.rssStartedAt,
    rssFinishedAt: phaseTimes.rssFinishedAt,
    ozetStartedAt: phaseTimes.ozetStartedAt,
    ozetFinishedAt: phaseTimes.ozetFinishedAt,
    cleanupStartedAt: phaseTimes.cleanupStartedAt,
    cleanupFinishedAt: phaseTimes.cleanupFinishedAt,
    duzenleStartedAt: phaseTimes.duzenleStartedAt,
    duzenleFinishedAt: phaseTimes.duzenleFinishedAt
  }, statsForHistory));
  log('  ⏱ RSS:    ' + (phaseTimes.rssStartedAt || '—') + ' → ' + (phaseTimes.rssFinishedAt || '—'));
  log('  ⏱ AI ÖZET: ' + (phaseTimes.ozetStartedAt || '—') + ' → ' + (phaseTimes.ozetFinishedAt || '—'));
  log('=== Cycle tamam ===');

  // === SIRALI ADIMLAR: Cleanup → AI Düzenle ===
  // User: "clear ai si rss ai işlemi bittikten sonra beklemeden çalışsın.
  //        clear ai işlemi bittikten sonra da hemen tüm yeni haberler için
  //        aidüzenle çalışsın. bu sıralamayı bozma."

  // 1. CLEANUP — duplicate temizleme (eski 5,25,45 cron yerine artık pipeline sonrası)
  // DEBUG: statsForHistory değerlerini logla — Clear/AI Düzenle neden atlandı anlamak için
  log('  [DEBUG] statsForHistory: rssRead=' + statsForHistory.rssRead +
      ', duplicatesFound=' + statsForHistory.duplicatesFound +
      ', summariesDone=' + statsForHistory.summariesDone +
      ', publishedCount=' + statsForHistory.publishedCount);
  log('  [DEBUG] Clear koşulu: publishedCount > 0 || summariesDone > 0 = ' +
      ((statsForHistory.publishedCount > 0 || statsForHistory.summariesDone > 0) ? 'TRUE (çalışmalı)' : 'FALSE (atlandı)'));
  log('  [DEBUG] AI Düzenle koşulu: publishedCount > 0 && prisma var = ' +
      ((statsForHistory.publishedCount > 0 && globalThis.prisma) ? 'TRUE (çalışmalı)' : 'FALSE (atlandı)'));
  log('  [DEBUG] globalThis.prisma: ' + (globalThis.prisma ? 'VAR' : 'YOK'));
  if (statsForHistory.publishedCount > 0 || statsForHistory.summariesDone > 0) {
    phaseTimes.cleanupStartedAt = new Date().toISOString();
    ws({ cleanupStartedAt: phaseTimes.cleanupStartedAt });
    log('>>> SIRALI ADIM 1: Cleanup (duplicate temizleme) — başladı ' + phaseTimes.cleanupStartedAt + ' >>>');
    try {
      await runScript(path.join(__dirname, 'cleanup-duplicates.js'), 'Cleanup');
      if (global.gc) { global.gc(); log('GC (cleanup sonrası)'); }
    } catch (e) { log('Cleanup hatası: ' + e.message); }
    phaseTimes.cleanupFinishedAt = new Date().toISOString();
    ws({ cleanupFinishedAt: phaseTimes.cleanupFinishedAt });
    log('  ⏱ Cleanup: ' + phaseTimes.cleanupStartedAt + ' → ' + phaseTimes.cleanupFinishedAt);
  }

  // 2. AI DÜZENLE — tüm yeni (isEdited=false) makaleler için
  // AI özet'ten FARKLI: plagiarizm/wordcount/ad filter YOK
  // Sadece mevcut metni akıcı, doğal yap — min 100 max 300 kelime (user: düzenleme ai alt limit 100)
  if (statsForHistory.publishedCount > 0 && globalThis.prisma) {
    // CRITICAL: deadKeys'i SIFIRLA — AI Özet tüm key'leri tüketmiş olabilir (rate limit)
    // User: "ai düzenlemeler neden 0 saniye? tüm sağlayıcılar denendi ama hepsi başarısız"
    // Sebep: AI Özet 6 dk boyunca API çağrıları yapar, sonunda tüm key'ler 429 (rate limit) olur.
    // AI Düzenle başlayınca tüm key'ler deadKeys'te olduğu için anında 0/15 başarısız olur.
    // Çözüm: deadKeys'i temizle + 60 sn bekle (rate limit penceresi resetlensin)
    log('  [AI Düzenle] deadKeys sıfırlanıyor (önceki: ' + deadKeys.size + ' ölü key)');
    deadKeys = new Set();
    log('  [AI Düzenle] 60 sn bekleniyor — rate limit penceresi resetlensin...');
    await new Promise(function(r) { setTimeout(r, 60000); });
    log('  [AI Düzenle] Bekleme bitti, başlıyor');

    phaseTimes.duzenleStartedAt = new Date().toISOString();
    ws({ duzenleStartedAt: phaseTimes.duzenleStartedAt });
    log('>>> SIRALI ADIM 2: AI Düzenle (yeni makaleler) — başladı ' + phaseTimes.duzenleStartedAt + ' >>>');
    try {
      var newArticles = await globalThis.prisma.publishedArticle.findMany({
        where: { status: 'published', isEdited: false },
        orderBy: { publishedAt: 'desc' },
        take: 25, // max 25 makale (cycle 20dk'ya sığması için — user: 16 Ekim 2026)
        select: { id: true, aiTitle: true, aiSummary: true }
      });
      log('  Yeni (isEdited=false) makale sayısı: ' + newArticles.length);

      var aiEditOk = 0;
      for (var ei = 0; ei < newArticles.length; ei++) {
        var ea = newArticles[ei];
        log('  [AI Düzenle ' + (ei+1) + '/' + newArticles.length + '] ' + ea.aiTitle.slice(0, 40));

        // AI Düzenle çağrısı — /api/admin/ai-edit endpoint'ini çağıramayız (pipeline = ayrı process)
        // Bu yüzden AI çağrısını direkt burada yapıyoruz (callEvren → callGemini)
        var editPrompt = 'Aşağıdaki haber metnini Türkçe olarak yeniden yaz. Kurallar:\n' +
          '- Zorlama, yapay veya resmi ifadeleri doğal, günlük ve yaygın popüler ifadelerle değiştir\n' +
          '- Metni akıcı ve okunabilir bir haber diline çevir\n' +
          '- Anlamı koru, yeni bilgi ekleme\n' +
          '- Başlığı kısa ve etkileyici yap\n' +
          '- ÖZET MİNIMUM 40, MAKSİMUM 300 KELİME OLMALI\n' +
          '- Kopyalama kontrolü, reklam filtresi YOK — sadece metni düzelt\n\n' +
          'GÜNCEL BİLGİLER VE TARİH DOĞRULUĞU (ÇOK ÖNEMLİ — bugün: ' + new Date().toLocaleDateString('tr-TR') + '):\n' +
          '- Donald Trump: ABD\'nin 47. ve ŞU ANKİ Başkanı (20 Ocak 2025\'ten beri görevde). "Eski başkan" DEĞİL.\n' +
          '- Biden: ABD\'nin 46. Başkanı (ESKİ, 2021-2025 arasında görevde idi).\n' +
          '- Recep Tayyip Erdoğan: Türkiye Cumhurbaşkanı (şu an görevde).\n' +
          '- Kişilerin güncel görevlerini DOĞRU ver. Görevde olanı "eski" deme, ayrılanı "eski" de.\n' +
          '- Eğer kaynak metinde Trump için "eski başkan" yazıyorsa DÜZELT — "ABD Başkanı Trump" yaz.\n\n' +
          'BAŞLIK: ' + (ea.aiTitle || '') + '\n\n' +
          'ÖZET: ' + (ea.aiSummary || '') + '\n\n' +
          'ÇIKTI FORMATI (kesinlikle bu formatta):\n' +
          'BAŞLIK: [yeniden yazılmış başlık]\n' +
          '---\n' +
          'ÖZET: [yeniden yazılmış özet — 100-300 kelime]';

        try {
          var editedText = null;
          // AI Düzenle: önce EVREN, başarısız olursa Gemini'ye fallback
          // User: "evren başarısız olursa gemini kullanılsın"
          var providers = getAiProviders();
          for (var pi2 = 0; pi2 < providers.length && !editedText; pi2++) {
            var prov = providers[pi2];
            if (deadKeys.has(prov.key)) continue;
            try {
              if (prov.type === 'evren') {
                editedText = await callEvren(editPrompt, 2000);
              } else {
                editedText = await callGemini(prov.key, editPrompt, 2000);
              }
            } catch (e2) {
              log('    [' + prov.label + '] hata: ' + e2.message.slice(0, 60));
              // SADECE HTTP 4xx hatalarında deadKeys'e ekle (kalıcı — key ölü)
              // "content boş" geçici hata — deadKeys'e EKLEME, sonraki makalede tekrar dene
              // User: "Gemini#1 her makalede deneniyor" — 400 de deadKeys'e ekle (AI Düzenle)
              if (e2.statusCode === 400 || e2.statusCode === 401 || e2.statusCode === 403 || e2.statusCode === 429) {
                deadKeys.add(prov.key);
              }
              // "content boş" hatası → deadKeys'e EKLEME
            }
          }

          if (editedText) {
            // Parse: "BAŞLIK: xxx --- ÖZET: xxx"
            var editedTitle = ea.aiTitle;
            var editedSummary = ea.aiSummary;
            var m1 = editedText.match(/BAŞLIK:\s*(.+?)(?:\s*---|\s*\n---|\nÖZET:)\s*([\s\S]+)/);
            if (m1) {
              editedTitle = m1[1].trim();
              editedSummary = m1[2].replace(/^ÖZET:\s*/i, '').trim();
            } else {
              var tm = editedText.match(/BAŞLIK:\s*(.+)/);
              var sm = editedText.match(/ÖZET:\s*([\s\S]+)/);
              if (tm) editedTitle = tm[1].trim();
              if (sm) editedSummary = sm[1].trim();
            }

            // DB'ye kaydet — isEdited=true YAP (tekrar işlenmesin)
            // User: "tekrar gelen haberler için tekrar işlem yapmayalım"
            // Önceki tasarım: isEdited=false KALMALI idi (kullanıcı /veri'de görecek, Yayınla'ya basacak)
            // Sorun: aynı makaleler her cycle'da tekrar tekrar AI Düzenle'den geçiyordu (API kotası boşa)
            // Çözüm: AI Düzenle yapınca isEdited=true yap — bir daha işlenmez
            // Kullanıcı hâlâ /veri'de manuel düzenleyebilir (manuel düzenleyince de isEdited=true kalır)
            await globalThis.prisma.publishedArticle.update({
              where: { id: ea.id },
              data: {
                aiTitle: editedTitle,
                aiSummary: editedSummary,
                isEdited: true,         // ARTIK TRUE — tekrar işlenmesin
                editedAt: new Date()    // AI Düzenle zamanı (audit için)
              }
            });
            aiEditOk++;
            log('    ✓ AI Düzenle tamam — ' + editedTitle.slice(0, 40));
          } else {
            log('    ✗ AI Düzenle başarısız (tüm sağlayıcılar denendi)');
          }
        } catch (e3) {
          log('    ✗ AI Düzenle hatası: ' + e3.message.slice(0, 60));
        }
      }
      log('  AI Düzenle özet: ' + aiEditOk + '/' + newArticles.length + ' makale düzenlendi');
      ws({ aiEditDone: aiEditOk, aiEditTotal: newArticles.length });
    } catch (e) {
      log('AI Düzenle toplu hata: ' + e.message);
    }
    phaseTimes.duzenleFinishedAt = new Date().toISOString();
    ws({ duzenleFinishedAt: phaseTimes.duzenleFinishedAt });
    log('  ⏱ Cleanup:    ' + (phaseTimes.cleanupStartedAt || '—') + ' → ' + (phaseTimes.cleanupFinishedAt || '—'));
    log('  ⏱ AI Düzenle: ' + (phaseTimes.duzenleStartedAt || '—') + ' → ' + (phaseTimes.duzenleFinishedAt || '—'));

    // History'ye faz zamanlarını GÜNCELLE — done event'ine fazları ekle
    wh({
      event: 'phases-update',
      startedAt: startedAtIso,
      rssStartedAt: phaseTimes.rssStartedAt,
      rssFinishedAt: phaseTimes.rssFinishedAt,
      ozetStartedAt: phaseTimes.ozetStartedAt,
      ozetFinishedAt: phaseTimes.ozetFinishedAt,
      cleanupStartedAt: phaseTimes.cleanupStartedAt,
      cleanupFinishedAt: phaseTimes.cleanupFinishedAt,
      duzenleStartedAt: phaseTimes.duzenleStartedAt,
      duzenleFinishedAt: phaseTimes.duzenleFinishedAt
    });
  } else {
    log('  ⏱ Cleanup:    atlandı (yeni haber yok)');
    log('  ⏱ AI Düzenle: atlandı (yeni haber yok)');
  }

  log('=== Tüm adımlar tamam (pipeline + cleanup + AI düzenle) ===');
  // Status: pipeline GERÇEKTEN bitti (cleanup + AI Düzenle dahil)
  ws({ stage: 'done', finishedAt: new Date().toISOString() });
  // History: cycle başarıyla bitti (Akış Kontrol sekmesi için)
  try { wh({ event: 'done', startedAt: startedAtIso, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs }); } catch (e4) {}

  // KRİTİK: Prisma connection'ı kapat — açık connection process'in exit olmasını engelliyor
  // User: "13:00 cycle 39 dkda bitti logu var ama process 53 dk'dır yaşıyor (zombie)"
  // Sebep: prisma client açık kaldı, process.exit() çağrılsa bile process ölmedi
  // Çözüm: prisma.$disconnect() çağır, sonra exit
  if (globalThis.prisma) {
    try { await globalThis.prisma.$disconnect(); log('Prisma disconnect OK'); } catch (e) { log('Prisma disconnect error: ' + e.message); }
  }
  // exitListeners'ı çalıştır (process.exit override'ı)
  process.exit = origExit;
  // Tüm timer'ları temizle (interval varsa)
  try {
    // Prisma client'ın interval'ları olabilir — process.exit force ediyor
    process.exit(0);
  } catch (e) {
    origExit(0);
  }
}

main().catch(async function(e) {
  log('FATAL: ' + (e && e.message || e));
  // History: cycle hata ile bitti
  try {
    wh({ event: 'error', startedAt: startedAtIso, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs, error: (e && e.message || String(e)).slice(0, 500) });
  } catch (e2) {}
  ws({ stage: 'error', error: (e && e.message || String(e)), finishedAt: new Date().toISOString() });
  // Hata durumunda da prisma disconnect yap
  if (globalThis.prisma) {
    try { await globalThis.prisma.$disconnect(); log('Prisma disconnect OK (error path)'); } catch (e3) {}
  }
  process.exit = origExit;
  origExit(1);
});
