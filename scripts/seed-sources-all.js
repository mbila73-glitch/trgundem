// TRGUNDEM RSS Kaynakları — Kategori Bazlı Seed Script
var PrismaClient = require('@prisma/client').PrismaClient;
var db = new PrismaClient({ log: ['error', 'warn'] });

var SOURCES = [
  // Siyaset
  { name: 'BBC Türkçe', url: 'http://feeds.bbci.co.uk/turkce/rss.xml', category: 'Siyaset' },
  { name: 'Euronews TR', url: 'https://feeds.feedburner.com/euronews/tr/home', category: 'Siyaset' },
  { name: 'Sol Haber', url: 'http://haber.sol.org.tr/rss.xml', category: 'Siyaset' },
  { name: 'Sabah Gazetesi', url: 'http://mix.chimpfeedr.com/d1bed-Sabah-Gazetesi', category: 'Siyaset' },
  { name: 'CNN Türk', url: 'http://www.cnnturk.com/feed/rss/all/news', category: 'Siyaset' },
  { name: 'Cumhuriyet', url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', category: 'Siyaset' },
  { name: 'Dünya', url: 'http://www.dunya.com/rss', category: 'Siyaset' },
  { name: 'Ensonhaber', url: 'http://www.ensonhaber.com/rss/ensonhaber.xml', category: 'Siyaset' },
  { name: 'Evrensel', url: 'https://www.evrensel.net/rss/haber.xml', category: 'Siyaset' },
  { name: 'Gerçek Gündem', url: 'http://www.gercekgundem.com/rss', category: 'Siyaset' },
  { name: 'Habertürk', url: 'https://www.haberturk.com/rss', category: 'Siyaset' },
  { name: 'Hürriyet Dünya', url: 'http://www.hurriyet.com.tr/rss/dunya', category: 'Siyaset' },
  { name: 'Hürriyet Gündem', url: 'http://www.hurriyet.com.tr/rss/gundem', category: 'Siyaset' },
  { name: 'İnternet Haber', url: 'http://www.internethaber.com/rss', category: 'Siyaset' },
  { name: 'Milliyet Dünya', url: 'http://www.milliyet.com.tr/rss/rssNew/dunyaRss.xml', category: 'Siyaset' },
  { name: 'Milliyet Gündem', url: 'http://www.milliyet.com.tr/rss/rssNew/gundemRss.xml', category: 'Siyaset' },
  { name: 'Milliyet Siyaset', url: 'http://www.milliyet.com.tr/rss/rssNew/siyasetRss.xml', category: 'Siyaset' },
  { name: 'Mynet Günün Özeti', url: 'http://www.mynet.com/haber/rss/gununozeti/', category: 'Siyaset' },
  { name: 'Mynet Politika', url: 'http://www.mynet.com/haber/rss/kategori/politika/', category: 'Siyaset' },
  { name: 'Odatv', url: 'https://www.odatv.com/rss.xml', category: 'Siyaset' },
  { name: 'TRT Haber', url: 'https://www.trthaber.com/gundem_articles.rss', category: 'Siyaset' },
  { name: 'Sözcü', url: 'https://www.sozcu.com.tr/rss/all.xml', category: 'Siyaset' },
  { name: 'BirGün', url: 'https://www.birgun.net/rss/home', category: 'Siyaset' },
  { name: 'Gazete Duvar', url: 'https://www.gazeteduvar.com.tr/export/rss', category: 'Siyaset' },
  { name: 'Diken', url: 'https://www.diken.com.tr/feed/', category: 'Siyaset' },
  { name: 'Karar', url: 'https://www.karar.com/service/rss.php', category: 'Siyaset' },
  { name: 'NTV Gündem', url: 'https://www.ntv.com.tr/gundem.rss', category: 'Siyaset' },
  { name: 'NTV Türkiye', url: 'https://www.ntv.com.tr/turkiye.rss', category: 'Siyaset' },
  { name: 'Medyascope', url: 'https://medyascope.tv/feed/', category: 'Siyaset' },
  { name: 'AA Gündel', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', category: 'Siyaset' },
  { name: 'Demokrat Haber', url: 'https://www.demokrathaber.org/rss', category: 'Siyaset' },
  { name: 'Halk TV', url: 'https://halktv.com.tr/service/rss.php', category: 'Siyaset' },
  { name: 'Sputnik TR', url: 'https://tr.sputniknews.com/export/rss2/archive/index.xml', category: 'Siyaset' },
  { name: 'Turkiye Haber Ajansi', url: 'http://www.turkiyehaberajansi.com/rss.xml', category: 'Siyaset' },
  { name: 'Açık Gazete', url: 'http://www.acikgazete.com/feed/', category: 'Siyaset' },
  { name: 'Bianet', url: 'http://www.bianet.org/bianet.rss', category: 'Siyaset' },

  // Kamu / Resmi
  { name: 'İşçi Gazetesi', url: 'https://iscigazetesi.org/feed', category: 'Kamu / Resmi' },
  { name: 'Ajans Kamu', url: 'https://www.ajanskamu.net/service/rss.php', category: 'Kamu / Resmi' },
  { name: 'İşçi Haber', url: 'https://www.iscihaber.net/rss/news', category: 'Kamu / Resmi' },
  { name: 'Kamudan Haber', url: 'https://www.kamudanhaber.net/rss', category: 'Kamu / Resmi' },
  { name: 'Kamu İşçileri', url: 'https://www.kamuiscileri.net/rss', category: 'Kamu / Resmi' },
  { name: 'Kamu Personeli', url: 'https://www.kamupersoneli.net/rss', category: 'Kamu / Resmi' },
  { name: 'Mevzuatın Yeri', url: 'https://www.mevzuatinyeri.com/rss', category: 'Kamu / Resmi' },

  // Ekonomi / Finans
  { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/rss', category: 'Ekonomi / Finans' },
  { name: 'Finans Gündem', url: 'http://www.finansgundem.com/rss', category: 'Ekonomi / Finans' },
  { name: 'Hürriyet Ekonomi', url: 'http://www.hurriyet.com.tr/rss/ekonomi', category: 'Ekonomi / Finans' },
  { name: 'Milliyet Ekonomi', url: 'http://www.milliyet.com.tr/rss/rssNew/ekonomiRss.xml', category: 'Ekonomi / Finans' },
  { name: 'Investing News', url: 'https://tr.investing.com/rss/news.rss', category: 'Ekonomi / Finans' },
  { name: 'CNBCE', url: 'https://www.cnbce.com/rss', category: 'Ekonomi / Finans' },
  { name: 'CNN Türk Ekonomi', url: 'https://www.cnnturk.com/feed/rss/ekonomi/news', category: 'Ekonomi / Finans' },
  { name: 'Ekonomi Gazetesi', url: 'https://www.ekonomigazetesi.com/rss.xml', category: 'Ekonomi / Finans' },
  { name: 'Habertürk Ekonomi', url: 'https://www.haberturk.com/rss/ekonomi.xml', category: 'Ekonomi / Finans' },
  { name: 'NTV Ekonomi', url: 'https://www.ntv.com.tr/ekonomi.rss', category: 'Ekonomi / Finans' },
  { name: 'Sabah Ekonomi', url: 'https://www.sabah.com.tr/rss/ekonomi.xml', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Borsa', url: 'https://www.sozcu.com.tr/feeds-rss-category-borsa', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Ekonomi', url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Finans', url: 'https://www.sozcu.com.tr/feeds-rss-category-finans', category: 'Ekonomi / Finans' },
  { name: 'TRT Ekonomi', url: 'https://www.trthaber.com/ekonomi_articles.rss', category: 'Ekonomi / Finans' },
  { name: 'Yeni Şafak Ekonomi', url: 'https://www.yenisafak.com/rss?xml=ekonomi', category: 'Ekonomi / Finans' },
  { name: 'Foreks', url: 'https://www.foreks.com/rss/', category: 'Ekonomi / Finans' },
  { name: 'Borsa Tek', url: 'https://www.borsatek.com/feed/', category: 'Ekonomi / Finans' },

  // Bilim / Teknoloji
  { name: 'Hürriyet Teknoloji', url: 'http://www.hurriyet.com.tr/rss/teknoloji', category: 'Bilim / Teknoloji' },
  { name: 'Milliyet Teknoloji', url: 'http://www.milliyet.com.tr/rss/rssNew/teknolojiRss.xml', category: 'Bilim / Teknoloji' },
  { name: 'ShiftDelete', url: 'https://shiftdelete.net/feed', category: 'Bilim / Teknoloji' },
  { name: 'A Haber Teknoloji', url: 'https://www.ahaber.com.tr/rss/teknoloji.xml', category: 'Bilim / Teknoloji' },
  { name: 'Chip', url: 'https://www.chip.com.tr/rss', category: 'Bilim / Teknoloji' },
  { name: 'CNN Türk Bilim', url: 'https://www.cnnturk.com/feed/rss/bilim-teknoloji/news', category: 'Bilim / Teknoloji' },
  { name: 'Donanım Haber', url: 'https://www.donanimhaber.com/rss/tum/', category: 'Bilim / Teknoloji' },
  { name: 'NTV Teknoloji', url: 'https://www.ntv.com.tr/teknoloji.rss', category: 'Bilim / Teknoloji' },
  { name: 'Sabah Teknoloji', url: 'https://www.sabah.com.tr/rss/teknoloji.xml', category: 'Bilim / Teknoloji' },
  { name: 'Teknoloji Oku', url: 'https://www.teknolojioku.com/export/rss', category: 'Bilim / Teknoloji' },
  { name: 'TRT Bilim', url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', category: 'Bilim / Teknoloji' },
  { name: 'Webtekno', url: 'https://www.webtekno.com/rss.xml', category: 'Bilim / Teknoloji' },
  { name: 'Yeni Şafak Teknoloji', url: 'https://www.yenisafak.com/rss?xml=teknoloji', category: 'Bilim / Teknoloji' },

  // Kültür / Sanat
  { name: 'Milliyet Kitap', url: 'http://www.milliyet.com.tr/rss/rssNew/kitapRss.xml', category: 'Kültür / Sanat' },
  { name: 'Mynet Yaşam', url: 'http://www.mynet.com/haber/rss/kategori/yasam/', category: 'Kültür / Sanat' },
  { name: 'A Haber Yaşam', url: 'https://www.ahaber.com.tr/rss/yasam.xml', category: 'Kültür / Sanat' },
  { name: 'CNN Türk Kültür', url: 'https://www.cnnturk.com/feed/rss/kultur-sanat/news', category: 'Kültür / Sanat' },
  { name: 'NTV Yaşam', url: 'https://www.ntv.com.tr/yasam.rss', category: 'Kültür / Sanat' },
  { name: 'Sabah Kültür', url: 'https://www.sabah.com.tr/rss/kultur-sanat.xml', category: 'Kültür / Sanat' },
  { name: 'Sabah Yaşam', url: 'https://www.sabah.com.tr/rss/yasam.xml', category: 'Kültür / Sanat' },
  { name: 'TRT Kültür', url: 'https://www.trthaber.com/kultur_sanat_articles.rss', category: 'Kültür / Sanat' },
  { name: 'TRT Yaşam', url: 'https://www.trthaber.com/yasam_articles.rss', category: 'Kültür / Sanat' },
  { name: 'Aydınlık', url: 'https://www.aydinlik.com.tr/feed', category: 'Kültür / Sanat' },
  { name: 'Teori Dergisi', url: 'https://www.teoridergisi.com/feed', category: 'Kültür / Sanat' },

  // Spor / Magazin (12 kaynak — spor/magazin/sağlık karışık gelmesin diye azaltıldı)
  { name: 'Hürriyet Spor', url: 'http://www.hurriyet.com.tr/rss/spor', category: 'Spor / Magazin' },
  { name: 'Hürriyet Magazin', url: 'http://www.hurriyet.com.tr/rss/magazin', category: 'Spor / Magazin' },
  { name: 'Milliyet Magazin', url: 'http://www.milliyet.com.tr/rss/rssNew/magazinRss.xml', category: 'Spor / Magazin' },
  { name: 'AA Spor', url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', category: 'Spor / Magazin' },
  { name: 'A Haber Magazin', url: 'https://www.ahaber.com.tr/rss/magazin.xml', category: 'Spor / Magazin' },
  { name: 'CNN Türk Magazin', url: 'https://www.cnnturk.com/feed/rss/magazin/news', category: 'Spor / Magazin' },
  { name: 'Sabah Magazin', url: 'https://www.sabah.com.tr/rss/magazin.xml', category: 'Spor / Magazin' },
  { name: 'Sözcü Spor', url: 'https://www.sozcu.com.tr/feeds-rss-category-spor', category: 'Spor / Magazin' },
  { name: 'Sözcü Magazin', url: 'https://www.sozcu.com.tr/feeds-rss-category-magazin', category: 'Spor / Magazin' },
  { name: 'TRT Spor', url: 'https://www.trthaber.com/spor_articles.rss', category: 'Spor / Magazin' },
  { name: 'NTV Sağlık', url: 'https://www.ntv.com.tr/saglik.rss', category: 'Spor / Magazin' },
  { name: 'TRT Sağlık', url: 'https://www.trthaber.com/saglik_articles.rss', category: 'Spor / Magazin' },
];

async function main() {
  // Eski kaynakları sil
  var deleted = await db.source.deleteMany({});
  console.log('Eski kaynaklar silindi: ' + deleted.count);

  // Yeni kaynakları ekle
  var added = 0;
  for (var i = 0; i < SOURCES.length; i++) {
    var s = SOURCES[i];
    try {
      await db.source.create({
        data: { name: s.name, url: s.url, category: s.category, active: true }
      });
      added++;
      console.log((i+1) + '. ' + s.category + ' — ' + s.name);
    } catch (e) {
      console.log((i+1) + '. HATA: ' + s.name + ' — ' + e.message);
    }
  }

  // Kategori sayımları
  var categories = ['Siyaset', 'Kamu / Resmi', 'Ekonomi / Finans', 'Bilim / Teknoloji', 'Kültür / Sanat', 'Spor / Magazin'];
  for (var c = 0; c < categories.length; c++) {
    var count = await db.source.count({ where: { category: categories[c], active: true } });
    console.log(categories[c] + ': ' + count + ' kaynak');
  }

  var total = await db.source.count({ where: { active: true } });
  console.log('\nToplam aktif kaynak: ' + total);

  await db.$disconnect();
  console.log('=== Seed Tamam ===');
}

main().catch(function(e) { console.error('FATAL:', e.message); process.exit(1); });
