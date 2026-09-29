// Cron-like pipeline scheduler.
//
// Timeline (her 30 dakikalık cycle):
//   :00 — cycle başlangıcı: archive-stale (eski published'ları stale yap) +
//         refresh RSS + build rss_icerik + find-duplicates + AI summarize
//         (incremental — sadece yeni grupları özetler, her 3 hazırda bir publish)
//   :30 — yeni cycle başlar (aynı işlem)
//   :00 (sonraki saat) — yeni cycle
//
// Cycle içinde:
//   - AI özetleme en yüksek kaynak sayısından başlar (sourceCount DESC)
//   - Her 3 hazır draft'ta bir publish yap (draft → published)
//   - Aynı sourceArticleIds hash DB'de published olarak varsa: eskisini archived
//     yap, yenisini ekle (haber güncellendi)
//   - Eski cycle'ın published haberlerinden bu cycle'da yenisi gelmeyenler:
//     sayfada kalsın (silme)
//
// Run (daemon):  setsid bash -c 'exec bun run /home/z/my-project/scripts/pipeline-cron.ts' &
// Run (tek sefer): bun run /home/z/my-project/scripts/pipeline-cron.ts --once

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { db } from '../src/lib/db';

const execAsync = promisify(exec);
const ONE_MINUTE_MS = 60_000;
const STATUS_FILE = `${process.cwd()}/pipeline-status.json`;

type Stage = 'idle' | 'archive-stale' | 'refresh' | 'build-icerik' | 'build-kaynak-sayi' | 'build-ozet' | 'done' | 'error';
let currentStage: Stage = 'idle';

type CycleStatus = {
  stage: Stage;
  startedAt: string;
  finishedAt: string | null;
  rssRead: number | null;          // kaç RSS kaynağı okundu (RSS refresh)
  duplicatesFound: number | null;  // 2+ kaynaklı farklı haber sayısı
  summariesDone: number | null;    // tamamlanan AI özet sayısı
  publishedCount: number | null;   // yayınlanan haber sayısı (publish sonrası)
  error: string | null;
};

async function writeStatus(s: Partial<CycleStatus>): Promise<void> {
  try {
    // Önce mevcut status'u oku, sonra merge et
    let current: CycleStatus | null = null;
    try {
      const raw = await readFile(STATUS_FILE, 'utf8');
      current = JSON.parse(raw) as CycleStatus;
    } catch {
      // Dosya yok veya parse edilemiyor — boş current ile devam et
    }
    const merged: CycleStatus = {
      stage: s.stage ?? current?.stage ?? 'idle',
      startedAt: s.startedAt ?? current?.startedAt ?? new Date().toISOString(),
      finishedAt: s.finishedAt ?? current?.finishedAt ?? null,
      rssRead: s.rssRead !== undefined ? s.rssRead : (current?.rssRead ?? null),
      duplicatesFound: s.duplicatesFound !== undefined ? s.duplicatesFound : (current?.duplicatesFound ?? null),
      summariesDone: s.summariesDone !== undefined ? s.summariesDone : (current?.summariesDone ?? null),
      publishedCount: s.publishedCount !== undefined ? s.publishedCount : (current?.publishedCount ?? null),
      error: s.error ?? current?.error ?? null,
    };
    await writeFile(STATUS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    // Status yazma başarısız olsa da pipeline'a devam et
  }
}

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

  // Cycle başlamadan önce status dosyasını sıfırla
  await writeStatus({
    stage: 'archive-stale',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    rssRead: 0,
    duplicatesFound: 0,
    summariesDone: 0,
    publishedCount: null,
    error: null,
  });

  // 1. Cancel drafts: önceki cycle'dan kalan, yetişmeyen draft'ları sil
  //    (yeni cycle başlıyor, eski yarı kalmış özetler iptal)
  //    Not: published'ları stale yapmıyoruz — eski haberler published olarak kalır,
  //    sadece yeni RSS'leri işliyoruz. Bu, AI'ı boğmamak için — cycle kısa sürer.
  currentStage = 'archive-stale';
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

  // 2. RSS refresh — kaç kaynak okundu sayısını stdout'tan parse et
  currentStage = 'refresh';
  await writeStatus({ stage: 'refresh' });
  {
    const r = await runStep('RSS refresh', 'bun run scripts/trigger-refresh.ts');
    // trigger-refresh.ts output: "İşlenen kaynak: 23"
    const m = r.stdout.match(/İşlenen kaynak:\s*(\d+)/);
    const rssRead = m ? parseInt(m[1], 10) : 0;
    await writeStatus({ rssRead });
  }

  // 3. build rss_icerik.md
  currentStage = 'build-icerik';
  await writeStatus({ stage: 'build-icerik' });
  await runStep('rss_icerik.md', 'bun run scripts/build-rss-icerik.ts');

  // 4. find-duplicate-news — kaç farklı haber grubu olduğunu stdout'tan parse et
  currentStage = 'build-kaynak-sayi';
  await writeStatus({ stage: 'build-kaynak-sayi' });
  {
    const r = await runStep('rss_kaynak_sayi.md', 'python3 scripts/find-duplicate-news.py');
    // find-duplicate-news.py output'u muhtemelen farklı formatlarda olabilir;
    // "X farklı haber grubu bulundu" gibi satırı arayalım, olmazsa
    // rss_kaynak_sayi.md dosyasından grup sayısını sayalım.
    let dupCount = 0;
    const m = r.stdout.match(/(\d+)\s*(?:farklı\s*)?(?:haber\s*)?(?:grup|kayıt)/i);
    if (m) dupCount = parseInt(m[1], 10);
    else {
      // rss_kaynak_sayi.md dosyasından "##" başlıklarını say
      try {
        const content = await readFile(`${process.cwd()}/download/rss_kaynak_sayi.md`, 'utf8');
        dupCount = (content.match(/^##\s/gm) ?? []).length;
      } catch { /* ignore */ }
    }
    await writeStatus({ duplicatesFound: dupCount });
  }

  // 5. build-rss-ozet (incremental + auto-publish her 3 draft'ta bir)
  //    — kaç özet tamamlandı + kaç yayınlandı sayısını stdout'tan parse et
  //    Sadece yeni grupları özetler (existingHashes check). AI'ı boğmamak için
  //    aralarda 15 sn bekleme var (build-rss-ozet.ts içinde).
  currentStage = 'build-ozet';
  await writeStatus({ stage: 'build-ozet' });
  {
    const r = await runStep('rss_ozet.md (AI paraphrase + auto-publish)', 'bun run scripts/build-rss-ozet.ts');
    // build-rss-ozet.ts output: "X yeni AI özet, Y stale→published, Z atlandı, ..."
    // "Özetleme tamam: 8 yeni AI özet, ..."
    const summaryMatch = r.stdout.match(/(\d+)\s*yeni\s*AI\s*özet/i);
    const summariesDone = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;
    await writeStatus({ summariesDone });
  }

  // 6. Max 30 per category — kategori bazında 30'u aşanları en eskiden sil
  //    Not: artık stale yapmadığımız için restore adımı yok — published kalır.
  const MAX_PER_CATEGORY = 30;
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
          log(`  ✓ Max 30 [${cat}]: ${r.count} en eski haber silindi (${catCount} → ${catCount - r.count})`);
        }
      }
    } catch (e) {
      log(`  ✗ Max 30 [${cat}] hatası: ${(e as Error).message}`);
    }
  }

  // 7. Max 50 total published — toplam 50'yi aşarsa en eskileri sil
  //    (şişme olmasın — kullanıcı "yarım saat birikiyor" dedi)
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
    // Final published count
    const finalPublished = await db.publishedArticle.count({ where: { status: 'published' } });
    await writeStatus({ publishedCount: finalPublished });
  } catch (e) {
    log(`  ✗ Max 50 (total) hatası: ${(e as Error).message}`);
  }

  currentStage = 'idle';
  await writeStatus({ stage: 'done', finishedAt: new Date().toISOString() });
  log(`=== Cycle tamam ===`);
}

// Export ediyoruz ki API routeundan da çağrılabilsin.
export { runCycle };

async function tick(): Promise<void> {
  const now = new Date();
  const minute = now.getMinutes();

  // Cycle her 10 dakikada bir başlar (minute % 10 === 0): 00, 10, 20, 30, 40, 50
  if (minute % 10 === 0) {
    if (currentStage !== 'idle') {
      log(`Tick skipped (stage: ${currentStage}) — önceki cycle hala çalışıyor`);
      return;
    }
    await runCycle();
  }
}

async function main() {
  const isOnce = process.argv.includes('--once');

  if (isOnce) {
    log(`Tek seferlik cycle başlatılıyor (manuel tetikleme)…`);
    await runCycle();
    await db.$disconnect();
    process.exit(0);
  }

  log(`Pipeline cron başlatıldı. PID: ${process.pid}`);
  log(`Saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  log(`Tetikleme saatleri:`);
  log(`  • :00 — cycle başlat (RSS refresh + pipeline + her 3 draft'ta bir publish)`);
  log(`  • :30 — yeni cycle`);
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

// Sadece bu dosya doğrudan çalıştırıldığında (bun run scripts/pipeline-cron.ts)
// main() çağrılsın. Import edildiğinde (örn. API route) main otomatik çağrılmasın.
const isMain = (() => {
  const arg0 = process.argv[1] ?? '';
  return arg0.endsWith('pipeline-cron.ts') || arg0.endsWith('pipeline-cron');
})();

if (isMain) {
  main().catch((e) => {
    console.error('Cron hatası:', e);
    process.exit(1);
  });
}
