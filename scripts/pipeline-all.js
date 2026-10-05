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

  function buildPrompt(minW, prevText, plagiarismChunks) {
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
      '   Kaynakta "5 Ekim 2026" yazıyorsa sen "Ekim ayının beşinci günü / 2026 yılının ekim ayında" yaz.\n' +
      '7. Alıntı yapılmış sözleri ("..." içindeki ifadeler) AYNEN KORUMAK ZORUNLU DEĞİL — kendi cümlenle aktar.\n' +
      '8. Kişi adları ve kurum adları korunabilir ANCAK cümle içinde farklı konumlandır.\n' +
      '9. Eğer kaynak metinle çok benzer çıkarsa, kendini düzelt — farklı bir cümle kur.\n' +
      '10. 4+ kelimelik ardışık dizilim kaynak metinde varsa, bu bir kopyalama sayılır — DEĞİŞTİR.\n';

    // Eğer önceki denemeden plagiarizm tespit edildiyse, AI'a geri bildirim ver
    if (prevText && plagiarismChunks && plagiarismChunks.length > 0) {
      prompt += '\nÖNCEKİ DENEMENDE KOPYALAMA TESPİT EDİLDİ. Şu ifadeler kaynak metinle birebir aynı:\n';
      plagiarismChunks.slice(0, 5).forEach(function(chunk, i) {
        prompt += '  ' + (i+1) + '. "' + chunk + '"\n';
      });
      prompt += 'Bu ifadelerin hiçbirini yeniden yazdığın metinde aynen kullanma. ' +
        'Tamamen farklı cümle yapısı ve eş anlamlı kelimelerle yeniden yaz.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans için, kopyalama):\n' + prevText.slice(0, 1500) + '\n';
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
      '5. Anlam kayması: "ekonomik büyüme" yerine "ekonomik küçülme" gibi zıt anlamlı kelime yazma.\n\n' +
      'UZUNLUK:\n' +
      'EN AZ ' + minW + ' kelime olmalı — daha kısa yazma. ' +
      'ÜST SINIR YOK — gerekirse 300, 500, 1000 veya daha fazla kelime yaz. ' +
      'Cümleni yarıda kesme, haber doğal bir sonuca ulaşmalı. ' +
      'ASLA 200 kelimeye ulaşınca kesme — haberin tamamını yaz, bitirmediysen devam et.\n\n' +
      'ÇIKTI FORMATI:\n' +
      'Türkçe yaz. Sadece yeniden yazılmış metni yaz, başka hiçbir şey ekleme ' +
      '(başlık, etiket, markdown, açıklama yok).\n\n' +
      'BAŞLIK (referans): ' + title + '\n\nKAYNAK HABER METİNLERİ:\n' + combinedContent;
    return prompt;
  }

  // Plagiarizm kontrolü — AI cevabında 4+ kelimelik ardışık dizilim kaynak metinde var mı?
  function findPlagiarism(aiText, sourceText) {
    var normalize = function(t) {
      return String(t || '')
        .toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[İI]/g, 'i')
        .replace(/Ş/g, 's').replace(/Ç/g, 'c').replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ö/g, 'o')
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    var ai = normalize(aiText);
    var src = normalize(sourceText);
    if (!ai || !src) return [];

    var aiWords = ai.split(' ');
    var found = [];
    var seen = new Set();
    // 4 kelimelik ardışık dizilimleri kaynak metinde ara
    for (var i = 0; i + 4 <= aiWords.length; i++) {
      var chunk = aiWords.slice(i, i + 4).join(' ');
      // 15+ karakter ve sadece jenerik olmayan (en az 1 meaningful kelime içersin)
      if (chunk.length > 15 && src.indexOf(chunk) >= 0 && !seen.has(chunk)) {
        seen.add(chunk);
        found.push(chunk);
      }
    }
    return found;
  }

  var bestText = null;
  var bestWordCount = 0;
  var prevAttemptText = null;
  var prevPlagiarism = null;

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
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(minWords, prevAttemptText, prevPlagiarism) }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } })
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

          // Plagiarizm kontrolü — kaynak metinle 4+ kelimelik ardışık dizilim ara
          var plagiarism = findPlagiarism(text, combinedContent);

          if (plagiarism.length > 0) {
            log('  AI özet: ' + wc + ' kelime — ' + plagiarism.length + ' kopyalama tespit edildi (örn: "' + plagiarism[0].slice(0, 50) + '")');
            // bestText olarak kabul et ama retry için geri bildirim ver
            if (wc > bestWordCount) { bestText = text; bestWordCount = wc; }
            prevAttemptText = text;
            prevPlagiarism = plagiarism;
            // Yeniden deneme yapılacak (return etme)
            continue;
          }

          log('  AI özet: ' + wc + ' kelime (min: ' + minWords + ') — kopyalama YOK');
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

// Kategori bazlı min kaynak sayısı
var CATEGORY_MIN_SOURCES = {
  'Siyaset': 3,
  'Ekonomi / Finans': 3,
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
        var summaryText = aiText || (firstArticle.description ? firstArticle.description.slice(0, 500) : firstArticle.title || '');
        if (aiText) aiOk++;

        // En iyi görsel
        var bestImage = null;
        for (var k = 0; k < groupArticlesList.length; k++) {
          if (groupArticlesList[k].imageUrl) { bestImage = groupArticlesList[k].imageUrl; break; }
        }

        try {
          var publishTime = new Date(Date.now() - i * 60000);
          // Tüm yeni haberler direkt PUBLISHED — pending_review KALDIRILDI
          var createdArticle = await globalThis.prisma.publishedArticle.create({
            data: {
              aiTitle: decodeHtmlEntities(firstArticle.title),
              aiSummary: summaryText.slice(0, 2000),
              category: cat,
              imageUrl: bestImage,
              sourceArticleIds: JSON.stringify(groupArticlesList.map(function(a) { return a.id; })),
              sourceCount: sourceCount,
              earliestPublishedAt: groupArticlesList[groupArticlesList.length - 1].publishedAt || publishTime,
              latestPublishedAt: publishTime,
              wordCount: summaryText.split(/\s+/).length,
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
        var staleCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 saat
        var staleResult = await globalThis.prisma.publishedArticle.updateMany({
          where: {
            status: 'published',
            latestPublishedAt: { lt: staleCutoff }
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
