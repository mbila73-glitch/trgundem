import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// PATCH /api/admin/published/[id] — edit article (title, summary, image)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const data = body as { aiTitle?: string; aiSummary?: string; imageUrl?: string | null };
  const update: Record<string, unknown> = {};
  if (typeof data.aiTitle === 'string') update.aiTitle = data.aiTitle.trim();
  if (typeof data.aiSummary === 'string') update.aiSummary = data.aiSummary.trim();
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl;
  try {
    const r = await db.publishedArticle.update({ where: { id }, data: update });
    return NextResponse.json({ ok: true, article: r });
  } catch { return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 }); }
}

// DELETE /api/admin/published/[id] — delete published article
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const { id } = await params;
  try {
    await db.publishedArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 }); }
}
