// Tek process pipeline — exec/spawn yok, process limit dolmaz
// Prisma client'i BIZ ACMIYORUZ — script'ler kendi global'larini kullaniyor
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

function log(m) {
  var ts = new Date().toISOString();
  console.log('[' + ts + '] ' + m);
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
var exitListeners = [];
var origExit = process.exit;
process.exit = function (code) {
  log('process.exit(' + code + ') engellendi — devam ediliyor');
  exitListeners.forEach(function (fn) { try { fn(code); } catch (e) {} });
  exitListeners = [];
};

// Her script'i calistir, bitmesini bekle
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
    exitListeners.push(finish);
    try {
      var full = path.resolve(scriptPath);
      delete require.cache[full];
      var result = require(scriptPath);
      if (result && typeof result.then === 'function') {
        result.then(function () { finish('promise'); }).catch(function (e) {
          log('✗ ' + name + ' hata: ' + (e && e.message || e));
          finish('promise-error');
        });
      } else {
        // sync bitti — 30 sn bekle, exit cagrilirsa finish tetiklenir
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

  // Step 2: icerik insa et
  ws({ stage: 'build-icerik' });
  await runScript(path.join(__dirname, 'build-rss-icerik.js'), 'icerik');

  // Step 3: kaynak sayi
  ws({ stage: 'build-kaynak-sayi' });
  await runScript(path.join(__dirname, 'build-rss-icerik.js'), 'kaynak-sayi');

  ws({ duplicatesFound: 0 });

  // Step 4: AI ozet
  ws({ stage: 'build-ozet' });
  await runScript(path.join(__dirname, 'build-rss-ozet.js'), 'AI-ozet');

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
