const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();

// GERÇEK dup olanlar — kesinlikle pasif kalmalı
const verifiedDups = [
  'http://www.cnnturk.com/feed/rss/news',        // /all/news ile birebir aynı
  'http://www.cumhuriyet.com.tr/rss/35.xml',     // son_dakika.xml ile aynı
  'http://www.cumhuriyet.com.tr/rss/36.xml',     // son_dakika.xml ile aynı
  'https://www.takvim.com.tr/rss/ekonomi.xml',   // boş (0 item)
  'https://www.takvim.com.tr/rss/otomobil.xml',  // boş (0 item)
  'http://www.mynet.com/haber/rss/sondakika',    // son-dakika ile aynı
  'http://mix.chimpfeedr.com/6ab71-NTV',         // proxy
  'http://mix.chimpfeedr.com/d1bed-Sabah-Gazetesi', // proxy
  'https://www.sabah.com.tr/rss/adana.xml',      // çok yerel
];

(async () => {
  let disabled = 0;
  for (const url of verifiedDups) {
    const r = await db.source.updateMany({
      where: { url, active: true },
      data: { active: false },
    });
    if (r.count > 0) {
      console.log('Pasif yapıldı (gerçek dup): ' + url);
      disabled += r.count;
    }
  }
  console.log('\nToplam pasif yapılan gerçek dup:', disabled);

  const total = await db.source.count({ where: { active: true } });
  console.log('Final toplam aktif kaynak:', total);
  await db.$disconnect();
})();
