// Pipeline cycle status — Restart sekmesinde canlı bilgi göstermek için.
//
// GET /api/pipeline/status
//   → pipeline-status.json dosyasını okur ve frontend'e döner.
//     Frontend Restart sekmesinde her 2 saniyede polling yapar:
//       - stage: hangi aşamada (idle/refresh/build-icerik/build-kaynak-sayi/build-ozet/done/error)
//       - rssRead: kaç RSS kaynağı okundu
//       - duplicatesFound: 2+ kaynaklı kaç farklı haber bulundu
//       - summariesDone: kaç özet tamamlandı
//       - publishedCount: kaç haber yayınlandı
//       - startedAt, finishedAt, error

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// KRİTİK: Production'da Next.js standalone server'ın cwd'i /var/www/.next/standalone/
// olabilir. Pipeline script ise /var/www/pipeline-status.json'a yazar.
// Bu yüzden önce /var/www/'yu dene, sonra cwd fallback (local dev için).
const HARDCODED_PATH = '/var/www/pipeline-status.json';
const STATUS_FILE = existsSync(HARDCODED_PATH) ? HARDCODED_PATH : path.join(process.cwd(), 'pipeline-status.json');

type CycleStatus = {
  stage: string;
  startedAt: string | null;
  finishedAt: string | null;
  rssRead: number | null;
  duplicatesFound: number | null;
  summariesDone: number | null;
  publishedCount: number | null;
  error: string | null;
};

export async function GET() {
  if (!existsSync(STATUS_FILE)) {
    return NextResponse.json({
      ok: true,
      stage: 'idle',
      message: 'Henüz cycle çalıştırılmadı. Restart ile başlatın.',
      startedAt: null,
      finishedAt: null,
      rssRead: null,
      duplicatesFound: null,
      summariesDone: null,
      publishedCount: null,
      error: null,
    } satisfies CycleStatus & { ok: boolean; message: string });
  }

  try {
    const raw = await readFile(STATUS_FILE, 'utf8');
    const status = JSON.parse(raw) as CycleStatus;
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
