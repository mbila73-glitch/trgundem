import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

let zaiPromise: Promise<ZAI> | null = null;
async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// POST /api/admin/custom-article
//   { action: 'fetch', url: string } → { title, description, images[] }
//   { action: 'save', title, summary, imageUrl, category } → { ok, id }
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const data = body as { action?: string; url?: string; title?: string; summary?: string; imageUrl?: string | null; category?: string };

  if (data.action === 'fetch' && data.url) {
    try {
      const zai = await getZAI();
      const result = await zai.functions.invoke('page_reader', { url: data.url });
      const pageData = result.data;
      // Extract images from HTML
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      const images: string[] = [];
      let match;
      const html = pageData.html || '';
      while ((match = imgRegex.exec(html)) !== null && images.length < 10) {
        const src = match[1];
        if (src.match(/\.(jpg|jpeg|png|webp|gif)/i) && !src.includes('logo') && !src.includes('icon')) {
          // Make absolute URL if relative
          try {
            const absUrl = new URL(src, data.url).href;
            images.push(absUrl);
          } catch {
            images.push(src);
          }
        }
      }
      // Get description from meta or first paragraph
      let description = '';
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      if (descMatch) description = descMatch[1];
      if (!description) {
        const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (ogDesc) description = ogDesc[1];
      }
      if (!description) {
        const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (pMatch) description = pMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500);
      }
      return NextResponse.json({
        ok: true,
        title: pageData.title || '',
        description: description.slice(0, 1000),
        images,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sayfa okunamadı' }, { status: 500 });
    }
  }

  if (data.action === 'save') {
    if (!data.title?.trim() || !data.summary?.trim()) {
      return NextResponse.json({ error: 'Başlık ve özet zorunlu' }, { status: 400 });
    }
    try {
      const created = await db.publishedArticle.create({
        data: {
          aiTitle: data.title.trim(),
          aiSummary: data.summary.trim(),
          imageUrl: data.imageUrl || null,
          category: data.category || 'Güncel',
          wordCount: data.summary.trim().split(/\s+/).filter(Boolean).length,
          sourceArticleIds: JSON.stringify(['custom']),
          sourceCount: 1,
          earliestPublishedAt: new Date(),
          latestPublishedAt: new Date(),
          status: 'published',
          publishedAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Kayıt hatası' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
}
