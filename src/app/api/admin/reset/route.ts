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

// POST /api/admin/reset — selective delete + clear logs + restart pipeline
// Body: { resetArticles?: boolean (default true), resetArchive?: boolean (default true) }
// User: "makaleleri de sıfırla ve arşivi de sıfırla diye 2 kutu olsun seçmezsem sıfırlanmasın"
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  // Parse body — checkbox değerleri (default false — seçilmezse silinmez)
  let resetArticles = false;
  let resetArchive = false;
  let resetMessages = false;
  try {
    const body = await req.json() as { resetArticles?: boolean; resetArchive?: boolean; resetMessages?: boolean };
    if (body.resetArticles === true) resetArticles = true;
    if (body.resetArchive === true) resetArchive = true;
    if (body.resetMessages === true) resetMessages = true;
  } catch {
    // body yoksa hepsi false
  }

  try {
    let publishedDeleted = { count: 0 };
    let archivedDeleted = { count: 0 };

    // 1a. Makaleleri sıfırla (published + draft) — checkbox seçili ise
    if (resetArticles) {
      publishedDeleted = await db.publishedArticle.deleteMany({
        where: { status: { in: ['published', 'draft', 'pending_review'] } },
      });
    }

    // 1b. Arşivi sıfırla (archived + duplicate) — checkbox seçili ise
    if (resetArchive) {
      archivedDeleted = await db.publishedArticle.deleteMany({
        where: { status: { in: ['archived', 'duplicate'] } },
      });
    }

    // 2. Delete all Article records (raw RSS items) — her zaman sil
    const articlesDeleted = await db.article.deleteMany({});

    // 3. Delete ReaderMessage records — sadece checkbox seçiliyse
    let messagesDeleted = { count: 0 };
    if (resetMessages) {
      messagesDeleted = await db.readerMessage.deleteMany({});
    }

    // 4. Delete output files
    const fs = await import('node:fs');
    const downloadDir = resolve(process.cwd(), 'download');
    for (const f of ['rss_icerik.md', 'rss_ozet.md', 'rss_kaynak_sayi.md']) {
      try {
        fs.unlinkSync(resolve(downloadDir, f));
      } catch {
        // file may not exist, ignore
      }
    }

    // 4b. Akış ekranını + log dosyalarını temizle
    const ROOT = existsSync('/var/www/package.json') ? '/var/www' : process.cwd();
    for (const f of ['pipeline-history.log', 'pipeline-once.log', 'pipeline-spawn.log']) {
      try {
        fs.writeFileSync(join(ROOT, f), '', 'utf8');
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(join(ROOT, 'pipeline-status.json'));
    } catch {
      // ignore
    }

    // 5. Spawn pipeline in background (sadece makaleler sıfırlandıysa — yeni makale üretsin)
    let pipelineStarted = false;
    if (resetArticles) {
      const scriptPath = resolve(process.cwd(), 'scripts/pipeline-all.js');
      const child = spawn(
        'setsid',
        ['bash', '-c', `exec node --expose-gc ${scriptPath} --once`],
        { detached: true, stdio: 'ignore', cwd: process.cwd() },
      );
      child.unref();
      pipelineStarted = true;
    }

    const parts: string[] = [];
    if (resetArticles) parts.push(`${publishedDeleted.count} makale`);
    if (resetArchive) parts.push(`${archivedDeleted.count} arşiv`);
    parts.push(`${articlesDeleted.count} RSS kaydı`);
    parts.push(`${messagesDeleted.count} mesaj`);

    return NextResponse.json({
      ok: true,
      deleted: {
        publishedArticles: publishedDeleted.count,
        archivedArticles: archivedDeleted.count,
        articles: articlesDeleted.count,
        readerMessages: messagesDeleted.count,
      },
      options: { resetArticles, resetArchive },
      logsCleared: ['pipeline-history.log', 'pipeline-once.log', 'pipeline-spawn.log', 'pipeline-status.json'],
      pipelineStarted,
      message: parts.join(', ') + ' silindi' + (pipelineStarted ? ', pipeline başlatıldı' : ', pipeline başlatılmadı (makaleler korundu)'),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sıfırlama hatası' },
      { status: 500 },
    );
  }
}
