import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { seedDefaultSourcesIfEmpty, refreshAllActiveSources } from '@/lib/rss';

export async function GET() {
  const sources = await db.source.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      url: true,
      category: true,
      active: true,
      lastFetched: true,
      createdAt: true,
      _count: { select: { articles: true } },
    },
  });
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'refresh-all') {
    const results = await refreshAllActiveSources();
    return NextResponse.json({ results });
  }

  if (action === 'seed') {
    const added = await seedDefaultSourcesIfEmpty();
    const refreshResults = added > 0 ? await refreshAllActiveSources() : [];
    return NextResponse.json({ added, refreshResults });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi' },
      { status: 400 },
    );
  }

  const data = body as {
    name?: string;
    url?: string;
    category?: string | null;
  };

  const name = (data.name ?? '').trim();
  const url = (data.url ?? '').trim();
  const category = data.category ? String(data.category).trim() : null;

  if (!name || !url) {
    return NextResponse.json(
      { error: 'Ad ve URL zorunlu' },
      { status: 400 },
    );
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 });
  }

  try {
    const created = await db.source.create({
      data: { name, url, category: category || null },
    });
    return NextResponse.json({ source: created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('unique')) {
      return NextResponse.json(
        { error: 'Bu URL zaten kayıtlı' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
