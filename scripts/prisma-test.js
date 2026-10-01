// Prisma bellek testi
var fs = require('fs');
var LF = require('path').join(__dirname, '..', 'pipeline-test.log');
try { fs.writeFileSync(LF, '', 'utf8'); } catch (e) {}

function log(m) {
  var ts = new Date().toISOString();
  var mem = process.memoryUsage();
  var mb = 'rss=' + Math.round(mem.rss / 1024 / 1024) + 'MB heap=' + Math.round(mem.heapUsed / 1024 / 1024) + 'MB/' + Math.round(mem.heapTotal / 1024 / 1024) + 'MB ext=' + Math.round(mem.external / 1024 / 1024) + 'MB';
  var line = '[' + ts + '] [' + mb + '] ' + m;
  console.log(line);
  try { fs.appendFileSync(LF, line + '\n'); } catch (e) {}
}

async function main() {
  log('=== TEST BASLADI ===');
  log('1. Bos durumda bellek');

  log('2. require("@prisma/client") once...');
  var pc = require('@prisma/client');
  log('   require tamam. keys: ' + Object.keys(pc).slice(0, 5).join(','));

  log('3. new PrismaClient()...');
  var db;
  try {
    db = new pc.PrismaClient({ log: ['error', 'warn'] });
    log('   client acildi');
  } catch (e) {
    log('   HATA: ' + e.message);
    process.exit(1);
  }

  log('4. db.source.count()...');
  try {
    var cnt = await db.source.count();
    log('   source count = ' + cnt);
  } catch (e) {
    log('   QUERY HATA: ' + e.message);
  }

  log('5. db.source.findMany() (active=true)...');
  try {
    var sources = await db.source.findMany({ where: { active: true } });
    log('   sources = ' + sources.length + ' adet');
    if (sources.length > 0) {
      log('   ilk kaynak: ' + sources[0].name + ' - ' + sources[0].url);
    }
  } catch (e) {
    log('   FINDMANY HATA: ' + e.message);
  }

  log('6. db.article.count()...');
  try {
    var ac = await db.article.count();
    log('   article count = ' + ac);
  } catch (e) {
    log('   HATA: ' + e.message);
  }

  try { await db.$disconnect(); } catch (e) {}
  log('=== TEST TAMAM ===');
}

main().catch(function (e) { log('FATAL: ' + e.message); process.exit(1); });
