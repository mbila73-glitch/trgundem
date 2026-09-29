import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/published-articles
//   ?category=Güncel           -> filter by category
//   ?limit=20&offset=0          -> pagination
//   ?status=draft|published     -> default: published
//   ?layout=all                 -> "Tüm Haberler" layout: per-category quotas
//                                 (Güncel 10, Kamu 5, Ekonomi 5, Spor 4, Bilim 3, Kültür 3) = 30
//   ?layout=all&offset=30&limit=20 -> "Diğer Haberler" (ikinci batch, kategorisiz, en yeni)
//                                    toplam max 50 haber
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const layout = sp.get('layout');
  const status = sp.get('status') ?? 'published';

  if (layout === 'all') {
    const offset = Number(sp.get('offset') ?? 0);

    if (offset === 0) {
      // İlk batch: Özel haberler en üstte, sonra kategori kotalı haberler
      // Önce Özel kategoriyi al (limit 5)
      const ozelItems = await db.publishedArticle.findMany({
        where: { category: 'Özel', status },
        orderBy: { latestPublishedAt: 'desc' },
        take: 5,
      });

      const quotas: Record<string, number> = {
        'Güncel': 10,
        'Kamu / Resmi': 5,
        'Ekonomi / Finans': 5,
        'Spor / Magazin': 4,
        'Bilim / Teknoloji': 3,
        'Kültür / Sanat': 3,
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
      // Özel haberler en başa, sonra diğer kategoriler latestPublishedAt DESC sıralı
      const otherArticles = result.flat().sort(
        (a, b) => b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime(),
      );
      const all = [...ozelItems, ...otherArticles];
      const totalPublished = await db.publishedArticle.count({ where: { status } });
      return NextResponse.json({
        articles: all,
        total: all.length,
        totalPublished,
        hasMore: totalPublished > all.length,
      });
    }

    // İkinci batch ("Diğer Haberler"): kategorisiz, en yeni kalanlar
    const limit = Math.min(Number(sp.get('limit') ?? 20), 20);
    const articles = await db.publishedArticle.findMany({
      where: { status },
      orderBy: { latestPublishedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const totalPublished = await db.publishedArticle.count({ where: { status } });
    return NextResponse.json({
      articles,
      total: articles.length,
      totalPublished,
      hasMore: offset + articles.length < totalPublished,
    });
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
//   ?action=publish-drafts  -> promote all drafts to published
//   ?action=rebuild         -> trigger the build-rss-ozet.ts script in background
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');

  if (action === 'publish-drafts') {
    await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'archived' },
    });
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
