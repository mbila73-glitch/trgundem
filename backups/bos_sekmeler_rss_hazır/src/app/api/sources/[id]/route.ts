import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshSource } from '@/lib/rss';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 });
  }
  const data = body as {
    name?: string;
    url?: string;
    category?: string | null;
    active?: boolean;
  };

  const update: Record<string, unknown> = {};
  if (typeof data.name === 'string') update.name = data.name.trim();
  if (typeof data.url === 'string') {
    try {
      new URL(data.url);
      update.url = data.url.trim();
    } catch {
      return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 });
    }
  }
  if (data.category !== undefined) {
    update.category = data.category ? String(data.category) : null;
  }
  if (typeof data.active === 'boolean') update.active = data.active;

  try {
    const updated = await db.source.update({ where: { id }, data: update });
    return NextResponse.json({ source: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.source.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await refreshSource(id);
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
