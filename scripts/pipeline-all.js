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

// 3 Gemini API Key
var GEMINI_KEYS = [];
try { var k1 = fs.readFileSync('/var/www/.gemini-key', 'utf8').trim(); if (k1) GEMINI_KEYS.push(k1); } catch (e) {}
try { var k2 = fs.readFileSync('/var/www/.gemini-key2', 'utf8').trim(); if (k2) GEMINI_KEYS.push(k2); } catch (e) {}
try { var k3 = fs.readFileSync('/var/www/.gemini-key3', 'utf8').trim(); if (k3) GEMINI_KEYS.push(k3); } catch (e) {}
if (GEMINI_KEYS.length === 0) {
  var ek1 = process.env.GEMINI_API_KEY || ''; if (ek1) GEMINI_KEYS.push(ek1);
  var ek2 = process.env.GEMINI_API_KEY_2 || ''; if (ek2) GEMINI_KEYS.push(ek2);
  var ek3 = process.env.GEMINI_API_KEY_3 || ''; if (ek3) GEMINI_KEYS.push(ek3);
}
var GEMINI_MODEL = 'gemini-flash-lite-latest';
var keyIndex = 0;

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

// AI ÖZET — telifsiz, 150+ kelime, 3 key sırayla
async function aiSummarize(title, contents) {
  if (!contents || contents.length === 0) return null;
  var sorted = contents.filter(function(c) { return c && c.length > 50; }).sort(function(a, b) { return b.length - a.length; });
  if (sorted.length === 0) return null;
  var combinedContent = sorted.join('\n\n---\n\n').slice(0, 8000);
  var prompt = 'Aşağıdaki haber metinlerini oku. Asla kaynak metinle aynı cümleleri kurma. Tamamen kendi cümlelerinle, eş anlamlı kelimeler kullanarak, cümle yapısını değiştirerek yaz. Orijinal metinden hiçbir cümleyi, hiçbir ifadeyi kopyalama. Bu bir özet değil, haberin yeniden yazımıdır. En az 150 kelime olmalı. Türkçe yaz. Sadece yeniden yazılmış metni yaz, başka hiçbir şey ekleme.\n\nBAŞLIK: ' + title + '\n\nHABER METİNLERİ:\n' + combinedContent;

  for (var attempt = 1; attempt <= 3; attempt++) {
    var currentKey = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
    keyIndex++;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + currentKey;
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 800, temperature: 0.7 } })
      });
      var result = await resp.json();
      if (result.error && result.error.code === 503) {
        log('  AI 503 (deneme ' + attempt + '/3) — key ' + (keyIndex % GEMINI_KEYS.length + 1));
        if (attempt < 3) { await new Promise(function(r) { setTimeout(r, 5000); }); continue; }
        return null;
      }
      if (result.error) { log('  AI error ' + result.error.code + ': ' + (result.error.message || '').slice(0, 80)); return null; }
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        var text = result.candidates[0].content.parts[0].text;
        return text ? text.trim() : null;
      }
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

// Başlık benzerliği
function normalizeTitle(t) { return (t || '').toLowerCase().replace(/[''`]/g, "'").replace(/[^\w\sçğıöşü]/g, ' ').replace(/\s+/g, ' ').trim(); }
function titleSimilar(t1, t2) {
  var n1 = normalizeTitle(t1), n2 = normalizeTitle(t2);
  if (!n1 || !n2) return 0;
  var w1 = n1.split(' ').filter(function(w) { return w.length > 3; });
  var w2 = n2.split(' ').filter(function(w) { return w.length > 3; });
  if (!w1.length || !w2.length) return 0;
  var set2 = new Set(w2); var common = 0;
  w1.forEach(function(w) { if (set2.has(w)) common++; });
  return common / Math.max(w1.length, w2.length);
}

// Gruplama
function groupArticles(articles) {
  var groups = [], used = new Set();
  for (var i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;
    var group = { articles: [articles[i]], sourceIds: new Set([articles[i].sourceId]) };
    used.add(i);
    for (var j = i + 1; j < articles.length; j++) {
      if (used.has(j)) continue;
      if (titleSimilar(articles[i].title, articles[j].title) >= 0.5) {
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
  'Güncel': 2,
  'Kamu / Resmi': 2,
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

// Kategori max haber sayısı
var CATEGORY_MAX = 15;
var HOME_MAX_TOTAL = 50;
var HOME_MAX_FIRST_PAGE = 25;

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
      // Son 12 saat makaleler
      var since = new Date(Date.now() - 12 * 60 * 60 * 1000);
      var articles = await globalThis.prisma.article.findMany({
        where: { publishedAt: { gte: since } },
        orderBy: { publishedAt: 'desc' },
        take: 200,
        select: { id: true, title: true, content: true, description: true, sourceId: true, category: true, imageUrl: true, publishedAt: true }
      });
      log('Son 12 saat makale: ' + articles.length);

      // Grupla
      var groups = groupArticles(articles);
      log('Grup sayisi: ' + groups.length);

      // Kategori bazlı min kaynak filtrele
      var multiSource = groups.filter(function(g) {
        var cat = g.articles[0].category || 'Güncel';
        var minSources = CATEGORY_MIN_SOURCES[cat] || 2;
        return g.sourceIds.size >= minSources;
      });
      log('Min kaynakli grup: ' + multiSource.length);

      // En çok kaynaklı 10 grubu al
      multiSource.sort(function(a, b) { return b.sourceIds.size - a.sourceIds.size; });
      var top10 = multiSource.slice(0, 10);

      // Duplicate kontrol
      var existing = await globalThis.prisma.publishedArticle.findMany({
        where: { status: 'published' },
        select: { sourceArticleIds: true, aiTitle: true },
        take: 50,
        orderBy: { publishedAt: 'desc' }
      });
      var existingIds = new Set();
      var existingTitles = [];
      existing.forEach(function(p) {
        try { var ids = JSON.parse(p.sourceArticleIds); if (Array.isArray(ids)) ids.forEach(function(id) { existingIds.add(id); }); } catch (e) {}
        if (p.aiTitle) existingTitles.push(p.aiTitle);
      });

      var added = 0, skipped = 0, aiOk = 0;
      for (var i = 0; i < top10.length; i++) {
        var group = top10[i];
        var groupArticlesList = group.articles;
        var firstArticle = groupArticlesList[0];
        var cat = firstArticle.category || 'Güncel';

        // Duplicate
        var dup = false;
        for (var j = 0; j < existingTitles.length; j++) {
          if (titleSimilar(firstArticle.title, existingTitles[j]) >= 0.6) { dup = true; break; }
        }
        if (dup) { skipped++; continue; }

        var allIds = groupArticlesList.map(function(a) { return a.id; });
        var sourceCount = group.sourceIds.size;
        log('  [' + (i+1) + '/10] ' + sourceCount + ' kaynak, ' + groupArticlesList.length + ' makale (' + cat + '): ' + firstArticle.title.slice(0, 50));

        // İçerikleri topla — Siyaset/Ekonomi: en yeni 5 kaynak, diğerleri: en yeni 2
        var maxSources = (cat === 'Siyaset' || cat === 'Ekonomi / Finans') ? 5 : 2;
        var contents = groupArticlesList.slice(0, maxSources).map(function(a) { return a.content || a.description || ''; });

        // AI özet
        var aiText = await aiSummarize(firstArticle.title, contents);
        var summaryText = aiText || (firstArticle.description ? firstArticle.description.slice(0, 500) : firstArticle.title || '');
        if (aiText) aiOk++;

        // En iyi görsel
        var bestImage = null;
        for (var k = 0; k < groupArticlesList.length; k++) {
          if (groupArticlesList[k].imageUrl) { bestImage = groupArticlesList[k].imageUrl; break; }
        }

        try {
          var publishTime = new Date(Date.now() - i * 60000);
          await globalThis.prisma.publishedArticle.create({
            data: {
              aiTitle: firstArticle.title,
              aiSummary: summaryText.slice(0, 2000),
              category: cat,
              imageUrl: bestImage,
              sourceArticleIds: JSON.stringify(allIds),
              sourceCount: sourceCount,
              earliestPublishedAt: groupArticlesList[groupArticlesList.length - 1].publishedAt || publishTime,
              latestPublishedAt: publishTime,
              wordCount: summaryText.split(/\s+/).length,
              status: 'published',
              publishedAt: publishTime
            }
          });
          added++;
        } catch (e) { log('  DB hata: ' + e.message); }
      }
      log('Added: ' + added + ', Skip: ' + skipped + ', AI: ' + aiOk);

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
