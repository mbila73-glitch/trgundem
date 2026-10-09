import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/articles/[id]  body: { isFeatured?: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 });
  }
  const data = body as { isFeatured?: boolean };

  if (typeof data.isFeatured !== 'boolean') {
    return NextResponse.json(
      { error: 'isFeatured boolean olmalı' },
      { status: 400 },
    );
  }

  try {
    const updated = await db.article.update({
      where: { id },
      data: { isFeatured: data.isFeatured },
      select: { id: true, isFeatured: true },
    });
    return NextResponse.json({ article: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = await db.article.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, category: true } },
    },
  });
  if (!article) {
    return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 });
  }
  // sanitize: sourceArticleIds + source alanlarını kaldır, imageUrl'yi proxy'ye çevir
  const { sourceArticleIds: _ignored, source: _srcIgnored, ...publicArticle } = article as any;
  const sanitized = publicArticle as any;
  if (sanitized.imageUrl && typeof sanitized.imageUrl === 'string' && sanitized.imageUrl.startsWith('http')) {
    sanitized.imageUrl = `/api/img?url=${encodeURIComponent(sanitized.imageUrl)}`;
  }
  return NextResponse.json({ article: sanitized });
}
