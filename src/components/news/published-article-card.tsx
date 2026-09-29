'use client';

import { useState } from 'react';
import { Clock, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { PublishedArticle } from '@/lib/types';
import { colorForName, relativeTime, initials } from '@/lib/format';

type Props = {
  article: PublishedArticle;
  onOpen: (id: string) => void;
};

// Deterministic stable hash from string so SSR and CSR produce the SAME number.
// This avoids the React hydration mismatch that Math.random() would cause.
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// Returns a stable pseudo-random integer in [min, max] based on a seed.
function seededInt(seed: number, min: number, max: number): number {
  const range = max - min + 1;
  return min + (seed % range);
}

export function PublishedArticleCard({ article, onOpen }: Props) {
  const [imgError, setImgError] = useState(false);
  const showImage = article.imageUrl && !imgError;

  // SSR-stable initial values (deterministic from article.id).
  // These do not change on every reload of the same article, which is fine —
  // they're cosmetic seed values and the user can still like/dislike to update.
  const seed = hashSeed(article.id || article.aiTitle);
  const [likes, setLikes] = useState(() => seededInt(seed, 215, 400));
  const [dislikes, setDislikes] = useState(() => seededInt(seed >> 3, 5, 25));
  const [userAction, setUserAction] = useState<'like' | 'dislike' | null>(null);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userAction === 'like') {
      setLikes((l) => Math.max(0, l - 1));
      setUserAction(null);
    } else {
      setLikes((l) => l + 1);
      if (userAction === 'dislike') setDislikes((d) => Math.max(0, d - 1));
      setUserAction('like');
    }
  };

  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userAction === 'dislike') {
      setDislikes((d) => Math.max(0, d - 1));
      setUserAction(null);
    } else {
      setDislikes((d) => d + 1);
      if (userAction === 'like') setLikes((l) => Math.max(0, l - 1));
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
      {showImage ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <img
            src={article.imageUrl!}
            alt={article.aiTitle}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
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
            <AvatarFallback className={`text-[9px] font-semibold ${colorForName(article.category)}`}>
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

        {/* Like / Dislike bar */}
        <div className="mt-auto flex items-center gap-3 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={handleLike}
            aria-label="Beğen"
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition cursor-pointer ${
              userAction === 'like' ? 'text-blue-600' : 'text-muted-foreground hover:text-blue-600'
            }`}
          >
            <ThumbsUp className={`h-4 w-4 ${userAction === 'like' ? 'fill-blue-600' : ''}`} />
            <span className="tabular-nums">{likes}</span>
          </button>
          <button
            type="button"
            onClick={handleDislike}
            aria-label="Beğenme"
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition cursor-pointer ${
              userAction === 'dislike' ? 'text-red-600' : 'text-muted-foreground hover:text-red-600'
            }`}
          >
            <ThumbsDown className={`h-4 w-4 ${userAction === 'dislike' ? 'fill-red-600' : ''}`} />
            <span className="tabular-nums">{dislikes}</span>
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

// Re-export so consumers can keep using Star for featured action later
export const _Star = ThumbsUp;
