// Tarih bug fix — eski makalelerin özetlerindeki "yılının ekim ayının sekizinci günü"
// formatını "8 Ekim 2026" formatına çevirir.
//
// Kullanım: node scripts/fix-date-bugs.js
//   --dry-run  → sadece raporlar, DB'ye yazmaz
//   --force    → tüm makaleleri tara (varsayılan: sadece bug'lı olanlar)
//
// Bu script ONE-TIME fix için yazıldı. Pipeline'a eklenen regex post-processing
// (scripts/pipeline-all.js'te) yeni makalelerde bu bug'ı önler.

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

var { PrismaClient } = require('@prisma/client');
var prisma = new PrismaClient();

var DRY_RUN = process.argv.includes('--dry-run');

// Türkçe sıralama sayı kelimesi → rakam
var TURKISH_ORDINALS = {
  'birinci': 1, 'ilk': 1,
  'ikinci': 2,
  'üçüncü': 3, 'ucuncu': 3,
  'dördüncü': 4, 'dorduncu': 4,
  'beşinci': 5, 'besinci': 5,
  'altıncı': 6, 'altinci': 6,
  'yedinci': 7,
  'sekizinci': 8,
  'dokuzuncu': 9,
  'onuncu': 10,
  'on birinci': 11, 'onbirinci': 11,
  'on ikinci': 12, 'onikinci': 12,
  'on üçüncü': 13, 'on ucuncu': 13, 'onucuncu': 13,
  'on dördüncü': 14, 'on dorduncu': 14, 'ondorduncu': 14,
  'on beşinci': 15, 'on besinci': 15, 'onbesinci': 15,
  'on altıncı': 16, 'on altinci': 16, 'onaltinci': 16,
  'on yedinci': 17, 'onyedinci': 17,
  'on sekizinci': 18, 'onsekkizinci': 18,
  'on dokuzuncu': 19, 'ondokuzuncu': 19,
  'yirminci': 20,
  'yirmi birinci': 21, 'yirmibirinci': 21,
  'yirmi ikinci': 22, 'yirmiikinci': 22,
  'yirmi üçüncü': 23, 'yirmi ucuncu': 23, 'yirmiucuncu': 23,
  'yirmi dördüncü': 24, 'yirmi dorduncu': 24, 'yirmidorduncu': 24,
  'yirmi beşinci': 25, 'yirmi besinci': 25, 'yirmibesinci': 25,
  'yirmi altıncı': 26, 'yirmi altinci': 26, 'yirmialtinci': 26,
  'yirmi yedinci': 27, 'yirmiyedinci': 27,
  'yirmi sekizinci': 28, 'yirmisekkizinci': 28,
  'yirmi dokuzuncu': 29, 'yirmidokuzuncu': 29,
  'otuzuncu': 30,
  'otuz birinci': 31, 'otuzbirinci': 31,
};

var TURKISH_MONTHS = {
  'ocak': 'Ocak', 'şubat': 'Şubat', 'subat': 'Şubat',
  'mart': 'Mart', 'nisan': 'Nisan', 'mayıs': 'Mayıs', 'mayis': 'Mayıs',
  'haziran': 'Haziran', 'temmuz': 'Temmuz',
  'ağustos': 'Ağustos', 'agustos': 'Ağustos',
  'eylül': 'Eylül', 'eylul': 'Eylül',
  'ekim': 'Ekim', 'kasım': 'Kasım', 'kasim': 'Kasım',
  'aralık': 'Aralık', 'aralik': 'Aralık',
};

// Türkçe sayı kelimesini rakama çevir (en uzun eşleşmeyi dener)
function turkishWordToNumber(word) {
  if (!word) return null;
  var w = word.toLowerCase().trim();
  var keys = Object.keys(TURKISH_ORDINALS).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (w === keys[i]) return TURKISH_ORDINALS[keys[i]];
  }
  for (var i = 0; i < keys.length; i++) {
    if (w.includes(keys[i])) return TURKISH_ORDINALS[keys[i]];
  }
  return null;
}

// Suffix map: "gününde" → " tarihinde" etc.
var SUFFIX_MAP = {
  'nde': ' tarihinde',
  'nün': ' tarihinin',
  'nden': ' tarihinden',
  'n': '',
  '': ''
};

var MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Helper: build replacement string
function buildReplacement(year, monthWord, ordinalWord, suffix) {
  var month = TURKISH_MONTHS[monthWord.toLowerCase()];
  if (!month) return null;
  var day = turkishWordToNumber(ordinalWord);
  if (day === null) return null;
  var dateStr = (year ? day + ' ' + month + ' ' + year : day + ' ' + month);
  return dateStr + (SUFFIX_MAP[suffix || ''] !== undefined ? SUFFIX_MAP[suffix || ''] : '');
}

// "yılının ekim ayının sekizinci günü" → "8 Ekim" (yıl yoksa)
// "2026 yılının ekim ayının sekizinci gününde" → "8 Ekim 2026 tarihinde"
function fixDateInText(text) {
  if (!text) return text;
  var fixes = 0;

  // Pattern 1: "[year ] yılının [month] ayının [ordinal] günü[suffix]"
  var p1 = /(?:((?:19|20)\d{2})\s+)?yılının\s+(\w+)\s+ayının\s+([\w\s]+?)\s+günü(nde|nün|nden|n)?/gi;
  text = text.replace(p1, function(match, year, monthWord, ordinalWord, suffix) {
    var repl = buildReplacement(year, monthWord, ordinalWord, suffix || '');
    if (repl === null) return match;
    fixes++;
    return repl;
  });

  // Pattern 2: "yılın [monthOrdinal] ayının [dayOrdinal] günü[suffix]"
  var p2 = /yılın\s+(\w+)\s+ayının\s+([\w\s]+?)\s+günü(nde|nün|nden|n)?/gi;
  text = text.replace(p2, function(match, monthOrdinal, dayOrdinal, suffix) {
    var monthNum = turkishWordToNumber(monthOrdinal);
    if (monthNum === null || monthNum < 1 || monthNum > 12) return match;
    var monthName = MONTH_NAMES[monthNum - 1];
    var day = turkishWordToNumber(dayOrdinal);
    if (day === null) return match;
    fixes++;
    return day + ' ' + monthName + (SUFFIX_MAP[suffix || ''] !== undefined ? SUFFIX_MAP[suffix || ''] : '');
  });

  // Pattern 3: Standalone "[month] ayının [ordinal] günü[suffix]" (yıl yok)
  var monthKeys = Object.keys(TURKISH_MONTHS);
  var p3Pattern = '(' + monthKeys.join('|') + ')\\s+ayının\\s+([\\w\\s]+?)\\s+günü(nde|nün|nden|n)?';
  var p3 = new RegExp(p3Pattern, 'gi');
  text = text.replace(p3, function(match, monthWord, ordinalWord, suffix) {
    var repl = buildReplacement(null, monthWord, ordinalWord, suffix || '');
    if (repl === null) return match;
    fixes++;
    return repl;
  });

  // Pattern 4: "2026 yılının ekim ayının sekizinci perşembe günü" — weekday eklendi
  var p4 = /((?:19|20)\d{2})\s+yılının\s+(\w+)\s+ayının\s+([\w\s]+?)\s+\w+\s+günü(nde|nün|nden|n)?/gi;
  text = text.replace(p4, function(match, year, monthWord, ordinalWord, suffix) {
    var repl = buildReplacement(year, monthWord, ordinalWord, suffix || '');
    if (repl === null) return match;
    fixes++;
    return repl;
  });

  return { text: text, fixes: fixes };
}

async function main() {
  console.log('=== Tarih Bug Fix ===');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN (DB\'ye yazılmayacak)' : 'LIVE (DB güncellenecek)');
  console.log('');

  var articles = await prisma.publishedArticle.findMany({
    where: { status: 'published' },
    select: { id: true, aiTitle: true, aiSummary: true, publishedAt: true }
  });
  console.log('Toplam published makale: ' + articles.length);

  var buggyArticles = [];
  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    var result = fixDateInText(a.aiSummary || '');
    if (result.fixes > 0) {
      buggyArticles.push(Object.assign({}, a, { fixedSummary: result.text, fixCount: result.fixes }));
    }
  }

  console.log('Bug\'lı makale sayısı: ' + buggyArticles.length);
  console.log('');

  if (buggyArticles.length === 0) {
    console.log('✓ Düzeltilecek makale yok.');
    return;
  }

  console.log('=== DÜZELTME LİSTESİ ===');
  for (var i = 0; i < buggyArticles.length; i++) {
    var a = buggyArticles[i];
    console.log((i + 1) + '. ' + a.aiTitle.slice(0, 60));
    console.log('   ID: ' + a.id);
    console.log('   Fix sayısı: ' + a.fixCount);
    console.log('   Önceki özet (ilk 250 karakter):');
    console.log('   ' + (a.aiSummary || '').slice(0, 250));
    console.log('   Yeni özet (ilk 250 karakter):');
    console.log('   ' + a.fixedSummary.slice(0, 250));
    console.log('');
  }

  if (DRY_RUN) {
    console.log('=== DRY-RUN — DB güncellenmedi ===');
    console.log('Live modda çalıştırmak için: node scripts/fix-date-bugs.js');
    return;
  }

  console.log('=== DB GÜNCELLENİYOR ===');
  var updated = 0;
  for (var i = 0; i < buggyArticles.length; i++) {
    var a = buggyArticles[i];
    try {
      await prisma.publishedArticle.update({
        where: { id: a.id },
        data: { aiSummary: a.fixedSummary }
      });
      updated++;
      console.log('✓ ' + (i + 1) + '/' + buggyArticles.length + ' güncellendi: ' + a.aiTitle.slice(0, 50));
    } catch (e) {
      console.log('✗ ' + a.id + ' hata: ' + e.message);
    }
  }
  console.log('');
  console.log('✓ Toplam ' + updated + ' makale güncellendi');

  console.log('');
  console.log('=== DOĞRULAMA ===');
  var recheck = await prisma.publishedArticle.findMany({
    where: { status: 'published' },
    select: { id: true, aiTitle: true, aiSummary: true }
  });
  var remainingBugs = 0;
  for (var i = 0; i < recheck.length; i++) {
    var result = fixDateInText(recheck[i].aiSummary || '');
    if (result.fixes > 0) remainingBugs++;
  }
  console.log('Kalan bug\'lı makale: ' + remainingBugs);
  if (remainingBugs === 0) {
    console.log('✓ Tarih bug\'ı tamamen temizlendi!');
  } else {
    console.log('⚠ Hâlâ ' + remainingBugs + ' makalede bug var — manuel düzeltme gerekebilir.');
  }
}

main()
  .catch(function(e) { console.error('Fatal:', e); process.exit(1); })
  .finally(function() { prisma.$disconnect(); });
