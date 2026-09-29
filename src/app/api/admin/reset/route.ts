import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

// POST /api/admin/reset — delete ALL content and restart pipeline
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  try {
    // 1. Delete all PublishedArticle records
    const publishedDeleted = await db.publishedArticle.deleteMany({});

    // 2. Delete all Article records
    const articlesDeleted = await db.article.deleteMany({});

    // 3. Delete all ReaderMessage records
    const messagesDeleted = await db.readerMessage.deleteMany({});

    // 4. Delete output files (rss_icerik.md, rss_kaynak_sayi.md, rss_ozet.md)
    const fs = await import('node:fs');
    const downloadDir = resolve(process.cwd(), 'download');
    for (const f of ['rss_icerik.md', 'rss_ozet.md', 'rss_kaynak_sayi.md']) {
      try {
        fs.unlinkSync(resolve(downloadDir, f));
      } catch {
        // file may not exist, ignore
      }
    }

    // 5. Spawn the full pipeline in background (RSS refresh + build + AI summarize)
    const scriptPath = resolve(process.cwd(), 'scripts/trigger-refresh.ts');
    const child = spawn(
      'setsid',
      ['bash', '-c', `exec bun run ${scriptPath}`],
      { detached: true, stdio: 'ignore', cwd: process.cwd() },
    );
    child.unref();

    return NextResponse.json({
      ok: true,
      deleted: {
        publishedArticles: publishedDeleted.count,
        articles: articlesDeleted.count,
        readerMessages: messagesDeleted.count,
      },
      pipelineStarted: true,
      message: 'Tüm içerik silindi, RSS yenileme başlatıldı',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sıfırlama hatası' },
      { status: 500 },
    );
  }
}
