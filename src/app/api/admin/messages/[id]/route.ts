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
  } catch {
    return false;
  }
}

// DELETE /api/admin/messages/[id] — soft-delete (status → deleted)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await db.readerMessage.update({
      where: { id },
      data: { status: 'deleted' },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 });
  }
}
