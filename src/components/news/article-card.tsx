'use client';

import { useState } from 'react';
import { Star, Clock, ExternalLink, Newspaper, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  onFeaturedChange?: (id: string, featured: boolean) => void;
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function ArticleCard({ article, onOpen }: Props) {
  const sourceName = article.source?.name ?? 'Bilinmiyor';
  const desc = truncate(article.description ?? article.content, 180);
  const [featured, setFeatured] = useState<boolean>(article.isFeatured ?? false);
  const [busy, setBusy] = useState(false);

  // Like / Dislike state — random initial values
  const [likes, setLikes] = useState(() => randomInt(215, 400));
  const [dislikes, setDislikes] = useState(() => randomInt(5, 25));
  const [userAction, setUserAction] = useState<'like' | 'dislike' | null>(null);

  const toggleFeatured = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await fetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !featured }),
      });
      if (!r.ok) throw new Error('Güncellenemedi');
      setFeatured(!featured);
      onFeaturedChange?.(article.id, !featured);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userAction === 'like') {
      setLikes(l => l - 1);
      setUserAction(null);
    } else {
      setLikes(l => l + 1);
      if (userAction === 'dislike') {
        setDislikes(d => d - 1);
      }
      setUserAction('like');
    }
  };

  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userAction === 'dislike') {
      setDislikes(d => d - 1);
      setUserAction(null);
    } else {
      setDislikes(d => d + 1);
      if (userAction === 'like') {
        setLikes(l => l - 1);
      }
      setUserAction('dislike');
    }
  };

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
      {/* Featured star button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleFeatured}
        disabled={busy}
        aria-label={featured ? 'Özel işareti kaldır' : 'Özel olarak işaretle'}
        className={`absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur transition hover:bg-background ${
          featured ? 'text-news' : 'text-muted-foreground hover:text-news'
        }`}
      >
        <Star className={`h-4 w-4 ${featured ? 'fill-news' : ''}`} />
      </Button>

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
          <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-16 w-auto object-contain opacity-60" />
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

        {/* Like / Dislike bar */}
        <div className="mt-auto flex items-center gap-3 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition ${
              userAction === 'like' ? 'text-blue-600' : 'text-muted-foreground hover:text-blue-600'
            }`}
          >
            <ThumbsUp className={`h-4 w-4 ${userAction === 'like' ? 'fill-blue-600' : ''}`} />
            <span className="tabular-nums">{likes}</span>
          </button>
          <button
            type="button"
            onClick={handleDislike}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition ${
              userAction === 'dislike' ? 'text-red-600' : 'text-muted-foreground hover:text-red-600'
            }`}
          >
            <ThumbsDown className={`h-4 w-4 ${userAction === 'dislike' ? 'fill-red-600' : ''}`} />
            <span className="tabular-nums">{dislikes}</span>
          </button>
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <ExternalLink className="h-3 w-3" />
            {hostFromUrl(article.link || article.source?.name || '')}
          </span>
        </div>
      </div>
    </Card>
  );
}
