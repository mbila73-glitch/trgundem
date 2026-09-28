import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
  return NextResponse.json({ article });
}
