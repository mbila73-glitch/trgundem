// Dünya kategorisi RSS kaynaklarını DB'ye ekle
// User: "rss çektiğimiz kategorilere dünya başlıklı bir liste ekle"
// Kullanım: node /var/www/scripts/seed-dunya-rss.js

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

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

// Dünya RSS kaynakları (İngilizce — AI Türkçe özetleyecek)
var DUNYA_RSS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { name: 'Deutsche Welle All', url: 'https://rss.dw.com/xml/rss-en-all' },
  { name: 'Deutsche Welle Top', url: 'https://rss.dw.com/rdf/rss-en-top' },
  { name: 'Deutsche Welle Europe', url: 'https://rss.dw.com/rdf/rss-en-eu' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss' },
  { name: 'The Guardian International', url: 'https://www.theguardian.com/international/rss' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss' },
  { name: 'AP Top Stories', url: 'https://flipboard.com/@associatedpress/top-stories-u7govdf1z.rss' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
  { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'Washington Post World', url: 'https://feeds.washingtonpost.com/rss/world' },
  { name: 'Reuters World (Google News)', url: 'https://news.google.com/rss/search?q=site%3Areuters.com%2Fworld&hl=en-US&gl=US&ceid=US%3Aen' },
  { name: 'AP News (Google News)', url: 'https://news.google.com/rss/search?q=site%3Aapnews.com&hl=en-US&gl=US&ceid=US%3Aen' },
];

async function main() {
  console.log('=== DÜNYA RSS KAYNAKLARI EKLENİYOR ===');
  var added = 0;
  var skipped = 0;

  for (var i = 0; i < DUNYA_RSS.length; i++) {
    var src = DUNYA_RSS[i];
    var existing = await db.source.findFirst({
      where: { url: src.url },
      select: { id: true }
    });
    if (existing) {
      console.log('  ATLA (zaten var): ' + src.name);
      skipped++;
      continue;
    }
    await db.source.create({
      data: {
        name: src.name,
        url: src.url,
        category: 'Dünya',
        active: true,
      }
    });
    console.log('  ✓ Eklendi: ' + src.name);
    added++;
  }

  console.log('');
  console.log('Toplam: ' + added + ' eklendi, ' + skipped + ' zaten var');
  console.log('Dünya kategorisinde aktif kaynak sayısı: ' + await db.source.count({ where: { category: 'Dünya', active: true } }));
  await db.$disconnect();
}

main().catch(function(e) {
  console.error('Hata:', e.message);
  process.exit(1);
});
