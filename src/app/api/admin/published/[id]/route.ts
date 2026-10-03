import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// PATCH /api/admin/published/[id] — edit article OR restore from archive OR pending_review decision
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const data = body as { aiTitle?: string; aiSummary?: string; imageUrl?: string | null; status?: string; archiveOld?: boolean };
  const update: Record<string, unknown> = {};
  if (typeof data.aiTitle === 'string') update.aiTitle = data.aiTitle.trim();
  if (typeof data.aiSummary === 'string') update.aiSummary = data.aiSummary.trim();
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl;

  // Pending → Published: pending_review → published (yeni yayınla)
  if (data.status === 'published') {
    update.status = 'published';
    update.archivedAt = null;
    update.publishedAt = new Date();

    // Eğer "archiveOld: true" gelirse, bu pending haberi yayınlarken
    // aynı başlığa sahip eski published'ı ARŞİVE taşı (manuel onay: "Yayınla ve Eskiyi Arşive")
    if (data.archiveOld) {
      // Aynı başlığa sahip, şu an published olan haberleri bul (pending olan hariç)
      const pending = await db.publishedArticle.findUnique({ where: { id }, select: { aiTitle: true, category: true } });
      if (pending) {
        const oldPublished = await db.publishedArticle.findMany({
          where: {
            status: 'published',
            aiTitle: pending.aiTitle,
            NOT: { id },
          },
          select: { id: true },
        });
        for (const old of oldPublished) {
          await db.publishedArticle.update({
            where: { id: old.id },
            data: { status: 'archived', archivedAt: new Date() },
          });
        }
      }
    }
  }

  // Pending → Archived: pending_review → archived (manuel ret)
  if (data.status === 'archived') {
    update.status = 'archived';
    update.archivedAt = new Date();
  }

  try {
    const r = await db.publishedArticle.update({ where: { id }, data: update });
    return NextResponse.json({ ok: true, article: r });
  } catch { return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 }); }
}

// DELETE /api/admin/published/[id] — haberi "arşive" al (hard delete değil).
// Artık admin panelinden silinen tüm haberler Arşiv sekmesinde görünür.
// status: 'published' → 'archived', archivedAt: now() olarak işaretlenir.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Geçersiz ID' }, { status: 400 });
  try {
    // Önce kayıt var mı kontrol et (daha iyi hata mesajı için)
    const existing = await db.publishedArticle.findUnique({ where: { id }, select: { id: true, status: true, aiTitle: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Haber bulunamadı', id }, { status: 404 });
    }
    // Status zaten archived ise tekrar archived yapma (idempotent)
    if (existing.status === 'archived') {
      return NextResponse.json({ ok: true, archived: existing, message: 'Haber zaten arşivde' });
    }
    const r = await db.publishedArticle.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    return NextResponse.json({ ok: true, archived: r });
  } catch (e) {
    // Hatanın gerçek sebebini logla — eski kod hatayı yutuyordu
    console.error('[DELETE /api/admin/published] Hata:', e);
    return NextResponse.json(
      { error: 'Sunucu hatası', detail: (e as Error).message, id },
      { status: 500 },
    );
  }
}
