import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { db } from '@/lib/db';

const FILE_PATH = path.join(process.cwd(), 'download', 'rss_icerik.md');

// GET /api/icerik              -> serve the markdown file as plain text
// GET /api/icerik?format=json  -> return stats + first 8 KB preview
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format');

  if (!existsSync(FILE_PATH)) {
    return NextResponse.json(
      { error: 'Dosya henüz oluşturulmadı' },
      { status: 404 },
    );
  }

  if (format === 'json') {
    const stat = statSync(FILE_PATH);
    const content = readFileSync(FILE_PATH, 'utf-8');
    const totalArticles = await db.article.count();
    const totalSources = await db.source.count();
    const summarizedCount = await db.article.count({
      where: { summary: { not: null } },
    });
    const preview = content.slice(0, 8 * 1024);
    return NextResponse.json({
      ok: true,
      path: 'download/rss_icerik.md',
      sizeBytes: stat.size,
      sizeKb: Math.round((stat.size / 1024) * 10) / 10,
      lastModified: stat.mtime,
      lineCount: content.split('\n').length,
      totalArticles,
      totalSources,
      summarizedCount,
      preview,
    });
  }

  // Default: serve as text/markdown for direct download
  const content = readFileSync(FILE_PATH, 'utf-8');
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rss_icerik.md"',
      'Cache-Control': 'no-store',
    },
  });
}

// POST /api/icerik
//   body: { summarize?: boolean, limit?: number }
//   - summarize=true  -> run summarize-batch script then rebuild file
//   - summarize=false (default) -> rebuild file only
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const data = body as { summarize?: boolean; limit?: number };

  const scriptName = data.summarize
    ? 'summarize-batch.ts'
    : 'build-rss-icerik.ts';
  const scriptPath = path.join(process.cwd(), 'scripts', scriptName);

  let args: string[] = [];
  if (data.summarize && typeof data.limit === 'number') {
    args = [String(data.limit)];
  }

  // Spawn detached child so dev server stays responsive
  const cmd = args.length > 0 ? ['run', scriptPath, ...args] : ['run', scriptPath];
  const child = spawn('setsid', ['bash', '-c', `exec bun ${cmd.join(' ')}`], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();

  return NextResponse.json(
    {
      ok: true,
      message: data.summarize
        ? `Arka planda AI özetleme + dosya yeniden oluşturma başlatıldı (limit: ${data.limit ?? 150})`
        : 'Arka planda dosya yeniden oluşturma başlatıldı',
      childPid: child.pid,
    },
    { status: 202 },
  );
}
