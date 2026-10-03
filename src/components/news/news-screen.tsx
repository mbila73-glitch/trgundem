'use client';

import { useCallback, useEffect, useState } from 'react';
import { Newspaper, FileText, FolderTree, Star, Loader2, AlertCircle, ChevronDown, ArrowLeft, Home, Heart, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PublishedArticleCard } from './published-article-card';
import { useHeart } from '@/lib/use-heart';
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
  ozel: 'Özel',
};

const CATEGORY_LIMITS: Record<string, number> = {
  'Güncel': 10,
  'Kamu / Resmi': 7,
  'Ekonomi / Finans': 7,
  'Spor / Magazin': 5,
  'Bilim / Teknoloji': 3,
  'Kültür / Sanat': 3,
  'Özel': 30,
};

// Stable FNV-1a hash so SSR and CSR produce the same seed (avoids hydration mismatch).
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededInt(seed: number, min: number, max: number): number {
  const range = max - min + 1;
  return min + (seed % range);
}

function HorizontalLikeBar({ articleId }: { articleId: string }) {
  const { hearts, userLiked, toggleHeart } = useHeart(articleId);

  return (
    <div className="mt-auto flex items-center gap-3 pt-2 border-t border-border/50">
      <button type="button" onClick={toggleHeart} className={`inline-flex items-center gap-1.5 text-xs font-medium transition ${userLiked ? 'text-rose-600' : 'text-muted-foreground hover:text-rose-600'}`}>
        <Heart className={`h-4 w-4 ${userLiked ? 'fill-rose-600' : ''}`} />
        <span className="tabular-nums">{hearts}</span>
      </button>
    </div>
  );
}

// Inline article detail component (not a dialog)
function ArticleDetailInline({
  articleId,
  onBack,
}: {
  articleId: string;
  onBack: () => void;
}) {
  const [article, setArticle] = useState<PublishedArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/published-articles?limit=100&status=published`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haber yüklenemedi');
        const json = (await r.json()) as { articles: PublishedArticle[] };
        return json.articles?.find((a) => a.id === articleId) ?? null;
      })
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mx-auto h-[240px] w-full max-w-md rounded-xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Haber bulunamadı</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Geri Dön
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-4">
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('article');
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home className="h-4 w-4" />
          Ana Sayfa
        </Button>
      </div>

      {/* Görsel: 10 satır yüksekliğinde (~240px), genişlik uygun oranda azaldı */}
      {article.imageUrl ? (
        <div className="mb-6 flex justify-center">
          <div className="relative aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl bg-muted">
            <img
              src={article.imageUrl}
              alt={article.aiTitle}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mb-6 flex justify-center">
          <div className="relative flex aspect-[16/9] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-muted">
            <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-20 w-auto object-contain opacity-60" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{article.category}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(article.latestPublishedAt).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>

      <h1 className="text-2xl font-bold leading-tight mb-4">{article.aiTitle}</h1>

      <div className="prose prose-sm max-w-none">
        <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {article.aiSummary}
        </p>
      </div>

      {/* Like / Dislike bar — haberin altında */}
      <HorizontalLikeBar articleId={article.id} />
    </div>
  );
}

export function NewsScreen() {
  const [active, setActive] = useState<string>('all');
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Track which article is open (from URL ?article=<id>)
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  // On mount, check URL for ?article=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    if (articleId) {
      setOpenArticleId(articleId);
    }
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const articleId = params.get('article');
      setOpenArticleId(articleId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Open article: push URL state
  const openArticle = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('article', id);
    window.history.pushState({}, '', url.toString());
    setOpenArticleId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Close article (go home): URL'deki ?article= parametresini sil ve popstate tetikle.
  // Bu, logoya tıklanınca çalışan handleHomeClick ile AYNI mantık — yani
  // "Tüm Haberler" sekmesi de, "Ana Sayfa" butonu da, logolar da aynı davranışı sergiler.
  const closeArticle = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('article')) {
      setOpenArticleId(null);
      return;
    }
    url.searchParams.delete('article');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Go back to previous page in browser history (browser back button behavior).
  // "Geri" butonu için: ana sayfaya değil, kullanıcının geldiği önceki sayfaya gider.
  // Eğer önceki sayfa yoksa (doğrudan article linki açılmışsa), closeArticle fallback'i
  // çağrılıp URL temizlenir ve ana listeye dönülür.
  const goBack = useCallback(() => {
    if (typeof window === 'undefined') return;
    // history.back() asenkron — popstate dinleyicisi state'i güncelleyecek.
    // Eğer history'de önceki sayfa yoksa (referrless navigation), back() hiçbir şey
    // yapmaz. Bu yüzden kısa bir timeout ile kontrol edip fallback uyguluyoruz.
    const hadArticle = new URL(window.location.href).searchParams.has('article');
    window.history.back();
    if (hadArticle) {
      // 300ms sonra hala article açıksa, back() hiçbir şey yapmadı demektir — fallback.
      setTimeout(() => {
        const stillHasArticle = new URL(window.location.href).searchParams.has('article');
        if (stillHasArticle) {
          closeArticle();
        }
      }, 300);
    }
  }, [closeArticle]);

  // Load articles when tab changes
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => setLoading(true));
    Promise.resolve().then(() => setError(null));
    setHasMore(false);

    const url =
      active === 'all'
        ? '/api/published-articles?limit=100&status=published'
        : `/api/published-articles?category=${encodeURIComponent(
            CATEGORY_MAP[active] ?? 'Güncel',
          )}&limit=${CATEGORY_LIMITS[CATEGORY_MAP[active] ?? 'Güncel'] ?? 30}&status=published`;

    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haberler yüklenemedi');
        const json = (await r.json()) as {
          articles: PublishedArticle[];
          hasMore?: boolean;
        };
        return json;
      })
      .then((data) => {
        if (cancelled) return;
        setArticles(data.articles ?? []);
        setHasMore(data.hasMore ?? false);
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

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await fetch(
        '/api/published-articles?layout=all&status=published&offset=30&limit=20',
        { cache: 'no-store' },
      );
      if (!r.ok) throw new Error('Daha fazla haber yüklenemedi');
      const json = (await r.json()) as {
        articles: PublishedArticle[];
        hasMore?: boolean;
      };
      setArticles((prev) => [...prev, ...(json.articles ?? [])]);
      setHasMore(json.hasMore ?? false);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const current = SUB_TABS.find((t) => t.id === active) ?? SUB_TABS[0];

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
      {/* Category tabs — sticky (kaybolmasın) */}
      <nav
        role="tablist"
        aria-label="Haber kategorileri"
        className="sticky z-20 mb-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1.5 shadow-sm"
        style={{ top: '160px' }}
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
              onClick={() => {
                setActive(tab.id);
                if (openArticleId) closeArticle();
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {isActive && articles.length > 0 && !openArticleId && (
                <span className="ml-1 rounded bg-muted-foreground/20 px-1.5 text-[10px] tabular-nums">
                  {articles.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Article detail (inline, not dialog) OR news grid */}
      {openArticleId ? (
        <ArticleDetailInline articleId={openArticleId} onBack={goBack} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
                ? 'Özel olarak işaretlediğiniz haberler burada toplanacak.'
                : 'Bu kategoride henüz haber yok.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a, i) => (
              <div key={a.id} className={i === 0 && !openArticleId ? 'col-span-full' : ''}>
                {i === 0 && !openArticleId ? (
                  <div className="flex h-full min-h-[200px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md hover:border-foreground/20 sm:flex-row" onClick={() => openArticle(a.id)} role="button" tabIndex={0}>
                    {a.imageUrl ? (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px]">
                        <img src={a.imageUrl} alt={a.aiTitle} className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    ) : (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px] flex items-center justify-center">
                        <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-20 w-auto object-contain opacity-50" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-2 p-6">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{a.category}</span>
                      </div>
                      <h3 className="text-xl font-bold leading-tight text-foreground hover:text-news">{a.aiTitle}</h3>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{a.aiSummary}</p>
                      <HorizontalLikeBar articleId={a.id} />
                    </div>
                  </div>
                ) : (
                  <PublishedArticleCard article={a} onOpen={(id) => openArticle(id)} />
                )}
              </div>
            ))}
          </div>

          {active === 'all' && hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Diğer Haberler
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
