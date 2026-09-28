import { NextRequest, NextResponse } from 'next/server';
import { refreshSource, refreshAllActiveSources } from '@/lib/rss';

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sourceId = sp.get('sourceId');

  try {
    if (sourceId) {
      const result = await refreshSource(sourceId);
      return NextResponse.json({ results: [result] });
    }
    const results = await refreshAllActiveSources();
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
