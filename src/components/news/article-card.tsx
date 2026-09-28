'use client';

import { Sparkles, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { ArticleListItem } from '@/lib/types';
import {
  colorForName,
  hostFromUrl,
  initials,
  relativeTime,
  truncate,
} from '@/lib/format';

type Props = {
  article: ArticleListItem;
  onOpen: (id: string) => void;
};

export function ArticleCard({ article, onOpen }: Props) {
  const sourceName = article.source?.name ?? 'Bilinmiyor';
  const desc = truncate(article.description ?? article.content, 180);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(article.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(article.id);
        }
      }}
      className="group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-md hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {article.imageUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <img
            src={article.imageUrl}
            alt={article.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground">
          <Avatar className="h-12 w-12">
            <AvatarFallback
              className={`text-sm font-semibold ${colorForName(sourceName)}`}
            >
              {initials(sourceName)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarFallback
              className={`text-[9px] font-semibold ${colorForName(sourceName)}`}
            >
              {initials(sourceName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground/80">{sourceName}</span>
          {article.category && (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[9px] uppercase tracking-wide"
            >
              {article.category}
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" />
            {relativeTime(article.publishedAt)}
          </span>
        </div>

        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.title}
        </h3>

        {desc && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {desc}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          {article.summary ? (
            <Badge
              variant="default"
              className="gap-1 bg-news/10 px-2 py-0.5 text-[10px] font-medium text-news news-foreground-inverted"
            >
              <Sparkles className="h-3 w-3" />
              AI özet hazır
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
            >
              Özet yok
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <ExternalLink className="h-3 w-3" />
            {hostFromUrl(article.link || article.source?.name || '')}
          </span>
        </div>
      </div>
    </Card>
  );
}
