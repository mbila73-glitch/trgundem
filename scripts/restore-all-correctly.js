const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();

// GERÇEK dup olanlar — bunlar ASLA aktif yapılmayacak (verilerle doğrulandı)
const verifiedDups = new Set([
  'http://www.cnnturk.com/feed/rss/news',        // /all/news ile birebir aynı
  'http://www.cumhuriyet.com.tr/rss/35.xml',     // son_dakika.xml ile aynı
  'http://www.cumhuriyet.com.tr/rss/36.xml',     // son_dakika.xml ile aynı
  'https://www.takvim.com.tr/rss/ekonomi.xml',   // boş (0 item)
  'https://www.takvim.com.tr/rss/otomobil.xml',  // boş (0 item)
  'http://www.mynet.com/haber/rss/sondakika',    // son-dakika ile aynı
  'http://mix.chimpfeedr.com/6ab71-NTV',         // proxy
  'http://mix.chimpfeedr.com/d1bed-Sabah-Gazetesi', // proxy
  'https://www.sabah.com.tr/rss/adana.xml',      // çok yerel
]);

const sources = [
  // === Siyaset (eski Güncel) ===
  { name: 'Artı Gerçek', url: 'https://artigercek.com/service/rss.php', category: 'Siyaset' },
  { name: 'Daktilo 1984', url: 'https://daktilo1984.com/feed/', category: 'Siyaset' },
  { name: 'Fayn', url: 'https://fayn.press/feed', category: 'Siyaset' },
  { name: 'Halk TV', url: 'https://halktv.com.tr/service/rss.php', category: 'Siyaset' },
  { name: 'Harici', url: 'https://harici.com.tr/feed/', category: 'Siyaset' },
  { name: 'İfade Engelli Web', url: 'https://ifade.org.tr/engelliweb/feed', category: 'Siyaset' },
  { name: 'Journo', url: 'https://journo.com.tr/feed', category: 'Siyaset' },
  { name: 'Kıbrıs Gazetesi', url: 'https://kibrisgazetesi.com.tr/rss.xml', category: 'Siyaset' },
  { name: 'Marksist', url: 'https://marksist.org/feed', category: 'Siyaset' },
  { name: 'Medyascope', url: 'https://medyascope.tv/feed/', category: 'Siyaset' },
  { name: 'Onedio', url: 'https://onedio.com/Publisher/publisher-daily.rss', category: 'Siyaset' },
  { name: 'Sol Haber', url: 'https://sol.org.tr/rss.xml', category: 'Siyaset' },
  { name: 'IRNA TR', url: 'https://tr.irna.ir/rss', category: 'Siyaset' },
  { name: 'Sputnik TR', url: 'https://tr.sputniknews.com/export/rss2/archive/index.xml', category: 'Siyaset' },
  { name: 'Yeni Ceida', url: 'https://yeniceida.com/rss', category: 'Siyaset' },
  { name: 'AA Gündem', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', category: 'Siyaset' },
  { name: 'Aydınlık', url: 'https://www.aydinlik.com.tr/feed', category: 'Siyaset' },
  { name: 'Birgün', url: 'https://www.birgun.net/rss/home', category: 'Siyaset' },
  { name: 'CNN Türk Galeri', url: 'https://www.cnnturk.com/feed/rss/all/gallery', category: 'Siyaset' },
  { name: 'CNN Türk', url: 'http://www.cnnturk.com/feed/rss/all/news', category: 'Siyaset' },
  { name: 'CNN Türk Türkiye Galeri', url: 'https://www.cnnturk.com/feed/rss/turkiye/gallery', category: 'Siyaset' },
  { name: 'CNN Türk Türkiye', url: 'https://www.cnnturk.com/feed/rss/turkiye/news', category: 'Siyaset' },
  { name: 'CNN Türk Türkiye Video', url: 'https://www.cnnturk.com/feed/rss/turkiye/video', category: 'Siyaset' },
  { name: 'Cumhuriyet Son Dakika', url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', category: 'Siyaset' },
  { name: 'Demokrat Haber', url: 'https://www.demokrathaber.org/rss', category: 'Siyaset' },
  { name: 'Diken', url: 'https://www.diken.com.tr/feed/', category: 'Siyaset' },
  { name: 'Evrensel Haber', url: 'https://www.evrensel.net/rss/haber.xml', category: 'Siyaset' },
  { name: 'Gazete Duvar', url: 'https://www.gazeteduvar.com.tr/export/rss', category: 'Siyaset' },
  { name: 'Gerçek Gündem', url: 'http://www.gercekgundem.com/rss', category: 'Siyaset' },
  { name: 'Gündem Kıbrıs', url: 'https://www.gundemkibris.com/rss', category: 'Siyaset' },
  { name: 'Haberiniz', url: 'https://www.haberiniz.com.tr/feed/', category: 'Siyaset' },
  { name: 'Habertürk', url: 'https://www.haberturk.com/rss', category: 'Siyaset' },
  { name: 'İklim Haber', url: 'https://www.iklimhaber.org/feed/', category: 'Siyaset' },
  { name: 'Indy Türk', url: 'https://www.indyturk.com/rss.xml', category: 'Siyaset' },
  { name: 'İçinde Detayı Gündem', url: 'https://www.isindetayi.com/rss/gundem', category: 'Siyaset' },
  { name: 'Karar', url: 'https://www.karar.com/service/rss.php', category: 'Siyaset' },
  { name: 'Kıbrıs Gazetesi 2', url: 'https://www.kibrisgazetesi.com/rss', category: 'Siyaset' },
  { name: 'KRT TV', url: 'https://www.krttv.com.tr/rss', category: 'Siyaset' },
  { name: 'Nehaber Kıbrıs', url: 'https://www.nehaberkibris.com/rss/genel-0', category: 'Siyaset' },
  { name: 'NTV Gündem', url: 'https://www.ntv.com.tr/gundem.rss', category: 'Siyaset' },
  { name: 'NTV Türkiye', url: 'https://www.ntv.com.tr/turkiye.rss', category: 'Siyaset' },
  { name: 'Odatv', url: 'https://www.odatv.com/rss.xml', category: 'Siyaset' },
  { name: 'Odatv 2', url: 'http://www.odatv.com/rss.php', category: 'Siyaset' },
  { name: 'Sözcü', url: 'https://www.sozcu.com.tr/rss/all.xml', category: 'Siyaset' },
  { name: 'Takvim Anasayfa', url: 'https://www.takvim.com.tr/rss/anasayfa.xml', category: 'Siyaset' },
  { name: 'Takvim Video', url: 'https://www.takvim.com.tr/rss/video.xml', category: 'Siyaset' },
  { name: 'TRT Dosya Haber', url: 'https://www.trthaber.com/dosya_haber_articles.rss', category: 'Siyaset' },
  { name: 'TRT Guncel', url: 'https://www.trthaber.com/guncel_articles.rss', category: 'Siyaset' },
  { name: 'TRT Haber', url: 'https://www.trthaber.com/gundem_articles.rss', category: 'Siyaset' },
  { name: 'TRT Manset', url: 'https://www.trthaber.com/manset_articles.rss', category: 'Siyaset' },
  { name: 'TRT Ozel Haber', url: 'https://www.trthaber.com/ozel_haber_articles.rss', category: 'Siyaset' },
  { name: 'TRT Türkiye', url: 'https://www.trthaber.com/turkiye_articles.rss', category: 'Siyaset' },
  { name: 'Veryansın TV', url: 'https://www.veryansintv.com/feed', category: 'Siyaset' },
  { name: 'Euronews TR', url: 'http://feeds.feedburner.com/euronews/tr/home', category: 'Siyaset' },
  { name: 'Sol Haber 2', url: 'http://haber.sol.org.tr/rss.xml', category: 'Siyaset' },
  { name: 'Açık Gazete', url: 'http://www.acikgazete.com/feed/', category: 'Siyaset' },
  { name: 'Aydınlık Gazete', url: 'http://www.aydinlikgazete.com/rss', category: 'Siyaset' },
  { name: 'Bianet', url: 'http://www.bianet.org/bianet.rss', category: 'Siyaset' },
  { name: 'Cumhuriyet 3', url: 'http://www.cumhuriyet.com.tr/rss/3.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 6', url: 'http://www.cumhuriyet.com.tr/rss/6.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 7', url: 'http://www.cumhuriyet.com.tr/rss/7.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 9', url: 'http://www.cumhuriyet.com.tr/rss/9.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 10', url: 'http://www.cumhuriyet.com.tr/rss/10.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 11', url: 'http://www.cumhuriyet.com.tr/rss/11.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 14', url: 'http://www.cumhuriyet.com.tr/rss/14.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 15', url: 'http://www.cumhuriyet.com.tr/rss/15.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 16', url: 'http://www.cumhuriyet.com.tr/rss/16.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 17', url: 'http://www.cumhuriyet.com.tr/rss/17.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 19', url: 'http://www.cumhuriyet.com.tr/rss/19.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 20', url: 'http://www.cumhuriyet.com.tr/rss/20.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 24', url: 'http://www.cumhuriyet.com.tr/rss/24.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 32', url: 'http://www.cumhuriyet.com.tr/rss/32.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 33', url: 'http://www.cumhuriyet.com.tr/rss/33.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 34', url: 'http://www.cumhuriyet.com.tr/rss/34.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 46', url: 'http://www.cumhuriyet.com.tr/rss/46.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 70', url: 'http://www.cumhuriyet.com.tr/rss/70.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 72', url: 'http://www.cumhuriyet.com.tr/rss/72.xml', category: 'Siyaset' },
  { name: 'Cumhuriyet 73', url: 'http://www.cumhuriyet.com.tr/rss/73.xml', category: 'Siyaset' },
  { name: 'Ensonhaber', url: 'http://www.ensonhaber.com/rss/ensonhaber.xml', category: 'Siyaset' },
  { name: 'İnternet Haber', url: 'http://www.internethaber.com/rss', category: 'Siyaset' },
  { name: 'İnternet Haber Son Dakika', url: 'http://www.internethaber.com/rss/last_min.xml', category: 'Siyaset' },
  { name: 'Milliyet Gündem', url: 'http://www.milliyet.com.tr/rss/rssNew/gundemRss.xml', category: 'Siyaset' },
  { name: 'Mynet Günün Özeti', url: 'http://www.mynet.com/haber/rss/gununozeti/', category: 'Siyaset' },
  { name: 'Mynet Politika', url: 'http://www.mynet.com/haber/rss/kategori/politika/', category: 'Siyaset' },
  { name: 'Mynet Son Dakika', url: 'http://www.mynet.com/haber/rss/son-dakika', category: 'Siyaset' },
  { name: 'Star 125', url: 'http://www.star.com.tr/rss/rss.asp?cid=125', category: 'Siyaset' },
  { name: 'Star 13', url: 'http://www.star.com.tr/rss/rss.asp?cid=13', category: 'Siyaset' },
  { name: 'Star 16', url: 'http://www.star.com.tr/rss/rss.asp?cid=16', category: 'Siyaset' },
  { name: 'Star 170', url: 'http://www.star.com.tr/rss/rss.asp?cid=170', category: 'Siyaset' },
  { name: 'Star 19', url: 'http://www.star.com.tr/rss/rss.asp?cid=19', category: 'Siyaset' },
  { name: 'Star 223', url: 'http://www.star.com.tr/rss/rss.asp?cid=223', category: 'Siyaset' },
  { name: 'Star 500', url: 'http://www.star.com.tr/rss/rss.asp?cid=500', category: 'Siyaset' },
  { name: 'Türkiye Haber Ajansı', url: 'http://www.turkiyehaberajansi.com/rss.xml', category: 'Siyaset' },
  { name: 'Yeniçağ', url: 'http://www.yenicaggazetesi.com.tr/rss', category: 'Siyaset' },
  { name: 'Yeni Yaşam Gazetesi', url: 'https://yeniyasamgazetesi9.com/feed', category: 'Siyaset' },
  { name: 'Gerçek Gündem', url: 'https://www.gercekgundem.com/rss', category: 'Siyaset' },
  { name: 'Fayn', url: 'https://fayn.press/feed', category: 'Siyaset' },
  { name: 'Journo', url: 'https://journo.com.tr/feed', category: 'Siyaset' },

  // === Ekonomi / Finans ===
  { name: 'BloombergHT', url: 'https://www.bloomberght.com/rss', category: 'Ekonomi / Finans' },
  { name: 'Borsa Tek', url: 'https://www.borsatek.com/feed/', category: 'Ekonomi / Finans' },
  { name: 'CNBCE', url: 'https://www.cnbce.com/rss', category: 'Ekonomi / Finans' },
  { name: 'CNN Türk Ekonomi Galeri', url: 'https://www.cnnturk.com/feed/rss/ekonomi/gallery', category: 'Ekonomi / Finans' },
  { name: 'CNN Türk Ekonomi', url: 'https://www.cnnturk.com/feed/rss/ekonomi/news', category: 'Ekonomi / Finans' },
  { name: 'CNN Türk Ekonomi Video', url: 'https://www.cnnturk.com/feed/rss/ekonomi/video', category: 'Ekonomi / Finans' },
  { name: 'Ekonomi Gazetesi', url: 'https://www.ekonomigazetesi.com/rss.xml', category: 'Ekonomi / Finans' },
  { name: 'Foreks', url: 'https://www.foreks.com/rss/', category: 'Ekonomi / Finans' },
  { name: 'Habertürk Ekonomi', url: 'https://www.haberturk.com/rss/ekonomi.xml', category: 'Ekonomi / Finans' },
  { name: 'NTV Ekonomi', url: 'https://www.ntv.com.tr/ekonomi.rss', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Finans', url: 'https://www.sozcu.com.tr/feeds-rss-category-finans', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Ekonomi', url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Emlak', url: 'https://www.sozcu.com.tr/feeds-rss-category-emlak', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Emtia', url: 'https://www.sozcu.com.tr/feeds-rss-category-emtia', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Kripto', url: 'https://www.sozcu.com.tr/feeds-rss-category-kripto', category: 'Ekonomi / Finans' },
  { name: 'Sözcü Borsa', url: 'https://www.sozcu.com.tr/feeds-rss-category-borsa', category: 'Ekonomi / Finans' },
  { name: 'TRT Ekonomi', url: 'https://www.trthaber.com/ekonomi_articles.rss', category: 'Ekonomi / Finans' },
  { name: 'Finans Gündem', url: 'http://www.finansgundem.com/rss', category: 'Ekonomi / Finans' },
  { name: 'Hürriyet Ekonomi', url: 'http://www.hurriyet.com.tr/rss/ekonomi', category: 'Ekonomi / Finans' },
  { name: 'Investing Market', url: 'https://tr.investing.com/rss/market_overview.rss', category: 'Ekonomi / Finans' },
  { name: 'Investing News', url: 'https://tr.investing.com/rss/news.rss', category: 'Ekonomi / Finans' },
  { name: 'Euronews TR Economy', url: 'https://tr.euronews.com/rss?level=theme&name=economy', category: 'Ekonomi / Finans' },
  { name: 'Euronews TR Markets', url: 'https://tr.euronews.com/rss?level=theme&name=markets', category: 'Ekonomi / Finans' },

  // === Kamu / Resmi ===
  { name: 'BHA', url: 'https://bha.net.tr/rss', category: 'Kamu / Resmi' },
  { name: 'İşçi Gazetesi', url: 'https://iscigazetesi.org/feed', category: 'Kamu / Resmi' },
  { name: 'Ajans Kamu', url: 'https://www.ajanskamu.net/service/rss.php', category: 'Kamu / Resmi' },
  { name: 'Hukuki Haber', url: 'https://www.hukukihaber.net/rss', category: 'Kamu / Resmi' },
  { name: 'İşçi Haber', url: 'https://www.iscihaber.net/rss/news', category: 'Kamu / Resmi' },
  { name: 'Kamudan Haber', url: 'https://www.kamudanhaber.net/rss', category: 'Kamu / Resmi' },
  { name: 'Kamu İşçileri', url: 'https://www.kamuiscileri.net/rss', category: 'Kamu / Resmi' },
  { name: 'Kamu Personeli', url: 'https://www.kamupersoneli.net/rss', category: 'Kamu / Resmi' },
  { name: 'Mevzuatın Yeri', url: 'https://www.mevzuatinyeri.com/rss', category: 'Kamu / Resmi' },
  { name: 'NTV Eğitim', url: 'https://www.ntv.com.tr/egitim.rss', category: 'Kamu / Resmi' },
  { name: 'TRT Eğitim', url: 'https://www.trthaber.com/egitim_articles.rss', category: 'Kamu / Resmi' },
  { name: 'İçinde Detayı Gündem', url: 'https://www.isindetayi.com/rss/gundem', category: 'Kamu / Resmi' },

  // === Bilim / Teknoloji ===
  { name: 'Shiftdelete', url: 'https://shiftdelete.net/feed', category: 'Bilim / Teknoloji' },
  { name: 'A Haber Otomobil', url: 'https://www.ahaber.com.tr/rss/otomobil.xml', category: 'Bilim / Teknoloji' },
  { name: 'A Haber Teknoloji', url: 'https://www.ahaber.com.tr/rss/teknoloji.xml', category: 'Bilim / Teknoloji' },
  { name: 'Chip', url: 'https://www.chip.com.tr/rss', category: 'Bilim / Teknoloji' },
  { name: 'CNN Türk Otomobil Galeri', url: 'https://www.cnnturk.com/feed/rss/otomobil/gallery', category: 'Bilim / Teknoloji' },
  { name: 'CNN Türk Otomobil', url: 'https://www.cnnturk.com/feed/rss/otomobil/news', category: 'Bilim / Teknoloji' },
  { name: 'CNN Türk Otomobil Video', url: 'https://www.cnnturk.com/feed/rss/otomobil/video', category: 'Bilim / Teknoloji' },
  { name: 'Digital Age', url: 'https://www.digitalage.com.tr/feed/', category: 'Bilim / Teknoloji' },
  { name: 'Donanımhaber', url: 'https://www.donanimhaber.com/rss/tum/', category: 'Bilim / Teknoloji' },
  { name: 'Log', url: 'https://www.log.com.tr/feed/', category: 'Bilim / Teknoloji' },
  { name: 'Megabayt', url: 'https://www.megabayt.com/rss/news', category: 'Bilim / Teknoloji' },
  { name: 'NTV Otomobil', url: 'https://www.ntv.com.tr/otomobil.rss', category: 'Bilim / Teknoloji' },
  { name: 'NTV Teknoloji', url: 'https://www.ntv.com.tr/teknoloji.rss', category: 'Bilim / Teknoloji' },
  { name: 'Sabah Otomobil', url: 'https://www.sabah.com.tr/rss/otomobil.xml', category: 'Bilim / Teknoloji' },
  { name: 'Techinside', url: 'https://www.techinside.com/feed/', category: 'Bilim / Teknoloji' },
  { name: 'Teknoblog', url: 'https://www.teknoblog.com/feed/', category: 'Bilim / Teknoloji' },
  { name: 'Teknolojioku', url: 'https://www.teknolojioku.com/export/rss', category: 'Bilim / Teknoloji' },
  { name: 'TRT Bilim', url: 'https://www.trthaber.com/bilim_teknoloji_articles.rss', category: 'Bilim / Teknoloji' },
  { name: 'Webtekno', url: 'https://www.webtekno.com/rss.xml', category: 'Bilim / Teknoloji' },
  { name: 'Hürriyet Teknoloji', url: 'http://www.hurriyet.com.tr/rss/teknoloji', category: 'Bilim / Teknoloji' },
  { name: 'Mynet Teknoloji', url: 'http://www.mynet.com/haber/rss/kategori/teknoloji/', category: 'Bilim / Teknoloji' },

  // === Kültür / Sanat ===
  { name: 'Ayrıntı Dergi', url: 'https://ayrintidergi.com.tr/feed', category: 'Kültür / Sanat' },
  { name: 'CNN Türk Kültür Galeri', url: 'https://www.cnnturk.com/feed/rss/kultur-sanat/gallery', category: 'Kültür / Sanat' },
  { name: 'CNN Türk Kültür', url: 'https://www.cnnturk.com/feed/rss/kultur-sanat/news', category: 'Kültür / Sanat' },
  { name: 'CNN Türk Kültür Video', url: 'https://www.cnnturk.com/feed/rss/kultur-sanat/video', category: 'Kültür / Sanat' },
  { name: 'Sabah Kültür', url: 'https://www.sabah.com.tr/rss/kultur-sanat.xml', category: 'Kültür / Sanat' },
  { name: 'Teori Dergisi', url: 'https://www.teoridergisi.com/feed', category: 'Kültür / Sanat' },
  { name: 'TRT Kültür', url: 'https://www.trthaber.com/kultur_sanat_articles.rss', category: 'Kültür / Sanat' },
  { name: 'Elele', url: 'https://www.elele.com.tr/export/rss', category: 'Kültür / Sanat' },
  { name: 'Trendus', url: 'https://www.trendus.com/feed', category: 'Kültür / Sanat' },
  { name: 'Elle', url: 'https://www.elle.com.tr/rss', category: 'Kültür / Sanat' },

  // === Spor / Magazin ===
  { name: 'AA Spor', url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', category: 'Spor / Magazin' },
  { name: 'A Haber Magazin', url: 'https://www.ahaber.com.tr/rss/magazin.xml', category: 'Spor / Magazin' },
  { name: 'A Haber Spor', url: 'https://www.ahaber.com.tr/rss/spor.xml', category: 'Spor / Magazin' },
  { name: 'CNN Türk Magazin Galeri', url: 'https://www.cnnturk.com/feed/rss/magazin/gallery', category: 'Spor / Magazin' },
  { name: 'CNN Türk Magazin', url: 'https://www.cnnturk.com/feed/rss/magazin/news', category: 'Spor / Magazin' },
  { name: 'CNN Türk Magazin Video', url: 'https://www.cnnturk.com/feed/rss/magazin/video', category: 'Spor / Magazin' },
  { name: 'CNN Türk Sağlık Galeri', url: 'https://www.cnnturk.com/feed/rss/saglik/gallery', category: 'Spor / Magazin' },
  { name: 'CNN Türk Sağlık', url: 'https://www.cnnturk.com/feed/rss/saglik/news', category: 'Spor / Magazin' },
  { name: 'CNN Türk Sağlık Video', url: 'https://www.cnnturk.com/feed/rss/saglik/video', category: 'Spor / Magazin' },
  { name: 'CNN Türk Seyahat Galeri', url: 'https://www.cnnturk.com/feed/rss/seyahat/gallery', category: 'Spor / Magazin' },
  { name: 'CNN Türk Seyahat', url: 'https://www.cnnturk.com/feed/rss/seyahat/news', category: 'Spor / Magazin' },
  { name: 'CNN Türk Seyahat Video', url: 'https://www.cnnturk.com/feed/rss/seyahat/video', category: 'Spor / Magazin' },
  { name: 'CNN Türk Spor Galeri', url: 'https://www.cnnturk.com/feed/rss/spor/gallery', category: 'Spor / Magazin' },
  { name: 'CNN Türk Spor', url: 'https://www.cnnturk.com/feed/rss/spor/news', category: 'Spor / Magazin' },
  { name: 'CNN Türk Spor Video', url: 'https://www.cnnturk.com/feed/rss/spor/video', category: 'Spor / Magazin' },
  { name: 'CNN Türk Yaşam Galeri', url: 'https://www.cnnturk.com/feed/rss/yasam/gallery', category: 'Spor / Magazin' },
  { name: 'CNN Türk Yaşam Video', url: 'https://www.cnnturk.com/feed/rss/yasam/video', category: 'Spor / Magazin' },
  { name: 'Fotomaç', url: 'https://www.fotomac.com.tr/rss/anasayfa.xml', category: 'Spor / Magazin' },
  { name: 'Fotospor', url: 'https://www.fotospor.com/feed/rss_sondakika.xml', category: 'Spor / Magazin' },
  { name: 'Habertürk Magazin', url: 'https://www.haberturk.com/rss/magazin.xml', category: 'Spor / Magazin' },
  { name: 'Marie Claire', url: 'https://www.marieclaire.com.tr/feed/', category: 'Spor / Magazin' },
  { name: 'Mynet Magazin', url: 'https://www.mynet.com/magazin/rss', category: 'Spor / Magazin' },
  { name: 'NTV Sağlık', url: 'https://www.ntv.com.tr/saglik.rss', category: 'Spor / Magazin' },
  { name: 'NTV Yaşam', url: 'https://www.ntv.com.tr/yasam.rss', category: 'Spor / Magazin' },
  { name: 'Sabah Magazin', url: 'https://www.sabah.com.tr/rss/magazin.xml', category: 'Spor / Magazin' },
  { name: 'Sabah Oyun', url: 'https://www.sabah.com.tr/rss/oyun.xml', category: 'Spor / Magazin' },
  { name: 'Sabah Spor', url: 'https://www.sabah.com.tr/rss/spor.xml', category: 'Spor / Magazin' },
  { name: 'Sözcü Magazin', url: 'https://www.sozcu.com.tr/feeds-rss-category-magazin', category: 'Spor / Magazin' },
  { name: 'Sözcü Spor', url: 'https://www.sozcu.com.tr/feeds-rss-category-spor', category: 'Spor / Magazin' },
  { name: 'Takvim Saklambac', url: 'https://www.takvim.com.tr/rss/saklambac.xml', category: 'Spor / Magazin' },
  { name: 'Takvim Spor', url: 'https://www.takvim.com.tr/rss/spor.xml', category: 'Spor / Magazin' },
  { name: 'Takvim Televizyon', url: 'https://www.takvim.com.tr/rss/televizyon.xml', category: 'Spor / Magazin' },
  { name: 'TRT Sağlık', url: 'https://www.trthaber.com/saglik_articles.rss', category: 'Spor / Magazin' },
  { name: 'TRT Spor', url: 'https://www.trthaber.com/spor_articles.rss', category: 'Spor / Magazin' },
  { name: 'TRT Yaşam', url: 'https://www.trthaber.com/yasam_articles.rss', category: 'Spor / Magazin' },
  { name: 'Mynet Spor', url: 'http://spor.mynet.com/rss', category: 'Spor / Magazin' },
  { name: 'Hürriyet Astroloji', url: 'http://www.hurriyet.com.tr/rss/astroloji', category: 'Spor / Magazin' },
  { name: 'Hürriyet Magazin', url: 'http://www.hurriyet.com.tr/rss/magazin', category: 'Spor / Magazin' },
  { name: 'Hürriyet Spor', url: 'http://www.hurriyet.com.tr/rss/spor', category: 'Spor / Magazin' },
  { name: 'Mynet Sağlık', url: 'http://www.mynet.com/haber/rss/kategori/saglik/', category: 'Spor / Magazin' },
  { name: 'Mynet Yaşam', url: 'http://www.mynet.com/haber/rss/kategori/yasam/', category: 'Spor / Magazin' },

  // === Dünya ===
  { name: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml', category: 'Dünya' },
  { name: 'CNN Türk Dünya Galeri', url: 'https://www.cnnturk.com/feed/rss/dunya/gallery', category: 'Dünya' },
  { name: 'CNN Türk Dünya', url: 'https://www.cnnturk.com/feed/rss/dunya/news', category: 'Dünya' },
  { name: 'CNN Türk Dünya Video', url: 'https://www.cnnturk.com/feed/rss/dunya/video', category: 'Dünya' },
  { name: 'Dünya Gazetesi', url: 'https://www.dunya.com/rss', category: 'Dünya' },
  { name: 'NTV Dünya', url: 'https://www.ntv.com.tr/dunya.rss', category: 'Dünya' },
  { name: 'TRT Dünya', url: 'https://www.trthaber.com/dunya_articles.rss', category: 'Dünya' },
  { name: 'DW Türkçe', url: 'http://rss.dw.com/rdf/rss-tur-all', category: 'Dünya' },
  { name: 'BBC Türkçe 2', url: 'http://www.bbc.co.uk/turkce/index.xml', category: 'Dünya' },
  { name: 'Mynet Dünya', url: 'http://www.mynet.com/haber/rss/kategori/dunya/', category: 'Dünya' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'Dünya' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'Dünya' },
  { name: 'DW All', url: 'https://rss.dw.com/xml/rss-en-all', category: 'Dünya' },
  { name: 'DW Top', url: 'https://rss.dw.com/rdf/rss-en-top', category: 'Dünya' },
  { name: 'DW Europe', url: 'https://rss.dw.com/rdf/rss-en-eu', category: 'Dünya' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', category: 'Dünya' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'Dünya' },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'Dünya' },
  { name: 'Guardian International', url: 'https://www.theguardian.com/international/rss', category: 'Dünya' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss', category: 'Dünya' },
  { name: 'AP Top Stories', url: 'https://flipboard.com/@associatedpress/top-stories-u7govdf1z.rss', category: 'Dünya' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', category: 'Dünya' },
  { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'Dünya' },
  { name: 'Reuters World', url: 'https://news.google.com/rss/search?q=site%3Areuters.com%2Fworld&hl=en-US&gl=US&ceid=US%3Aen', category: 'Dünya' },
  { name: 'AP News', url: 'https://news.google.com/rss/search?q=site%3Aapnews.com&hl=en-US&gl=US&ceid=US%3Aen', category: 'Dünya' },
];

(async () => {
  // 1) "Güncel" kategorisindekileri "Siyaset" yap
  const guncelUpdated = await db.source.updateMany({
    where: { category: 'Güncel' },
    data: { category: 'Siyaset' },
  });
  console.log('Güncel -> Siyaset güncellendi:', guncelUpdated.count);

  // 2) Mevcut URL'leri topla
  const existing = await db.source.findMany({ select: { url: true, active: true } });
  const existingUrls = new Set(existing.map((s) => s.url));
  console.log('Mevcut aktif kaynak:', existingUrls.size);

  // 3) User listesinde olup DB'de OLMAYANLARI ekle, var olanları active=true yap
  let added = 0;
  let reactivated = 0;
  let skippedDup = 0;
  let alreadyActive = 0;

  for (const s of sources) {
    if (verifiedDups.has(s.url)) {
      skippedDup++;
      continue;
    }
    try {
      const row = await db.source.findUnique({ where: { url: s.url } });
      if (row) {
        if (!row.active) {
          await db.source.update({
            where: { url: s.url },
            data: { active: true, category: s.category, name: s.name },
          });
          reactivated++;
        } else {
          // Aktif ama kategori/name güncelle
          await db.source.update({
            where: { url: s.url },
            data: { category: s.category, name: s.name },
          });
          alreadyActive++;
        }
      } else {
        await db.source.create({ data: { ...s, active: true } });
        added++;
      }
    } catch (e) {
      console.log('Hata: ' + s.name + ' - ' + e.message.slice(0, 80));
    }
  }

  // 4) Listede olmayan ama DB'de pasif olan bağımsız kaynakları da aktif yap
  // (Birgün, Evrensel, Diken, Medyascope, vb. — hepsi farklı siteler)
  const inList = new Set(sources.map((s) => s.url));
  const inactiveRows = await db.source.findMany({
    where: { active: false },
    select: { url: true, name: true, category: true },
  });
  let restoredIndependent = 0;
  for (const r of inactiveRows) {
    if (verifiedDups.has(r.url)) continue;
    if (inList.has(r.url)) continue; // zaten yukarıda işlendi
    try {
      await db.source.update({ where: { url: r.url }, data: { active: true } });
      restoredIndependent++;
      console.log('Bağımsız geri açıldı: ' + r.name + ' | ' + r.url);
    } catch (e) {}
  }

  console.log('\n=== ÖZET ===');
  console.log('Yeni eklenen:', added);
  console.log('Pasifken aktif yapılan (listede olan):', reactivated);
  console.log('Zaten aktif (kategori düzeltildi):', alreadyActive);
  console.log('Bağımsız pasif kaynak geri açıldı:', restoredIndependent);
  console.log('Atlanan (gerçek dup):', skippedDup);

  const total = await db.source.count({ where: { active: true } });
  console.log('\nToplam aktif kaynak:', total);

  const all = await db.source.findMany({ where: { active: true } });
  const byCat = {};
  all.forEach((s) => {
    byCat[s.category] = (byCat[s.category] || 0) + 1;
  });
  console.log('\n=== KATEGORI DAGILIMI ===');
  Object.keys(byCat)
    .sort()
    .forEach((c) => console.log('  ' + c + ': ' + byCat[c]));

  await db.$disconnect();
})();
