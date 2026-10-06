'use client';

import { useState } from 'react';
import { Clock, ExternalLink, Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { PublishedArticle } from '@/lib/types';
import { colorForName, relativeTime, initials, proxyImageUrl, dateTimeShort } from '@/lib/format';
import { useHeart } from '@/lib/use-heart';

type Props = {
  article: PublishedArticle;
  onOpen: (id: string) => void;
};

export function PublishedArticleCard({ article, onOpen }: Props) {
  const [imgError, setImgError] = useState(false);
  const showImage = article.imageUrl && !imgError;
  const { hearts, userLiked, toggleHeart } = useHeart(article.id);

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
            src={proxyImageUrl(article.imageUrl) || undefined}
            alt={article.aiTitle}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground p-2">
          <img src="/trlogo2.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-60" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 pt-0.5 px-4 pb-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarFallback className={`text-[9px] font-semibold ${colorForName(article.category)}`}>
              {initials(article.category)}
            </AvatarFallback>
          </Avatar>
          <span className="ml-auto inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" />
            {dateTimeShort(article.latestPublishedAt)}
          </span>
        </div>

        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.aiTitle}
        </h3>

        <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
          {article.aiSummary}
        </p>

        {/* Heart bar — senkron */}
        <div className="mt-auto flex items-center gap-3 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={toggleHeart}
            aria-label="Beğen"
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition cursor-pointer ${
              userLiked ? 'text-rose-600' : 'text-muted-foreground hover:text-rose-600'
            }`}
          >
            <Heart className={`h-4 w-4 ${userLiked ? 'fill-rose-600' : ''}`} />
            <span className="tabular-nums">{hearts}</span>
          </button>
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <ExternalLink className="h-3 w-3" />
            Detay
          </span>
        </div>
      </div>
    </Card>
  );
}
