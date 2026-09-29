'use client';

import { Star, Clock, ExternalLink, Newspaper } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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

export function ArticleCard({ article, onOpen, onFeaturedChange }: Props) {
  const sourceName = article.source?.name ?? 'Bilinmiyor';
  const desc = truncate(article.description ?? article.content, 180);
  const [featured, setFeatured] = useState<boolean>(article.isFeatured ?? false);
  const [busy, setBusy] = useState(false);

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
      toast.success(
        !featured
          ? 'Haber özel olarak işaretlendi'
          : 'Özel işaret kaldırıldı',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşaret hatası');
    } finally {
      setBusy(false);
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
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-md hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Featured star button (top-right corner, above image) */}
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
          {featured ? (
            <Badge
              variant="default"
              className="gap-1 bg-news/10 px-2 py-0.5 text-[10px] font-medium text-news"
            >
              <Star className="h-3 w-3 fill-news" />
              Özel
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
            >
              {article.isFeatured ? 'Özel' : 'Yıldızla'}
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            <Newspaper className="h-3 w-3" />
            {hostFromUrl(article.link || article.source?.name || '')}
          </span>
        </div>
      </div>
    </Card>
  );
}
