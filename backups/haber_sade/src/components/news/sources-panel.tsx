'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Newspaper, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Source } from '@/lib/types';
import { colorForName, hostFromUrl, initials, relativeTime } from '@/lib/format';

const ALL = '__all__';

type Props = {
  onSourcesChange?: () => void;
};

export function SourcesPanel({ onSourcesChange }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/sources', { cache: 'no-store' });
      const json = (await r.json()) as { sources: Source[] };
      setSources(json.sources ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaynaklar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Notify parent that source list might have changed (initial load)
    onSourcesChange?.();
  }, []);

  const categories = Array.from(
    new Set(sources.map((s) => s.category ?? '(Diğer)')),
  ).sort();

  const filtered =
    categoryFilter === ALL
      ? sources
      : sources.filter((s) => (s.category ?? '(Diğer)') === categoryFilter);

  const totalArticles = sources.reduce(
    (acc, s) => acc + (s._count?.articles ?? 0),
    0,
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Kaynaklar</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {sources.length} kaynak · {totalArticles.toLocaleString('tr-TR')}{' '}
            makale · {categories.length} kategori
          </p>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]" aria-label="Kategori filtrele">
            <SelectValue placeholder="Kategori seç" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm kategoriler</SelectItem>
            {categories.map((cat) => {
              const count = sources.filter(
                (s) => (s.category ?? '(Diğer)') === cat,
              ).length;
              return (
                <SelectItem key={cat} value={cat}>
                  {cat} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </header>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Bu kategoride kaynak yok.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <Card
              key={s.id}
              className={`flex flex-col gap-3 p-4 ${s.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback
                    className={`text-xs font-semibold ${colorForName(s.name)}`}
                  >
                    {initials(s.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold" title={s.name}>
                    {s.name}
                  </h3>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-news"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{hostFromUrl(s.url)}</span>
                  </a>
                  {s.category && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[9px] uppercase tracking-wide"
                    >
                      {s.category}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Newspaper className="h-3 w-3" />
                  {(s._count?.articles ?? 0).toLocaleString('tr-TR')} haber
                </span>
                {s.lastFetched && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {relativeTime(s.lastFetched)}
                  </span>
                )}
              </div>

              <div className="mt-auto border-t border-border pt-3 text-[11px] text-muted-foreground">
                {s.active ? 'Aktif' : 'Pasif'}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Background loader (kept for future use, currently no action triggers it) */}
      {loading && (
        <div className="fixed bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-xs shadow-md">
          <Loader2 className="h-3 w-3 animate-spin" />
          Yükleniyor…
        </div>
      )}
    </section>
  );
}
