// Compare DB sources against the new DEFAULT_SOURCES list:
// - Delete sources whose URL is NOT in the new list (cascade deletes their articles)
// - Insert sources whose URL is in the new list but not yet in DB
// - Update category for sources that exist but have a different category
//
// Run: bun /home/z/my-project/scripts/sync-sources.ts

import { db } from '../src/lib/db';
import { DEFAULT_SOURCES, deriveNameFromUrl } from '../src/lib/rss';

async function main() {
  // Group counts for the report
  const desiredByCategory = new Map<string, number>();
  for (const s of DEFAULT_SOURCES) {
    desiredByCategory.set(
      s.category,
      (desiredByCategory.get(s.category) ?? 0) + 1,
    );
  }

  console.log('=== Senkronizasyon: DB ↔ DEFAULT_SOURCES ===');
  console.log(
    `Yeni liste: ${DEFAULT_SOURCES.length} kaynak, ${desiredByCategory.size} kategori:`,
  );
  for (const [cat, n] of desiredByCategory) {
    console.log(`  · ${cat}: ${n}`);
  }

  const currentSources = await db.source.findMany({
    select: { id: true, url: true, name: true, category: true },
  });
  console.log(`\nMevcut DB: ${currentSources.length} kaynak`);

  const desiredUrls = new Set(DEFAULT_SOURCES.map((s) => s.url));
  const currentUrls = new Map(currentSources.map((s) => [s.url, s]));

  const toDelete = currentSources.filter((s) => !desiredUrls.has(s.url));
  const toAdd = DEFAULT_SOURCES.filter((s) => !currentUrls.has(s.url));
  const toUpdateCategory = currentSources.filter((s) => {
    const desired = DEFAULT_SOURCES.find((d) => d.url === s.url);
    return Boolean(desired) && desired!.category !== s.category;
  });

  console.log(`\nSilinecek: ${toDelete.length} kaynak (makaleler de silinecek)`);
  console.log(`Eklenecek: ${toAdd.length} yeni kaynak`);
  console.log(`Kategori güncellenecek: ${toUpdateCategory.length} kaynak`);

  if (toDelete.length > 0) {
    console.log('\n--- Silinenler (ilk 20) ---');
    for (const s of toDelete.slice(0, 20)) {
      console.log(`  · ${s.name} (${s.category}) — ${s.url}`);
    }
    if (toDelete.length > 20) console.log(`  … ve ${toDelete.length - 20} daha`);
  }

  if (toAdd.length > 0) {
    console.log('\n--- Eklenenler ---');
    for (const s of toAdd) {
      const name = s.name ?? deriveNameFromUrl(s.url);
      console.log(`  + ${name} (${s.category}) — ${s.url}`);
    }
  }

  if (toUpdateCategory.length > 0) {
    console.log('\n--- Kategori değişiklikleri ---');
    for (const s of toUpdateCategory) {
      const desired = DEFAULT_SOURCES.find((d) => d.url === s.url);
      console.log(
        `  ~ ${s.name}: ${s.category} → ${desired?.category} — ${s.url}`,
      );
    }
  }

  // Execute changes
  let deletedCount = 0;
  for (const s of toDelete) {
    try {
      await db.source.delete({ where: { id: s.id } });
      deletedCount += 1;
    } catch (e) {
      console.error(`Silinemedi: ${s.url} —`, e instanceof Error ? e.message : e);
    }
  }

  let addedCount = 0;
  for (const s of toAdd) {
    const name = s.name ?? deriveNameFromUrl(s.url);
    try {
      await db.source.create({
        data: { name, url: s.url, category: s.category, active: true },
      });
      addedCount += 1;
    } catch (e) {
      console.error(`Eklenemedi: ${s.url} —`, e instanceof Error ? e.message : e);
    }
  }

  let updatedCount = 0;
  for (const s of toUpdateCategory) {
    const desired = DEFAULT_SOURCES.find((d) => d.url === s.url);
    if (!desired) continue;
    try {
      await db.source.update({
        where: { id: s.id },
        data: { category: desired.category },
      });
      updatedCount += 1;
    } catch (e) {
      console.error(
        `Güncellenemedi: ${s.url} —`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  const finalSources = await db.source.count();
  const finalArticles = await db.article.count();
  console.log('\n=== Tamam ===');
  console.log(`Silinen: ${deletedCount}`);
  console.log(`Eklenen: ${addedCount}`);
  console.log(`Kategori güncellenen: ${updatedCount}`);
  console.log(`\nDB son durum: ${finalSources} kaynak, ${finalArticles} makale`);
}

main()
  .catch((e) => {
    console.error('Sync hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
