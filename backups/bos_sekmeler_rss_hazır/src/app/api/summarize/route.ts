import { NextRequest, NextResponse } from 'next/server';
import { summarizeArticle, summarizePending } from '@/lib/ai';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const data = (body || {}) as { articleId?: string; limit?: number };

  if (data.articleId) {
    const r = await summarizeArticle(data.articleId);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }

  const limit = Math.max(1, Math.min(Number(data.limit ?? 5), 20));
  const batch = await summarizePending(limit);
  return NextResponse.json(batch);
}
