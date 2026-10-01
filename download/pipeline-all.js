// Tek process pipeline — exec/spawn yok, process limit dolmaz
// Tüm script'leri require ile çağırır, process.exit'i geçici olarak engeller

var path = require('path');
var fs = require('fs');
var PrismaClient = require('@prisma/client').PrismaClient;

var db = null;
try { db = new PrismaClient(); } catch (e) { console.error('Prisma acilamadi: ' + e.message); }

var SF = path.join(process.cwd(), 'pipeline-status.json');
var LF = path.join(process.cwd(), 'pipeline-once.log');

function log(m) {
  var ts = new Date().toISOString();
  console.log('[' + ts + '] ' + m);
  // ayni anda log dosyasina da yaz
  try { fs.appendFileSync(LF, '[' + ts + '] ' + m + '\n'); } catch (e) {}
}

function ws(s) {
  try {
    var c = null;
    try { c = JSON.parse(fs.readFileSync(SF, 'utf8')); } catch (e) {}
    var m = Object.assign({}, c, s);
    fs.writeFileSync(SF, JSON.stringify(m, null, 2), 'utf8');
  } catch (e) {}
}

// process.exit'i gecici olarak engelle
// script'ler exit cagirirsa, biz yakalayip sonraki script'e gecelim
var exitListeners = [];
var origExit = process.exit;
process.exit = function (code) {
  log('process.exit(' + code + ') engellendi — devam ediliyor');
  // kayitli dinleyicileri uyandir
  exitListeners.forEach(function (fn) { try { fn(code); } catch (e) {} });
  exitListeners = [];
};

// Her script'i calistir, bitmesini bekle
// Script ya (a) export ile promise dondurur, ya (b) process.exit cagirir,
// ya da (c) sync biter. Uc durum icin de garantili bekleme:
function runScript(scriptPath, name) {
  log('> ' + name + ' basliyor');
  return new Promise(function (resolve) {
    var done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      log('✓ ' + name + ' bitti (' + reason + ')');
      resolve();
    }

    // exit cagirilirse bu script bitti sayalim
    exitListeners.push(finish);

    try {
      var full = path.resolve(scriptPath);
      delete require.cache[full];
      var result = require(scriptPath);
      // script promise donduruyorsa bekle
      if (result && typeof result.then === 'function') {
        result.then(function () { finish('promise'); }).catch(function (e) {
          log('✗ ' + name + ' hata: ' + (e && e.message || e));
          finish('promise-error');
        });
      } else {
        // sync bitti — ama async isler hala calisiyor olabilir
        // 5 sn bekle, eger bu surede exit cagirilursa finish zaten cagrildi
        setTimeout(function () { finish('timeout'); }, 5000);
      }
    } catch (e) {
      log('✗ ' + name + ' exception: ' + (e && e.message || e));
      finish('exception');
    }
  });
}

async function main() {
  log('=== Cycle basladi ===');
  ws({
    stage: 'archive-stale',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    rssRead: 0,
    duplicatesFound: 0,
    summariesDone: 0,
    publishedCount: null,
    error: null
  });

  // Step 1: draft'leri sil
  log('Step1: deleteMany drafts');
  if (db) {
    try {
      var r = await db.publishedArticle.deleteMany({ where: { status: 'draft' } });
      log('Drafts silindi: ' + r.count);
    } catch (e) {
      log('DelErr: ' + e.message);
    }
  } else {
    log('DB yok, adim atlandi');
  }

  // Step 2: RSS cek
  ws({ stage: 'refresh' });
  await runScript('scripts/trigger-refresh.js', 'RSS');

  var rssCount = 0;
  try {
    var lf = fs.readFileSync(LF, 'utf8');
    var m = lf.match(/İşlenen kaynak:\s*(\d+)/i);
    if (m) rssCount = parseInt(m[1]);
  } catch (e) {}
  ws({ rssRead: rssCount });

  // Step 3: icerik insa et
  ws({ stage: 'build-icerik' });
  await runScript('scripts/build-rss-icerik.js', 'icerik');

  // Step 4: kaynak sayi
  ws({ stage: 'build-kaynak-sayi' });
  await runScript('scripts/build-rss-icerik.js', 'kaynak-sayi');

  ws({ duplicatesFound: 0 });

  // Step 5: AI ozet
  ws({ stage: 'build-ozet' });
  await runScript('scripts/build-rss-ozet.js', 'AI-ozet');

  var sumCount = 0;
  try {
    var lf2 = fs.readFileSync(LF, 'utf8');
    var m2 = lf2.match(/(\d+)\s*yeni\s*AI\s*özet/i);
    if (m2) sumCount = parseInt(m2[1]);
  } catch (e) {}
  ws({ summariesDone: sumCount });

  // Step 6: sayim
  log('Step6: count');
  if (db) {
    try {
      var p = await db.publishedArticle.count({ where: { status: 'published' } });
      log('Published: ' + p);
      ws({ publishedCount: p });
    } catch (e) {
      log('CntErr: ' + e.message);
    }
  }

  ws({ stage: 'done', finishedAt: new Date().toISOString() });
  log('=== Cycle tamam ===');

  // Gercek exit'i geri yukle ve cik
  process.exit = origExit;
  if (db) {
    try { await db.$disconnect(); } catch (e) {}
  }
  origExit(0);
}

main().catch(function (e) {
  log('FATAL: ' + (e && e.message || e));
  process.exit = origExit;
  if (db) { try { db.$disconnect(); } catch (e2) {} }
  origExit(1);
});
