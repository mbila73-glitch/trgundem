'use client';

import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  Tag,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { ArticleDetail, SummarizeResult } from '@/lib/types';
import {
  colorForName,
  formatDate,
  hostFromUrl,
  initials,
  truncate,
} from '@/lib/format';
import { toast } from 'sonner';

type Props = {
  articleId: string | null;
  onClose: () => void;
};

export function ArticleDetailDialog({ articleId, onClose }: Props) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/articles/${articleId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Haber alınamadı');
        const json = (await r.json()) as { article: ArticleDetail };
        return json.article;
      })
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : 'Haber yüklenemedi');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, onClose]);

  const handleSummarize = async () => {
    if (!article) return;
    setSummarizing(true);
    try {
      const r = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id }),
      });
      const json = (await r.json()) as SummarizeResult;
      if (!r.ok || !json.ok) {
        throw new Error(json.error || 'Özet oluşturulamadı');
      }
      setArticle({ ...article, summary: json.summary, summarizedAt: new Date().toISOString() });
      toast.success('AI özet hazır');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Özet hatası');
    } finally {
      setSummarizing(false);
    }
  };

  const sourceName = article?.source?.name ?? 'Kaynak';
  const body = article?.content ?? article?.description ?? '';
  const isLongEnough = body.length >= 60;

  return (
    <Dialog
      open={articleId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl overflow-hidden p-0 sm:max-h-[88vh]">
        <div className="max-h-[88vh] overflow-y-auto news-scroll">
          {article?.imageUrl && (
            <div className="relative aspect-[16/8] w-full overflow-hidden bg-muted">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
            </div>
          )}

          <DialogHeader className="px-6 pt-6">
            {article && (
              <div className="mb-2 flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback
                    className={`text-[10px] font-semibold ${colorForName(sourceName)}`}
                  >
                    {initials(sourceName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-foreground/80">
                  {sourceName}
                </span>
                {article.category && (
                  <Badge variant="secondary" className="text-[10px]">
                    {article.category}
                  </Badge>
                )}
              </div>
            )}
            <DialogTitle className="text-balance text-xl leading-tight">
              {loading ? (
                <Skeleton className="h-6 w-3/4" />
              ) : (
                article?.title
              )}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {article && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(article.publishedAt)}
                  </span>
                  {article.author && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {article.author}
                    </span>
                  )}
                  {article.category && (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {article.category}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6 pt-4">
            {/* AI Summary section */}
            <section className="mb-5 rounded-lg border border-news/30 bg-news/[0.06] p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-news">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    AI Özet
                  </span>
                </div>
                {!article?.summary && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleSummarize}
                    disabled={summarizing || loading || !isLongEnough}
                    className="h-7 gap-1.5 bg-news px-2 text-[11px] text-news-foreground hover:bg-news/90"
                  >
                    {summarizing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Hazırlanıyor…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Özet Oluştur
                      </>
                    )}
                  </Button>
                )}
              </div>

              {article?.summary ? (
                <p className="text-sm leading-relaxed text-foreground/90">
                  {article.summary}
                </p>
              ) : article?.summaryError ? (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Özet oluşturulamadı</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {article.summaryError}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSummarize}
                      disabled={summarizing}
                      className="mt-2 h-7 gap-1 px-2 text-[11px]"
                    >
                      {summarizing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Yeniden deneniyor…
                        </>
                      ) : (
                        'Tekrar dene'
                      )}
                    </Button>
                  </div>
                </div>
              ) : loading ? (
                <Skeleton className="h-12 w-full" />
              ) : !isLongEnough ? (
                <p className="text-xs text-muted-foreground">
                  Bu haberin metni AI özeti için yeterince uzun değil.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bu haberin henüz AI özeti yok. &ldquo;Özet Oluştur&rdquo;
                  butonuna basarak 3 cümlelik Türkçe özet hazırlayabilirsiniz.
                </p>
              )}
            </section>

            {/* Article body */}
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : (
              body && (
                <article className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  {body.split(/\n+/).map((p, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {truncate(p, 1200)}
                    </p>
                  ))}
                </article>
              )
            )}

            {article?.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-news hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {hostFromUrl(article.link)} üzerinde orijinal haberi oku
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
