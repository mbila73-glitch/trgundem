// Pipeline çalışma geçmişi — Admin panel "Akış Kontrol" sekmesi için
// GET /api/admin/pipeline-history
//   → /var/www/pipeline-history.log (ya da process.cwd()/pipeline-history.log) dosyasını okur
//   → Son 24 saatteki pipeline cycle'larını döner
//   → Her cycle: { ts, startedAt, finishedAt, durationMs, rssRead, duplicatesFound, summariesDone, publishedCount, error }
//
// Pipeline script (scripts/pipeline-all.js) her cycle'ın başlangıç ve bitişinde
// JSON-line formatında bu dosyaya yazar (append-only, truncate edilmez).

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const HISTORY_FILE = path.join(process.cwd(), 'pipeline-history.log');
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 saat

// Admin auth — admin token kontrolü
function checkAuth(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === process.env.ADMIN_PASSWORD;
  } catch { return false; }
}

type HistoryEntry = {
  ts: string;
  event: 'start' | 'done' | 'error';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  rssRead?: number | null;
  duplicatesFound?: number | null;
  summariesDone?: number | null;
  publishedCount?: number | null;
  error?: string | null;
};

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  if (!existsSync(HISTORY_FILE)) {
    return NextResponse.json({
      ok: true,
      runs: [],
      summary: { totalRuns: 0, successCount: 0, errorCount: 0, totalNewArticles: 0, avgDurationMs: 0, periodHours: 24 },
      message: 'Henüz pipeline çalışma geçmişi yok (history log dosyası yok). Pipeline bir kez çalıştığında burada görünmeye başlayacak.',
    });
  }

  let raw: string;
  try {
    raw = await readFile(HISTORY_FILE, 'utf8');
  } catch (e) {
    return NextResponse.json({
      ok: true,
      runs: [],
      summary: { totalRuns: 0, successCount: 0, errorCount: 0, totalNewArticles: 0, avgDurationMs: 0, periodHours: 24 },
      message: 'History log okunamadı: ' + (e instanceof Error ? e.message : String(e)),
    });
  }

  // JSON-Line formatinda — her satir bir kayit
  const lines = raw.split('\n').filter(Boolean);
  const entries: HistoryEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as HistoryEntry;
      if (entry && entry.event && entry.ts) {
        entries.push(entry);
      }
    } catch {
      // bozuk satir, atla
    }
  }

  // Son 24 saati filtrele
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const recent = entries.filter(e => new Date(e.ts).getTime() >= cutoff);

  // start + done/error ciftlerini birlestir — her cycle icin tek kayit
  const cyclesByStartedAt = new Map<string, HistoryEntry>();
  for (const e of recent) {
    if (e.event === 'start' && e.startedAt) {
      cyclesByStartedAt.set(e.startedAt, { ...e });
    }
  }
  // Done/error event'lerini eslestir
  for (const e of recent) {
    if ((e.event === 'done' || e.event === 'error') && e.startedAt) {
      const startEntry = cyclesByStartedAt.get(e.startedAt);
      if (startEntry) {
        cyclesByStartedAt.set(e.startedAt, { ...startEntry, ...e });
      } else {
        cyclesByStartedAt.set(e.startedAt, { ...e });
      }
    }
  }

  // Sadece done/error olanlari al (start var ama done olmamis = henuz calisiyor, gosterme)
  // User: "Gerceklesmediyse gosterme" — yani sadece tamamlanmis cycle'lar
  const completedCycles = Array.from(cyclesByStartedAt.values())
    .filter(e => e.event === 'done' || e.event === 'error')
    .sort((a, b) => {
      const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : new Date(a.ts).getTime();
      const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : new Date(b.ts).getTime();
      return bTime - aTime;
    });

  const totalRuns = completedCycles.length;
  const successCount = completedCycles.filter(e => e.event === 'done').length;
  const errorCount = completedCycles.filter(e => e.event === 'error').length;
  const totalNewArticles = completedCycles.reduce((sum, e) => sum + (e.publishedCount || 0), 0);
  const avgDurationMs = totalRuns > 0
    ? Math.round(completedCycles.reduce((sum, e) => sum + (e.durationMs || 0), 0) / totalRuns)
    : 0;

  return NextResponse.json({
    ok: true,
    runs: completedCycles,
    summary: {
      totalRuns,
      successCount,
      errorCount,
      totalNewArticles,
      avgDurationMs,
      periodHours: 24,
    },
  });
}
