// Cron-like pipeline scheduler.
//
// Runs continuously. Every minute it checks the wall-clock minute and triggers:
//   minute 25 (and 55): refresh RSS feeds → build rss_icerik → run duplicate
//     detection (rss_kaynak_sayi) → build rss_ozet (with AI paraphrase) → drafts ready
//   minute 30 (and 60=00): publish-drafts (drafts → published, previously
//     published → archived). The UI will then poll /api/published-articles and
//     show the new batch.
//
// The refresh + build steps run sequentially because each step depends on the
// previous one. publish-drafts is fire-and-forget on the API endpoint, but we
// call the DB update directly here since the script has direct DB access.
//
// Run: setsid bash -c 'exec bun run /home/z/my-project/scripts/pipeline-cron.ts' &

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../src/lib/db';

const execAsync = promisify(exec);

const ONE_MINUTE_MS = 60_000;

type Stage = 'idle' | 'refresh' | 'build-icerik' | 'build-kaynak-sayi' | 'build-ozet' | 'publish';
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
      maxBuffer: 50 * 1024 * 1024, // 50 MB
    });
    log(`✓ ${name} tamam`);
    if (stderr) {
      // Filter out prisma query logs (too noisy)
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

async function runPublishStep(): Promise<void> {
  currentStage = 'publish';
  log(`=== Publish step (draft → published) başlatıldı ===`);
  try {
    // Archive previously-published articles
    const archived = await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'archived' },
    });
    // Promote drafts to published
    const promoted = await db.publishedArticle.updateMany({
      where: { status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
    });
    lastPublishAt = new Date();
    log(`✓ Archived: ${archived.count}, Promoted (draft→published): ${promoted.count}`);
  } catch (e) {
    log(`✗ Publish hatası: ${(e as Error).message}`);
  }
  currentStage = 'idle';
}

async function tick(): Promise<void> {
  const now = new Date();
  const minute = now.getMinutes();

  if (minute === 25 || minute === 55) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage})`);
      return;
    }
    await runRefreshPipeline();
  } else if (minute === 30 || minute === 0) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage})`);
      return;
    }
    await runPublishStep();
  }
}

async function main() {
  log(`Pipeline cron başlatıldı. PID: ${process.pid}`);
  log(`Saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  log(`Tetikleme saatleri: 25. ve 55. dakika (refresh), 30. ve 60.(00) dakika (publish)`);
  log(`Bekleniyor…`);

  // Check every minute
  setInterval(() => {
    void tick().catch((e) => log(`Tick hatası: ${(e as Error).message}`));
  }, ONE_MINUTE_MS);

  // Also run a single check immediately (in case we just started near a tick minute)
  setTimeout(() => {
    void tick().catch((e) => log(`İlk tick hatası: ${(e as Error).message}`));
  }, 5000);

  // Keep the process alive
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
