'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Loader2,
  Sparkles,
  RefreshCw,
  Newspaper,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArticleCard } from './article-card';
import { ArticleDetailDialog } from './article-detail-dialog';
import type { ArticleListItem, RefreshResult, Source } from '@/lib/types';

const PAGE_SIZE = 24;

type Props = {
  refreshSignal?: number;
  onSourcesRefresh?: () => void;
  onRefreshComplete?: (totalAdded: number) => void;
};

export function NewsFeed({
  refreshSignal = 0,
  onRefreshComplete,
}: Props) {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [onlySummarized, setOnlySummarized] = useState(false);

  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  // Load sources for filter dropdown
  useEffect(() => {
    fetch('/api/sources', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { sources: Source[] }) => {
        setSources(json.sources ?? []);
        const cats = Array.from(
          new Set(
            (json.sources ?? [])
              .map((s) => s.category)
              .filter(Boolean) as string[],
          ),
        ).sort();
        setCategories(cats);
      })
      .catch(() => {});
  }, []);

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reload articles when filters change or refresh signal triggered
  useEffect(() => {
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams();
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', '0');
    if (selectedSourceId !== 'all') sp.set('sourceId', selectedSourceId);
    if (selectedCategory !== 'all') sp.set('category', selectedCategory);
    if (debouncedQuery) sp.set('q', debouncedQuery);
    if (onlySummarized) sp.set('onlySummarized', '1');

    fetch(`/api/articles?${sp.toString()}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haberler yüklenemedi');
        const json = (await r.json()) as {
          articles: ArticleListItem[];
          total: number;
        };
        setArticles(json.articles ?? []);
        setTotal(json.total ?? 0);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
      })
      .finally(() => setLoading(false));
  }, [
    selectedSourceId,
    selectedCategory,
    debouncedQuery,
    onlySummarized,
    refreshSignal,
  ]);

  const canLoadMore = articles.length < total;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const sp = new URLSearchParams();
      sp.set('limit', String(PAGE_SIZE));
      sp.set('offset', String(articles.length));
      if (selectedSourceId !== 'all') sp.set('sourceId', selectedSourceId);
      if (selectedCategory !== 'all') sp.set('category', selectedCategory);
      if (debouncedQuery) sp.set('q', debouncedQuery);
      if (onlySummarized) sp.set('onlySummarized', '1');
      const r = await fetch(`/api/articles?${sp.toString()}`, {
        cache: 'no-store',
      });
      const json = (await r.json()) as {
        articles: ArticleListItem[];
        total: number;
      };
      setArticles((arr) => [...arr, ...(json.articles ?? [])]);
      setTotal(json.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Daha fazla yüklenemedi');
    } finally {
      setLoadingMore(false);
    }
  };

  const summarizedCount = useMemo(
    () => articles.filter((a) => a.summary).length,
    [articles],
  );

  const resetFilters = () => {
    setSelectedSourceId('all');
    setSelectedCategory('all');
    setQuery('');
    setOnlySummarized(false);
  };

  const hasFilters =
    selectedSourceId !== 'all' ||
    selectedCategory !== 'all' ||
    debouncedQuery !== '' ||
    onlySummarized;

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Filter bar */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Haberlerde ara…"
              className="pl-8"
              aria-label="Arama"
            />
          </div>
          <Select
            value={selectedSourceId}
            onValueChange={setSelectedSourceId}
          >
            <SelectTrigger className="sm:w-44" aria-label="Kaynak filtrele">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue placeholder="Kaynak" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kaynaklar</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {categories.length > 0 && (
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="sm:w-40" aria-label="Kategori filtrele">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm kategoriler</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            <Switch
              checked={onlySummarized}
              onCheckedChange={setOnlySummarized}
              aria-label="Sadece özetlenmiş"
            />
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-news" />
              Sadece özetli
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {!loading && (
            <Badge variant="secondary" className="gap-1 px-2 py-1 text-[10px]">
              {total} haber{summarizedCount > 0 && ` · ${summarizedCount} özetli`}
            </Badge>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 px-2 text-xs"
            >
              Filtreleri temizle
            </Button>
          )}
        </div>
      </div>

      {/* Articles */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setArticles((arr) => [...arr]) /* triggers re-render */
            }
          >
            Tekrar dene
          </Button>
        </Card>
      ) : articles.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Newspaper className="h-12 w-12 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {hasFilters
                ? 'Filtrelerle eşleşen haber yok.'
                : 'Henüz haber yok.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters
                ? 'Filtreleri temizleyip tüm haberleri görebilirsiniz.'
                : 'Sağ üstteki "Beslemeleri Yenile" butonuna basarak RSS kaynaklarından ilk haberleri çekin.'}
            </p>
          </div>
          {hasFilters && (
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Filtreleri temizle
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onOpen={(id) => setOpenArticleId(id)}
              />
            ))}
          </div>

          {canLoadMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-1.5"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Daha fazla yükle ({total - articles.length} haber kaldı)
              </Button>
            </div>
          )}
        </>
      )}

      <ArticleDetailDialog
        articleId={openArticleId}
        onClose={() => setOpenArticleId(null)}
      />
    </section>
  );
}
