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

// fetch override — native http, redirect takip (max 5 seviye)
globalThis.fetch = function(url, options, redirectCount) {
  options = options || {};
  redirectCount = redirectCount || 0;
  return new Promise(function(resolve, reject) {
    if (redirectCount > 5) { reject(new Error('too many redirects')); return; }
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
      // Redirect takip (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(resp.statusCode) && resp.headers.location) {
        var newUrl = resp.headers.location;
        // Göreceli URL → tam URL
        if (newUrl.startsWith('/')) {
          newUrl = urlObj.protocol + '//' + urlObj.host + newUrl;
        }
        resolve(globalThis.fetch(newUrl, options, redirectCount + 1));
        return;
      }
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

// fast-xml-parser — rss-parser'dan çok daha toleranslı
let XMLParser;
try { XMLParser = require('fast-xml-parser').XMLParser; } catch (e) {
  console.error('fast-xml-parser yükleyin: npm install fast-xml-parser');
  process.exit(1);
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName, jPath, isLeafNode, isAttribute) => {
    // 'item' ve 'entry' her zaman array olsun
    if (['item', 'entry'].includes(tagName)) return true;
    return false;
  },
  removeNSFromVals: false,
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  tagValueProcessor: (tagName, tagValue) => tagValue,
  cdataPropName: '__cdata',
  trimValues: true
});

// RSS XML'ini parse et, feed objesi döndür
function parseRss(xml) {
  const obj = xmlParser.parse(xml, true);

  // RSS 2.0: rss.channel.item[]
  // Atom 1.0: feed.entry[]
  // RSS 1.0 (RDF): rdf:RDF.item[]
  let channel, items;

  if (obj.rss && obj.rss.channel) {
    channel = obj.rss.channel;
    items = channel.item || [];
  } else if (obj.feed) {
    channel = obj.feed;
    items = obj.feed.entry || [];
  } else if (obj['rdf:RDF']) {
    channel = obj['rdf:RDF'];
    items = obj['rdf:RDF'].item || [];
  } else {
    throw new Error('Feed not recognized (RSS 2.0/Atom 1.0/RDF expected)');
  }

  if (!Array.isArray(items)) items = items ? [items] : [];

  // Item'ları normalize et
  return items.map(item => {
    // CDATA ve textValue'ları çıkar
    function val(v) {
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') {
        if (v.__cdata !== undefined) return String(v.__cdata);
        if (v['#text'] !== undefined) return String(v['#text']);
        return '';
      }
      return String(v);
    }

    const link = val(item.link) || (item.link && item.link['@_href']) || '';
    const guid = item.guid ? (typeof item.guid === 'object' ? val(item.guid) : item.guid) : '';
    const pubDateRaw = val(item.pubDate) || val(item.published) || val(item.updated) || val(item['dc:date']);
    let isoDate = null;
    if (pubDateRaw) {
      try {
        const d = new Date(pubDateRaw);
        if (!isNaN(d.getTime())) isoDate = d.toISOString();
      } catch (e) {}
    }

    return {
      title: val(item.title) || '(Başlıksız)',
      link,
      guid: guid || link,
      pubDate: pubDateRaw,
      isoDate,
      description: val(item.description),
      content: val(item['content:encoded']) || val(item.content) || val(item.summary),
      enclosure: item.enclosure,
      mediaThumbnail: item['media:thumbnail'],
      mediaContent: item['media:content'],
      categories: item.category,
      creator: val(item['dc:creator']) || val(item.creator)
    };
  });
}

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
  if (item.enclosure && item.enclosure['@_url']) return item.enclosure['@_url'];
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item.mediaThumbnail && item.mediaThumbnail['@_url']) return item.mediaThumbnail['@_url'];
  if (item.mediaContent && item.mediaContent['@_url']) return item.mediaContent['@_url'];
  // description veya content içinde <img src="...">
  const desc = item.content || item.description || '';
  if (desc) {
    const m = String(desc).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

function pickCategory(item, sourceCategory) {
  if (item.categories) {
    if (Array.isArray(item.categories)) return typeof item.categories[0] === 'object' ? val(item.categories[0]) : item.categories[0];
    return typeof item.categories === 'object' ? val(item.categories) : item.categories;
  }
  return sourceCategory;
}

async function fetchRss(source) {
  const r = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TRGUNDEM-Pipeline/1.0)' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  if (!xml || xml.length < 50) throw new Error('boş yanıt');
  // HTML dönmüş mü?
  if (xml.substring(0, 200).toLowerCase().includes('<!doctype html') || xml.substring(0, 200).toLowerCase().includes('<html')) {
    throw new Error('HTML döndü (RSS değil)');
  }
  const items = parseRss(xml);
  return items;
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
  let skippedDuplicates = 0;
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
        const items = (await fetchRss(src)).slice(0, 50);
        fetched = items.length;

        for (const item of items) {
          try {
            const guid = item.guid || item.link || `${src.id}:${item.title || Date.now()}`;
            const link = item.link || '';
            const title = (item.title || '').trim() || '(Başlıksız)';
            const pubDateRaw = item.isoDate || item.pubDate;
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

            // Duplicate 4: KATEGORİ BAĞIMSIZ — tüm kaynaklarda başlık kontrolü
            // Başlığın normalize edilmiş ilk 40 karakteri eşitse skip
            // Bu, "aynı haber farklı kaynakta" durumunu yakalar (RSS öncesi eleme)
            const titleNorm = title.toLowerCase()
              .replace(/[''`]/g, "'")
              .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
              .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
              .replace(/&\w+;/g, ' ')
              .replace(/[^\w\sçğıöşü]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 40);
            if (titleNorm.length > 10) {
              // Tüm kaynaklarda, son 24 saatte, benzer başlık var mı
              const exists4 = await db.article.findFirst({
                where: {
                  title: { startsWith: titleNorm.slice(0, 25) },
                  publishedAt: { gte: since24 }
                },
                select: { id: true }
              });
              if (exists4) {
                skippedDuplicates++;
                continue;
              }
            }

            const rawDescription = stripHtml(item.description);
            const rawContent = stripHtml(item.content);
            const content = rawContent.length >= rawDescription.length ? rawContent : rawDescription;
            const imageUrl = pickImage(item);
            const author = item.creator || null;
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
  console.log(`Tekrar elendi (kategori bağımsız): ${skippedDuplicates}`);
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
