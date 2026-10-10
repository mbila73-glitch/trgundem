import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

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

// POST /api/admin/reset — delete ALL content, clear logs, restart full pipeline
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

    // 4. Delete output files (rss_icerik.md, rss_ozet.md, rss_kaynak_sayi.md)
    const fs = await import('node:fs');
    const downloadDir = resolve(process.cwd(), 'download');
    for (const f of ['rss_icerik.md', 'rss_ozet.md', 'rss_kaynak_sayi.md']) {
      try {
        fs.unlinkSync(resolve(downloadDir, f));
      } catch {
        // file may not exist, ignore
      }
    }

    // 4b. Akış ekranını + log dosyalarını da temizle
    // User: "akış ekranını ve tüm makaleleri temizleyelim. siteyi sıfırlayınca akışlar sıfırlanmıyor"
    // pipeline-history.log → Akış Kontrol sekmesinin verisi (append-only, truncate)
    // pipeline-once.log + pipeline-spawn.log → cycle logları (truncate)
    // pipeline-status.json → status dosyası (sil, yeniden oluşturulur)
    const ROOT = existsSync('/var/www/package.json') ? '/var/www' : process.cwd();
    for (const f of ['pipeline-history.log', 'pipeline-once.log', 'pipeline-spawn.log']) {
      try {
        fs.writeFileSync(join(ROOT, f), '', 'utf8'); // truncate (içini boşalt)
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(join(ROOT, 'pipeline-status.json'));
    } catch {
      // ignore
    }

    // 5. Spawn the FULL pipeline in background (RSS + AI özet + Clear + AI Düzenle)
    // Önceki: sadece trigger-refresh.ts çağırıyordu (sadece RSS çeker, AI özet ÜRETMEZ)
    // User: "siteyi sıfırlayınca haberler düzelmemiş" — Reset sonrası tam pipeline lazım
    const scriptPath = resolve(process.cwd(), 'scripts/pipeline-all.js');
    const child = spawn(
      'setsid',
      ['bash', '-c', `exec node --expose-gc ${scriptPath} --once`],
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
      logsCleared: ['pipeline-history.log', 'pipeline-once.log', 'pipeline-spawn.log', 'pipeline-status.json'],
      pipelineStarted: true,
      message: 'Tüm içerik + akış geçmişi temizlendi, tam pipeline başlatıldı (RSS + AI özet + Clear + Düzenle)',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sıfırlama hatası' },
      { status: 500 },
    );
  }
}
