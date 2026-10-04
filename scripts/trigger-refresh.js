// TRGUNDEM — RSS Refresh (v2 minimal)
// rss-parser + xml2js strict:false ile kötü biçimlenmiş RSS'leri tolere eder
// Duplicate kontrol: sourceId+guid, sourceId+link, sourceId+title (24s)

const path = require('path');
const fs = require('fs');

// .env oku
const envPath = '/var/www/.env';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
      process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
} catch (e) {}

// fetch override — native http (Wasm yok)
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
        resolve({
          status: resp.statusCode,
          ok: resp.statusCode >= 200 && resp.statusCode < 300,
          json: function() { return Promise.resolve(JSON.parse(text)); },
          text: function() { return Promise.resolve(text); }
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
};

let PrismaClient;
try { PrismaClient = require('@prisma/client').PrismaClient; } catch (e) { console.error('Prisma:', e.message); process.exit(1); }
let Parser;
try { Parser = require('rss-parser'); } catch (e) { console.error('rss-parser:', e.message); process.exit(1); }

// strict:false ile kötü XML'leri tolere et
const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; TRGUNDEM-Pipeline/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  defaultRSS: 2.0,
  xml2js: {
    strict: false,
    trim: true,
    normalizeTags: true,
    ignoreAttrs: false,
    mergeAttrs: true,
    explicitArray: false
  }
});

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickImage(item) {
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) return item['media:thumbnail'].$.url;
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) return item['media:content'].$.url;
  if (item.media && item.media.url) return item.media.url;
  if (item.image && item.image.url) return item.image.url;
  const desc = item.content || item.description || item['content:encoded'] || '';
  if (desc) {
    const m = String(desc).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

function pickCategory(item, sourceCategory) {
  if (item.categories && item.categories.length > 0) return item.categories[0];
  if (item.category) return typeof item.category === 'string' ? item.category : (item.category._ || sourceCategory);
  return sourceCategory;
}

async function fetchRss(source) {
  const r = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TRGUNDEM-Pipeline/1.0)' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  if (!xml || xml.length < 50) throw new Error('boş yanıt');
  return await parser.parseString(xml);
}

async function main() {
  console.log('=== Arka plan RSS yenilemesi başlatıldı ===');
  const started = Date.now();
  const db = new PrismaClient({ log: [] });

  const sources = await db.source.findMany({
    where: { active: true },
    select: { id: true, name: true, url: true, category: true }
  });
  console.log(`Aktif kaynak: ${sources.length}`);

  let totalFetched = 0;
  let totalAdded = 0;
  let failedSources = 0;
  const errors = [];
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const CONCURRENCY = 5;
  let index = 0;

  async function worker() {
    while (index < sources.length) {
      const src = sources[index++];
      if (!src) break;
      let fetched = 0;
      let added = 0;
      try {
        const feed = await fetchRss(src);
        const items = (feed.items || []).slice(0, 50);
        fetched = items.length;

        for (const item of items) {
          try {
            const guid = item.guid || item.link || `${src.id}:${item.title || Date.now()}`;
            const link = item.link || '';
            const title = (item.title || '').trim() || '(Başlıksız)';
            const pubDateRaw = item.isoDate || item.pubDate || item.pubdate;
            let publishedAt;
            try {
              publishedAt = pubDateRaw ? new Date(pubDateRaw) : new Date();
              if (isNaN(publishedAt.getTime())) publishedAt = new Date();
            } catch (e) { publishedAt = new Date(); }

            // Duplicate 1: sourceId + guid
            const exists1 = await db.article.findUnique({
              where: { sourceId_guid: { sourceId: src.id, guid: String(guid).slice(0, 500) } },
              select: { id: true }
            });
            if (exists1) continue;

            // Duplicate 2: sourceId + link
            if (link) {
              const exists2 = await db.article.findFirst({
                where: { sourceId: src.id, link: link.slice(0, 500) },
                select: { id: true }
              });
              if (exists2) continue;
            }

            // Duplicate 3: sourceId + title 24 saat içinde (startsWith ile)
            const titleKey = title.slice(0, 30);
            if (titleKey.length > 5) {
              const exists3 = await db.article.findFirst({
                where: {
                  sourceId: src.id,
                  title: { startsWith: titleKey },
                  publishedAt: { gte: since24 }
                },
                select: { id: true }
              });
              if (exists3) continue;
            }

            const rawDescription = stripHtml(item.contentSnippet || item.description || '');
            const rawContent = stripHtml(item['content:encoded'] || item.content || '');
            const content = rawContent.length >= rawDescription.length ? rawContent : rawDescription;
            const imageUrl = pickImage(item);
            const author = item.creator || item.author || (item['dc:creator'] && (typeof item['dc:creator'] === 'string' ? item['dc:creator'] : item['dc:creator']._)) || null;
            const category = pickCategory(item, src.category);

            await db.article.create({
              data: {
                sourceId: src.id,
                guid: String(guid).slice(0, 500),
                title: title.slice(0, 500),
                link: (link || '').slice(0, 500),
                description: rawDescription.slice(0, 600) || null,
                content: content ? content.slice(0, 8000) : null,
                author: author ? String(author).slice(0, 120) : null,
                category,
                imageUrl,
                publishedAt
              }
            });
            added++;
          } catch (e) { /* tek item hatası */ }
        }

        await db.source.update({
          where: { id: src.id },
          data: { lastFetched: new Date() }
        });
      } catch (e) {
        failedSources++;
        errors.push({ name: src.name, error: e.message });
      }
      totalFetched += fetched;
      totalAdded += added;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const duration = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log(`=== Yenileme tamam (${duration}s) ===`);
  console.log(`İşlenen kaynak: ${sources.length}`);
  console.log(`Çekilen öğe:    ${totalFetched}`);
  console.log(`Eklenen makale: ${totalAdded}`);
  console.log(`Başarısız kaynak: ${failedSources}`);
  if (errors.length > 0) {
    console.log('');
    console.log(`İlk 15 hata:`);
    errors.slice(0, 15).forEach(e => console.log(`  · ${e.name}: ${e.error.slice(0, 80)}`));
  }

  const totalArticles = await db.article.count();
  const totalSources = await db.source.count();
  console.log('');
  console.log(`DB durumu: ${totalSources} kaynak, ${totalArticles} makale.`);

  await db.$disconnect();
}

module.exports = main().catch(e => {
  console.error('Yenileme hatası:', e);
  process.exit(1);
});
