// trigger-refresh.js — Tüm aktif RSS kaynaklarını fetch edip Article olarak DB'ye kaydeder
// Pipeline-all.js bu script'i çağırır. Çıktısı: "İşlenen kaynak: N" satırı (pipeline bunu parse eder)

var path = require('path');
var fs = require('fs');

// .env oku
var envPath = path.join(__dirname, '..', '.env');
try {
  var envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(function (line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    var idx = line.indexOf('=');
    if (idx > 0) {
      process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
} catch (e) {}

var { PrismaClient } = require('@prisma/client');
var db = new PrismaClient();

// RSS XML parse — minimal regex tabanlı (hızlı, bağımlılık yok)
function parseRssXml(xml, sourceUrl) {
  var items = [];
  // RSS 2.0: <item>...</item>
  var itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  var m;
  while ((m = itemRegex.exec(xml)) !== null) {
    var block = m[1];
    var title = extractTag(block, 'title');
    var link = extractTag(block, 'link');
    var guid = extractTag(block, 'guid') || link;
    var description = extractTag(block, 'description');
    var pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'dc:date');
    var author = extractTag(block, 'author') || extractTag(block, 'dc:creator');
    var category = extractTag(block, 'category');
    var imageUrl = extractImage(block);
    // content:encoded
    var contentMatch = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
    var content = contentMatch ? decodeEntities(contentMatch[1]) : description;
    items.push({
      guid: (guid || link || title || '').trim(),
      title: decodeEntities((title || '').trim()),
      link: decodeEntities((link || '').trim()),
      description: decodeEntities((description || '').trim()),
      content: content,
      author: decodeEntities((author || '').trim()) || null,
      category: decodeEntities((category || '').trim()) || null,
      imageUrl: imageUrl,
      publishedAt: parseDate(pubDate),
    });
  }
  // Atom: <entry>...</entry>
  if (items.length === 0) {
    var entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRegex.exec(xml)) !== null) {
      var block = m[1];
      var title = extractTag(block, 'title');
      var linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      var link = linkMatch ? linkMatch[1] : extractTag(block, 'link');
      var guid = extractTag(block, 'id') || link;
      var description = extractTag(block, 'summary') || extractTag(block, 'content');
      var pubDate = extractTag(block, 'published') || extractTag(block, 'updated');
      var author = '';
      var authorMatch = block.match(/<author[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>/i);
      if (authorMatch) author = authorMatch[1];
      var category = extractTag(block, 'category');
      var imageUrl = extractImage(block);
      items.push({
        guid: (guid || link || title || '').trim(),
        title: decodeEntities((title || '').trim()),
        link: decodeEntities((link || '').trim()),
        description: decodeEntities((description || '').trim()),
        content: decodeEntities((description || '').trim()),
        author: decodeEntities(author.trim()) || null,
        category: decodeEntities((category || '').trim()) || null,
        imageUrl: imageUrl,
        publishedAt: parseDate(pubDate),
      });
    }
  }
  return items;
}

function extractTag(block, tag) {
  // <tag>...</tag> veya <tag attr="...">...</tag>  (CDATA destekli)
  var re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  var m = block.match(re);
  return m ? m[1] : '';
}

function extractImage(block) {
  // media:content, media:thumbnail, enclosre, image url
  var m;
  if ((m = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i)) ||
      (m = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i)) ||
      (m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i))) {
    return decodeEntities(m[1].trim());
  }
  // description içinde <img src="...">
  var desc = extractTag(block, 'description');
  if ((m = desc.match(/<img[^>]+src=["']([^"']+)["']/i))) {
    return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(s) {
  if (!s) return new Date();
  s = s.trim();
  var d = new Date(s);
  if (isNaN(d.getTime())) {
    // RFC-822 fallback: "Fri, 16 Oct 2026 11:30:00 +0300"
    try { d = new Date(s); } catch (e) { d = new Date(); }
  }
  if (isNaN(d.getTime())) d = new Date();
  return d;
}

async function fetchRss(url) {
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 15000);
  try {
    var res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/rss+xml,application/xml,text/xml,*/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { error: 'HTTP ' + res.status, text: '' };
    var text = await res.text();
    return { text: text, error: null };
  } catch (e) {
    return { error: e.message, text: '' };
  } finally {
    clearTimeout(timeout);
  }
}

(async function () {
  var t0 = Date.now();
  var sources = await db.source.findMany({ where: { active: true } });
  console.log('[trigger-refresh] Aktif kaynak: ' + sources.length);

  var processed = 0;
  var inserted = 0;
  var errors = 0;
  var concurrency = 12;
  var i = 0;

  async function worker() {
    while (i < sources.length) {
      var src = sources[i++];
      processed++;
      try {
        var r = await fetchRss(src.url);
        if (r.error) {
          errors++;
          if (processed % 30 === 0) console.log('[trigger-refresh] ' + processed + '/' + sources.length + ' işlendi (hata: ' + r.error + ' — ' + src.url.slice(0, 60) + ')');
          continue;
        }
        var items = parseRssXml(r.text, src.url);
        if (items.length === 0) {
          if (processed % 30 === 0) console.log('[trigger-refresh] ' + processed + '/' + sources.length + ' işlendi (boş: ' + src.name + ')');
          continue;
        }
        // DB'ye kaydet — duplicate skip (sourceId+guid unique)
        for (var it of items) {
          if (!it.title || !it.guid) continue;
          try {
            await db.article.upsert({
              where: { sourceId_guid: { sourceId: src.id, guid: it.guid } },
              create: {
                sourceId: src.id,
                guid: it.guid,
                title: it.title.slice(0, 500),
                link: it.link.slice(0, 1000),
                description: it.description ? it.description.slice(0, 2000) : null,
                content: it.content ? it.content.slice(0, 8000) : null,
                author: it.author || null,
                category: src.category,
                imageUrl: it.imageUrl,
                publishedAt: it.publishedAt,
              },
              update: {
                // Mevcut kaydı güncelleme — sadece lastFetched güncellenecek
              },
            });
            inserted++;
          } catch (e) {
            // duplicate ise skip
          }
        }
        // Source.lastFetched güncelle
        try {
          await db.source.update({ where: { id: src.id }, data: { lastFetched: new Date() } });
        } catch (e) {}
        if (processed % 30 === 0) console.log('[trigger-refresh] ' + processed + '/' + sources.length + ' işlendi (' + items.length + ' item: ' + src.name + ')');
      } catch (e) {
        errors++;
      }
    }
  }

  var workers = [];
  for (var w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);

  var dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('İşlenen kaynak: ' + processed);
  console.log('[trigger-refresh] Toplam: ' + processed + ' kaynak, ' + inserted + ' yeni makale, ' + errors + ' hata, ' + dt + 's');

  await db.$disconnect();
})().catch(function (e) {
  console.error('[trigger-refresh] FATAL:', e);
  console.log('İşlenen kaynak: 0');
  process.exit(1);
});
