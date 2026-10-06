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

// DELETE — güvenilen site sil
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const { id } = await params;
  try {
    await db.trustedSite.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Site bulunamadı' }, { status: 404 });
  }
}
