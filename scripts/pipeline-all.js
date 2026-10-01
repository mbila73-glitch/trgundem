// Tek process pipeline — exec/spawn yok, process limit dolmaz
// Prisma + fetch + GC kontrolü

var path = require('path');
var fs = require('fs');

// fetch'i native http ile değiştir (Wasm/undici sorunu yok)
globalThis.fetch = function(url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var lib = url.indexOf('https') === 0 ? require('https') : require('http');
    var urlObj = new URL(url);
    var reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    var req = lib.request(reqOptions, function(resp) {
      var chunks = [];
      resp.on('data', function(c) { chunks.push(c); });
      resp.on('end', function() {
        var buf = Buffer.concat(chunks);
        var text = buf.toString('utf8');
        resolve({
          status: resp.statusCode,
          ok: resp.statusCode >= 200 && resp.statusCode < 300,
          statusText: resp.statusMessage || '',
          headers: resp.headers,
          json: function() { return Promise.resolve(JSON.parse(text)); },
          text: function() { return Promise.resolve(text); },
          arrayBuffer: function() { return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); }
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

// TEK Prisma client aç — global'e yaz
// $disconnect'i engelle ki trigger-refresh.js finally'de çağırsın, connection kapanmasın
try {
  var PrismaClient = require('@prisma/client').PrismaClient;
  var _prisma = new PrismaClient({ log: ['error', 'warn'] });
  _prisma.$disconnect = function() { return Promise.resolve(); };
  globalThis.prisma = _prisma;
} catch (e) {
  console.error('Prisma acilamadi: ' + e.message);
}

var ROOT = path.resolve(__dirname, '..');
var SF = path.join(ROOT, 'pipeline-status.json');
var LF = path.join(ROOT, 'pipeline-once.log');

try { fs.writeFileSync(LF, '', 'utf8'); } catch (e) {}

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

// Bellek temizleme — require.cache + GC
function cleanupMemory() {
  // trigger-refresh ve bağımlılıklarını cache'ten sil
  Object.keys(require.cache).forEach(function(k) {
    if (k.indexOf('trigger-refresh') !== -1 ||
        k.indexOf('rss-parser') !== -1 ||
        k.indexOf('xml2js') !== -1) {
      delete require.cache[k];
    }
  });
  // GC çağır (eğer --expose-gc ile çalıştırıldıysa)
  if (global.gc) {
    global.gc();
    global.gc();
    log('GC cagrildi');
  } else {
    log('GC yok (--expose-gc gerekir)');
  }
}

var exitListeners = [];
var origExit = process.exit;
process.exit = function (code) {
  log('process.exit(' + code + ') engellendi — devam ediliyor');
  exitListeners.forEach(function (fn) { try { fn(code); } catch (e) {} });
  exitListeners = [];
};

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

  // RSS
  ws({ stage: 'refresh' });
  await runScript(path.join(__dirname, 'trigger-refresh.js'), 'RSS');

  var rssCount = 0;
  try {
    var lf = fs.readFileSync(LF, 'utf8');
    var m = lf.match(/İşlenen kaynak:\s*(\d+)/i);
    if (m) rssCount = parseInt(m[1]);
  } catch (e) {}
  ws({ rssRead: rssCount });

  // BELLEK TEMİZLE — RSS'ten sonra
  log('--- bellek temizleme ---');
  cleanupMemory();

  // icerik atlandı
  ws({ stage: 'build-icerik', skipped: true });
  log('icerik adimi atlandi');

  ws({ duplicatesFound: 0 });

  // Basit publish — 10 makale
  ws({ stage: 'build-ozet', skipped: true });
  log('AI-ozet atlandi — basit publish yapiliyor');

  if (globalThis.prisma) {
    try {
      var del = await globalThis.prisma.publishedArticle.deleteMany({});
      log('Eski published silindi: ' + del.count);

      var recent = await globalThis.prisma.article.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 10,
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
              aiSummary: a.description ? a.description.slice(0, 500) : (a.title || ''),
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
