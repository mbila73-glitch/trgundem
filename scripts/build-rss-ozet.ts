// Build /home/z/my-project/download/rss_ozet.md from duplicate RSS article groups.
//
// Pipeline:
//   1. Find duplicate article groups (>= 2 DIFFERENT sources, Jaccard >= 40% on shingles).
//   2. For each group: take the 5 most recently added source articles (or all if < 5 sources),
//      concatenate their content + description.
//   3. Call z-ai-web-dev-sdk chat.completions with a paraphrase prompt
//      (target 150-200 words, Turkish, original sentences, copyright-safe).
//   4. Pick a representative image: prefer an image URL that appears in 2+ sources
//      (the "common" image); otherwise use the latest source's image.
//   5. Write rss_ozet.md grouped by category with per-category limits:
//        Güncel: 10, Kamu / Resmi: 7, Ekonomi / Finans: 7, Spor / Magazin: 5,
//        Bilim / Teknoloji: 3, Kültür / Sanat: 3
//   6. Persist each published article to PublishedArticle table.
//
// Run: bun /home/z/my-project/scripts/build-rss-ozet.ts

import { db } from '../src/lib/db';
import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const OUTPUT_PATH = path.join(process.cwd(), 'download', 'rss_ozet.md');
const SHINGLE1_THRESHOLD = 0.22;
const SHINGLE2_THRESHOLD = 0.20;
const MAX_SOURCES_PER_GROUP = 5; // read at most 5 most-recent source articles
const MIN_SUMMARY_WORDS = 150;   // minimum 150 kelime (100'den yükseltildi)
const MAX_SUMMARY_WORDS = 300;   // en fazla 300 kelime (200'den yükseltildi)
const REBUILD_ONLY = process.env.REBUILD_ONLY === '1'; // skip AI, just rebuild file from existing drafts

const TURKISH_STOPWORDS = new Set<string>([
  've', 'veya', 'ile', 'için', 'gibi', 'kadar', 'sadece', 'daha', 'çok',
  'az', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz',
  'on', 'bu', 'şu', 'o', 'ben', 'sen', 'biz', 'siz', 'onlar', 'bizler',
  'da', 'de', 'ta', 'te', 'ki', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl',
  'niçin', 'niye', 'olan', 'olarak', 'göre', 'sonra', 'önce',
  'en', 'her', 'hiç', 'ama', 'fakat', 'lakin', 'ancak', 'şey', 'yani',
  'ise', 'ya', 'veyahut', 'hem', 'değil', 'üzere', 'rağmen', 'kez',
  'doğru', 'tam', 'üzerine', 'yerine', 'diye', 'beri',
  'böyle', 'şöyle', 'neden', 'hangi', 'olduğu', 'oldu', 'olacak', 'olmuş',
  'oluyor', 'bunlar', 'şunlar',
]);

const CATEGORY_LIMITS: Record<string, number> = {
  'Güncel': 10,
  'Kamu / Resmi': 7,
  'Ekonomi / Finans': 7,
  'Spor / Magazin': 5,
  'Bilim / Teknoloji': 3,
  'Kültür / Sanat': 3,
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LIMITS);

const TR_MONTHS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

let zaiPromise: Promise<ZAI> | null = null;
async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

type RawArticle = {
  id: string;
  sourceId: string;
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  source: { id: string; name: string; url: string; category: string | null };
};

function normalize(text: string): string {
  if (!text) return '';
  let t = text
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/[^\w\sçğıöşüâîû]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove Turkish stop words to make shingles reflect meaningful terms
  const words = t.split(' ').filter((w) => w && !TURKISH_STOPWORDS.has(w) && w.length > 2);
  return words.join(' ');
}

function shingles(text: string, n: number): Set<string> {
  const words = text.split(' ').filter(Boolean);
  if (words.length < n) return new Set([words.join(' ')]);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - n; i += 1) {
    out.add(words.slice(i, i + n).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Hybrid similarity: sh2 >= SHINGLE2_THRESHOLD OR sh1 >= SHINGLE1_THRESHOLD
function isSimilar(sh1A: Set<string>, sh2A: Set<string>, sh1B: Set<string>, sh2B: Set<string>): boolean {
  if (jaccard(sh2A, sh2B) >= SHINGLE2_THRESHOLD) return true;
  if (jaccard(sh1A, sh1B) >= SHINGLE1_THRESHOLD) return true;
  return false;
}

class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else {
      this.parent[rb] = ra;
      if (this.rank[ra] === this.rank[rb]) this.rank[ra] += 1;
    }
  }
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function pickImage(sources: RawArticle[], excludeUrls?: Set<string>): string | null {
  // Prefer an image that appears in 2+ sources (the "common" image).
  // excludeUrls içindeki URL'leri seçme — bu, aynı görselin birden fazla
  // published haberde kullanılmasını önler (görsel dedup).
  const counts = new Map<string, number>();
  for (const s of sources) {
    if (!s.imageUrl) continue;
    if (excludeUrls && excludeUrls.has(s.imageUrl)) continue;
    counts.set(s.imageUrl, (counts.get(s.imageUrl) ?? 0) + 1);
  }
  let common: string | null = null;
  let commonCount = 0;
  for (const [url, c] of counts) {
    if (c > commonCount) {
      common = url;
      commonCount = c;
    }
  }
  if (common && commonCount >= 2) return common;
  // Fallback: most recently published source with an image (not in exclude)
  const sorted = [...sources].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
  for (const s of sorted) {
    if (s.imageUrl && (!excludeUrls || !excludeUrls.has(s.imageUrl))) return s.imageUrl;
  }
  return null;
}

function buildUserPrompt(
  articleSources: RawArticle[],
): string {
  const blocks = articleSources.map((a, i) => {
    const parts = [
      `[Kaynak ${i + 1}: ${a.source.name}]`,
      `Başlık: ${a.title}`,
      a.description ? `Açıklama: ${a.description.slice(0, 800)}` : '',
      a.content ? `İçerik: ${a.content.slice(0, 4000)}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  });
  return `Aşağıda aynı haberi farklı kaynaklardan alınmış ${articleSources.length} ayrı RSS metni var. Bunları okuyarak:

1. Haberin başlığını ~6-10 kelimelik Türkçe bir başlık olarak YENİ yaz (kaynak başlıklarını birebir kopyalama).
2. Haberin özetini EN AZ 150, EN FAZLA 300 KELİME olarak kendi cümlelerinle yaz.
3. Haberin kategorisini aşağıdaki 6 kategoriden biriyle belirle:
   - "Güncel" (genel haberler, siyaset, toplum)
   - "Kamu / Resmi" (devlet, kurum, resmi açıklamalar, memur, atama)
   - "Ekonomi / Finans" (ekonomi, borsa, döviz, finans, şirket)
   - "Spor / Magazin" (spor, magazin, ünlüler)
   - "Bilim / Teknoloji" (bilim, teknoloji, yapay zeka, internet)
   - "Kültür / Sanat" (kültür, sanat, müzik, sinema, edebiyat)

ÖNEMLİ KURALLAR:
- EN AZ 150 KELİME yaz. 150 kelimeden AZ yazma. EN FAZLA 300 kelime olmalı.
- Türkçe imla ve yazım kurallarına HARİCİ DİKKAT ET:
  * "kaza" (oluşan olay) vs "kazı" (arkeolojik) — doğru ek kullan (kazada, kazıda)
  * "ile", "için", "gibi" gibi ekler ayrı yazılır
  * "ki" eki çoğu durumda bitişik yazılır (kişi, amaçki → ama bağlaç olan ki ayrı: "bilmem ki")
  * Yabancı dillerden gelen kelimelerde düzeltme işareti (â, î, û) kullan
  * Sayıların yazımı: 150 kelime değil yüz elli kelime gibi
- Cümlelerin kaynaklardaki cümlelerle BİREBİR AYNI OLMAMALIDIR — telif cezası almamak için paraphrase yap.
  * İSTİSNA: Kaynaklarda tırnak içinde verilen doğrudan alıntılar (kişilerin sözleri, açıklamaları) olduğu gibi korunabilir. Örnek: kaynakta "Sinem Dedetaş, 'Deniz Göktaş için iyi çocuktur üzüldüm' dedi" şeklinde geçiyorsa, bu alıntı cümlesi tırnak içinde aynen kullanılabilir. Sadece tırnak dışındaki anlatım paraphrase edilmeli.
- Sadece haberde geçen bilgileri kullan, dış bilgi ekleme, yargılama yapma.
- Haberin tüm önemli detaylarını ver: kim, ne, nerede, ne zaman, nasıl, neden sorularına cevap.
- Haberin arka planı, etkileri ve ilgili kişilerin açıklamalarını da ekle.
- Markdown formatı kullanma, başlık ve liste ekleme — düz metin ver.

Çıktı formatı (her satırı dahil et):
BAŞLIK: <yeni başlığın>
KATEGORİ: <6 kategoriden biri>
ÖZET: <en az 150, en fazla 300 kelimelik özet>

Kaynak metinler:
${blocks.join('\n\n---\n\n')}`;
}

const VALID_CATEGORIES = [
  'Güncel', 'Kamu / Resmi', 'Ekonomi / Finans',
  'Spor / Magazin', 'Bilim / Teknoloji', 'Kültür / Sanat',
];

function normalizeCategory(raw: string): string {
  if (!raw) return 'Güncel';
  const trimmed = raw.trim();
  // Tam eşleşme
  for (const c of VALID_CATEGORIES) {
    if (trimmed.toLowerCase() === c.toLowerCase()) return c;
  }
  // Kısmi eşleşme — daha uzun olanlar önde
  const sorted = [...VALID_CATEGORIES].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (trimmed.toLowerCase().includes(c.toLowerCase())) return c;
  }
  // Anahtar kelime eşleşmesi
  const lower = trimmed.toLowerCase();
  if (lower.includes('spor') || lower.includes('magazin') || lower.includes('ünlü')) return 'Spor / Magazin';
  if (lower.includes('kamu') || lower.includes('resmi') || lower.includes('devlet') || lower.includes('memur') || lower.includes('atama')) return 'Kamu / Resmi';
  if (lower.includes('ekonomi') || lower.includes('finans') || lower.includes('borsa') || lower.includes('döviz') || lower.includes('şirket')) return 'Ekonomi / Finans';
  if (lower.includes('bilim') || lower.includes('teknoloji') || lower.includes('yapay zeka') || lower.includes('internet')) return 'Bilim / Teknoloji';
  if (lower.includes('kültür') || lower.includes('sanat') || lower.includes('müzik') || lower.includes('sinema') || lower.includes('edebiyat')) return 'Kültür / Sanat';
  return 'Güncel';
}

function parseAIResponse(text: string): { title: string; summary: string; category?: string } | null {
  const titleMatch = text.match(/BAŞLIK:\s*(.+?)(?:\n|$)/i);
  const categoryMatch = text.match(/KATEGORİ:\s*(.+?)(?:\n|$)/i);
  const summaryMatch = text.match(/ÖZET:\s*([\s\S]+?)(?:\n$|$)/i);
  if (!titleMatch || !summaryMatch) {
    // Fallback: split on double newline
    const lines = text.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      return { title: lines[0].slice(0, 120), summary: lines.slice(1).join(' ').trim() };
    }
    return null;
  }
  const title = titleMatch[1].trim();
  const summary = summaryMatch[1].trim();
  if (!title || !summary) return null;
  const category = categoryMatch ? normalizeCategory(categoryMatch[1]) : 'Güncel';
  return { title: title.slice(0, 200), summary, category };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

async function summarizeGroup(
  sources: RawArticle[],
): Promise<{ title: string; summary: string; category?: string; error?: string } | null> {
  // En son eklenen en fazla 5 kaynağın içeriğini oku (5'ten az ise hepsini).
  // Kullanıcı kuralı: 1 kaynaklı haberler yayınlanmaz (zaten 2+ kaynakla çağrılıyor).
  const sorted = [...sources].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
  const chosen =
    sorted.length > MAX_SOURCES_PER_GROUP
      ? sorted.slice(0, MAX_SOURCES_PER_GROUP)
      : sorted;
  if (chosen.length === 0) return null;

  const prompt = buildUserPrompt(chosen);
  const MAX_RETRIES = 2; // reduce retries to avoid 429 cascades
  const BASE_DELAY_MS = 15000; // 15s pause between calls — AI'ı boğmamak için uzun bekleme
  const WORD_COUNT_MIN = 150; // MIN_SUMMARY_WORDS ile aynı — AI bu kadar üretmeli
  let lastParsed: { title: string; summary: string; category?: string } | null = null;
  let lastWordCount = 0;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const zai = await getZAI();
      const retryHint = attempt > 0
        ? `\n\nÖNCEKİ YANITIN SADECE ${lastWordCount} KELİME İÇERİYORDU. Bu sefer MUTLAKA EN AZ 150 KELİME yaz.`
        : '';
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'Sen profesyonel bir Türkçe haber editörüsün. Verilen kaynakları okuyarak telif cezası almayacak şekilde özgün bir haber başlığı, kategori ve özet üretirsin. ' +
              'ÖZET HER ZAMAN EN AZ 150 KELİME, EN FAZLA 300 KELİME OLMALIDIR — bu kurala kesinlikle uy. ' +
              'KATEGORİ satırına 6 kategoriden birini yaz: Güncel, Kamu / Resmi, Ekonomi / Finans, Spor / Magazin, Bilim / Teknoloji, Kültür / Sanat. ' +
              'TÜRKÇE İMLA KURALLARINA DİKKAT ET: "kaza" (oluşan olay) ile "kazı" (arkeolojik) karıştırmamak, ekleri doğru kullanmak (kazada, kazıda), "ki" bağlacını doğru yazmak. ' +
              'Kaynak cümlelerini birebir kopyalama; paraphrase yap. ANCAK tırnak içindeki doğrudan alıntıları (kişilerin sözleri) tırnak içinde aynen koru. ' +
              'Haberin tüm önemli detaylarını (kim, ne, ne zaman, nerede, nasıl, neden) ver. ' +
              'Haberin arka planı, etkileri ve ilgili kişilerin açıklamalarını da ekle.',
          },
          { role: 'user', content: prompt + retryHint },
        ],
        thinking: { type: 'disabled' },
        temperature: 0.6,
      });
      const text: string = completion?.choices?.[0]?.message?.content ?? '';
      const parsed = parseAIResponse(text);
      if (!parsed) {
        return { title: '', summary: '', category: 'Güncel', error: 'AI yanıtı parse edilemedi' };
      }
      lastParsed = parsed;
      lastWordCount = countWords(parsed.summary);

      // Word count control — if too short, retry with stronger hint
      if (lastWordCount < WORD_COUNT_MIN && attempt < MAX_RETRIES - 1) {
        console.log(`  ⚠️ ${lastWordCount} kelime — kısa (min ${WORD_COUNT_MIN}), retry ${attempt + 2}/${MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, 3000)); // brief pause before retry
        continue;
      }
      // Pause before next call to avoid rate limit
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS));
      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('429') && attempt < MAX_RETRIES - 1) {
        // Long backoff: 30s, 60s
        const waitMs = 30000 * (attempt + 1);
        console.log(`  429 rate limit — ${waitMs / 1000}s bekleniyor (deneme ${attempt + 2}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return { title: '', summary: '', category: 'Güncel', error: msg };
    }
  }
  // Return last attempt even if too short — better than nothing
  if (lastParsed) {
    return lastParsed;
  }
  return { title: '', summary: '', category: 'Güncel', error: 'Maksimum deneme aşıldı' };
}

async function main() {
  const started = Date.now();
  console.log('=== RSS Özet Pipeline ===\n');

  // REBUILD_ONLY mode: skip AI, just rebuild rss_ozet.md from existing DB rows
  if (REBUILD_ONLY) {
    console.log("🔧 REBUILD_ONLY modu — AI çağrısı yapılmıyor, DB'den dosya üretiliyor");
    const rows = await db.publishedArticle.findMany({
      where: { status: 'published' },
      orderBy: { latestPublishedAt: 'desc' },
    });
    console.log(`PublishedArticle: ${rows.length} kayıt`);

    // Load all source articles in one query (for sourceArticleIds resolution)
    const allArticles = await db.article.findMany({
      where: { id: { in: rows.flatMap((r) => { try { return JSON.parse(r.sourceArticleIds) as string[]; } catch { return []; } }) } },
      include: { source: { select: { name: true, url: true } } },
    });
    const articleMap = new Map(allArticles.map((a) => [a.id, a]));

    const published = rows.map((r) => {
      let ids: string[] = [];
      try { ids = JSON.parse(r.sourceArticleIds) as string[]; } catch { /* ignore */ }
      const sourceArticleLinks = ids.map((id) => {
        const a = articleMap.get(id);
        return {
          title: a?.title ?? '',
          link: a?.link ?? '',
          source: a?.source.name ?? '',
          publishedAt: a?.publishedAt ?? new Date(),
        };
      });
      return {
        aiTitle: r.aiTitle,
        aiSummary: r.aiSummary,
        imageUrl: r.imageUrl,
        category: r.category,
        wordCount: r.wordCount,
        sourceArticleIds: ids,
        sourceArticleLinks,
        earliestPublishedAt: r.earliestPublishedAt,
        latestPublishedAt: r.latestPublishedAt,
        sourceCount: r.sourceCount,
      };
    });
    await writeRssOzetFile(published, started);
    return;
  }

  // 1. Load all articles (with description, length >= 30) + their source
  const articles: RawArticle[] = await db.article.findMany({
    where: { description: { not: null } },
    include: {
      source: { select: { id: true, name: true, url: true, category: true } },
    },
    orderBy: { publishedAt: 'desc' },
  });
  console.log(`Toplam makale: ${articles.length}`);

  // Use source.category for the published-article category (more reliable than article.category)
  const withShingles = articles
    .map((a) => {
      const norm = normalize(`${a.description ?? ''} ${a.content ?? ''}`);
      const sh1 = shingles(norm, 1);
      const sh2 = shingles(norm, 2);
      return { article: a, sh1, sh2 };
    })
    .filter((x) => x.sh2.size > 0);
  console.log(`İşlenecek (sh2 > 0): ${withShingles.length}`);

  // 2. Inverted index for 2-gram shingles (smaller set, fewer candidate pairs)
  const inverted = new Map<string, number[]>();
  for (let i = 0; i < withShingles.length; i += 1) {
    for (const sh of withShingles[i].sh2) {
      const arr = inverted.get(sh) ?? [];
      arr.push(i);
      inverted.set(sh, arr);
    }
  }

  // 3. Candidate pairs: only across DIFFERENT sources
  const candidates = new Set<string>();
  for (const [, idxs] of inverted) {
    if (idxs.length < 2) continue;
    for (let i = 0; i < idxs.length; i += 1) {
      for (let j = i + 1; j < idxs.length; j += 1) {
        const a = idxs[i];
        const b = idxs[j];
        if (withShingles[a].article.sourceId === withShingles[b].article.sourceId) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        candidates.add(key);
      }
    }
  }
  console.log(`Aday çift (farklı kaynaklar arası): ${candidates.size}`);

  // 4. Hybrid similarity check: sh2 OR sh1
  const uf = new UnionFind(withShingles.length);
  let pairCount = 0;
  for (const key of candidates) {
    const [a, b] = key.split(',').map(Number);
    if (isSimilar(withShingles[a].sh1, withShingles[a].sh2, withShingles[b].sh1, withShingles[b].sh2)) {
      uf.union(a, b);
      pairCount += 1;
    }
  }
  console.log(`Benzer çift (sh2≥%${Math.round(SHINGLE2_THRESHOLD * 100)} VEYA sh1≥%${Math.round(SHINGLE1_THRESHOLD * 100)}): ${pairCount}`);

  // 5. Group articles by root, keep groups with >= 2 DIFFERENT sources
  const groupsMap = new Map<number, number[]>();
  for (let i = 0; i < withShingles.length; i += 1) {
    const root = uf.find(i);
    const arr = groupsMap.get(root) ?? [];
    arr.push(i);
    groupsMap.set(root, arr);
  }
  const duplicateGroups: number[][] = [];
  for (const group of groupsMap.values()) {
    const uniqueSources = new Set(
      group.map((i) => withShingles[i].article.sourceId),
    );
    if (uniqueSources.size >= 2) duplicateGroups.push(group);
  }
  // Sort by sourceCount DESC (highest source count first — kullanıcı kuralı),
  // then by latest publishedAt DESC (tie-breaker)
  duplicateGroups.sort((a, b) => {
    const aSources = new Set(a.map((i) => withShingles[i].article.sourceId)).size;
    const bSources = new Set(b.map((i) => withShingles[i].article.sourceId)).size;
    if (aSources !== bSources) return bSources - aSources;
    const aMax = Math.max(...a.map((i) => withShingles[i].article.publishedAt.getTime()));
    const bMax = Math.max(...b.map((i) => withShingles[i].article.publishedAt.getTime()));
    return bMax - aMax;
  });
  console.log(`Tekrar eden haber grubu (>= 2 farklı kaynak): ${duplicateGroups.length}\n`);

  // 6. Apply per-category limits BEFORE AI summarization (so we only call AI
  //    for the ~35 groups that will actually be published, not all 166).
  //    This is critical for staying under the AI rate limit.
  type GroupMeta = {
    group: number[];
    sourcesInGroup: RawArticle[];
    bySource: Map<string, RawArticle[]>;
    allSources: RawArticle[];
    category: string;
    latestPublishedAt: Date;
    earliestPublishedAt: Date;
    sourceCount: number;
  };
  const groupMetas: GroupMeta[] = duplicateGroups.map((group) => {
    const sourcesInGroup: RawArticle[] = group.map((i) => withShingles[i].article);
    const bySource = new Map<string, RawArticle[]>();
    for (const art of sourcesInGroup) {
      const arr = bySource.get(art.sourceId) ?? [];
      arr.push(art);
      bySource.set(art.sourceId, arr);
    }
    const allSources = Array.from(bySource.values()).flat();
    const repSource = allSources[0]?.source;
    const category = repSource?.category ?? 'Güncel';
    const latestPublishedAt = new Date(
      Math.max(...allSources.map((a) => a.publishedAt.getTime())),
    );
    const earliestPublishedAt = new Date(
      Math.min(...allSources.map((a) => a.publishedAt.getTime())),
    );
    return {
      group,
      sourcesInGroup,
      bySource,
      allSources,
      category,
      latestPublishedAt,
      earliestPublishedAt,
      sourceCount: bySource.size,
    };
  });

  // Sort each category by latestPublishedAt desc, take top N per the per-category limit
  const byCategoryMap = new Map<string, GroupMeta[]>();
  for (const gm of groupMetas) {
    const arr = byCategoryMap.get(gm.category) ?? [];
    arr.push(gm);
    byCategoryMap.set(gm.category, arr);
  }
  for (const arr of byCategoryMap.values()) {
    arr.sort((a, b) => b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime());
  }
  const selectedGroups: GroupMeta[] = [];
  for (const cat of CATEGORY_ORDER) {
    const arr = byCategoryMap.get(cat) ?? [];
    const limit = CATEGORY_LIMITS[cat];
    const selected = arr.slice(0, limit);
    selectedGroups.push(...selected);
    console.log(`  ${cat}: ${selected.length}/${arr.length} seçildi (limit ${limit})`);
  }
  console.log(`Toplam AI özetlenecek: ${selectedGroups.length}\n`);

  // 7. For each SELECTED group, generate AI summary
  //    INCREMENTAL + AUTO-PUBLISH: write each PublishedArticle to DB immediately
  //    after AI success. Every 3 drafts, auto-publish them (draft → published).
  //    If a hash exists in 'stale' status (from previous cycle), restore it to
  //    'published' (this story came back in this cycle).
  //
  //    BENZERLİK KONTROLÜ: Yeni AI özetin başlığı, mevcut published haberlerle
  //    benzerse (shingle Jaccard), yeni haberi atla. Bu, aynı içeriğin farklı
  //    kaynak setleriyle tekrar yayınlanmasını önler.
  //
  //    GÖRSEL DEDUP: Yeni haberin görseli, mevcut published bir haberde
  //    kullanılmışsa, alternatif bir görsel seç. Tüm alternatifler doluysa
  //    görselsiz yayınla (placeholder logo gösterilir).
  const existingHashes = new Set<string>();
  // Mevcut published başlıkların shingle setleri — benzerlik kontrolü için
  const existingTitles: Array<{
    title: string;
    sh1: Set<string>;
    sh2: Set<string>;
  }> = [];
  // Mevcut published görseller — görsel dedup için
  const usedImageUrls = new Set<string>();
  // Check ALL statuses (draft, published, stale, archived) — already-summarized
  // groups should not be re-summarized.
  const existing = await db.publishedArticle.findMany({
    where: { status: { in: ['draft', 'published', 'stale'] } },
    select: {
      sourceArticleIds: true,
      status: true,
      id: true,
      aiTitle: true,
      aiSummary: true,
      imageUrl: true,
    },
  });
  for (const d of existing) {
    existingHashes.add(d.sourceArticleIds);
    if (d.aiTitle) {
      const norm = normalize(d.aiTitle);
      existingTitles.push({
        title: d.aiTitle,
        sh1: shingles(norm, 1),
        sh2: shingles(norm, 2),
      });
    }
    if (d.imageUrl) usedImageUrls.add(d.imageUrl);
  }
  console.log(`Mevcut özet (draft+published+stale): ${existingHashes.size} (atlanacak/restore edilecek)`);
  console.log(`Mevcut başlık sayısı (benzerlik kontrolü için): ${existingTitles.length}`);
  console.log(`Mevcut görsel sayısı (görsel dedup için): ${usedImageUrls.size}`);

  // Yeni başlığın mevcut published başlıklarla benzer olup olmadığını kontrol et.
  // Hibrit shingle algoritması: 2-gram ≥ %20 VEYA 1-gram ≥ %22.
  function findSimilarExisting(title: string): { title: string; sh1: Set<string>; sh2: Set<string> } | null {
    const norm = normalize(title);
    const sh1 = shingles(norm, 1);
    const sh2 = shingles(norm, 2);
    for (const e of existingTitles) {
      if (isSimilar(sh1, sh2, e.sh1, e.sh2)) {
        return { title: e.title, sh1: e.sh1, sh2: e.sh2 };
      }
    }
    return null;
  }

  const published: Array<{
    aiTitle: string;
    aiSummary: string;
    imageUrl: string | null;
    category: string;
    wordCount: number;
    sourceArticleIds: string[];
    sourceArticleLinks: Array<{ title: string; link: string; source: string; publishedAt: Date }>;
    earliestPublishedAt: Date;
    latestPublishedAt: Date;
    sourceCount: number;
  }> = [];

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let restoredCount = 0;
  let autoPublishedBatches = 0;
  let draftCounter = 0; // counts drafts created this run; every 3 → publish

  async function autoPublishDrafts(): Promise<number> {
    const r = await db.publishedArticle.updateMany({
      where: { status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
    });
    if (r.count > 0) {
      autoPublishedBatches += 1;
      console.log(`  📤 Auto-publish (batch ${autoPublishedBatches}): ${r.count} haber yayınlandı`);
    }
    return r.count;
  }

  for (let gi = 0; gi < selectedGroups.length; gi += 1) {
    const gm = selectedGroups[gi];
    // Compute a stable hash from sorted source article IDs
    const sortedIds = [...gm.allSources.map((a) => a.id)].sort();
    const hash = JSON.stringify(sortedIds);

    // Skip / restore if this group is already in DB
    if (existingHashes.has(hash)) {
      // Find the existing record
      const existingRow = await db.publishedArticle.findFirst({
        where: { sourceArticleIds: hash, status: { in: ['draft', 'published', 'stale'] } },
      });
      if (existingRow) {
        if (existingRow.status === 'stale') {
          // Restore: this story came back in this cycle, mark as published
          await db.publishedArticle.update({
            where: { id: existingRow.id },
            data: { status: 'published', publishedAt: new Date() },
          });
          restoredCount += 1;
          console.log(
            `[${gi + 1}/${selectedGroups.length}] 🔄 Restore (stale → published): ${existingRow.aiTitle.slice(0, 50)}`,
          );
        } else {
          skippedCount += 1;
          console.log(
            `[${gi + 1}/${selectedGroups.length}] ⏭️ Atlandı (zaten ${existingRow.status})`,
          );
        }
        // Load it into "published" array for the final file
        published.push({
          aiTitle: existingRow.aiTitle,
          aiSummary: existingRow.aiSummary,
          imageUrl: existingRow.imageUrl,
          category: existingRow.category,
          wordCount: existingRow.wordCount,
          sourceArticleIds: sortedIds,
          sourceArticleLinks: gm.allSources.map((a) => ({
            title: a.title,
            link: a.link,
            source: a.source.name,
            publishedAt: a.publishedAt,
          })),
          earliestPublishedAt: gm.earliestPublishedAt,
          latestPublishedAt: gm.latestPublishedAt,
          sourceCount: gm.sourceCount,
        });
      }
      continue;
    }

    const result = await summarizeGroup(gm.allSources);
    if (!result || result.error || !result.title || !result.summary) {
      errorCount += 1;
      console.log(
        `[${gi + 1}/${selectedGroups.length}] ⚠️ Atlandı: ${result?.error ?? 'boş yanıt'}`,
      );
      continue;
    }

    // BENZERLİK KONTROLÜ: Yeni AI özetin başlığı mevcut published/draft/stale
    // başlıklardan birine benzerse (hibrit shingle Jaccard), bu haber zaten
    // yayınlanmış demektir. Yenisini atla — böylece aynı içeriğin farklı
    // kaynak setleriyle tekrar yayınlanmasını önlemiş oluyoruz.
    const similar = findSimilarExisting(result.title);
    if (similar) {
      skippedCount += 1;
      console.log(
        `[${gi + 1}/${selectedGroups.length}] ⏭️ Benzer başlık atlandı: "${result.title.slice(0, 50)}" ≈ "${similar.title.slice(0, 50)}"`,
      );
      continue;
    }

    const wordCount = countWords(result.summary);
    if (wordCount < MIN_SUMMARY_WORDS - 30) {
      console.log(
        `[${gi + 1}/${selectedGroups.length}] ⚠️ Kısa özet (${wordCount} kelime) — yine de kaydedildi`,
      );
    }

    // GÖRSEL DEDUP: pickImage'e usedImageUrls set'i geç — kullanılmış görselleri
    // seçmez. Tüm alternatifler doluysa null döner (görselsiz yayınlanır,
    // placeholder logo gösterilir).
    const imageUrl = pickImage(gm.allSources, usedImageUrls);
    if (imageUrl) {
      usedImageUrls.add(imageUrl);
    } else {
      console.log(
        `[${gi + 1}/${selectedGroups.length}] 🖼️ Görsel benzersiz seçilemedi (tüm alternatifler kullanımda) — görselsiz yayınlanacak`,
      );
    }

    // Yeni başlığı existingTitles'a ekle — bu cycle'daki sonraki gruplar
    // için benzerlik kontrolü yapılabilsin.
    const newNorm = normalize(result.title);
    existingTitles.push({
      title: result.title,
      sh1: shingles(newNorm, 1),
      sh2: shingles(newNorm, 2),
    });

    const sourceArticleLinks = gm.allSources.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source.name,
      publishedAt: a.publishedAt,
    }));

    // AI özetten sonra kategori AI'dan gelmiş olabilir. AI kategorisi daha güvenilir.
    // Eğer AI kategori dönmezse fallback olarak gm.category (source.category) kullanılır.
    const aiCategory = result.category ?? gm.category;

    // IMMEDIATELY write to DB as draft (incremental save — crash-safe)
    try {
      await db.publishedArticle.create({
        data: {
          aiTitle: result.title,
          aiSummary: result.summary,
          imageUrl,
          category: aiCategory,
          wordCount,
          sourceArticleIds: hash,
          sourceCount: gm.sourceCount,
          earliestPublishedAt: gm.earliestPublishedAt,
          latestPublishedAt: gm.latestPublishedAt,
          status: 'draft',
        },
      });
      draftCounter += 1;
    } catch (e) {
      console.log(
        `[${gi + 1}/${selectedGroups.length}] DB yazma hatası: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    published.push({
      aiTitle: result.title,
      aiSummary: result.summary,
      imageUrl,
      category: aiCategory,
      wordCount,
      sourceArticleIds: sortedIds,
      sourceArticleLinks,
      earliestPublishedAt: gm.earliestPublishedAt,
      latestPublishedAt: gm.latestPublishedAt,
      sourceCount: gm.sourceCount,
    });
    successCount += 1;
    console.log(
      `[${gi + 1}/${selectedGroups.length}] ✓ "${result.title.slice(0, 60)}" — ${wordCount} kelime, ${gm.sourceCount} kaynak, ${aiCategory}`,
    );

    // AUTO-PUBLISH: every 3 drafts, publish them all (draft → published)
    if (draftCounter >= 3) {
      await autoPublishDrafts();
      draftCounter = 0;
    }
  }

  // Final auto-publish: any remaining drafts
  if (draftCounter > 0) {
    await autoPublishDrafts();
  }

  console.log(
    `\nÖzetleme tamam: ${successCount} yeni AI özet, ${restoredCount} stale→published, ${skippedCount} atlandı, ${errorCount} hata, ${autoPublishedBatches} publish batch, ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  const finalSelection = published;

  // (drafts were already written to DB during the loop above — incremental save)
  for (const p of finalSelection) {
    if (!existingHashes.has(JSON.stringify(p.sourceArticleIds))) {
      // already inserted above; skip
    }
  }

  // 8. Write rss_ozet.md
  await writeRssOzetFile(finalSelection, started);
}

type PublishedForFile = {
  aiTitle: string;
  aiSummary: string;
  imageUrl: string | null;
  category: string;
  wordCount: number;
  sourceArticleIds: string[];
  sourceArticleLinks: Array<{ title: string; link: string; source: string; publishedAt: Date }>;
  earliestPublishedAt: Date;
  latestPublishedAt: Date;
  sourceCount: number;
};

async function writeRssOzetFile(finalSelection: PublishedForFile[], started: number) {
  const lines: string[] = [];
  lines.push('# RSS Özet — Yeniden Yazılmış Haber Özetleri');
  lines.push('');
  lines.push(
    'Birden fazla kaynakta çıkan haberler için AI tarafından telif güvenli (paraphrase) şekilde yeniden yazılmış başlık ve özetler.',
  );
  lines.push('');
  lines.push(`- **Oluşturulma:** ${format(new Date(), 'd MMM yyyy HH:mm', { locale: tr })}`);
  lines.push(`- **Toplam özetlenen haber:** ${finalSelection.length}`);
  lines.push(`- **Kategori limitleri:** Güncel 10, Kamu 7, Ekonomi 7, Spor 5, Bilim 3, Kültür 3`);
  lines.push(`- **Kelime hedefi:** en az 100 kelime`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const cat of CATEGORY_ORDER) {
    const items = finalSelection.filter((p) => p.category === cat);
    lines.push(`## ${cat} (${items.length} haber)`);
    lines.push('');
    for (const p of items) {
      lines.push(`### ${p.aiTitle}`);
      lines.push('');
      lines.push(`- **Yayın aralığı:** ${fmtDate(p.earliestPublishedAt)} – ${fmtDate(p.latestPublishedAt)}`);
      lines.push(`- **Farklı kaynak sayısı:** ${p.sourceCount}`);
      lines.push(`- **Kelime sayısı:** ${p.wordCount}`);
      if (p.imageUrl) {
        lines.push(`- **Görsel:** ${p.imageUrl}`);
      }
      lines.push('');
      lines.push(`**Özet:**`);
      lines.push('');
      lines.push(p.aiSummary);
      lines.push('');
      lines.push('**Kaynaklar:**');
      lines.push('');
      for (let i = 0; i < p.sourceArticleLinks.length; i += 1) {
        const s = p.sourceArticleLinks[i];
        lines.push(
          `${i + 1}. [${s.title}](${s.link}) — ${s.source} — ${fmtDate(s.publishedAt)}`,
        );
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // Footer
  lines.push('## Üretim Bilgisi');
  lines.push('');
  lines.push(`- **Oluşturan:** build-rss-ozet.ts`);
  lines.push(`- **Tarih:** ${new Date().toISOString()}`);
  lines.push(`- **Algoritma:** HİBRİT — 2-gram shingle Jaccard ≥ %${Math.round(SHINGLE2_THRESHOLD * 100)} VEYA 1-gram (kelime kümesi) Jaccard ≥ %${Math.round(SHINGLE1_THRESHOLD * 100)} + Union-Find + z-ai-web-dev-sdk paraphrase`);
  lines.push(`- **Çalışma süresi:** ${((Date.now() - started) / 1000).toFixed(1)} saniye`);
  lines.push('');

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf-8');
  const sizeKb = Math.round((lines.join('\n').length / 1024) * 10) / 10;
  console.log(
    `\nDosya yazıldı: ${OUTPUT_PATH} (${sizeKb} KB, ${lines.length} satır)`,
  );
}

main()
  .catch((e) => {
    console.error('Pipeline hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
