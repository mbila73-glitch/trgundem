// Publish drafts in batches every 3 minutes.
// Each batch: publish up to 3 most-recent drafts (draft → published).
// Loop until no drafts remain.
//
// Run: setsid bash -c 'exec bun run scripts/publish-cycle.ts' &

import { db } from '../src/lib/db';

const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const BATCH_SIZE = 3;

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function publishBatch(): Promise<number> {
  const draftCount = await db.publishedArticle.count({ where: { status: 'draft' } });
  if (draftCount === 0) return 0;

  // Get most recent BATCH_SIZE drafts
  const drafts = await db.publishedArticle.findMany({
    where: { status: 'draft' },
    orderBy: { latestPublishedAt: 'desc' },
    take: BATCH_SIZE,
    select: { id: true, aiTitle: true },
  });
  if (drafts.length === 0) return 0;

  const r = await db.publishedArticle.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: 'published', publishedAt: new Date() },
  });

  log(`📤 Publish: ${r.count} haber yayınlandı (kalan ${draftCount - r.count} draft)`);
  for (const d of drafts.slice(0, r.count)) {
    log(`   • ${d.aiTitle.slice(0, 60)}`);
  }
  return r.count;
}

async function main() {
  log(`Publish cycle başlatıldı. PID: ${process.pid}`);
  log(`Her ${INTERVAL_MS / 1000} saniyede bir, en yeni ${BATCH_SIZE} draft yayınlanacak.`);
  log(`Draft 0 olunca otomatik durur.`);

  // Initial check
  const initialDrafts = await db.publishedArticle.count({ where: { status: 'draft' } });
  log(`Mevcut draft: ${initialDrafts}`);
  if (initialDrafts === 0) {
    log(`Yayınlanacak draft yok, çıkılıyor.`);
    return;
  }

  // Publish immediately on start
  await publishBatch();

  // Then loop every 3 minutes
  const interval = setInterval(async () => {
    try {
      const published = await publishBatch();
      if (published === 0) {
        const remaining = await db.publishedArticle.count({ where: { status: 'draft' } });
        if (remaining === 0) {
          log(`✓ Tüm draft'lar yayınlandı, döngü tamamladı. Çıkılıyor.`);
          clearInterval(interval);
          process.exit(0);
        }
      }
    } catch (e) {
      log(`✗ Publish hatası: ${(e as Error).message}`);
    }
  }, INTERVAL_MS);

  process.on('SIGTERM', () => {
    log('SIGTERM alındı, çıkılıyor…');
    clearInterval(interval);
    process.exit(0);
  });
  process.on('SIGINT', () => {
    log('SIGINT alındı, çıkılıyor…');
    clearInterval(interval);
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Publish cycle hatası:', e);
  process.exit(1);
});
