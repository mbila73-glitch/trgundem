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

// Extract text from HTML (server-side, no CORS issues)
function extractFromHtml(html: string, url: string) {
  // Title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) title = ogTitle[1].trim();

  // Description
  let description = '';
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch) description = descMatch[1].trim();
  if (!description) {
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDesc) description = ogDesc[1].trim();
  }
  if (!description) {
    // Get first paragraph with text
    const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const m of pMatches) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 50) { description = text.slice(0, 1000); break; }
    }
  }

  // Images
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null && images.length < 15) {
    const src = match[1];
    if (src.match(/\.(jpg|jpeg|png|webp|gif)/i) && !src.includes('logo') && !src.includes('icon') && !src.includes('sprite') && !src.includes('avatar') && src.length > 20) {
      try {
        const absUrl = new URL(src, url).href;
        images.push(absUrl);
      } catch {
        // skip invalid URLs
      }
    }
  }

  return { title, description: description.slice(0, 2000), images };
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
      // Direct fetch (server-side, no CORS)
      const r = await fetch(data.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HaberOzet/1.0; +https://haberozet.local)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const { title, description, images } = extractFromHtml(html, data.url);
      return NextResponse.json({ ok: true, title, description, images });
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
          category: 'Özel',
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
