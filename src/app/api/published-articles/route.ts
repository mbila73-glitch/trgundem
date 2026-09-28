import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/published-articles
//   ?category=Güncel           -> filter by category
//   ?limit=20&offset=0          -> pagination
//   ?status=draft|published     -> default: published (only "ready" articles)
//   ?layout=all                 -> "Tüm Haberler" layout: per-category quotas
//                                 (Güncel 6, Kamu 4, Ekonomi 4, Spor 3, Bilim 2, Kültür 1) = 20
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const layout = sp.get('layout');
  const status = sp.get('status') ?? 'published';

  if (layout === 'all') {
    // Tüm Haberler: 6 + 4 + 4 + 3 + 2 + 1 = 20 haber
    const quotas: Record<string, number> = {
      'Güncel': 6,
      'Kamu / Resmi': 4,
      'Ekonomi / Finans': 4,
      'Spor / Magazin': 3,
      'Bilim / Teknoloji': 2,
      'Kültür / Sanat': 1,
    };
    const result = await Promise.all(
      Object.entries(quotas).map(async ([cat, limit]) => {
        const items = await db.publishedArticle.findMany({
          where: { category: cat, status },
          orderBy: { latestPublishedAt: 'desc' },
          take: limit,
        });
        return items;
      }),
    );
    const all = result.flat();
    all.sort(
      (a, b) =>
        b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime(),
    );
    return NextResponse.json({ articles: all, total: all.length });
  }

  const limit = Math.min(Number(sp.get('limit') ?? 30), 100);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);
  const category = sp.get('category');

  const where: { category?: string; status: string } = { status };
  if (category) where.category = category;

  const [articles, total] = await Promise.all([
    db.publishedArticle.findMany({
      where,
      orderBy: { latestPublishedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.publishedArticle.count({ where }),
  ]);

  return NextResponse.json({ articles, total, limit, offset });
}

// POST /api/published-articles
//   ?action=publish-drafts  -> promote all drafts to published (and archive the previously-published)
//   ?action=rebuild         -> trigger the build-rss-ozet.ts script in background
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');

  if (action === 'publish-drafts') {
    // Archive previously published articles
    await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'archived' },
    });
    // Promote drafts to published (with publishedAt timestamp)
    const r = await db.publishedArticle.updateMany({
      where: { status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
    });
    return NextResponse.json({ promoted: r.count });
  }

  if (action === 'rebuild') {
    const { spawn } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const scriptPath = resolve(process.cwd(), 'scripts/build-rss-ozet.ts');
    const child = spawn(
      'setsid',
      ['bash', '-c', `exec bun run ${scriptPath}`],
      { detached: true, stdio: 'ignore', cwd: process.cwd() },
    );
    child.unref();
    return NextResponse.json(
      { ok: true, message: 'Arka planda rss_ozet rebuild başlatıldı', childPid: child.pid },
      { status: 202 },
    );
  }

  return NextResponse.json(
    { error: 'Geçersiz action. Kullanım: ?action=publish-drafts veya ?action=rebuild' },
    { status: 400 },
  );
}
