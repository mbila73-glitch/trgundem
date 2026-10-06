import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as path from 'path';
import * as fs from 'fs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// 5 Gemini API key
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ];
  for (const c of candidates) {
    if (c && c.length > 0) keys.push(c);
  }
  return keys;
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';

// HTML'den tam içerik çıkar — başlık + açıklama + TAM METİN + görseller
function extractFromHtml(html: string, url: string) {
  // Title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) title = ogTitle[1].trim();

  // Description (meta)
  let description = '';
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch) description = descMatch[1].trim();
  if (!description) {
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDesc) description = ogDesc[1].trim();
  }

  // TAM METİN — tüm <p> tag'lerini topla (en zengin içerik)
  let fullText = '';
  const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of pMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 30) fullText += text + '\n\n';
  }
  // <article>, <div class="content"> gibi konteynerlerden de çek
  if (fullText.length < 200) {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const articleText = articleMatch[1].replace(/<[^>]+>/g, '').trim();
      if (articleText.length > 200) fullText = articleText.slice(0, 8000);
    }
  }
  fullText = fullText.slice(0, 8000); // max 8000 karakter

  // Images
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null && images.length < 15) {
    const src = match[1];
    if (src.match(/\.(jpg|jpeg|png|webp|gif)/i) && !src.includes('logo') && !src.includes('icon') && !src.includes('sprite') && !src.includes('avatar') && !src.includes('banner') && src.length > 20) {
      try {
        const absUrl = new URL(src, url).href;
        images.push(absUrl);
      } catch { /* skip */ }
    }
  }

  return { title, description: description.slice(0, 2000), content: fullText, images };
}

// AI özeti üret — çekilen tam metinden 150-300 kelime özet
async function aiSummarize(title: string, content: string): Promise<string | null> {
  if (!content || content.length < 100) return null;
  const keys = getGeminiKeys();
  if (keys.length === 0) return null;

  const prompt = [
    'Sen bağımsız bir haber editörüsün. Aşağıdaki haber metnini oku ve kendi cümlelerinle yeniden yaz.',
    'Bu bir özet değil, haberin yeniden yazımıdır.',
    '',
    'KURALLAR:',
    '1. EN AZ 150 kelime olmalı, EN ÇOK 300 kelime.',
    '2. Kaynak metinle aynı cümleyi ASLA kurma.',
    '3. Eş anlamlı kelimeler kullan, cümle yapısını değiştir.',
    '4. Reklam, sponsorlu içerik, "abone ol", "tıkla" gibi ifadeleri dahil ETME.',
    '5. Marka tanıtımı/reklamı varsa atla, sadece tarafsız haber içeriğini yaz.',
    '6. Sadece yeniden yazılmış metni yaz, başka hiçbir şey ekleme.',
    '',
    'BAŞLIK: ' + title,
    '',
    'HABER METNİ:',
    content.slice(0, 6000),
  ].join('\n');

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt % keys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await resp.json();
      if (result.error) {
        if (result.error.code === 403 || result.error.code === 429) continue;
        continue;
      }
      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text.trim();
      }
    } catch { continue; }
  }
  return null;
}

// POST /api/admin/custom-article
//   { action: 'fetch', url } → { title, description, content, images[] }
//   { action: 'ai-summarize', title, content } → { summary }
//   { action: 'save', title, summary, imageUrl, category } → { ok, id }
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const data = body as { action?: string; url?: string; query?: string; title?: string; content?: string; summary?: string; imageUrl?: string | null; category?: string };

  // 1. FETCH — URL'den tam içerik çek
  if (data.action === 'fetch' && data.url) {
    try {
      const r = await fetch(data.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const { title, description, content, images } = extractFromHtml(html, data.url);
      return NextResponse.json({ ok: true, title, description, content, images });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sayfa okunamadı' }, { status: 500 });
    }
  }

  // 2. AI SUMMARIZE — tam metinden AI özeti üret
  if (data.action === 'ai-summarize' && data.content) {
    try {
      const summary = await aiSummarize(data.title || '', data.content);
      if (!summary) {
        return NextResponse.json({ error: 'AI özet üretilemedi (kota dolu veya hata)' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, summary });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'AI hatası' }, { status: 500 });
    }
  }

  // 2b. SEARCH AND SUMMARIZE — güvenilen sitelerde konuyu ara, içerik çek, AI özeti üret
  if (data.action === 'search-and-summarize' && data.query) {
    try {
      // Güvenilen siteleri getir
      const sites = await db.trustedSite.findMany({ where: { active: true } });
      if (sites.length === 0) {
        return NextResponse.json({ error: 'Güvenilen site yok. Admin panelden ekleyin.' }, { status: 400 });
      }

      const query = data.query.trim();
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
      const allContents: { title: string; content: string; images: string[] }[] = [];
      const allImages: string[] = [];
      const sources: { site: string; url: string; title: string }[] = [];

      // Her sitede ara
      for (const site of sites) {
        const searchUrl = site.searchUrl.replace('{query}', encodeURIComponent(query));
        try {
          const resp = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) continue;
          const html = await resp.text();

          // HTML'den haber linklerini bul
          const baseUrl = new URL(searchUrl);
          const domain = baseUrl.hostname;
          const linkRegex = /<a[^>]+href=["'](\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
          const seenLinks = new Set<string>();
          let linkMatch;
          const relevantLinks: { url: string; text: string; score: number }[] = [];
          const allLinks: { url: string; text: string }[] = [];

          while ((linkMatch = linkRegex.exec(html)) !== null) {
            const href = linkMatch[1];
            const linkText = linkMatch[2].replace(/<[^>]+>/g, '').trim();
            if (href.length > 15 && linkText.length > 20 && !seenLinks.has(href)) {
              seenLinks.add(href);
              try {
                const absUrl = new URL(href, searchUrl).href;
                if (absUrl.includes(domain) && !absUrl.includes('/ara') && !absUrl.includes('/search')) {
                  const linkTextLower = linkText.toLowerCase();
                  const urlLower = absUrl.toLowerCase();
                  const matchCount = queryWords.filter(w => linkTextLower.includes(w) || urlLower.includes(w.replace(/\s/g, '-'))).length;
                  relevantLinks.push({ url: absUrl, text: linkText, score: matchCount });
                  allLinks.push({ url: absUrl, text: linkText });
                }
              } catch { /* skip */ }
            }
          }

          // İlgili linkleri önceliklendir, yoksa ilk 3 linki al (fallback)
          relevantLinks.sort((a, b) => b.score - a.score);
          let linksToFetch: { url: string; text: string }[];

          if (relevantLinks.length > 0 && relevantLinks[0].score > 0) {
            // İlgili linkler var — en iyi 3'ü al
            linksToFetch = relevantLinks.slice(0, 3).map(l => ({ url: l.url, text: l.text }));
          } else {
            // İlgili link yok — ilk 3 linki al (fallback)
            linksToFetch = allLinks.slice(0, 3);
          }

          // Haberlerin içeriğini çek
          for (const link of linksToFetch) {
            try {
              const articleResp = await fetch(link.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml',
                },
                signal: AbortSignal.timeout(10000),
              });
              if (!articleResp.ok) continue;
              const articleHtml = await articleResp.text();
              const extracted = extractFromHtml(articleHtml, link.url);
              if (extracted.content && extracted.content.length > 200) {
                allContents.push({
                  title: extracted.title || link.text,
                  content: extracted.content,
                  images: extracted.images,
                });
                allImages.push(...extracted.images);
                sources.push({ site: site.name, url: link.url, title: extracted.title || link.text });
              }
            } catch { /* skip */ }
          }
        } catch { /* skip site errors */ }
      }

      if (allContents.length === 0) {
        return NextResponse.json({ error: 'Hiçbir sitede ilgili haber bulunamadı. Konuyu kontrol edin veya daha spesifik yazın.' }, { status: 404 });
      }

      // En ilgili haberi seç — başlığında en çok arama kelimesi geçen
      allContents.sort((a, b) => {
        const aCount = queryWords.filter(w => a.title.toLowerCase().includes(w)).length;
        const bCount = queryWords.filter(w => b.title.toLowerCase().includes(w)).length;
        return bCount - aCount;
      });

      // Sadece en ilgili 2 haberi birleştir
      const topContents = allContents.slice(0, 2);
      const combinedContent = topContents.map(c => c.content).join('\n\n---\n\n').slice(0, 8000);
      const bestTitle = topContents[0]?.title || query;

      // AI özeti üret
      const summary = await aiSummarize(bestTitle, combinedContent);

      // Görsel seç — en çok tekrarlanan görsel
      const imageCounts: Record<string, number> = {};
      for (const img of allImages) {
        imageCounts[img] = (imageCounts[img] || 0) + 1;
      }
      let bestImage: string | null = null;
      let maxCount = 0;
      for (const [img, count] of Object.entries(imageCounts)) {
        if (count > maxCount) {
          maxCount = count;
          bestImage = img;
        }
      }
      if (maxCount < 2) bestImage = null;

      return NextResponse.json({
        ok: true,
        title: bestTitle,
        summary: summary || '',
        imageUrl: bestImage,
        content: combinedContent,
        sourcesFound: allContents.length,
        sources: sources,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Arama hatası' }, { status: 500 });
    }
  }

  // 3. SAVE — haberi DB'ye kaydet (multi-kategori destekli)
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
          category: data.category || 'Özel',
          wordCount: data.summary.trim().split(/\s+/).filter(Boolean).length,
          sourceArticleIds: JSON.stringify(['custom']),
          sourceCount: 999,
          initialHearts: Math.floor(Math.random() * (413 - 223 + 1)) + 223,
          clickHearts: 0,
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
