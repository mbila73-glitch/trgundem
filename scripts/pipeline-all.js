// TRGUNDEM Pipeline — Gruplama + Kategori Bazlı Min Kaynak + AI Özet + Arşiv
var path = require('path');
var fs = require('fs');

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

// 5 Gemini API Key — sırayla dener
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
var GEMINI_MODEL = 'gemini-flash-lite-latest';
var keyIndex = 0;
var deadKeys = new Set(); // bu cycle'da ölü key'ler (403/429) — atlanır

var ROOT = path.resolve(__dirname, '..');
var SF = path.join(ROOT, 'pipeline-status.json');
var LF = path.join(ROOT, 'pipeline-once.log');
try { fs.writeFileSync(LF, '', 'utf8'); } catch (e) {}

function log(m) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] ' + m;
  console.log(line);
  try { fs.appendFileSync(LF, line + '\n'); } catch (e) {}
}

function ws(s) {
  try {
    var c = null;
    try { c = JSON.parse(fs.readFileSync(SF, 'utf8')); } catch (e) {}
    fs.writeFileSync(SF, JSON.stringify(Object.assign({}, c, s), null, 2), 'utf8');
  } catch (e) {}
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
  'Siyaset': 150,
  'Ekonomi / Finans': 150,
  'Kamu / Resmi': 150,
  'Bilim / Teknoloji': 150,
  'Kültür / Sanat': 150,
  'Spor / Magazin': 150
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
      plagiarismChunks.slice(0, 5).forEach(function(chunk, i) {
        prompt += '  ' + (i+1) + '. "' + chunk + '"\n';
      });
      prompt += 'Bu ifadelerin hiçbirini yeniden yazdığın metinde aynen kullanma. ' +
        'Tamamen farklı cümle yapısı ve eş anlamlı kelimelerle yeniden yaz.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans için, kopyalama):\n' + prevText.slice(0, 1500) + '\n';
    }

    // Eğer önceki denemede yetersiz kelime ise
    if (prevText && prevWordCount && prevWordCount < minW) {
      prompt += '\nÖNCEKİ DENEMEN ' + prevWordCount + ' KELİME İDİ — YETERSİZ.\n';
      prompt += 'EN AZ ' + minW + ' kelime yazman ZORUNLU. Önceki denemeyi referans al ama ' +
        'DAHA UZUN ve detaylı yaz. Haberin tüm detaylarını, bağlamını, arka planını, sonuçlarını ekle.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans):\n' + prevText.slice(0, 1500) + '\n';
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

    prompt += '\nUZUNLUK:\n' +
      'EN AZ ' + minW + ' kelime olmalı — daha kısa yazma. ' +
      'EN ÇOK 300 kelime olmalı — daha uzun yazma. 300 kelime yeterli, haberi tamamla. ' +
      'Cümleni yarıda kesme, haber doğal bir sonuca ulaşmalı. ' +
      'ASLA 300 kelimeyi geçme — kısa ve öz tut.\n';

    prompt += '\nÇIKTI FORMATI:\n' +
      'Türkçe yaz. Sadece yeniden yazılmış metni yaz, başka hiçbir şey ekleme ' +
      '(başlık, etiket, markdown, açıklama yok).\n\n' +
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
        // KRİTİK: Önce İ → i replace YAPILIR, sonra toLowerCase çağrılır.
        // JavaScript toLowerCase() Türkçe İ (U+0130) → "i̇" (i + U+0307 combining dot) üretir
        // Bu da ardışık dizilim eşleşmelerini bozar (chunk.length > 20 kontrolü yanlış çalışır)
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

    var aiWords = ai.split(' ');
    var found = [];
    var seen = new Set();

    // 6 kelimelik ardışık dizilimleri kaynak metinde ara (eski 4'ten 6'ya çıkarıldı — daha gevşek)
    for (var i = 0; i + 6 <= aiWords.length; i++) {
      var chunk = aiWords.slice(i, i + 6).join(' ');
      // 20+ karakter ve sadece jenerik olmayan (en az 1 meaningful kelime içersin)
      if (chunk.length > 20 && src.indexOf(chunk) >= 0 && !seen.has(chunk)) {
        seen.add(chunk);
        found.push(chunk);
      }
    }

    // Cümle bazında %50+ örtüşme kontrolü — bir AI cümlesinin %50+ kısmı kaynak cümlede geçiyorsa kopyalama sayılır
    var aiSentences = splitSentences(aiText);
    var srcSentences = splitSentences(sourceText);
    var sentenceOverlap = 0;
    aiSentences.forEach(function(aSent) {
      var aNorm = normalize(aSent);
      if (!aNorm) return;
      srcSentences.forEach(function(sSent) {
        var sNorm = normalize(sSent);
        if (!sNorm) return;
        // Kaynak cümlenin %50+ kısmı AI cümlesinde geçiyor mu?
        if (aNorm.length >= 20 && sNorm.length >= 20) {
          var longer = aNorm.length >= sNorm.length ? aNorm : sNorm;
          var shorter = aNorm.length >= sNorm.length ? sNorm : aNorm;
          if (longer.indexOf(shorter) >= 0) {
            sentenceOverlap++;
            if (!seen.has(aNorm)) {
              seen.add(aNorm);
              found.push(aNorm.slice(0, 80));
            }
          }
        }
      });
    });

    // 2/3 cümle örtüşmesi kontrolü — AI'daki cümlelerin 2/3+ kısmı kaynakla örtüşüyorsa TOPLU kopyalama var
    if (aiSentences.length >= 3 && sentenceOverlap >= Math.ceil(aiSentences.length * 2 / 3)) {
      if (!seen.has('__overlap_2_3__')) {
        seen.add('__overlap_2_3__');
        found.push('2/3 cümle örtüşmesi: ' + sentenceOverlap + '/' + aiSentences.length + ' cümle kaynakla birebir örtüşüyor');
      }
    }

    return found;
  }

  var bestText = null;
  var bestWordCount = 0;
  var prevAttemptText = null;
  var prevPlagiarism = null;
  var prevWordCount = 0;
  var prevAds = null;

  for (var attempt = 1; attempt <= GEMINI_KEYS.length; attempt++) {
    var currentKey = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
    keyIndex++;

    if (deadKeys.has(currentKey)) { continue; }

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + currentKey;
    var maxTokens = 4000;
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(minWords, prevAttemptText, prevPlagiarism, prevWordCount, prevAds) }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } })
      });
      var result = await resp.json();
      if (result.error && result.error.code === 403) {
        deadKeys.add(currentKey);
        log('  AI 403 — key ölü (bu cycle atlanacak)');
        continue;
      }
      if (result.error && result.error.code === 429) {
        deadKeys.add(currentKey);
        log('  AI 429 kota dolu — key ölü (bu cycle atlanacak)');
        continue;
      }
      if (result.error && result.error.code === 503) {
        log('  AI 503 — 5 sn bekle');
        await new Promise(function(r) { setTimeout(r, 5000); });
        attempt--; keyIndex--;
        continue;
      }
      if (result.error) {
        log('  AI error ' + result.error.code + ': ' + (result.error.message || '').slice(0, 80));
        deadKeys.add(currentKey);
        continue;
      }
      deadKeys.delete(currentKey);
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        var text = result.candidates[0].content.parts[0].text;
        if (text) {
          text = text.trim();
          var wc = countWords(text);

          // Plagiarizm kontrolü — kaynak metinle 6+ kelimelik ardışık dizilim VEYA cümle bazında %50+ / 2/3 örtüşme ara
          var plagiarism = findPlagiarism(text, combinedContent);

          if (plagiarism.length > 0) {
            log('  AI özet: ' + wc + ' kelime — ' + plagiarism.length + ' kopyalama tespit edildi (örn: "' + plagiarism[0].slice(0, 50) + '")');
            // bestText olarak kabul et ama retry için geri bildirim ver
            if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
            prevAttemptText = text;
            prevPlagiarism = plagiarism;
            prevWordCount = wc;
            prevAds = null;  // reklam temizle, sadece plagiarizm retry
            // Yeniden deneme yapılacak (return etme)
            continue;
          }

          // Reklam tespiti — AI cevabında reklam/CTA ifadeleri var mı?
          var ads = findAds(text);
          if (ads.length > 0) {
            log('  AI özet: ' + wc + ' kelime — ' + ads.length + ' reklam tespit edildi (örn: "' + ads[0] + '")');
            if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
            prevAttemptText = text;
            prevPlagiarism = null;  // plagiarizm temizle, sadece reklam retry
            prevWordCount = wc;
            prevAds = ads;
            continue;
          }

          // Yetersiz kelime kontrolü — min'den azsa retry yap (AI'a "daha uzun yaz" geri bildirimi)
          if (wc < minWords) {
            log('  AI özet: ' + wc + ' kelime (min: ' + minWords + ') — YETERSİZ, tekrar denenecek');
            if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
            prevAttemptText = text;
            prevPlagiarism = null;  // plagiarizm temizle, sadece kelime retry
            prevWordCount = wc;
            continue;
          }

          log('  AI özet: ' + wc + ' kelime (min: ' + minWords + ') — kopyalama YOK, kelime YETERLİ');
          if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
          if (wc >= minWords) return text;
          continue;
        }
      }
      continue;
    } catch (e) {
      log('  AI hata: ' + e.message);
      deadKeys.add(currentKey);
      continue;
    }
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
  // En az 2 anlamlı ortak kelime şart (jenerik başlıklar birleşmesin)
  if (common < 2) return 0;
  // Eşik yüksek — sadece anlamlı örtüşme varsa kabul
  if (ratio < 0.5) return 0;
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
    var group = { articles: [articles[i]], sourceIds: new Set([articles[i].sourceId]) };
    used.add(i);
    for (var j = i + 1; j < articles.length; j++) {
      if (used.has(j)) continue;
      // Kategori BAĞIMSIZ — aynı haber farklı kategori etiketiyle gelirse yine eşleşir
      var titleSim = titleSimilar(articles[i].title, articles[j].title);
      var contentSim = contentSimilar(articles[i].content || articles[i].description || '', articles[j].content || articles[j].description || '');
      // Eşik: title >= 0.5 (yüksek) VEYA (title >= 0.3 + content >= 0.5)
      // Bu, alakasız haberlerin aynı grupta olmasını kesin önler
      if (titleSim >= 0.5 || (titleSim >= 0.3 && contentSim >= 0.5)) {
        group.articles.push(articles[j]);
        group.sourceIds.add(articles[j].sourceId);
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
var CATEGORY_PUBLISH_LIMITS = {
  'Siyaset': 15,
  'Ekonomi / Finans': 10,
  'Kamu / Resmi': 5,
  'Bilim / Teknoloji': 5,
  'Kültür / Sanat': 5,
  'Spor / Magazin': 5
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

function runScript(scriptPath, name) {
  log('> ' + name);
  return new Promise(function(resolve) {
    var done = false;
    function finish(r) { if (done) return; done = true; log('✓ ' + name + ' (' + r + ')'); resolve(); }
    exitListeners.push(finish);
    try {
      delete require.cache[require.resolve(scriptPath)];
      var result = require(scriptPath);
      if (result && typeof result.then === 'function') {
        result.then(function() { finish('ok'); }).catch(function(e) { log('✗ ' + name + ': ' + e.message); finish('err'); });
      } else { setTimeout(function() { finish('timeout'); }, 60000); }
    } catch (e) { log('✗ ' + name + ': ' + e.message); finish('exc'); }
  });
}

async function main() {
  log('=== Cycle basladi ===');
  log('GEMINI keys: ' + GEMINI_KEYS.length + ' adet');
  ws({ stage: 'started', startedAt: new Date().toISOString(), finishedAt: null });

  // RSS
  ws({ stage: 'rss' });
  await runScript(path.join(__dirname, 'trigger-refresh.js'), 'RSS');
  if (global.gc) { global.gc(); log('GC'); }

  // Gruplama + AI özet
  ws({ stage: 'publish' });
  log('Gruplama + AI özet (Siyaset/Ekonomi 3+ kaynak, diğerleri 2+)');

  if (globalThis.prisma) {
    try {
      // Son 24 saat makaleler (tüm makaleler — take sınırı yok)
      var since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      var articles = await globalThis.prisma.article.findMany({
        where: { publishedAt: { gte: since } },
        orderBy: { publishedAt: 'desc' },
        select: { id: true, title: true, content: true, description: true, sourceId: true, category: true, imageUrl: true, publishedAt: true }
      });
      log('Son 24 saat makale: ' + articles.length);

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
        take: 500
      });
      // Birleşik liste (yayında + arşiv + duplicate) — kategori farkı gözetmeksizin aynı başlık ara
      var existing = existingPublished.concat(existingArchived);
      log('Mevcut haber (yayında ' + existingPublished.length + ' + arşiv/dup ' + existingArchived.length + ')');

      var added = 0, skipped = 0, aiOk = 0, archived = 0, pendingCount = 0;
      for (var i = 0; i < topGroups.length; i++) {
        var group = topGroups[i];
        var groupArticlesList = group.articles;
        var firstArticle = groupArticlesList[0];
        // GRUBUN KATEGORISI = en cok unique source'a sahip kategori (çoğunluk)
        // Bu, "Spor kategorisinde haber yoksa Spor satırı boş kalsın" mantığını sağlar
        // Önceki: firstArticle.category (rastgele) → yanlış kategori
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
          if (catSourcesByCat[c].size > bestCount) {
            bestCount = catSourcesByCat[c].size;
            bestCat = c;
          }
        });
        var cat = bestCat;
        var sourceCount = group.sourceIds.size;

        // REKLAM/TANITIM FILTRESI — başlıkta reklam/tanıtım ifadeleri varsa haberi ATLA
        var titleLowerCheck = firstArticle.title.toLowerCase();
        // Jenerik reklam ifadeleri (başlıkta varsa direkt atla)
        var adKeywords = [
          // Fiyat
          'fiyat listesi', 'fiyat listeleri', 'fiyatları açıklandı', 'fiyatı açıklandı',
          'özellikleri ve fiyatı', 'güncel fiyat', 'güncel fiyatlar', 'sıfır fiyat',
          'güncel sıfır', 'sıfır otomobil fiyat', 'sıfır araba fiyat',
          'otomobil fiyatları', 'güncel otomobil', 'oto fiyat listesi',
          // Tanıtım / lansman
          'tanıtıldı: işte', 'resmen tanıtıldı', 'işte özellikleri', 'işte fiyatı',
          'tanıtımı yapıldı', 'tanıtım videosu', 'lansmanı yapıldı', 'lansman videosu',
          'dünya prömiyeri', 'dünya lansmanı', 'tanıtım etkinliği', 'tanıtım günü',
          'tanıtım fragmanı',
          // Satış
          'satışa sunuldu', 'çıkış tarihi belli', 'satışa çıktı', 'ön satış', 'ön sipariş',
          'satışa çıkıyor', 'satışa sunulacak', 'satışa çıkan', 'satışta',
          // Telefon/araba inceleme
          'telefon incelemesi', 'akıllı telefon inceleme', 'telefonun özellikleri',
          'akıllı saat tanıtıldı', 'yeni akıllı saat', 'akıllı saat incelemesi',
          'otomobil tanıtımı', 'otomobil incelemesi', 'araba incelemesi',
          'test sürüşü', 'test sürüşü ile', 'sürüş izlenimleri',
          // Yeni model
          'yeni modeli tanıtıldı', 'yeni model tanıtımı', 'model tanıtımı',
          'modeli tanıtıldı', 'yüz yenileme yapıldı', 'yüz yenileme tanıtıldı'
        ];

        // Telefon markaları (başlıkta varsa + tanıtım eylemi de varsa atla)
        var phoneBrands = ['iphone', 'samsung galaxy', 'xiaomi', 'oppo', 'huawei', 'realme',
          'oneplus', 'honor', 'vivo', 'tecno', 'apple watch', 'redmi', 'poco',
          'galaxy note', 'galaxy s2', 'galaxy a', 'galaxy m', 'galaxy z'];
        // Araba markaları (başlıkta varsa + tanıtım eylemi de varsa atla)
        var carBrands = ['bmw', 'mercedes', 'audi', 'toyota', 'honda', 'volvo', 'renault',
          'fiat', 'ford', 'volkswagen', 'peugeot', 'skoda', 'hyundai', 'kia', 'mazda',
          'nissan', 'citroen', 'opel', 'tesla', 'porsche', 'lexus', 'seat',
          'alfa romeo', 'dacia', 'togg'];
        // Reklam eylem kelimeleri — marka ile birlikte aranacak
        var adActionWords = ['tanıtıldı', 'tanıtıldı:', 'tanıtımı', 'satıldı', 'satışa çıktı',
          'satışa sunuldu', 'yeni model', 'lansmanı', 'lansmanı yapıldı',
          'incelemesi', 'inceleme', 'satışta', 'satışa sunulacak', 'tanıtım videosu'];

        var isAd = false;
        for (var ai2 = 0; ai2 < adKeywords.length; ai2++) {
          if (titleLowerCheck.indexOf(adKeywords[ai2]) >= 0) { isAd = true; break; }
        }

        // Telefon markası + reklam eylemi birlikte var mı?
        if (!isAd) {
          for (var pi = 0; pi < phoneBrands.length; pi++) {
            if (titleLowerCheck.indexOf(phoneBrands[pi]) >= 0) {
              for (var pj = 0; pj < adActionWords.length; pj++) {
                if (titleLowerCheck.indexOf(adActionWords[pj]) >= 0) {
                  isAd = true; break;
                }
              }
              if (isAd) break;
            }
          }
        }

        // Araba markası + reklam eylemi birlikte var mı?
        if (!isAd) {
          for (var ci = 0; ci < carBrands.length; ci++) {
            if (titleLowerCheck.indexOf(carBrands[ci]) >= 0) {
              for (var cj = 0; cj < adActionWords.length; cj++) {
                if (titleLowerCheck.indexOf(adActionWords[cj]) >= 0) {
                  isAd = true; break;
                }
              }
              if (isAd) break;
            }
          }
        }

        // "telefon" / "otomobil" / "araba" + reklam eylemi kombinasyonu (markasız)
        if (!isAd) {
          var genericDeviceWords = ['telefon', 'akıllı telefon', 'akıllı saat', 'otomobil', 'araba', 'araç', 'suv'];
          for (var gi = 0; gi < genericDeviceWords.length; gi++) {
            if (titleLowerCheck.indexOf(genericDeviceWords[gi]) >= 0) {
              for (var gj = 0; gj < adActionWords.length; gj++) {
                if (titleLowerCheck.indexOf(adActionWords[gj]) >= 0) {
                  isAd = true; break;
                }
              }
              if (isAd) break;
            }
          }
        }

        if (isAd) {
          log('  [Reklam/Tanıtım] Haber ATLANDI: ' + firstArticle.title.slice(0, 60));
          continue;
        }

        // TEKRAR KONTROLÜ — kategori BAĞIMSIZ, eşik DÜŞÜK (0.3)
        // Yeni mantık (çok sıkı tekrar yakalama):
        // - titleSimilar >= 0.85 (birebir) + published ise: SKIP (create etme, AI çağırma)
        //   existing'i güncelle (latestPublishedAt, sourceCount)
        // - titleSimilar >= 0.85 + archived/duplicate ise: yeni published create
        // - titleSimilar 0.3-0.85: eski duplicate, yeni published (AI yeni)
        // - titleSimilar 0.15-0.3 + contentSimilar >= 0.3: eski duplicate
        // - < 0.15: published (yeni haber)
        // Tüm yeni haberler direkt PUBLISHED — pending_review YOK
        var oldArticleToDuplicate = null;
        var alreadyArchived = false;
        var skipCreate = false;  // birebir aynı başlık + published → create etme

        // Önce benzer başlık ara — kategori fark etmez
        for (var j = 0; j < existing.length; j++) {
          var simTitle = titleSimilar(firstArticle.title, existing[j].aiTitle || '');
          var simContent = contentSimilar(
            firstArticle.content || firstArticle.description || '',
            existing[j].aiSummary || ''
          );
          // Eşik: title >= 0.5 VEYA (title >= 0.3 VE content >= 0.5)
          // Yüksek eşik — alakasız haberler aynı sayılmasın
          var matched = simTitle >= 0.5 || (simTitle >= 0.3 && simContent >= 0.5);
          if (!matched) continue;

          if (simTitle >= 0.85 && existing[j].status === 'published') {
            // Birebir aynı başlık + published → SKIP (create etme, AI çağırma)
            // existing'i güncelle (latestPublishedAt, sourceCount)
            skipCreate = true;
            try {
              await globalThis.prisma.publishedArticle.update({
                where: { id: existing[j].id },
                data: {
                  latestPublishedAt: new Date(),
                  sourceCount: Math.max(existing[j].sourceCount || 0, sourceCount)
                }
              });
              log('  [Birebir ayni, skip + update] (' + cat + '): ' + firstArticle.title.slice(0, 50));
            } catch (e) {}
            break;
          }

          if (existing[j].status === 'published') {
            oldArticleToDuplicate = existing[j];
            log('  [Tekrar bulundu, eski -> duplicate] (' + cat + '/' + (existing[j].category || '?') + '): ' + firstArticle.title.slice(0, 50) + ' (benzerlik: ' + Math.round(simTitle * 100) + '%)');
            break;
          } else if (existing[j].status === 'archived' || existing[j].status === 'duplicate') {
            alreadyArchived = true;
            break;
          }
        }

        if (skipCreate) {
          skipped++;
          continue;  // AI çağırma, create etme, sonraki gruba geç
        }

        if (alreadyArchived) {
          log('  [Arsivde/Duplicatete var, taze yayinla] (' + cat + '): ' + firstArticle.title.slice(0, 50));
        }
        if (oldArticleToDuplicate) {
          try {
            await globalThis.prisma.publishedArticle.update({
              where: { id: oldArticleToDuplicate.id },
              data: { status: 'duplicate', archivedAt: new Date() }
            });
            archived++;
            log('  [Eski -> duplicate] (' + cat + '): ' + (oldArticleToDuplicate.aiTitle || '').slice(0, 50));
          } catch (e) {}
        }

        log('  [' + (i+1) + '/' + topGroups.length + '] ' + sourceCount + ' kaynak, ' + groupArticlesList.length + ' makale (' + cat + '): ' + firstArticle.title.slice(0, 50));

        // İçerikleri topla — Siyaset/Ekonomi: en yeni 5 kaynak, diğerleri: en yeni 2
        var maxSources = (cat === 'Siyaset' || cat === 'Ekonomi / Finans') ? 5 : 2;
        var contents = groupArticlesList.slice(0, maxSources).map(function(a) { return a.content || a.description || ''; });

        // AI özet
        var aiText = await aiSummarize(firstArticle.title, contents, cat);
        // AI null ise haberi atla — fallback description KULLANMA (kısa özet oluşur)
        if (!aiText || aiText.trim().length < 100) {
          log('  AI cevap vermedi veya çok kısa, haber ATLANDI: ' + firstArticle.title.slice(0, 50));
          continue;
        }
        var summaryText = aiText;
        aiOk++;

        // En iyi görsel
        var bestImage = null;
        for (var k = 0; k < groupArticlesList.length; k++) {
          if (groupArticlesList[k].imageUrl) { bestImage = groupArticlesList[k].imageUrl; break; }
        }

        // "Son dakika" haberi tespiti — kaynak başlıkta "son dakika" geçiyorsa
        // AI özetinden "son dakika" kaldır, başına "Konu ile ilgili son bilgiler şu şekildedir:" ekle
        // Ayrıca kaynak başlıktan da "SON DAKİKA |" ön ekini ve takip eden tüm noktalama işaretlerini temizle
        // KRİTİK: JavaScript toLowerCase() Türkçe İ (U+0130) karakterini "i̇" (i + U+0307 combining dot) yapar
        // Bu yüzden önce İ → i replace yap, sonra toLowerCase çağır — yoksa indexOf('son dakika') eşleşmez
        var titleLower = firstArticle.title.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
        if (titleLower.indexOf('son dakika') >= 0 || titleLower.indexOf('sondakika') >= 0) {
          // AI özetinden "son dakika" ifadelerini kaldır (önce İ→i replace, sonra gi regex — gi flag de İ hatası var)
          summaryText = summaryText.replace(/İ/g, 'i').replace(/son\s*dakika\.{0,3}/gi, '').replace(/sondakika\.{0,3}/gi, '').trim();
          // Başına "Konu ile ilgili son bilgiler şu şekildedir:" ekle
          var sonBilgilerPrefix = 'Konu ile ilgili son bilgiler şu şekildedir: ';
          if (summaryText.toLowerCase().indexOf(sonBilgilerPrefix.toLowerCase()) !== 0) {
            summaryText = sonBilgilerPrefix + summaryText;
          }
          // BAŞLIK temizliği — "SON DAKİKA |", "SON DAKİKA:", "SON DAKİKA -", "SON DAKİKA•", "SON DAKİKA HABERİ:" vb.
          // Başlığın başındaki "SON DAKİKA" önekini + takip eden "HABERİ" kelimesi + tüm noktalama/bağlaç işaretlerini kaldır
          // İşaretler: . ! ? … | : • - – — , ; ve boşluklar
          // Türkçe İ → i replace ÖNCE yapılır (gi flag Türkçe İ'yi yakalamıyor)
          var cleanedTitle = firstArticle.title
            .replace(/İ/g, 'i')
            .replace(/^\s*son\s*dakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi, '')
            .replace(/^\s*sondakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi, '')
            .replace(/\bson\s*dakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi, '')
            .replace(/\bsondakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          if (cleanedTitle && cleanedTitle !== firstArticle.title) {
            log('  [Son dakika haberi] Başlık temizlendi: "' + firstArticle.title + '" -> "' + cleanedTitle + '"');
            firstArticle.title = cleanedTitle;
          }
          log('  [Son dakika haberi] Özet başına "Konu ile ilgili son bilgiler" eklendi');
        }

        try {
          var publishTime = new Date(Date.now() - i * 60000);
          // Tüm yeni haberler direkt PUBLISHED — pending_review KALDIRILDI
          var createdArticle = await globalThis.prisma.publishedArticle.create({
            data: {
              aiTitle: decodeHtmlEntities(firstArticle.title),
              aiSummary: summaryText.slice(0, 5000),
              category: cat,
              imageUrl: bestImage,
              sourceArticleIds: JSON.stringify(groupArticlesList.map(function(a) { return a.id; })),
              sourceCount: sourceCount,
              earliestPublishedAt: groupArticlesList[groupArticlesList.length - 1].publishedAt || publishTime,
              latestPublishedAt: publishTime,
              wordCount: summaryText.split(/\s+/).length,
              initialHearts: Math.floor(Math.random() * (413 - 223 + 1)) + 223, // random 223-413
              clickHearts: 0,
              status: 'published',
              publishedAt: publishTime
            }
          });
          added++;
          // CRITICAL: yeni create edileni existing listesine ekle
          // ki cycle içinde aynı başlıkla başka grup gelirse onu görelim
          existing.push({
            id: createdArticle.id,
            aiTitle: decodeHtmlEntities(firstArticle.title),
            aiSummary: summaryText.slice(0, 2000),
            category: cat,
            status: 'published'
          });
        } catch (e) { log('  DB hata: ' + e.message); }
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
            // Eşik: title >= 0.5 veya (title >= 0.3 + content >= 0.5)
            // Yüksek eşik — alakasız haberler silinmesin
            if (sim >= 0.5 || (sim >= 0.3 && simC >= 0.5)) {
              // Bu pub daha eski (çünkü allPublished latestPublishedAt desc sıralı)
              // Yani pub'ı sil
              isDuplicate = true;
              break;
            }
          }

          if (isDuplicate) {
            toDelete.push(pub.id);
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

      ws({ summariesDone: aiOk });
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

  ws({ stage: 'done', finishedAt: new Date().toISOString() });
  log('=== Cycle tamam ===');
  process.exit = origExit;
  origExit(0);
}

main().catch(function(e) {
  log('FATAL: ' + (e && e.message || e));
  process.exit = origExit;
  origExit(1);
});
