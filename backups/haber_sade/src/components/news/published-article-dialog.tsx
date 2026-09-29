'use client';

import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Clock,
  Tag,
  Newspaper,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { PublishedArticle, PublishedSourceLink } from '@/lib/types';
import {
  colorForName,
  fmtDate,
  hostFromUrl,
  initials,
} from '@/lib/format';
import { toast } from 'sonner';

type Props = {
  articleId: string | null;
  articles: PublishedArticle[];
  onClose: () => void;
};

export function PublishedArticleDialog({ articleId, articles, onClose }: Props) {
  const [sourceLinks, setSourceLinks] = useState<PublishedSourceLink[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const article = articles.find((a) => a.id === articleId) ?? null;

  useEffect(() => {
    if (!article) {
      Promise.resolve().then(() => setSourceLinks([]));
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => setLoadingSources(true));
    Promise.resolve().then(() => setSourceLinks([]));
    const ids: string[] = (() => {
      try {
        return JSON.parse(article.sourceArticleIds) as string[];
      } catch {
        return [];
      }
    })();
    if (ids.length === 0) {
      Promise.resolve().then(() => setLoadingSources(false));
      return;
    }
    // Fetch each source article in parallel
    Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`/api/articles/${id}`, { cache: 'no-store' });
          if (!r.ok) return null;
          const json = (await r.json()) as { article: { id: string; title: string; link: string; description: string | null; imageUrl: string | null; publishedAt: string; source: { name: string; url: string } } };
          const a = json.article;
          return {
            id: a.id,
            title: a.title,
            link: a.link,
            description: a.description,
            imageUrl: a.imageUrl,
            publishedAt: a.publishedAt,
            sourceName: a.source.name,
            sourceUrl: a.source.url,
          } as PublishedSourceLink;
        } catch {
          return null;
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const valid = results.filter((r): r is PublishedSourceLink => r !== null);
        valid.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );
        setSourceLinks(valid);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : 'Kaynaklar yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => {
      cancelled = true;
    };
  }, [article]);

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
                alt={article.aiTitle}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
              <div className="absolute right-3 top-3">
                <Badge className="bg-background/85 text-foreground backdrop-blur">
                  {article.sourceCount} kaynak
                </Badge>
              </div>
            </div>
          )}

          <DialogHeader className="px-6 pt-6">
            {article && (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar className="h-6 w-6">
                  <AvatarFallback
                    className={`text-[10px] font-semibold ${colorForName(article.category)}`}
                  >
                    {initials(article.category)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground/80">
                  {article.category}
                </span>
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {article.wordCount} kelime
                </Badge>
                <Badge
                  variant="outline"
                  className="ml-1 gap-1 text-[10px] text-news"
                >
                  <Sparkles className="h-3 w-3" />
                  AI özet
                </Badge>
              </div>
            )}
            <DialogTitle className="text-balance text-xl leading-tight">
              {article?.aiTitle ?? 'Yükleniyor…'}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {article && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(article.latestPublishedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {article.category}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Newspaper className="h-3 w-3" />
                    {article.sourceCount} farklı kaynak
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6 pt-4">
            {/* AI Özet section */}
            <section className="mb-5 rounded-lg border border-news/30 bg-news/[0.06] p-4">
              <div className="mb-2 flex items-center gap-1.5 text-news">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  AI Özet
                </span>
              </div>
              {article ? (
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {article.aiSummary}
                </p>
              ) : (
                <Skeleton className="h-24 w-full" />
              )}
            </section>

            {/* Source articles list */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kaynak Haberler ({sourceLinks.length})
              </h3>
              {loadingSources ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : sourceLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Kaynak bağlantıları yüklenemedi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sourceLinks.map((s, i) => (
                    <li
                      key={s.id}
                      className="rounded-md border border-border bg-card p-3 text-xs"
                    >
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-medium text-foreground hover:text-news"
                      >
                        {i + 1}. {s.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{s.sourceName}</span>
                        <span className="inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {hostFromUrl(s.sourceUrl)}
                        </span>
                        <span>{fmtDate(s.publishedAt)}</span>
                      </div>
                      {s.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                          {s.description.slice(0, 200)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {loadingSources && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Kaynaklar yükleniyor…
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
