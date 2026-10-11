// Trigger the background RSS refresh directly via the lib (bypasses dev server).
// Runs in the same process so the refresh status tracker is local to this script.
//
// Run: bun /home/z/my-project/scripts/trigger-refresh.ts

import { refreshAllActiveSources } from '../src/lib/rss';
import { db } from '../src/lib/db';

async function main() {
  console.log('=== Arka plan RSS yenilemesi başlatıldı ===');
  const started = Date.now();
  const results = await refreshAllActiveSources();
  const duration = Math.round((Date.now() - started) / 1000);

  const totalAdded = results.reduce((a, r) => a + r.added, 0);
  const totalFetched = results.reduce((a, r) => a + r.fetched, 0);
  const failed = results.filter((r) => r.error);

  console.log(`\n=== Yenileme tamam (${duration}s) ===`);
  console.log(`İşlenen kaynak: ${results.length}`);
  console.log(`Çekilen öğe:    ${totalFetched}`);
  console.log(`Eklenen makale: ${totalAdded}`);
  console.log(`Başarısız kaynak: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nİlk 15 hata:');
    failed.slice(0, 15).forEach((r) => {
      console.log(`  · ${r.sourceName}: ${r.error?.slice(0, 80)}`);
    });
  }

  const totalArticles = await db.article.count();
  const totalSources = await db.source.count();
  console.log(`\nDB durumu: ${totalSources} kaynak, ${totalArticles} makale.`);
}

main()
  .catch((e) => {
    console.error('Yenileme hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
