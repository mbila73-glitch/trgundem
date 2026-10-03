// Tek process pipeline — AI özet (Gemini) + 150+ kelime + duplicate kontrol
var path = require('path');
var fs = require('fs');

// .env dosyasını oku (Node.js otomatik okumaz)
var envPath = path.join(__dirname, '..', '.env');
try {
  var envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(function(line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    var idx = line.indexOf('=');
    if (idx > 0) {
      var key = line.substring(0, idx).trim();
      var val = line.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
} catch (e) {}

// GEMINI API KEY — .env'den oku
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
var GEMINI_MODEL = 'gemini-flash-lite-latest';

// fetch'i native http ile değiştir (Wasm yok)
globalThis.fetch = function(url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var lib = url.indexOf('https') === 0 ? require('https') : require('http');
    var urlObj = new URL(url);
    var req = lib.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, function(resp) {
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
    req.setTimeout(120000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

// Prisma client
try {
  var PrismaClient = require('@prisma/client').PrismaClient;
  var _prisma = new PrismaClient({ log: ['error'] });
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

// AI ÖZET FONKSİYONU — 150+ kelime, telifsiz, farklı cümlelerle
async function aiSummarize(title, content) {
  if (!content || content.length < 50) return null;

  var prompt = 'Aşağıdaki haberi en az 150 kelimelik, farklı cümlelerle, telif sorunu olmayacak şekilde özetle. Türkçe yaz. Sadece özeti yaz, başka metin ekleme.\n\nBAŞLIK: ' + title + '\n\nHABER:\n' + content.slice(0, 4000);

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_API_KEY;

  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
        })
      });
      var result = await resp.json();

      // 503: yoğunluk, tekrar dene
      if (result.error && result.error.code === 503) {
        log('  AI 503 (deneme ' + attempt + '/3)');
        if (attempt < 3) { await new Promise(function(r) { setTimeout(r, 5000); }); continue; }
        return null;
      }

      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        var text = result.candidates[0].content.parts[0].text;
        return text ? text.trim() : null;
      }
      log('  AI bos yanit (deneme ' + attempt + '/3)');
      if (attempt < 3) { await new Promise(function(r) { setTimeout(r, 3000); }); continue; }
      return null;
    } catch (e) {
      log('  AI hata (deneme ' + attempt + '/3): ' + e.message);
      if (attempt < 3) { await new Promise(function(r) { setTimeout(r, 5000); }); continue; }
      return null;
    }
  }
  return null;
}

// Başlık benzerliği kontrolü
function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[''`]/g, "'").replace(/[^\w\sçğıöşü]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleSimilar(t1, t2) {
  var n1 = normalizeTitle(t1);
  var n2 = normalizeTitle(t2);
  if (!n1 || !n2) return 0;
  var w1 = n1.split(' ').filter(function(w) { return w.length > 3; });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 3; });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2);
  var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  return common / Math.max(w1.length, w2.length);
}

var exitListeners = [];
var origExit = process.exit;
process.exit = function(code) {
  exitListeners.forEach(function(fn) { try { fn(code); } catch (e) {} });
  exitListeners = [];
};

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
      } else {
        setTimeout(function() { finish('timeout'); }, 30000);
      }
    } catch (e) {
      log('✗ ' + name + ': ' + e.message);
      finish('exc');
    }
  });
}

async function main() {
  log('=== Cycle basladi ===');
  ws({ stage: 'started', startedAt: new Date().toISOString(), finishedAt: null });

  // RSS
  ws({ stage: 'rss' });
  await runScript(path.join(__dirname, 'trigger-refresh.js'), 'RSS');

  // GC
  if (global.gc) { global.gc(); log('GC'); }

  // AI özet + publish — 10 makale
  ws({ stage: 'publish' });
  log('AI özet + publish (10 makale, 150+ kelime)');

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'SENIN_GEMINI_KEY') {
    log('UYARI: GEMINI_API_KEY yok! .env dosyasina yaz. AI özet atlandi.');
  }

  if (globalThis.prisma) {
    try {
      // Duplicate kontrol — son 30 published
      var existing = await globalThis.prisma.publishedArticle.findMany({
        where: { status: 'published' },
        select: { sourceArticleIds: true, aiTitle: true },
        take: 30,
        orderBy: { publishedAt: 'desc' }
      });
      var existingIds = new Set();
      var existingTitles = [];
      existing.forEach(function(p) {
        try {
          var ids = JSON.parse(p.sourceArticleIds);
          if (Array.isArray(ids)) ids.forEach(function(id) { existingIds.add(id); });
        } catch (e) {}
        if (p.aiTitle) existingTitles.push(p.aiTitle);
      });

      // Son 10 makale
      var recent = await globalThis.prisma.article.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 10
      });

      var added = 0, skipped = 0, aiOk = 0;
      for (var i = 0; i < recent.length; i++) {
        var a = recent[i];

        // Duplicate: Article ID
        if (existingIds.has(a.id)) { skipped++; continue; }
        // Duplicate: başlık benzerliği
        var dup = false;
        for (var j = 0; j < existingTitles.length; j++) {
          if (titleSimilar(a.title, existingTitles[j]) >= 0.6) { dup = true; break; }
        }
        if (dup) { skipped++; continue; }

        log('  [' + (i+1) + '/10] AI: ' + (a.title || '').slice(0, 40));
        var aiText = await aiSummarize(a.title, a.content || a.description);
        var summaryText = aiText || (a.description ? a.description.slice(0, 500) : a.title || '');
        if (aiText) aiOk++;

        try {
          await globalThis.prisma.publishedArticle.create({
            data: {
              aiTitle: a.title,
              aiSummary: summaryText.slice(0, 2000),
              category: a.category || 'Güncel',
              imageUrl: a.imageUrl || null,
              sourceArticleIds: JSON.stringify([a.id]),
              sourceCount: 1,
              earliestPublishedAt: a.publishedAt || new Date(),
              latestPublishedAt: a.publishedAt || new Date(),
              wordCount: summaryText.split(/\s+/).length,
              status: 'published',
              publishedAt: new Date()
            }
          });
          added++;
        } catch (e) {
          log('  DB hata: ' + e.message);
        }
      }
      log('Added: ' + added + ', Skip: ' + skipped + ', AI: ' + aiOk);
      ws({ summariesDone: aiOk });
    } catch (e) {
      log('Publish hatasi: ' + e.message);
    }
  }

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
