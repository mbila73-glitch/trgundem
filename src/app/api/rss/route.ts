import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// RSS 2.0 feed — TRGUNDEM.NET
// URL: /api/rss
// Veya /rss.xml (Next.js rewrite ile)

const SITE_URL = 'https://trgundem.net';
const SITE_TITLE = 'TRGUNDEM.NET — Türkiye\'de Gündem';
const SITE_DESC = 'Bağımsız, özgün ve çok kaynaklı haber platformu. AI ile özetlenen güncel haberler.';
const SITE_LANG = 'tr';

function escapeXml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return new Date().toUTCString();
  try { return d.toUTCString(); } catch { return new Date().toUTCString(); }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? 25), 5), 50);
  const category = sp.get('category');

  // Sadece published status'taki haberler (duplicate veya archived değil)
  const where: { status: string; category?: string } = { status: 'published' };
  if (category) where.category = category;

  const articles = await db.publishedArticle.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      aiTitle: true,
      aiSummary: true,
      category: true,
      imageUrl: true,
      publishedAt: true,
      latestPublishedAt: true,
      sourceCount: true,
      wordCount: true,
    },
  });

  const lastBuildDate = articles.length > 0 && articles[0].publishedAt
    ? isoDate(articles[0].publishedAt)
    : isoDate(new Date());

  const itemsXml = articles.map(a => {
    const link = `${SITE_URL}/?article=${a.id}`;
    const pubDate = a.publishedAt ? isoDate(a.publishedAt) : isoDate(a.latestPublishedAt);
    const description = (a.aiSummary || '').slice(0, 500);
    const fullContent = a.aiSummary || '';

    return `    <item>
      <title>${escapeXml(a.aiTitle)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(a.category)}</category>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[
        ${a.imageUrl ? `<img src="${escapeXml(a.imageUrl)}" alt="${escapeXml(a.aiTitle)}" style="max-width:100%;height:auto;" />` : ''}
        <h2>${escapeXml(a.aiTitle)}</h2>
        <p><strong>Kategori:</strong> ${escapeXml(a.category)}</p>
        <p><strong>Kaynak sayısı:</strong> ${a.sourceCount}</p>
        <p><strong>Kelime:</strong> ${a.wordCount}</p>
        <hr />
        <p>${escapeXml(fullContent).replace(/\n/g, '</p><p>')}</p>
      ]]></content:encoded>
      ${a.imageUrl ? `<enclosure url="${escapeXml(a.imageUrl)}" type="image/jpeg" />` : ''}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>${SITE_LANG}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>TRGUNDEM.NET RSS Generator v1.0</generator>
    <atom:link href="${SITE_URL}/api/rss" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/trlogo2.jpg</url>
      <title>${escapeXml(SITE_TITLE)}</title>
      <link>${SITE_URL}</link>
      <width>140</width>
      <height>40</height>
    </image>
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
