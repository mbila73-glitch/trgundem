import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch { return false; }
}

// GET /api/admin/archived — arşive alınmış haberleri listeler.
// Sadece status='archived' olanları döndürür.
// Varsayılan: SON 24 SAAT (yönetici panelinin Arşiv sekmesi için)
//   ?all=true — TÜM arşiv kayıtları (delil amaçlı, sadece bu parametreyle)
//
// Yönetici panelinin Arşiv sekmesi varsayılan çağrı yapar (son 24 saat).
// Eski kayıtlar DB'de durur (delil) ama UI'da gösterilmez — istenirse
// "Eski Arşivleri Dışa Aktar" ile gzip JSON dosyasına sıkıştırılır.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const url = new URL(req.url);
  const showAll = url.searchParams.get('all') === 'true';

  // Varsayılan: son 24 saat — ?all=true ise tümü
  const where: { status: string; archivedAt?: { gte: Date } } = { status: 'archived' };
  if (!showAll) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 saat önce
    where.archivedAt = { gte: cutoff };
  }

  const articles = await db.publishedArticle.findMany({
    where,
    orderBy: { archivedAt: 'desc' }, // en son arşivlenen en üstte
    take: showAll ? undefined : 200, // son 24 saat için max 200 (güvenlik limiti)
  });

  // Toplam arşiv sayısını da döndür (UI'da "X / Y" gösterebilmek için)
  const totalCount = await db.publishedArticle.count({ where: { status: 'archived' } });
  const last24hCount = showAll ? totalCount : await db.publishedArticle.count({
    where: { status: 'archived', archivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
  });

  return NextResponse.json({
    articles,
    summary: {
      shown: articles.length,
      last24h: last24hCount,
      total: totalCount,
      filter: showAll ? 'all' : 'last24h',
    },
  });
}
