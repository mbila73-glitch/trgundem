import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = 'Trgundem123';

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

// GET /api/admin/archived — arşive alınmış tüm haberleri listeler.
// Sadece status='archived' olanları döndürür.
// Yönetici panelinin Arşiv sekmesi bu endpoint'i çağırır.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const articles = await db.publishedArticle.findMany({
    where: { status: 'archived' },
    orderBy: { archivedAt: 'desc' }, // en son arşivlenen en üstte
  });
  return NextResponse.json({ articles });
}
