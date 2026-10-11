// Tek seferlik temizlik script'i: DB'deki tekrar haberleri ve görsel tekrarlarını archive'lar.
//
// Kurallar:
//   1. Benzer başlığa sahip published haberler (hibrit shingle Jaccard) varsa,
//      eskisini (düşük publishedAt) archived yap, en yeni olanı published tut.
//   2. Aynı görseli paylaşan published haberler varsa, eskisini archived yap.
//
// Bu script tekrar tekrar güvenle çalıştırılabilir — idempotent.
//
// Run: bun run scripts/dedup-published.ts

import { db } from '../src/lib/db';

const TURKISH_STOPWORDS = new Set<string>([
  've', 'veya', 'ile', 'için', 'gibi', 'kadar', 'sadece', 'daha', 'çok',
  'az', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz',
  'on', 'bu', 'şu', 'o', 'ben', 'sen', 'biz', 'siz', 'onlar', 'bizler',
  'da', 'de', 'ta', 'te', 'ki', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl',
  'niçin', 'niye', 'olan', 'olarak', 'göre', 'sonra', 'önce',
  'en', 'her', 'hiç', 'ama', 'fakat', 'lakin', 'ancak', 'şey', 'yani',
  'ise', 'ya', 'veyahut', 'hem', 'değil', 'üzere', 'rağmen', 'kez',
  'doğru', 'tam', 'üzerine', 'yerine', 'diye', 'beri',
  'böyle', 'şöyle', 'neden', 'hangi', 'olduğu', 'oldu', 'olacak', 'olmuş',
  'oluyor', 'bunlar', 'şunlar',
]);

function normalize(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const noPunct = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const collapsed = noPunct.replace(/\s+/g, ' ').trim();
  const words = collapsed.split(' ').filter((w) => w && !TURKISH_STOPWORDS.has(w) && w.length > 2);
  return words.join(' ');
}

function shingles(text: string, n: number): Set<string> {
  const words = text.split(' ').filter(Boolean);
  if (words.length < n) return new Set([words.join(' ')]);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - n; i += 1) {
    out.add(words.slice(i, i + n).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Hibrit: 2-gram Jaccard >= %20 VEYA 1-gram Jaccard >= %22
function isSimilar(sh1A: Set<string>, sh2A: Set<string>, sh1B: Set<string>, sh2B: Set<string>): boolean {
  if (jaccard(sh2A, sh2B) >= 0.20) return true;
  if (jaccard(sh1A, sh1B) >= 0.22) return true;
  return false;
}

async function main() {
  const started = Date.now();
  console.log('=== Tekrar haber ve görsel temizlik başladı ===\n');

  const all = await db.publishedArticle.findMany({
    where: { status: 'published' },
    select: {
      id: true,
      aiTitle: true,
      imageUrl: true,
      publishedAt: true,
      category: true,
    },
    orderBy: { publishedAt: 'desc' }, // en yeni önce
  });
  console.log(`Toplam published: ${all.length}`);

  // Shingle setlerini hazırla
  type Item = (typeof all)[number] & { sh1: Set<string>; sh2: Set<string> };
  const items: Item[] = all.map((a) => {
    const norm = normalize(a.aiTitle || '');
    return { ...a, sh1: shingles(norm, 1), sh2: shingles(norm, 2) };
  });

  // Benzer başlık tespiti: her bir haberi, "kalan" set'indeki diğer haberlerle karşılaştır
  const keep = new Set<string>();      // kalacak (published olarak)
  const archiveIds = new Set<string>(); // archived yapılacak
  const usedImageUrls = new Set<string>();

  for (const item of items) {
    // Bu haber zaten arşivlenecek ise atla
    if (archiveIds.has(item.id)) continue;

    // Benzerlik kontrolü: kalan haberlerden biriyle benzer mi?
    let similarFound = false;
    for (const k of keep) {
      const other = items.find((x) => x.id === k);
      if (!other) continue;
      if (isSimilar(item.sh1, item.sh2, other.sh1, other.sh2)) {
        console.log(`  ⏭️ Benzer başlık (eski arşivlendi):`);
        console.log(`     Yeni:   "${item.aiTitle.slice(0, 70)}" (${(item.publishedAt ?? new Date()).toISOString().slice(0, 16)})`);
        console.log(`     Önceki: "${other.aiTitle.slice(0, 70)}" (${(other.publishedAt ?? new Date()).toISOString().slice(0, 16)})`);
        archiveIds.add(item.id);
        similarFound = true;
        break;
      }
    }
    if (similarFound) continue;

    // Görsel dedup: bu haberin görseli zaten kullanılmış mı?
    if (item.imageUrl) {
      if (usedImageUrls.has(item.imageUrl)) {
        console.log(`  🖼️ Aynı görsel tekrarı (eskisi arşivlendi): "${item.aiTitle.slice(0, 60)}"`);
        archiveIds.add(item.id);
        continue;
      }
      usedImageUrls.add(item.imageUrl);
    }

    keep.add(item.id);
  }

  console.log(`\nSonuç: ${keep.size} published kalıyor, ${archiveIds.size} archived yapılacak`);

  if (archiveIds.size === 0) {
    console.log('Temizlik gerekmedi — hiç tekrar yok.');
    await db.$disconnect();
    return;
  }

  // Archived yap
  const r = await db.publishedArticle.updateMany({
    where: { id: { in: [...archiveIds] } },
    data: { status: 'archived' },
  });
  console.log(`\n✓ ${r.count} haber archived yapıldı`);

  // Final published sayısı
  const finalPublished = await db.publishedArticle.count({ where: { status: 'published' } });
  console.log(`Final published: ${finalPublished}`);
  console.log(`\n=== Tamamlandı (${((Date.now() - started) / 1000).toFixed(1)}s) ===`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error('Temizlik hatası:', e);
  process.exit(1);
});
