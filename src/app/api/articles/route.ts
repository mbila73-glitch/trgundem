import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeArticles } from '@/lib/format';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? 30), 100);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);
  const sourceId = sp.get('sourceId');
  const category = sp.get('category');
  const q = sp.get('q')?.trim();
  const onlySummarized = sp.get('onlySummarized') === '1';
  const featured = sp.get('featured');

  const where: {
    sourceId?: string;
    category?: string;
    summary?: null | { not: null };
    isFeatured?: boolean;
    OR?: Array<{
      title?: { contains: string };
      description?: { contains: string };
      content?: { contains: string };
    }>;
  } = {};
  if (sourceId) where.sourceId = sourceId;
  if (category) where.category = category;
  if (onlySummarized) where.summary = { not: null };
  if (featured === 'true') where.isFeatured = true;
  else if (featured === 'false') where.isFeatured = false;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { content: { contains: q } },
    ];
  }

  const [articles, total] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        source: { select: { id: true, name: true, category: true } },
      },
    }),
    db.article.count({ where }),
  ]);

  return NextResponse.json({ articles: sanitizeArticles(articles), total, limit, offset });
}
