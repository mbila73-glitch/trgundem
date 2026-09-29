// Kullanıcının verdiği 23 RSS kaynağını tutar, diğerlerini active:false yapar,
// listede olup DB'de olmayan 5 yeni kaynağı ekler.
//
// Run: bun run scripts/apply-source-list.ts

import { db } from '../src/lib/db';

// Kullanıcının verdiği URL listesi (http veya https olabilir).
// İsim tahminleri domain'den türetiliyor; kategori varsayılan "Güncel".
const USER_LIST: Array<{ url: string; name?: string; category?: string }> = [
  { url: 'http://yeniyasamgazetesi9.com/feed', name: 'Yeniyasamgazetesi9', category: 'Güncel' },
  { url: 'http://www.iscihaber.net/rss/news', name: 'Iscihaber', category: 'Kamu / Resmi' },
  { url: 'http://artigercek.com/service/rss.php', name: 'Artigercek', category: 'Güncel' },
  { url: 'http://halktv.com.tr/service/rss.php', name: 'Halktv', category: 'Güncel' },
  { url: 'http://www.gercekgundem.com/rss', name: 'Gercekgundem', category: 'Güncel' },
  { url: 'http://fayn.press/feed', name: 'Fayn', category: 'Güncel' },
  { url: 'http://journo.com.tr/feed', name: 'Journo', category: 'Güncel' },
  { url: 'http://www.teoridergisi.com/feed', name: 'Teoridergisi', category: 'Kültür / Sanat' },
  { url: 'http://www.cumhuriyet.com.tr/rss/son_dakika.xml', name: 'Cumhuriyet', category: 'Güncel' },
  { url: 'http://www.karar.com/service/rss.php', name: 'Karar', category: 'Güncel' },
  { url: 'http://www.sozcu.com.tr/rss/all.xml', name: 'Sozcu', category: 'Güncel' },
  { url: 'http://www.aa.com.tr/tr/rss/default?cat=spor', name: 'Aa · Spor', category: 'Spor / Magazin' },
  { url: 'http://www.trthaber.com/spor_articles.rss', name: 'Trthaber · Spor', category: 'Spor / Magazin' },
  { url: 'http://www.fotomac.com.tr/rss/anasayfa.xml', name: 'Fotomac', category: 'Spor / Magazin' },
  { url: 'http://www.cnnturk.com/feed/rss/spor/news', name: 'Cnnturk · Spor', category: 'Spor / Magazin' },
  { url: 'http://www.ajanskamu.net/service/rss.php', name: 'Ajanskamu', category: 'Kamu / Resmi' },
  { url: 'http://www.kamudanhaber.net/rss', name: 'Kamudanhaber', category: 'Kamu / Resmi' },
  { url: 'http://www.haberturk.com/rss/ekonomi.xml', name: 'Haberturk · Ekonomi', category: 'Ekonomi / Finans' },
  { url: 'http://www.bloomberght.com/rss', name: 'Bloomberght', category: 'Ekonomi / Finans' },
  { url: 'http://www.cnbce.com/rss', name: 'Cnbce', category: 'Ekonomi / Finans' },
  { url: 'http://www.ekonomigazetesi.com/rss.xml', name: 'Ekonomigazetesi', category: 'Ekonomi / Finans' },
  { url: 'http://www.foreks.com/rss/', name: 'Foreks', category: 'Ekonomi / Finans' },
  { url: 'http://tr.investing.com/rss/news.rss', name: 'Investing · News', category: 'Ekonomi / Finans' },
];

// URL'yi normalize et: https'e çevir, sonundaki /'i kaldır (path kök değilse),
// ?query parametreleri korunur (örn. cat=spor), path ile ayrılır.
function normalizeUrl(u: string): string {
  let s = u.trim();
  // http:// → https://
  if (s.startsWith('http://')) s = 'https://' + s.slice(7);
  else if (!s.startsWith('https://')) s = 'https://' + s;
  // sonundaki /'i kaldır (path sadece / ise hariç)
  if (s.endsWith('/') && s !== 'https://') s = s.slice(0, -1);
  return s.toLowerCase();
}

async function main() {
  console.log('=== Kaynak listesi uygulanıyor ===\n');

  // Kullanıcının listesini normalize et
  const userNormalized = USER_LIST.map((x) => ({
    ...x,
    normalized: normalizeUrl(x.url),
  }));
  const userSet = new Set(userNormalized.map((x) => x.normalized));

  // DB'deki tüm kaynakları yükle
  const all = await db.source.findMany({ select: { id: true, name: true, url: true, category: true, active: true } });
  console.log(`DB'de toplam kaynak: ${all.length}`);
  console.log(`Kullanıcı listesi: ${userNormalized.length} URL\n`);

  // DB'de olup kullanıcı listesinde olmayanları active:false yap
  const toDeactivate = all.filter((s) => !userSet.has(normalizeUrl(s.url)));
  const toKeep = all.filter((s) => userSet.has(normalizeUrl(s.url)));

  console.log(`=== Devre dışı bırakılacak (active: false): ${toDeactivate.length} kaynak ===`);
  for (const s of toDeactivate) {
    console.log(`  - ${s.name} | ${s.url}`);
  }
  console.log();

  console.log(`=== Aktif kalacak (zaten DB'de): ${toKeep.length} kaynak ===`);
  for (const s of toKeep) {
    console.log(`  - ${s.name} | ${s.url}`);
  }
  console.log();

  // Kullanıcı listesinde olup DB'de olmayanları ekle
  const dbNormalized = new Map(all.map((s) => [normalizeUrl(s.url), s]));
  const toAdd = userNormalized.filter((x) => !dbNormalized.has(x.normalized));

  console.log(`=== Yeni eklenecek: ${toAdd.length} kaynak ===`);
  for (const s of toAdd) {
    console.log(`  + ${s.name} | ${s.url} (${s.category})`);
  }
  console.log();

  // İşlemleri uygula
  // 1. Devre dışı bırak
  if (toDeactivate.length > 0) {
    const r = await db.source.updateMany({
      where: { id: { in: toDeactivate.map((s) => s.id) } },
      data: { active: false },
    });
    console.log(`✓ ${r.count} kaynak devre dışı bırakıldı`);
  }

  // 2. Aktif kalanları tekrar active:true yap (önceden false olmuş olabilir)
  if (toKeep.length > 0) {
    const r = await db.source.updateMany({
      where: { id: { in: toKeep.map((s) => s.id) } },
      data: { active: true },
    });
    console.log(`✓ ${r.count} kaynak aktif olarak işaretlendi`);
  }

  // 3. Yeni kaynakları ekle
  for (const x of toAdd) {
    await db.source.create({
      data: {
        name: x.name!,
        url: x.normalized, // normalize edilmiş URL'yi kaydet
        category: x.category!,
        active: true,
      },
    });
    console.log(`✓ Eklendi: ${x.name} | ${x.normalized}`);
  }

  // Final durum
  const finalActive = await db.source.count({ where: { active: true } });
  const finalTotal = await db.source.count();
  console.log(`\n=== Tamamlandı ===`);
  console.log(`Toplam kaynak: ${finalTotal}`);
  console.log(`Aktif kaynak: ${finalActive}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error('Hata:', e);
  process.exit(1);
});
