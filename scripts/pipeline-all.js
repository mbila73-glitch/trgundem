// Tek process pipeline — exec/spawn yok, process limit dolmaz
// Prisma client'i BIZ ACIYORUZ — global'e yaziyoruz, tüm script'ler bunu kullanir
// Böylece tek native engine = az bellek

var path = require('path');
var fs = require('fs');

// __dirname = pipeline-all.js'in bulunduğu dizin
// Üst dizin = proje kök — SF ve LF oraya yazılır
var ROOT = path.resolve(__dirname, '..');
var SF = path.join(ROOT, 'pipeline-status.json');
var LF = path.join(ROOT, 'pipeline-once.log');

// Log dosyasini her calismada sifirla
try { fs.writeFileSync(LF, '', 'utf8'); } catch (e) {}

// TEK Prisma client aç — global'e yaz ki tüm script'ler bunu kullansın
// (trigger-refresh, build-rss-icerik, build-rss-ozet kendi client'larını açmasın)
try {
  var PrismaClient = require('@prisma/client').PrismaClient;
  globalThis.prisma = new PrismaClient({ log: ['error', 'warn'] });
} catch (e) {
  console.error('Prisma acilamadi: ' + e.message);
}

function log(m) {
  var ts = new Date().toISOString();
  var mem = process.memoryUsage();
  var mb = 'rss=' + Math.round(mem.rss / 1024 / 1024) + 'MB heap=' + Math.round(mem.heapUsed / 1024 / 1024) + 'MB/' + Math.round(mem.heapTotal / 1024 / 1024) + 'MB ext=' + Math.round(mem.external / 1024 / 1024) + 'MB';
  var line = '[' + ts + '] [' + mb + '] ' + m;
  console.log(line);
  try { fs.appendFileSync(LF, line + '\n'); } catch (e) {}
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
var exitListeners = [];
var origExit = process.exit;
process.exit = function (code) {
  log('process.exit(' + code + ') engellendi — devam ediliyor');
  exitListeners.forEach(function (fn) { try { fn(code); } catch (e) {} });
  exitListeners = [];
};

// Her script'i calistir, bitmesini bekle
function runScript(scriptPath, name) {
  log('> ' + name + ' basliyor (path: ' + scriptPath + ')');
  return new Promise(function (resolve) {
    var done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      log('✓ ' + name + ' bitti (' + reason + ')');
      resolve();
    }
    exitListeners.push(finish);
    try {
      var full = path.resolve(scriptPath);
      delete require.cache[full];
      log('  require oncesi');
      var result = require(scriptPath);
      log('  require sonrasi');
      if (result && typeof result.then === 'function') {
        result.then(function () { finish('promise'); }).catch(function (e) {
          log('✗ ' + name + ' hata: ' + (e && e.message || e));
          finish('promise-error');
        });
      } else {
        setTimeout(function () { finish('timeout'); }, 30000);
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

  // Step 1: RSS cek — trigger-refresh.js kendi Prisma'sini aciyor
  ws({ stage: 'refresh' });
  await runScript(path.join(__dirname, 'trigger-refresh.js'), 'RSS');

  var rssCount = 0;
  try {
    var lf = fs.readFileSync(LF, 'utf8');
    var m = lf.match(/İşlenen kaynak:\s*(\d+)/i);
    if (m) rssCount = parseInt(m[1]);
  } catch (e) {}
  ws({ rssRead: rssCount });

  // Step 2: icerik dosyasi — ZATEN ÖNCEKI CALIŞTIRMADAN VAR, atla
  // (515 makale findMany yapınca bellek şişiriyor)
  ws({ stage: 'build-icerik', skipped: true });
  log('icerik adimi atlandi (rss_icerik.md zaten var)');

  ws({ duplicatesFound: 0 });

  // Step 4: AI-ozet adimi atlandi (bellek limiti aşıyor)
  // Bunun yerine: son 30 makaleyi basit published yap
  ws({ stage: 'build-ozet', skipped: true });
  log('AI-ozet adimi atlandi — basit publish yapiliyor');

  if (globalThis.prisma) {
    try {
      var del = await globalThis.prisma.publishedArticle.deleteMany({});
      log('Eski published silindi: ' + del.count);

      var recent = await globalThis.prisma.article.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 30,
        include: { source: { select: { name: true } } }
      });
      log('Son makaleler cekildi: ' + recent.length);

      var added = 0;
      for (var i = 0; i < recent.length; i++) {
        var a = recent[i];
        try {
          await globalThis.prisma.publishedArticle.create({
            data: {
              articleId: a.id,
              aiTitle: a.title,
              summary: a.description ? a.description.slice(0, 300) : '',
              aiCategory: a.category || 'Güncel',
              status: 'published',
              publishedAt: new Date()
            }
          });
          added++;
        } catch (e) {}
      }
      log('Published eklendi: ' + added);
      ws({ summariesDone: added });
    } catch (e) {
      log('Publish hatasi: ' + e.message);
    }
  }

  var sumCount = 0;
  try {
    var lf2 = fs.readFileSync(LF, 'utf8');
    var m2 = lf2.match(/(\d+)\s*yeni\s*AI\s*özet/i);
    if (m2) sumCount = parseInt(m2[1]);
  } catch (e) {}
  ws({ summariesDone: sumCount });

  ws({ stage: 'done', finishedAt: new Date().toISOString() });
  log('=== Cycle tamam ===');

  process.exit = origExit;
  origExit(0);
}

main().catch(function (e) {
  log('FATAL: ' + (e && e.message || e));
  process.exit = origExit;
  origExit(1);
});
