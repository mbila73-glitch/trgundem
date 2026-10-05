// Spor/Magazin kategorisindeki 8 fazla kaynağı sil
// Kalan 12 kaynak yeterli — spor haberleri azaltır
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const urls = [
  'http://spor.mynet.com/rss',
  'https://www.ahaber.com.tr/rss/spor.xml',
  'https://www.cnnturk.com/feed/rss/spor/news',
  'https://www.fotomac.com.tr/rss/anasayfa.xml',
  'https://www.haberturk.com/rss/magazin.xml',
  'https://www.sabah.com.tr/rss/spor.xml',
  'https://www.takvim.com.tr/rss/spor.xml',
  'https://www.yenisafak.com/rss?xml=spor'
];

(async () => {
  const r = await db.source.deleteMany({ where: { url: { in: urls } } });
  console.log('Silinen kaynak: ' + r.count);

  const total = await db.source.count({ where: { active: true } });
  const spor = await db.source.count({ where: { category: 'Spor / Magazin', active: true } });
  console.log('Kalan aktif kaynak: ' + total);
  console.log('Spor / Magazin kaynak: ' + spor);

  await db.$disconnect();
})().catch((e) => {
  console.error('Hata:', e.message);
  process.exit(1);
});
