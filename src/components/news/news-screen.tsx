'use client';

import { useEffect, useState } from 'react';
import { Newspaper, Sparkles, FileText, FolderTree, Star, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PublishedArticleCard } from './published-article-card';
import { PublishedArticleDialog } from './published-article-dialog';
import type { PublishedArticle } from '@/lib/types';

const SUB_TABS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'all', label: 'Tüm Haberler', icon: Newspaper },
  { id: 'guncel', label: 'Güncel', icon: FileText },
  { id: 'kamu', label: 'Kamu / Resmi', icon: FolderTree },
  { id: 'ekonomi', label: 'Ekonomi / Finans', icon: FolderTree },
  { id: 'bilim', label: 'Bilim / Teknoloji', icon: FolderTree },
  { id: 'spor', label: 'Spor / Magazin', icon: FolderTree },
  { id: 'kultur', label: 'Kültür / Sanat', icon: FolderTree },
  { id: 'ozel', label: 'Özel Haber', icon: Star },
];

const CATEGORY_MAP: Record<string, string> = {
  guncel: 'Güncel',
  kamu: 'Kamu / Resmi',
  ekonomi: 'Ekonomi / Finans',
  bilim: 'Bilim / Teknoloji',
  spor: 'Spor / Magazin',
  kultur: 'Kültür / Sanat',
};

const ALL_LIMITS: Record<string, number> = {
  'Güncel': 6,
  'Kamu / Resmi': 4,
  'Ekonomi / Finans': 4,
  'Spor / Magazin': 3,
  'Bilim / Teknoloji': 2,
  'Kültür / Sanat': 1,
};

const CATEGORY_LIMITS: Record<string, number> = {
  'Güncel': 10,
  'Kamu / Resmi': 7,
  'Ekonomi / Finans': 7,
  'Spor / Magazin': 5,
  'Bilim / Teknoloji': 3,
  'Kültür / Sanat': 3,
};

export function NewsScreen() {
  const [active, setActive] = useState<string>('all');
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer setState calls to microtasks so they happen in callbacks, not in the effect body
    Promise.resolve().then(() => setLoading(true));
    Promise.resolve().then(() => setError(null));

    const url =
      active === 'all'
        ? '/api/published-articles?layout=all&status=published'
        : `/api/published-articles?category=${encodeURIComponent(
            CATEGORY_MAP[active] ?? '',
          )}&limit=${CATEGORY_LIMITS[CATEGORY_MAP[active] ?? ''] ?? 30}&status=published`;

    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haberler yüklenemedi');
        const json = (await r.json()) as { articles: PublishedArticle[]; total: number };
        return json.articles ?? [];
      })
      .then((items) => {
        if (cancelled) return;
        setArticles(items);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
        setArticles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const current = SUB_TABS.find((t) => t.id === active) ?? SUB_TABS[0];

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Sub-tab bar */}
      <nav
        role="tablist"
        aria-label="Haber kategorileri"
        className="mb-6 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1.5"
      >
        {SUB_TABS.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-secondary text-secondary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {isActive && articles.length > 0 && (
                <span className="ml-1 rounded bg-muted-foreground/20 px-1.5 text-[10px] tabular-nums">
                  {articles.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Layout info */}
      {!loading && articles.length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          {active === 'all' ? (
            <>
              <strong>20 haber</strong> · Kategori kotaları: Güncel 6, Kamu 4,
              Ekonomi 4, Spor 3, Bilim 2, Kültür 1
            </>
          ) : (
            <>
              <strong>{articles.length} haber</strong> · Limit:{' '}
              {CATEGORY_LIMITS[CATEGORY_MAP[active] ?? ''] ?? 30}
            </>
          )}
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : articles.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <current.icon className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {current.label} sekmesinde henüz haber yok.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {active === 'ozel'
                ? 'Haber kartındaki yıldız butonuyla özel olarak işaretlediğiniz haberler burada toplanacak.'
                : 'Bu kategoride birden fazla kaynakta çıkan (2+ kaynak) henüz haber yok.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {articles.map((a) => (
              <PublishedArticleCard
                key={a.id}
                article={a}
                onOpen={(id) => setOpenArticleId(id)}
              />
            ))}
          </div>

          <div className="mt-4 text-center text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-news" />
              AI ile telif güvenli (paraphrase) şekilde yeniden yazıldı · 1
              kaynaklı haberler yayınlanmaz
            </span>
          </div>
        </>
      )}

      <PublishedArticleDialog
        articleId={openArticleId}
        articles={articles}
        onClose={() => setOpenArticleId(null)}
      />
    </section>
  );
}

// Re-export so consumers can keep using Loader2 for background jobs
export const _Loader = Loader2;
