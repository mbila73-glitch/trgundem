'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { PublishedArticle } from '@/lib/types';
import { proxyImageUrl, dateTimeShort, colorForName, categoryBadgeText } from '@/lib/format';
import { useHeart } from '@/lib/use-heart';

type Props = {
  article: PublishedArticle;
  onOpen: (id: string) => void;
  isEdited?: boolean; // true = yeşil çerçeve, false = kırmızı çerçeve
};

export function PublishedArticleCard({ article, onOpen, isEdited }: Props) {
  const [imgError, setImgError] = useState(false);
  const showImage = article.imageUrl && !imgError;
  const { hearts, userLiked, toggleHeart } = useHeart(article.id);

  // Çerçeve rengi — isEdited true = yeşil (yayınlandı), false = kırmızı (bekliyor)
  // border-4 (4px) — daha kalın, daha belirgin
  const borderClass = isEdited === true
    ? 'border-4 border-green-500 shadow-md shadow-green-500/30'
    : isEdited === false
    ? 'border-4 border-red-500 shadow-md shadow-red-500/30'
    : ''; // undefined = varsayılan (eski davranış)

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
      className={`group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-md hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${borderClass}`}
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
          <img src="/logo_TRG.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-60" />
        </div>
      )}

      {/* İçerik — görselin hemen altında, boşluk YOK */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2">
        {/* Başlık */}
        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.aiTitle}
        </h3>

        {/* Özet */}
        <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
          {article.aiSummary}
        </p>

        {/* Alt satır: Kalp solda, renkli harf + tarih sağda */}
        <div className="mt-auto flex items-center justify-between pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleHeart(); }}
            aria-label="Beğen"
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition cursor-pointer ${
              userLiked ? 'text-rose-600' : 'text-muted-foreground hover:text-rose-600'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${userLiked ? 'fill-rose-600' : ''}`} />
            <span className="tabular-nums">{hearts}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60 font-bold tabular-nums">
              {categoryBadgeText(article.category, article.sourceCount)}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{dateTimeShort(article.latestPublishedAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
