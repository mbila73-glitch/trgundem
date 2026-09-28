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
const SHINGLE_SIZE = 4;
const SIMILARITY_THRESHOLD = 0.4;
const MAX_SOURCES_PER_GROUP = 5; // read at most 5 most-recent source articles
const MIN_SUMMARY_WORDS = 150;
const MAX_SUMMARY_WORDS = 200;

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
  return text
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/[^\w\sçğıöşüâîû]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text: string, n = SHINGLE_SIZE): Set<string> {
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

function pickImage(sources: RawArticle[]): string | null {
  // Prefer an image that appears in 2+ sources (the "common" image)
  const counts = new Map<string, number>();
  for (const s of sources) {
    if (!s.imageUrl) continue;
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
  // Fallback: most recently published source with an image
  const sorted = [...sources].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
  for (const s of sorted) if (s.imageUrl) return s.imageUrl;
  return null;
}

function buildUserPrompt(
  articleSources: RawArticle[],
): string {
  const blocks = articleSources.map((a, i) => {
    const parts = [
      `[Kaynak ${i + 1}: ${a.source.name}]`,
      `Başlık: ${a.title}`,
      a.description ? `Açıklama: ${a.description.slice(0, 600)}` : '',
      a.content ? `İçerik: ${a.content.slice(0, 2000)}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  });
  return `Aşağıda aynı haberi farklı kaynaklardan alınmış ${articleSources.length} ayrı RSS metni var. Bunları okuyarak:

1. Haberin başlığını ~6-10 kelimelik Türkçe bir başlık olarak YENİ yaz (kaynak başlıklarını birebir kopyalama).
2. Haberin özetini ${MIN_SUMMARY_WORDS}-${MAX_SUMMARY_WORDS} kelimelik kendi cümlelerinle yaz.
3. Cümlelerin kaynaklardaki cümlelerle BİREBİR AYNI OLMAMALIDIR — telif cezası almamak için paraphrase yap, yeniden ifade et.
4. Sadece haberde geçen bilgileri kullan, dış bilgi ekleme, yargılama yapma.
5. Markdown formatı kullanma, başlık ve liste ekleme — düz metin ver.
6. Çıktı formatı:
   BAŞLIK: <yeni başlığın>
   ÖZET: <${MIN_SUMMARY_WORDS}-${MAX_SUMMARY_WORDS} kelimelik özet>

Kaynak metinler:
${blocks.join('\n\n---\n\n')}`;
}

function parseAIResponse(text: string): { title: string; summary: string } | null {
  const titleMatch = text.match(/BAŞLIK:\s*(.+?)(?:\n|$)/i);
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
  return { title: title.slice(0, 200), summary };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

async function summarizeGroup(
  sources: RawArticle[],
): Promise<{ title: string; summary: string; error?: string } | null> {
  // Take at most MAX_SOURCES_PER_GROUP most recently published sources
  const sorted = [...sources].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
  const chosen =
    sorted.length > MAX_SOURCES_PER_GROUP
      ? sorted.slice(0, MAX_SOURCES_PER_GROUP)
      : sorted;
  if (chosen.length === 0) return null;

  const prompt = buildUserPrompt(chosen);
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Sen profesyonel bir Türkçe haber editörüsün. Verilen kaynakları okuyarak telif cezası almayacak şekilde özgün bir haber başlığı ve özet üretirsin.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.4,
    });
    const text: string = completion?.choices?.[0]?.message?.content ?? '';
    const parsed = parseAIResponse(text);
    if (!parsed) {
      return { title: '', summary: '', error: 'AI yanıtı parse edilemedi' };
    }
    return parsed;
  } catch (e) {
    return {
      title: '',
      summary: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const started = Date.now();
  console.log('=== RSS Özet Pipeline ===\n');

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
      const sh = shingles(norm);
      return { article: a, sh };
    })
    .filter((x) => x.sh.size > 0);
  console.log(`İşlenecek (shingle > 0): ${withShingles.length}`);

  // 2. Inverted index for shingles
  const inverted = new Map<string, number[]>();
  for (let i = 0; i < withShingles.length; i += 1) {
    for (const sh of withShingles[i].sh) {
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

  // 4. Union-find duplicate groups
  const uf = new UnionFind(withShingles.length);
  let pairCount = 0;
  for (const key of candidates) {
    const [a, b] = key.split(',').map(Number);
    if (jaccard(withShingles[a].sh, withShingles[b].sh) >= SIMILARITY_THRESHOLD) {
      uf.union(a, b);
      pairCount += 1;
    }
  }
  console.log(`Benzer çift (>= %${Math.round(SIMILARITY_THRESHOLD * 100)} jaccard): ${pairCount}`);

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
  // Sort by latest publishedAt desc
  duplicateGroups.sort((a, b) => {
    const aMax = Math.max(...a.map((i) => withShingles[i].article.publishedAt.getTime()));
    const bMax = Math.max(...b.map((i) => withShingles[i].article.publishedAt.getTime()));
    return bMax - aMax;
  });
  console.log(`Tekrar eden haber grubu (>= 2 farklı kaynak): ${duplicateGroups.length}\n`);

  // 6. For each group, generate AI summary
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

  for (let gi = 0; gi < duplicateGroups.length; gi += 1) {
    const group = duplicateGroups[gi];
    const sourcesInGroup: RawArticle[] = group.map((i) => withShingles[i].article);

    // Group sources by sourceId (take the most recent article per source)
    const bySource = new Map<string, RawArticle[]>();
    for (const art of sourcesInGroup) {
      const arr = bySource.get(art.sourceId) ?? [];
      arr.push(art);
      bySource.set(art.sourceId, arr);
    }
    const allSources = Array.from(bySource.values()).flat();

    // Determine the category (use source.category of the representative)
    const repSource = allSources[0]?.source;
    const category = repSource?.category ?? 'Güncel';

    const result = await summarizeGroup(allSources);
    if (!result || result.error || !result.title || !result.summary) {
      errorCount += 1;
      console.log(
        `[${gi + 1}/${duplicateGroups.length}] ⚠️ Atlandı: ${result?.error ?? 'boş yanıt'}`,
      );
      continue;
    }

    const wordCount = countWords(result.summary);
    if (wordCount < MIN_SUMMARY_WORDS - 30) {
      console.log(
        `[${gi + 1}/${duplicateGroups.length}] ⚠️ Kısa özet (${wordCount} kelime) — yine de kaydedildi`,
      );
    }

    const imageUrl = pickImage(allSources);
    const earliestPublishedAt = new Date(
      Math.min(...allSources.map((a) => a.publishedAt.getTime())),
    );
    const latestPublishedAt = new Date(
      Math.max(...allSources.map((a) => a.publishedAt.getTime())),
    );

    published.push({
      aiTitle: result.title,
      aiSummary: result.summary,
      imageUrl,
      category,
      wordCount,
      sourceArticleIds: allSources.map((a) => a.id),
      sourceArticleLinks: allSources.map((a) => ({
        title: a.title,
        link: a.link,
        source: a.source.name,
        publishedAt: a.publishedAt,
      })),
      earliestPublishedAt,
      latestPublishedAt,
      sourceCount: bySource.size,
    });
    successCount += 1;
    console.log(
      `[${gi + 1}/${duplicateGroups.length}] ✓ "${result.title.slice(0, 60)}" — ${wordCount} kelime, ${bySource.size} kaynak, ${category}`,
    );
  }

  console.log(
    `\nÖzetleme tamam: ${successCount} başarılı, ${errorCount} hata, ${(Date.now() - started) / 1000}s`,
  );

  // 7. Apply per-category limits and write PublishedArticle rows + rss_ozet.md
  // Group by category
  const byCategory = new Map<string, typeof published>();
  for (const p of published) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }
  // Sort each category by latestPublishedAt desc, take top N
  const finalSelection: typeof published = [];
  for (const cat of CATEGORY_ORDER) {
    const arr = byCategory.get(cat) ?? [];
    arr.sort(
      (a, b) => b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime(),
    );
    const limit = CATEGORY_LIMITS[cat];
    const selected = arr.slice(0, limit);
    finalSelection.push(...selected);
    console.log(`  ${cat}: ${selected.length}/${arr.length} (limit ${limit})`);
  }
  console.log(`Toplam yayın: ${finalSelection.length}\n`);

  // Clear previous drafts, insert new
  await db.publishedArticle.deleteMany({ where: { status: 'draft' } });
  for (const p of finalSelection) {
    await db.publishedArticle.create({
      data: {
        aiTitle: p.aiTitle,
        aiSummary: p.aiSummary,
        imageUrl: p.imageUrl,
        category: p.category,
        wordCount: p.wordCount,
        sourceArticleIds: JSON.stringify(p.sourceArticleIds),
        sourceCount: p.sourceCount,
        earliestPublishedAt: p.earliestPublishedAt,
        latestPublishedAt: p.latestPublishedAt,
        status: 'draft',
      },
    });
  }

  // 8. Write rss_ozet.md
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
  lines.push(`- **Algoritma:** shingle+Jaccard (≥ %${Math.round(SIMILARITY_THRESHOLD * 100)}) + Union-Find + z-ai-web-dev-sdk paraphrase`);
  lines.push(`- **Çalışma süresi:** ${((Date.now() - started) / 1000).toFixed(1)} saniye`);
  lines.push('');

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf-8');
  const sizeKb = Math.round((lines.join('\n').length / 1024) * 10) / 10;
  console.log(
    `\nDosya yazıldı: ${OUTPUT_PATH} (${sizeKb} KB, ${lines.length} satır)`,
  );
  console.log(
    `DB'ye ${finalSelection.length} PublishedArticle (draft) eklendi.`,
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
