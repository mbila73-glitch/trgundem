// DB'deki publishedArticle.aiTitle'daki HTML entity'leri decode et
// Örn: "İstanbul&#x27;un" → "İstanbul'un"

const path = require('path');
const fs = require('fs');

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

function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  console.log('=== HTML ENTITY TEMİZLİĞİ ===');
  const all = await db.publishedArticle.findMany({
    select: { id: true, aiTitle: true }
  });
  console.log('Toplam kayit:', all.length);

  let updated = 0;
  for (const a of all) {
    const decoded = decodeHtmlEntities(a.aiTitle);
    if (decoded !== a.aiTitle) {
      await db.publishedArticle.update({
        where: { id: a.id },
        data: { aiTitle: decoded }
      });
      updated++;
      if (updated <= 10) {
        console.log('  ' + a.aiTitle.slice(0, 50) + ' -> ' + decoded.slice(0, 50));
      }
    }
  }
  console.log('');
  console.log('Güncellenen:', updated);

  await db.$disconnect();
}

main().catch(e => { console.error('Hata:', e.message); process.exit(1); });
