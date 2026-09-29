// Cron-like pipeline scheduler.
//
// Timeline (her 30 dakikalık cycle):
//   :20 ─ refresh RSS + build rss_icerik + find-duplicates + AI summarize (~10 dk)
//   :30 ─ ilk büyük publish (tüm draft'ları yayınla)
//   :32, :34, :36, :38, :40, :42, :44, :46, :48 ─ her 2 dk'da bir publish
//     (yeni draft'lar geldiyse onları yayınla)
//   :49 ─ cycle sonu (artık publish yapma, 50'de yeni refresh gelecek)
//   :50 ─ yeni refresh + pipeline
//   :00 (=60) ─ ilk büyük publish
//   :02, :04, :06, :08, :10, :12, :14, :16, :18 ─ her 2 dk'da publish
//   :19 ─ cycle sonu
//
// "Archive all published" işlemi her cycle'ın başında yapılır (20 ve 50'de
// refresh başlamadan önce). Böylece yeni cycle'da UI'da sadece yeni haberler
// görünür, eski cycle'ın haberleri "archived" olur.
//
// Run: setsid bash -c 'exec bun run /home/z/my-project/scripts/pipeline-cron.ts' &

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../src/lib/db';

const execAsync = promisify(exec);

const ONE_MINUTE_MS = 60_000;

type Stage = 'idle' | 'refresh' | 'build-icerik' | 'build-kaynak-sayi' | 'build-ozet' | 'publish' | 'archive';
let currentStage: Stage = 'idle';
let lastPublishAt: Date | null = null;
let lastRefreshStart: Date | null = null;

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function runStep(name: string, cmd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  log(`▶ ${name} başlatılıyor: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      maxBuffer: 50 * 1024 * 1024,
    });
    log(`✓ ${name} tamam`);
    if (stderr) {
      const filtered = stderr.split('\n').filter((l) => !l.startsWith('prisma:query')).join('\n').trim();
      if (filtered) console.log(`  stderr: ${filtered.slice(0, 500)}`);
    }
    return { ok: true, stdout, stderr };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    log(`✗ ${name} hata: ${err.message}`);
    if (err.stderr) {
      const filtered = err.stderr.split('\n').filter((l) => !l.startsWith('prisma:query')).join('\n').trim();
      if (filtered) console.log(`  stderr: ${filtered.slice(0, 500)}`);
    }
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

async function runRefreshPipeline(): Promise<void> {
  lastRefreshStart = new Date();
  log(`=== Refresh pipeline başlatıldı (saat ${lastRefreshStart.toLocaleTimeString('tr-TR')}) ===`);

  currentStage = 'archive';
  // Cycle başında eski published'ları arşivle (yeni cycle'da sadece yeni haberler görünsün)
  try {
    const r = await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'archived' },
    });
    log(`  ✓ Archived (cycle başı): ${r.count} eski haber arşivlendi`);
  } catch (e) {
    log(`  ✗ Archive hatası: ${(e as Error).message}`);
  }

  currentStage = 'refresh';
  await runStep('RSS refresh', 'bun run scripts/trigger-refresh.ts');

  currentStage = 'build-icerik';
  await runStep('rss_icerik.md', 'bun run scripts/build-rss-icerik.ts');

  currentStage = 'build-kaynak-sayi';
  await runStep('rss_kaynak_sayi.md', 'python3 scripts/find-duplicate-news.py');

  currentStage = 'build-ozet';
  await runStep('rss_ozet.md (AI paraphrase)', 'bun run scripts/build-rss-ozet.ts');

  currentStage = 'idle';
  log(`=== Refresh pipeline tamam ===`);
}

async function runPublishStep(isLast: boolean): Promise<void> {
  currentStage = 'publish';
  try {
    // Count current drafts
    const draftCount = await db.publishedArticle.count({ where: { status: 'draft' } });

    if (draftCount === 0) {
      // No drafts to publish — skip
      lastPublishAt = new Date();
      if (!isLast) {
        log(`⏸️ Publish: hazır draft yok, atlandı (${lastPublishAt.toLocaleTimeString('tr-TR')})`);
      }
      currentStage = 'idle';
      return;
    }

    if (isLast) {
      // Last publish of the cycle (48 or 18): publish ALL remaining drafts
      const r = await db.publishedArticle.updateMany({
        where: { status: 'draft' },
        data: { status: 'published', publishedAt: new Date() },
      });
      lastPublishAt = new Date();
      log(`✓ Publish (SON): ${r.count} haber yayınlandı, tüm draft'lar tükendi (${lastPublishAt.toLocaleTimeString('tr-TR')})`);
    } else {
      // Normal publish (30-46 or 00-16): publish up to 3 most recent drafts
      const drafts = await db.publishedArticle.findMany({
        where: { status: 'draft' },
        orderBy: { latestPublishedAt: 'desc' },
        take: 3,
        select: { id: true },
      });
      if (drafts.length === 0) {
        currentStage = 'idle';
        return;
      }
      const r = await db.publishedArticle.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: 'published', publishedAt: new Date() },
      });
      lastPublishAt = new Date();
      const remaining = draftCount - r.count;
      log(`✓ Publish: ${r.count} haber yayınlandı, kalan ${remaining} draft (${lastPublishAt.toLocaleTimeString('tr-TR')})`);
    }
  } catch (e) {
    log(`✗ Publish hatası: ${(e as Error).message}`);
  }
  currentStage = 'idle';
}

// Check if current minute is a "publish minute" (every 2 minutes from 30-48 or 00-18)
function isPublishMinute(minute: number): { isPublish: boolean; isLast: boolean } {
  // Cycle 1: 30, 32, 34, 36, 38, 40, 42, 44, 46, 48
  // Cycle 2: 00, 02, 04, 06, 08, 10, 12, 14, 16, 18
  // Last publish: 48 or 18
  if (minute >= 30 && minute <= 48 && minute % 2 === 0) {
    return { isPublish: true, isLast: minute === 48 };
  }
  if (minute >= 0 && minute <= 18 && minute % 2 === 0) {
    return { isPublish: true, isLast: minute === 18 };
  }
  return { isPublish: false, isLast: false };
}

async function tick(): Promise<void> {
  const now = new Date();
  const minute = now.getMinutes();

  // Refresh pipeline starts at minute 20 or 50
  if (minute === 20 || minute === 50) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage})`);
      return;
    }
    await runRefreshPipeline();
    return;
  }

  // Publish every 2 minutes between 30-48 and 00-18
  const publishInfo = isPublishMinute(minute);
  if (publishInfo.isPublish) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage}) — pipeline hala çalışıyor`);
      return;
    }
    await runPublishStep(publishInfo.isLast);
  }
}

async function main() {
  log(`Pipeline cron başlatıldı. PID: ${process.pid}`);
  log(`Saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  log(`Tetikleme saatleri:`);
  log(`  • :20 ve :50 — archive + refresh RSS + build pipeline (~10 dk sürer)`);
  log(`  • :30, :32, :34, :36, :38, :40, :42, :44, :46, :48 — publish (her 2 dk'da en yeni 3 draft, sonuncu = tüm kalan draft)`);
  log(`  • :00, :02, :04, :06, :08, :10, :12, :14, :16, :18 — publish (aynı mantık)`);
  log(`  • :48 ve :18 — cycle'da SON publish, kalan tüm draft'lar yayınlanır`);
  log(`  • :49-:19 ve :19-:20 — cycle boşluğu, sonraki refresh beklenir`);
  log(`Bekleniyor…`);

  // Check every minute
  setInterval(() => {
    void tick().catch((e) => log(`Tick hatası: ${(e as Error).message}`));
  }, ONE_MINUTE_MS);

  // Run a single check immediately (in case we just started near a tick minute)
  setTimeout(() => {
    void tick().catch((e) => log(`İlk tick hatası: ${(e as Error).message}`));
  }, 5000);

  process.on('SIGTERM', () => {
    log('SIGTERM alındı, çıkılıyor…');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    log('SIGINT alındı, çıkılıyor…');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Cron hatası:', e);
  process.exit(1);
});
