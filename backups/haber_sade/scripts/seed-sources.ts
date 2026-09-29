// One-time script: delete every existing Source (cascades its Articles),
// then insert all sources defined in DEFAULT_SOURCES (categorized, ~155 URLs).
// Run with: bun /home/z/my-project/scripts/seed-sources.ts

import { replaceAllSourcesFromDefaults, DEFAULT_SOURCES } from '../src/lib/rss';
import { db } from '../src/lib/db';

async function main() {
  // Group counts for the user-visible report
  const counts: Record<string, number> = {};
  for (const s of DEFAULT_SOURCES) {
    counts[s.category] = (counts[s.category] ?? 0) + 1;
  }

  console.log('=== Haber Özet — Kaynak kataloğunu sıfırla ===');
  console.log(`Toplam ${DEFAULT_SOURCES.length} kaynak, ${Object.keys(counts).length} kategori:`);
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`  · ${cat}: ${n}`);
  }
  console.log('\nMevcut kaynaklar siliniyor ve yenileri ekleniyor…');

  const result = await replaceAllSourcesFromDefaults();

  console.log('\n=== Tamam ===');
  console.log(`Silinen kaynak:  ${result.deletedSources}`);
  console.log(`Eklenen kaynak: ${result.insertedSources}`);
  console.log(`Atlanan (tekrar): ${result.skippedDuplicates}`);

  const total = await db.source.count();
  const articles = await db.article.count();
  console.log(`\nDB durumu: ${total} kaynak, ${articles} makale.`);
}

main()
  .catch((e) => {
    console.error('Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
