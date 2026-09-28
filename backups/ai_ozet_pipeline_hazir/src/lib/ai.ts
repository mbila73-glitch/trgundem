import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

let zaiPromise: Promise<ZAI> | null = null;

async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create();
  }
  return zaiPromise;
}

const SUMMARY_SYSTEM_PROMPT = `Sen Türkçe haber özetleme asistanısın. Görevin, sana verilen haber başlığı ve içeriğini okuyarak 3 cümlelik kısa, doğru ve nesnel bir Türkçe özet hazırlamak.
Kurallar:
- Sadece haberde geçen bilgileri kullan, dış bilgi ekleme.
- Yargılama veya yorum yapma, haberci üslubu koru.
- 3 cümleden fazla yazma; her cümle 25 kelimeyi geçmesin.
- Markdown formatı kullanma, başlık veya liste ekleme.
- Çıktıyı doğrudan düz metin olarak ver.`;

export type SummarizeResult = {
  articleId: string;
  summary: string;
  ok: boolean;
  error?: string;
};

export async function summarizeArticle(
  articleId: string,
): Promise<SummarizeResult> {
  const article = await db.article.findUnique({
    where: { id: articleId },
    include: { source: { select: { name: true } } },
  });
  if (!article) {
    return { articleId, summary: '', ok: false, error: 'Haber bulunamadı' };
  }

  const raw = [article.content, article.description]
    .filter(Boolean)
    .join('\n\n');
  if (!raw || raw.length < 60) {
    return {
      articleId,
      summary: '',
      ok: false,
      error: 'Haber metni yeterince uzun değil; özet oluşturulamadı.',
    };
  }

  const trimmed = raw.slice(0, 6000);
  const userPrompt = `Kaynak: ${article.source.name}\nBaşlık: ${article.title}\n\nİçerik:\n${trimmed}\n\nBu haberi 3 cümleyle özetle.`;

  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.3,
    });
    const summary: string | undefined =
      completion?.choices?.[0]?.message?.content;
    if (!summary || summary.trim().length === 0) {
      throw new Error('AI boş yanıt döndürdü');
    }
    const cleaned = summary.replace(/\s+/g, ' ').trim();
    await db.article.update({
      where: { id: articleId },
      data: { summary: cleaned, summarizedAt: new Date(), summaryError: null },
    });
    return { articleId, summary: cleaned, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.article.update({
      where: { id: articleId },
      data: { summaryError: msg },
    });
    return { articleId, summary: '', ok: false, error: msg };
  }
}

export type BatchSummarizeResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
};

export async function summarizePending(limit = 10): Promise<BatchSummarizeResult> {
  const pending = await db.article.findMany({
    where: { summary: null, summaryError: null },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { id: true },
  });
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const a of pending) {
    const r = await summarizeArticle(a.id);
    results.push({ id: a.id, ok: r.ok, error: r.error });
  }
  return {
    attempted: pending.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
