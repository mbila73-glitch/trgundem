import RSSParser from 'rss-parser';
import { db } from '@/lib/db';

type CustomItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  contentEncoded?: string;
  creator?: string;
  author?: string;
  categories?: string[] | string;
  enclosures?: Array<{ url?: string }>;
};

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; HaberOzet/1.0; +https://haberozet.local)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
    ],
  },
});

function pickImage(item: CustomItem & Record<string, unknown>): string | null {
  const enclosures = item.enclosures;
  if (Array.isArray(enclosures)) {
    const img = enclosures.find((e) =>
      e?.url?.match(/\.(jpg|jpeg|png|webp|gif)/i),
    );
    if (img?.url) return img.url;
  }
  const mediaContent = item.mediaContent as unknown;
  if (Array.isArray(mediaContent) && mediaContent.length > 0) {
    const first = mediaContent[0] as { $?: { url?: string } };
    if (first?.$?.url) return first.$.url;
  }
  const mediaThumb = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (mediaThumb?.$?.url) return mediaThumb.$.url;

  const content = item.contentEncoded ?? item.content ?? '';
  if (typeof content === 'string') {
    const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }
  const desc = item.description ?? '';
  if (typeof desc === 'string') {
    const match = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

function stripHtml(input: string | undefined | null): string | null {
  if (!input) return null;
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickCategory(
  item: CustomItem & Record<string, unknown>,
): string | null {
  const cats = item.categories;
  if (Array.isArray(cats) && cats.length > 0 && cats[0]) {
    return String(cats[0]).slice(0, 80);
  }
  if (typeof cats === 'string' && cats) {
    return cats.slice(0, 80);
  }
  return null;
}

export type RefreshResult = {
  sourceId: string;
  sourceName: string;
  fetched: number;
  added: number;
  error?: string;
};

export async function refreshSource(sourceId: string): Promise<RefreshResult> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Kaynak bulunamadı');
  return refreshInternal(source);
}

export async function refreshAllActiveSources(): Promise<RefreshResult[]> {
  const sources = await db.source.findMany({ where: { active: true } });
  if (sources.length === 0) return [];
  return Promise.all(sources.map((s) => refreshInternal(s).catch((e) => ({
    sourceId: s.id,
    sourceName: s.name,
    fetched: 0,
    added: 0,
    error: e instanceof Error ? e.message : String(e),
  }))));
}

async function refreshInternal(source: {
  id: string;
  name: string;
  url: string;
  category: string | null;
}): Promise<RefreshResult> {
  let fetched = 0;
  let added = 0;
  try {
    const feed = (await parser.parseURL(source.url)) as unknown as {
      items?: CustomItem[];
    };
    const items = feed.items ?? [];
    fetched = items.length;

    for (const item of items) {
      const guid =
        item.guid ||
        item.link ||
        `${source.id}:${item.title}` ||
        crypto.randomUUID();
      const link = item.link || '';
      const title = item.title?.trim() || '(Başlıksız)';
      const publishedAt = item.isoDate
        ? new Date(item.isoDate)
        : item.pubDate
          ? new Date(item.pubDate)
          : new Date();
      if (Number.isNaN(publishedAt.getTime())) continue;

      const exists = await db.article.findUnique({
        where: { sourceId_guid: { sourceId: source.id, guid } },
        select: { id: true },
      });
      if (exists) continue;

      const rawDescription = stripHtml(item.contentSnippet ?? item.description);
      const rawContent = stripHtml(item.contentEncoded ?? item.content);
      const descLen = rawDescription?.length ?? 0;
      const contentLen = rawContent?.length ?? 0;
      const content =
        contentLen >= descLen
          ? (rawContent ?? rawDescription ?? null)
          : (rawDescription ?? rawContent ?? null);
      const imageUrl = pickImage(item as CustomItem & Record<string, unknown>);
      const author = item.creator || item.author || null;
      const category = pickCategory(item as CustomItem & Record<string, unknown>);

      await db.article.create({
        data: {
          sourceId: source.id,
          guid,
          title,
          link,
          description: rawDescription?.slice(0, 600) || null,
          content: content ? content.slice(0, 8000) : null,
          author: author ? String(author).slice(0, 120) : null,
          category: category ?? source.category,
          imageUrl,
          publishedAt,
        },
      });
      added += 1;
    }

    await db.source.update({
      where: { id: source.id },
      data: { lastFetched: new Date() },
    });

    return { sourceId: source.id, sourceName: source.name, fetched, added };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.source.update({
      where: { id: source.id },
      data: { lastFetched: new Date() },
    });
    return {
      sourceId: source.id,
      sourceName: source.name,
      fetched,
      added,
      error: msg,
    };
  }
}

export const DEFAULT_SOURCES = [
  {
    name: 'BBC Türkçe',
    url: 'https://feeds.bbci.co.uk/turkce/rss.xml',
    category: 'Genel',
  },
  {
    name: 'NTV',
    url: 'https://www.ntv.com.tr/rss/anasayfa.rss',
    category: 'Genel',
  },
  {
    name: 'TRT Haber',
    url: 'https://www.trthaber.com/rss.xml',
    category: 'Genel',
  },
  {
    name: 'Hürriyet',
    url: 'https://www.hurriyet.com.tr/rss/anasayfa',
    category: 'Genel',
  },
  {
    name: 'Cumhuriyet',
    url: 'https://www.cumhuriyet.com.tr/rss/last.xml',
    category: 'Genel',
  },
  {
    name: 'The Guardian - World',
    url: 'https://www.theguardian.com/world/rss',
    category: 'Dünya',
  },
] as const;

export async function seedDefaultSourcesIfEmpty(): Promise<number> {
  const count = await db.source.count();
  if (count > 0) return 0;
  let added = 0;
  for (const s of DEFAULT_SOURCES) {
    try {
      await db.source.create({
        data: { name: s.name, url: s.url, category: s.category },
      });
      added += 1;
    } catch {
      // duplicate, skip
    }
  }
  return added;
}
