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
  description?: string;
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

// --- Refresh progress tracker (module-level, single shared instance) ---
export type RefreshStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  totalSources: number;
  processedSources: number;
  totalAdded: number;
  totalFetched: number;
  failedSources: number;
  errors: Array<{ sourceName: string; error: string }>;
};

let refreshStatus: RefreshStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  totalSources: 0,
  processedSources: 0,
  totalAdded: 0,
  totalFetched: 0,
  failedSources: 0,
  errors: [],
};

export function getRefreshStatus(): RefreshStatus {
  return { ...refreshStatus, errors: refreshStatus.errors.slice(-50) };
}

// Concurrency-bounded parallel refresh to avoid overwhelming the network
const REFRESH_CONCURRENCY = 8;

export async function refreshAllActiveSources(): Promise<RefreshResult[]> {
  const sources = await db.source.findMany({ where: { active: true } });
  if (sources.length === 0) return [];

  refreshStatus = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalSources: sources.length,
    processedSources: 0,
    totalAdded: 0,
    totalFetched: 0,
    failedSources: 0,
    errors: [],
  };

  const results: RefreshResult[] = [];
  const queue = sources.slice();
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (queue.length > 0) {
      const src = queue.shift();
      if (!src) return;
      const r = await refreshInternal(src).catch((e: unknown) => ({
        sourceId: src.id,
        sourceName: src.name,
        fetched: 0,
        added: 0,
        error: e instanceof Error ? e.message : String(e),
      }));
      results.push(r);
      refreshStatus.processedSources += 1;
      refreshStatus.totalFetched += r.fetched;
      refreshStatus.totalAdded += r.added;
      if (r.error) {
        refreshStatus.failedSources += 1;
        refreshStatus.errors.push({ sourceName: r.sourceName, error: r.error });
      }
    }
  };

  for (let i = 0; i < Math.min(REFRESH_CONCURRENCY, sources.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  refreshStatus.running = false;
  refreshStatus.finishedAt = new Date().toISOString();

  return results;
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
      const category =
        pickCategory(item as CustomItem & Record<string, unknown>) ??
        source.category;

      await db.article.create({
        data: {
          sourceId: source.id,
          guid,
          title,
          link,
          description: rawDescription?.slice(0, 600) || null,
          content: content ? content.slice(0, 8000) : null,
          author: author ? String(author).slice(0, 120) : null,
          category,
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

// --- Categorized source catalog (155 sources across 6 categories) ---
// Name is auto-derived from URL when not provided.
const SKIP_PARTS = new Set([
  'com',
  'co',
  'org',
  'net',
  'gov',
  'edu',
  'tr',
  'tv',
  'info',
  'biz',
  'kibris',
  'cy',
]);

export function deriveNameFromUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = host.split('.');
  let base = host;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (!SKIP_PARTS.has(parts[i])) {
      base = parts[i];
      break;
    }
  }
  const baseName = base.charAt(0).toUpperCase() + base.slice(1);

  // Try meaningful path segment or ?cat= query param
  const segs = u.pathname.split('/').filter(Boolean);
  let suffix = '';
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    let seg = segs[i].replace(/\.(rss|xml|php|aspx?|html?)$/i, '');
    seg = seg
      .replace(/^feeds-rss-category-/, '')
      .replace(/^feeds-rss-/, '')
      .replace(/^rss-/, '')
      .replace(/^rss_/, '')
      .replace(/^category-/, '')
      .replace(/^publisher-daily/, 'daily')
      .replace(/^_articles$/, '')
      .replace(/_articles$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    if (seg && seg.length > 0 && seg.length < 40) {
      suffix = seg;
      break;
    }
  }

  const cat = u.searchParams.get('cat');
  if (cat && (!suffix || suffix.toLowerCase() === 'default' || suffix.toLowerCase() === 'all')) {
    suffix = cat;
  }
  if (suffix && suffix.toLowerCase() !== 'rss' && suffix.toLowerCase() !== 'feed' && suffix.toLowerCase() !== 'default' && suffix.toLowerCase() !== 'all') {
    const cap = suffix.charAt(0).toUpperCase() + suffix.slice(1);
    return `${baseName} · ${cap}`;
  }
  return baseName;
}

// Each entry: { url, category, name? } — name is optional, auto-derived when missing
export const DEFAULT_SOURCES: Array<{ url: string; category: string; name?: string }> = [
  // --- 1. Güncel (17) ---
  { url: 'https://www.sozcu.com.tr/rss/all.xml', category: 'Güncel' },
  { url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', category: 'Güncel' },
  { url: 'https://www.birgun.net/rss/home', category: 'Güncel' },
  { url: 'https://www.evrensel.net/rss/haber.xml', category: 'Güncel' },
  { url: 'https://www.gazeteduvar.com.tr/export/rss', category: 'Güncel' },
  { url: 'https://www.diken.com.tr/feed/', category: 'Güncel' },
  { url: 'https://medyascope.tv/feed/', category: 'Güncel' },
  { url: 'https://www.odatv.com/rss.xml', category: 'Güncel' },
  { url: 'https://halktv.com.tr/service/rss.php', category: 'Güncel' },
  { url: 'https://artigercek.com/service/rss.php', category: 'Güncel' },
  { url: 'https://www.krttv.com.tr/rss', category: 'Güncel' },
  { url: 'https://www.karar.com/service/rss.php', category: 'Güncel' },
  { url: 'https://www.aydinlik.com.tr/feed', category: 'Güncel' },
  { url: 'https://www.gundemkibris.com/rss', category: 'Güncel' },
  { url: 'https://kibrisgazetesi.com.tr/rss.xml', category: 'Güncel' },
  { url: 'https://www.nehaberkibris.com/rss/genel-0', category: 'Güncel' },
  { url: 'https://yeniceida.com/rss', category: 'Güncel' },

  // --- 2. Kamu / Resmi (5) ---
  { url: 'https://www.kamudanhaber.net/rss', category: 'Kamu / Resmi' },
  { url: 'https://www.ajanskamu.net/service/rss.php', category: 'Kamu / Resmi' },
  { url: 'https://www.hukukihaber.net/rss', category: 'Kamu / Resmi' },
  { url: 'https://www.iscihaber.net/rss/news', category: 'Kamu / Resmi' },
  { url: 'https://www.isindetayi.com/rss/gundem', category: 'Kamu / Resmi' },

  // --- 3. Ekonomi / Finans (16) ---
  { url: 'https://www.ekonomigazetesi.com/rss.xml', category: 'Ekonomi / Finans' },
  { url: 'https://tr.investing.com/rss/market_overview.rss', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-borsa', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-finans', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-emlak', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-emtia', category: 'Ekonomi / Finans' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-kripto', category: 'Ekonomi / Finans' },
  { url: 'https://www.bloomberght.com/rss', category: 'Ekonomi / Finans' },
  { url: 'https://www.cnbce.com/rss', category: 'Ekonomi / Finans' },
  { url: 'https://www.cnnturk.com/feed/rss/ekonomi/news', category: 'Ekonomi / Finans' },
  { url: 'https://www.haberturk.com/rss/ekonomi.xml', category: 'Ekonomi / Finans' },
  { url: 'https://tr.euronews.com/rss?level=theme&name=economy', category: 'Ekonomi / Finans' },
  { url: 'https://tr.euronews.com/rss?level=theme&name=markets', category: 'Ekonomi / Finans' },
  { url: 'https://tr.investing.com/rss/news.rss', category: 'Ekonomi / Finans' },
  { url: 'https://www.foreks.com/rss/', category: 'Ekonomi / Finans' },

  // --- 4. Bilim / Teknoloji (7) ---
  { url: 'https://www.teknoblog.com/feed/', category: 'Bilim / Teknoloji' },
  { url: 'https://www.teknolojioku.com/export/rss', category: 'Bilim / Teknoloji' },
  { url: 'https://www.donanimhaber.com/rss/tum/', category: 'Bilim / Teknoloji' },
  { url: 'https://www.chip.com.tr/rss', category: 'Bilim / Teknoloji' },
  { url: 'https://shiftdelete.net/feed', category: 'Bilim / Teknoloji' },
  { url: 'https://www.webtekno.com/rss.xml', category: 'Bilim / Teknoloji' },
  { url: 'https://www.megabayt.com/rss/news', category: 'Bilim / Teknoloji' },

  // --- 5. Spor / Magazin (10) ---
  { url: 'https://www.fotomac.com.tr/rss/anasayfa.xml', category: 'Spor / Magazin' },
  { url: 'https://www.trthaber.com/spor_articles.rss', category: 'Spor / Magazin' },
  { url: 'https://www.cnnturk.com/feed/rss/spor/news', category: 'Spor / Magazin' },
  { url: 'https://onedio.com/Publisher/publisher-daily.rss', category: 'Spor / Magazin' },
  { url: 'https://www.sabah.com.tr/rss/magazin.xml', category: 'Spor / Magazin' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-spor', category: 'Spor / Magazin' },
  { url: 'https://www.aa.com.tr/tr/rss/default?cat=spor', category: 'Spor / Magazin' },
  { url: 'https://www.fotospor.com/feed/rss_sondakika.xml', category: 'Spor / Magazin' },
  { url: 'https://www.sozcu.com.tr/feeds-rss-category-magazin', category: 'Spor / Magazin' },
  { url: 'https://www.haberturk.com/rss/magazin.xml', category: 'Spor / Magazin' },

  // --- 6. Kültür / Sanat (4) ---
  { url: 'https://www.elele.com.tr/export/rss', category: 'Kültür / Sanat' },
  { url: 'https://www.trendus.com/feed', category: 'Kültür / Sanat' },
  { url: 'https://www.elle.com.tr/rss', category: 'Kültür / Sanat' },
  { url: 'https://www.marieclaire.com.tr/feed/', category: 'Kültür / Sanat' },
];

// Used by the one-time seed script (deletes everything, then inserts defaults)
export async function replaceAllSourcesFromDefaults(): Promise<{
  deletedSources: number;
  insertedSources: number;
  skippedDuplicates: number;
}> {
  const deleted = await db.source.deleteMany({});
  let inserted = 0;
  let skipped = 0;
  for (const s of DEFAULT_SOURCES) {
    const name = s.name ?? deriveNameFromUrl(s.url);
    try {
      await db.source.create({
        data: { name, url: s.url, category: s.category, active: true },
      });
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }
  return {
    deletedSources: deleted.count,
    insertedSources: inserted,
    skippedDuplicates: skipped,
  };
}

export async function seedDefaultSourcesIfEmpty(): Promise<number> {
  const count = await db.source.count();
  if (count > 0) return 0;
  let added = 0;
  for (const s of DEFAULT_SOURCES) {
    const name = s.name ?? deriveNameFromUrl(s.url);
    try {
      await db.source.create({
        data: { name, url: s.url, category: s.category },
      });
      added += 1;
    } catch {
      // duplicate, skip
    }
  }
  return added;
}
