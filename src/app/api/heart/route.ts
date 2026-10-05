import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Okuyucu IP'si al — Nginx X-Forwarded-For/X-Real-IP/CF-Connecting-IP
function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return 'bilinmiyor';
}

// GET /api/heart?articleId=X
// Okuyucunun gördüğü toplam kalp sayısı = initialHearts + clickHearts
// userLiked = IP bu makaleyi daha önce beğenmiş mi
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const articleId = sp.get('articleId');
  if (!articleId) {
    return NextResponse.json({ error: 'articleId gerekli' }, { status: 400 });
  }
  const ip = getClientIp(req);

  try {
    const article = await db.publishedArticle.findUnique({
      where: { id: articleId },
      select: { initialHearts: true, clickHearts: true },
    });
    if (!article) {
      return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 });
    }

    const heartLog = await db.heartLog.findUnique({
      where: { articleId_ip: { articleId, ip } },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      hearts: article.initialHearts + article.clickHearts, // toplam (okuyucu görür)
      userLiked: Boolean(heartLog),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sunucu hatası' },
      { status: 500 },
    );
  }
}

// POST /api/heart
// body: { articleId }
// IP başına 1 kez beğenme — toggle
// Sadece clickHearts artırılır/azaltılır (initialHearts değişmez)
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const { articleId } = body as { articleId?: string };
  if (!articleId) {
    return NextResponse.json({ error: 'articleId gerekli' }, { status: 400 });
  }
  const ip = getClientIp(req);

  try {
    const existing = await db.heartLog.findUnique({
      where: { articleId_ip: { articleId, ip } },
    });

    if (existing) {
      // Beğeniyi geri al — clickHearts -1
      await db.$transaction([
        db.heartLog.delete({ where: { id: existing.id } }),
        db.publishedArticle.update({
          where: { id: articleId },
          data: { clickHearts: { decrement: 1 } },
        }),
      ]);
      const updated = await db.publishedArticle.findUnique({
        where: { id: articleId },
        select: { initialHearts: true, clickHearts: true },
      });
      const total = Math.max(0, (updated?.clickHearts ?? 0)) + (updated?.initialHearts ?? 0);
      return NextResponse.json({
        ok: true,
        hearts: total,
        userLiked: false,
      });
    }

    // Yeni beğeni — clickHearts + 1
    await db.$transaction([
      db.heartLog.create({ data: { articleId, ip } }),
      db.publishedArticle.update({
        where: { id: articleId },
        data: { clickHearts: { increment: 1 } },
      }),
    ]);
    const updated = await db.publishedArticle.findUnique({
      where: { id: articleId },
      select: { initialHearts: true, clickHearts: true },
    });
    return NextResponse.json({
      ok: true,
      hearts: (updated?.initialHearts ?? 0) + (updated?.clickHearts ?? 0),
      userLiked: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sunucu hatası' },
      { status: 500 },
    );
  }
}
