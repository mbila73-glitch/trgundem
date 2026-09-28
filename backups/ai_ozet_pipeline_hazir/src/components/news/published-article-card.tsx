'use client';

import { useState } from 'react';
import { Clock, ExternalLink, Star, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { PublishedArticle } from '@/lib/types';
import { colorForName, hostFromUrl, initials, relativeTime } from '@/lib/format';

type Props = {
  article: PublishedArticle;
  onOpen: (id: string) => void;
};

export function PublishedArticleCard({ article, onOpen }: Props) {
  const [imgError, setImgError] = useState(false);
  const showImage = article.imageUrl && !imgError;
  // Pick a "primary" source name for the avatar
  let primarySource = 'Haber Özet';
  try {
    const links = article.sourceArticleIds
      ? (JSON.parse(article.sourceArticleIds) as string[])
      : [];
    if (links.length > 0) primarySource = `${links.length} kaynak`;
  } catch {
    /* ignore */
  }

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
      {showImage ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <img
            src={article.imageUrl!}
            alt={article.aiTitle}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
          />
          <div className="absolute left-2 top-2">
            <Badge
              className="bg-background/85 text-foreground backdrop-blur"
              variant="secondary"
            >
              {article.sourceCount} kaynak
            </Badge>
          </div>
        </div>
      ) : (
        <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-sm font-semibold bg-news/10 text-news">
              <Newspaper className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div className="absolute left-2 top-2">
            <Badge variant="secondary" className="bg-background/85">
              {article.sourceCount} kaynak
            </Badge>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarFallback
              className={`text-[9px] font-semibold ${colorForName(article.category)}`}
            >
              {initials(article.category)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground/80">{article.category}</span>
          <span className="ml-auto inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" />
            {relativeTime(article.latestPublishedAt)}
          </span>
        </div>

        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.aiTitle}
        </h3>

        <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
          {article.aiSummary}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Badge
            variant="outline"
            className="px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
          >
            {article.wordCount} kelime
          </Badge>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <ExternalLink className="h-3 w-3" />
            Detay
          </span>
        </div>
      </div>
    </Card>
  );
}

// Re-export so consumers can keep using Star for featured action later
export const _Star = Star;
