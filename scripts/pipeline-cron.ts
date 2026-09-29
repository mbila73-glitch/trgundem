// Cron-like pipeline scheduler.
//
// Timeline (her 30 dakikalık cycle):
//   :15 — cycle başlangıcı: archive-stale (eski published'ları stale yap) +
//         refresh RSS + build rss_icerik + find-duplicates + AI summarize
//         (incremental — sadece yeni grupları özetler, her 3 hazırda bir publish)
//   :45 — yeni cycle başlar (aynı işlem)
//   :15 (sonraki saat) — yeni cycle
//
// Cycle içinde:
//   - AI özetleme en yüksek kaynak sayısından başlar (sourceCount DESC)
//   - Her 3 hazır draft'ta bir publish yap (draft → published)
//   - Aynı sourceArticleIds hash DB'de published olarak varsa: eskisini archived
//     yap, yenisini ekle (haber güncellendi)
//   - Eski cycle'ın published haberlerinden bu cycle'da yenisi gelmeyenler:
//     sayfada kalsın (silme)
//
// Run: setsid bash -c 'exec bun run /home/z/my-project/scripts/pipeline-cron.ts' &

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../src/lib/db';

const execAsync = promisify(exec);
const ONE_MINUTE_MS = 60_000;

type Stage = 'idle' | 'archive-stale' | 'refresh' | 'build-icerik' | 'build-kaynak-sayi' | 'build-ozet';
let currentStage: Stage = 'idle';

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

async function runCycle(): Promise<void> {
  log(`=== Cycle başlatıldı (saat ${new Date().toLocaleTimeString('tr-TR')}) ===`);

  // 1. Stale: tüm published'ları 'stale' yap — bu cycle'da yeniden gelirlerse
  //    published'a restore edilecekler. Gelmezlerse son adımda tekrar published
  //    yapılıp sayfada kalacaklar.
  currentStage = 'archive-stale';
  try {
    const r = await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'stale' },
    });
    log(`  ✓ Stale: ${r.count} published haber 'stale' olarak işaretlendi`);
  } catch (e) {
    log(`  ✗ Stale hatası: ${(e as Error).message}`);
  }

  // 2. Cancel drafts: önceki cycle'dan kalan, yetişmeyen draft'ları sil
  //    (yeni cycle başlıyor, eski yarı kalmış özetler iptal)
  try {
    const r = await db.publishedArticle.deleteMany({
      where: { status: 'draft' },
    });
    if (r.count > 0) {
      log(`  ✓ Cancel: ${r.count} yarı kalmış draft silindi (yeni cycle için temiz başlangıç)`);
    }
  } catch (e) {
    log(`  ✗ Cancel hatası: ${(e as Error).message}`);
  }

  // 3. RSS refresh
  currentStage = 'refresh';
  await runStep('RSS refresh', 'bun run scripts/trigger-refresh.ts');

  // 4. build rss_icerik.md
  currentStage = 'build-icerik';
  await runStep('rss_icerik.md', 'bun run scripts/build-rss-icerik.ts');

  // 5. find-duplicate-news (rss_kaynak_sayi.md)
  currentStage = 'build-kaynak-sayi';
  await runStep('rss_kaynak_sayi.md', 'python3 scripts/find-duplicate-news.py');

  // 6. build-rss-ozet (incremental + auto-publish her 3 draft'ta bir)
  currentStage = 'build-ozet';
  await runStep('rss_ozet.md (AI paraphrase + auto-publish)', 'bun run scripts/build-rss-ozet.ts');

  // 7. Restore: hala 'stale' olanları (bu cycle'da yeniden gelmeyenler) → published
  //    (kullanıcının kuralı: güncellenmeyen haberler sayfada kalsın)
  try {
    const restored = await db.publishedArticle.updateMany({
      where: { status: 'stale' },
      data: { status: 'published' },
    });
    if (restored.count > 0) {
      log(`  ✓ Restore: ${restored.count} 'stale' haber tekrar published (sayfada kalsın)`);
    }
  } catch (e) {
    log(`  ✗ Restore hatası: ${(e as Error).message}`);
  }

  // 8. Max 20 per category: her kategoride 20'den fazla published varsa
  //    en eskilerden başlayarak sil, 20'ye düşür.
  //    (AI özetleme limitleri farklıdır — bu YAYINLANAN haber limiti)
  const MAX_PER_CATEGORY = 20;
  const ALL_CATEGORIES = [
    'Güncel', 'Kamu / Resmi', 'Ekonomi / Finans',
    'Spor / Magazin', 'Bilim / Teknoloji', 'Kültür / Sanat',
  ];
  for (const cat of ALL_CATEGORIES) {
    try {
      const catCount = await db.publishedArticle.count({
        where: { status: 'published', category: cat },
      });
      if (catCount > MAX_PER_CATEGORY) {
        const toDelete = catCount - MAX_PER_CATEGORY;
        const oldest = await db.publishedArticle.findMany({
          where: { status: 'published', category: cat },
          orderBy: { publishedAt: 'asc' },
          take: toDelete,
          select: { id: true },
        });
        if (oldest.length > 0) {
          const r = await db.publishedArticle.deleteMany({
            where: { id: { in: oldest.map((o) => o.id) } },
          });
          log(`  ✓ Max 20 [${cat}]: ${r.count} en eski haber silindi (${catCount} → ${catCount - r.count})`);
        }
      }
    } catch (e) {
      log(`  ✗ Max 20 [${cat}] hatası: ${(e as Error).message}`);
    }
  }

  // 9. Max 50 total published: tüm kategorilerdeki published toplamı 50'yi
  //    aşarsa, en eskilerden başlayarak sil
  try {
    const publishedCount = await db.publishedArticle.count({ where: { status: 'published' } });
    if (publishedCount > 50) {
      const toDelete = publishedCount - 50;
      const oldest = await db.publishedArticle.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'asc' },
        take: toDelete,
        select: { id: true, aiTitle: true },
      });
      if (oldest.length > 0) {
        const r = await db.publishedArticle.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
        log(`  ✓ Max 50 (total): ${r.count} en eski haber silindi (${publishedCount} → ${publishedCount - r.count})`);
      }
    }
  } catch (e) {
    log(`  ✗ Max 50 (total) hatası: ${(e as Error).message}`);
  }

  currentStage = 'idle';
  log(`=== Cycle tamam ===`);
}

async function tick(): Promise<void> {
  const now = new Date();
  const minute = now.getMinutes();

  // Cycle starts at minute 15 and 45
  if (minute === 15 || minute === 45) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage}) — önceki cycle hala çalışıyor`);
      return;
    }
    await runCycle();
  }
}

async function main() {
  log(`Pipeline cron başlatıldı. PID: ${process.pid}`);
  log(`Saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  log(`Tetikleme saatleri:`);
  log(`  • :15 — cycle başlat (RSS refresh + pipeline + her 3 draft'ta bir publish)`);
  log(`  • :45 — yeni cycle`);
  log(`Kurallar:`);
  log(`  - En yüksek kaynak sayısından başla özetlemeye`);
  log(`  - Her 3 hazır draft'ta bir publish yap (draft → published)`);
  log(`  - Aynı sourceArticleIds hash varsa: eskisini archived, yenisini published`);
  log(`  - Güncellenmeyen haberler sayfada kalsın (stale'leri geri published yap)`);
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
