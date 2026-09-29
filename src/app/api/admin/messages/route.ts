import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    // Token format: "password:timestamp"
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

// GET /api/admin/messages — list all non-deleted messages
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  const messages = await db.readerMessage.findMany({
    where: { status: { not: 'deleted' } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ messages });
}

// POST /api/admin/messages — mark as read
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const { id, action } = body as { id?: string; action?: string };
  if (!id || action === 'read') {
    const r = await db.readerMessage.update({
      where: { id },
      data: { status: 'read' },
    });
    return NextResponse.json({ ok: true, message: r });
  }
  return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
}
