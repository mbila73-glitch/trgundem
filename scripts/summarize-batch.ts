// Generate AI summaries for articles that don't have one yet, then rebuild the
// rss_icerik.md file with the new summaries included.
//
// Default: summarize up to 150 articles (most recent first), then rebuild the file.
// Override via args: bun /home/z/my-project/scripts/summarize-batch.ts 300
//
// Run: bun /home/z/my-project/scripts/summarize-batch.ts [limit]

import { db } from '../src/lib/db';
import { summarizePending } from '../src/lib/ai';
import { execSync } from 'node:child_process';
import path from 'node:path';

const limit = Math.max(1, Math.min(Number(process.argv[2] ?? 150), 5000));
const BUILD_SCRIPT = path.join(process.cwd(), 'scripts', 'build-rss-icerik.ts');

async function main() {
  console.log(`=== Toplu AI Özetleme (limit: ${limit}) ===`);

  const pendingCount = await db.article.count({
    where: { summary: null, summaryError: null },
  });
  console.log(`Bekleyen makale: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log('Özetlenecek makale yok, dosya yeniden oluşturuluyor…');
    execSync(`bun run ${BUILD_SCRIPT}`, { stdio: 'inherit' });
    return;
  }

  const started = Date.now();
  const result = await summarizePending(limit);
  const duration = Math.round((Date.now() - started) / 1000);

  console.log(
    `\n=== Tamam (${duration}s) ===\nDenenen: ${result.attempted}\nBaşarılı: ${result.succeeded}\nBaşarısız: ${result.failed}`,
  );

  if (result.failed > 0) {
    console.log('\nBaşarısız olanlar (ilk 10):');
    for (const r of result.results.filter((x) => !x.ok).slice(0, 10)) {
      console.log(`  · ${r.id}: ${r.error?.slice(0, 80)}`);
    }
  }

  // Rebuild the file
  console.log('\nDosya yeniden oluşturuluyor…');
  execSync(`bun run ${BUILD_SCRIPT}`, { stdio: 'inherit' });
}

main()
  .catch((e) => {
    console.error('Summarize hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
