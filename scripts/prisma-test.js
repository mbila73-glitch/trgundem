// RSS + Prisma bellek testi — tek kaynak
var fs = require('fs');
var path = require('path');
var LF = path.join(__dirname, '..', 'pipeline-test.log');
try { fs.writeFileSync(LF, '', 'utf8'); } catch (e) {}

function log(m) {
  var ts = new Date().toISOString();
  var mem = process.memoryUsage();
  var mb = 'rss=' + Math.round(mem.rss / 1024 / 1024) + 'MB heap=' + Math.round(mem.heapUsed / 1024 / 1024) + 'MB ext=' + Math.round(mem.external / 1024 / 1024) + 'MB';
  var line = '[' + ts + '] [' + mb + '] ' + m;
  console.log(line);
  try { fs.appendFileSync(LF, line + '\n'); } catch (e) {}
}

async function main() {
  log('=== TEST 2 BASLADI ===');

  // Prisma aç
  var pc = require('@prisma/client');
  var db = new pc.PrismaClient({ log: ['error', 'warn'] });
  log('Prisma acildi');

  // 1 aktif kaynak çek
  var sources = await db.source.findMany({ where: { active: true }, take: 1 });
  log('Test kaynagi: ' + sources[0].name + ' - ' + sources[0].url);

  // RSS fetch
  log('RSS fetch basliyor...');
  var resp = await fetch(sources[0].url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (trgundem-pipeline)' },
    timeout: 30000
  });
  log('fetch tamam, status=' + resp.status);

  var xml = await resp.text();
  log('RSS body alindi, uzunluk=' + xml.length + ' byte');

  // xml2js parse
  var xml2js = require('xml2js');
  var parser = new xml2js.Parser({ explicitArray: false, trim: true });
  log('parser olustu, parse basliyor...');
  var result = await parser.parseStringPromise(xml);
  log('parse tamam, items=' + (result.rss && result.rss.channel && result.rss.channel.item ? (Array.isArray(result.rss.channel.item) ? result.rss.channel.item.length : 1) : 0));

  // İlk 3 item'ı DB'ye yaz
  var items = result.rss.channel.item;
  if (!Array.isArray(items)) items = items ? [items] : [];
  log('Itemleri DB yazma basliyor...');
  for (var i = 0; i < Math.min(3, items.length); i++) {
    var item = items[i];
    log('  [' + (i + 1) + '] ' + (item.title || 'no-title').slice(0, 60));
    try {
      await db.article.upsert({
        where: { sourceId_guid: { sourceId: sources[0].id, guid: item.guid || item.link } },
        create: {
          sourceId: sources[0].id,
          guid: item.guid || item.link,
          title: (item.title || '').slice(0, 500),
          link: item.link || '',
          description: (item.description || '').slice(0, 2000),
          content: (item.content || item['content:encoded'] || '').slice(0, 50000),
          author: item.author || null,
          category: item.category || null,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date()
        },
        update: {}
      });
      log('    yazildi');
    } catch (e) {
      log('    HATA: ' + e.message);
    }
  }

  log('=== TEST 2 TAMAM ===');
  await db.$disconnect();
}

main().catch(function (e) { log('FATAL: ' + e.message); process.exit(1); });
