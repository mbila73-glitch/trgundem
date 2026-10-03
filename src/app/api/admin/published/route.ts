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

// GET /api/admin/published — list all published articles for admin
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const articles = await db.publishedArticle.findMany({
    where: { status: { in: ['published', 'draft'] } },
    orderBy: { latestPublishedAt: 'desc' },
  });
  return NextResponse.json({ articles });
}
