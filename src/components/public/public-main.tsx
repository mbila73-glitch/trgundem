'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, AlertCircle, X, ChevronLeft, ChevronRight, Heart, Clock, Home, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PublishedArticleCard } from '@/components/news/published-article-card';
import { useHeart } from '@/lib/use-heart';
import { normalizeTr, proxyImageUrl, dateTimeShort, dateTimeLong } from '@/lib/format';
import type { PublishedArticle } from '@/lib/types';

// ===== Yardımcı fonksiyonlar =====

// Kategori bazlı haber listesi
function filterByCategory(articles: PublishedArticle[], category: string): PublishedArticle[] {
  return articles.filter(a => a.category === category);
}

// 10 kutuda kullanılan haberleri topla
function getUsedInBoxes(
  topBoxes: (PublishedArticle | null)[],
  sideBoxes: (PublishedArticle | null)[],
  bottomBoxes: (PublishedArticle | null)[],
): Set<string> {
  const used = new Set<string>();
  [...topBoxes, ...sideBoxes, ...bottomBoxes].forEach(a => {
    if (a) used.add(a.id);
  });
  return used;
}

// Ana pencere 20 haber — articles[0..19]
function getMainSlider(articles: PublishedArticle[]): PublishedArticle[] {
  return articles.slice(0, 20);
}

// Üst 4 kutu: Siyaset[0], Siyaset[1], Ekonomi[0], Ekonomi[1]
// Eksikse articles'dan tamamla (4 kutu hep dolu)
function getTopBoxes(articles: PublishedArticle[]): (PublishedArticle | null)[] {
  const siyaset = filterByCategory(articles, 'Siyaset');
  const ekonomi = filterByCategory(articles, 'Ekonomi / Finans');

  const boxes: (PublishedArticle | null)[] = [];
  const usedIds = new Set<string>();

  // Önce: Siyaset[0], Siyaset[1], Ekonomi[0], Ekonomi[1]
  const candidates = [siyaset[0], siyaset[1], ekonomi[0], ekonomi[1]];
  for (const c of candidates) {
    if (c && !usedIds.has(c.id)) {
      boxes.push(c);
      usedIds.add(c.id);
    }
  }

  // 4'ten azsa, articles'dan tamamla (ana sayfa sırasıyla)
  let i = 0;
  while (boxes.length < 4 && i < articles.length) {
    const a = articles[i];
    if (!usedIds.has(a.id)) {
      boxes.push(a);
      usedIds.add(a.id);
    }
    i++;
  }

  // 4'ten fazlaysa kes (normalde olmaz ama garanti)
  return boxes.slice(0, 4);
}

// Yan 2 kutu: articles[1] ve articles[2]
// Eğer topBoxes'te varsa, articles'ın sıradaki ilk 2 haberi (topBoxes'ta olmayan)
function getSideBoxes(articles: PublishedArticle[], topBoxes: (PublishedArticle | null)[]): (PublishedArticle | null)[] {
  const topIds = new Set(topBoxes.filter(Boolean).map(a => a!.id));
  const boxes: (PublishedArticle | null)[] = [];

  // Önce articles[1] ve articles[2]
  for (let i = 1; i <= 2 && i < articles.length; i++) {
    if (!topIds.has(articles[i].id)) {
      boxes.push(articles[i]);
    }
  }

  // 2'den azsa, articles'ın sıradaki ilk 2 haberi (topBoxes + sideBoxes'ta olmayan)
  let i = 3;
  const sideIds = new Set(boxes.filter(Boolean).map(a => a!.id));
  while (boxes.length < 2 && i < articles.length) {
    const a = articles[i];
    if (!topIds.has(a.id) && !sideIds.has(a.id)) {
      boxes.push(a);
      sideIds.add(a.id);
    }
    i++;
  }

  return boxes.slice(0, 2);
}

// Alt 4 kutu: Kamu[0], Spor[0], Bilim[0], Kültür[0]
// Eksikse aynı sırayla 2. haberlerle doldur: Kamu[1], Spor[1], Bilim[1], Kültür[1]
// Hâlâ eksikse articles'dan tamamla
function getBottomBoxes(
  articles: PublishedArticle[],
  topBoxes: (PublishedArticle | null)[],
  sideBoxes: (PublishedArticle | null)[],
): (PublishedArticle | null)[] {
  const kamu = filterByCategory(articles, 'Kamu / Resmi');
  const spor = filterByCategory(articles, 'Spor / Magazin');
  const bilim = filterByCategory(articles, 'Bilim / Teknoloji');
  const kultur = filterByCategory(articles, 'Kültür / Sanat');

  const usedIds = new Set<string>();
  [...topBoxes, ...sideBoxes].forEach(a => {
    if (a) usedIds.add(a.id);
  });

  const boxes: (PublishedArticle | null)[] = [];

  // 1. tur: Kamu[0], Spor[0], Bilim[0], Kültür[0]
  const candidates1 = [kamu[0], spor[0], bilim[0], kultur[0]];
  for (const c of candidates1) {
    if (c && !usedIds.has(c.id)) {
      boxes.push(c);
      usedIds.add(c.id);
    }
  }

  // 2. tur (eksikse): Kamu[1], Spor[1], Bilim[1], Kültür[1]
  if (boxes.length < 4) {
    const candidates2 = [kamu[1], spor[1], bilim[1], kultur[1]];
    for (const c of candidates2) {
      if (boxes.length >= 4) break;
      if (c && !usedIds.has(c.id)) {
        boxes.push(c);
        usedIds.add(c.id);
      }
    }
  }

  // Hâlâ 4'ten azsa, articles'dan tamamla
  let i = 0;
  while (boxes.length < 4 && i < articles.length) {
    const a = articles[i];
    if (!usedIds.has(a.id)) {
      boxes.push(a);
      usedIds.add(a.id);
    }
    i++;
  }

  return boxes.slice(0, 4);
}

// Kalan haberler — ana pencerede (20) OLMAYAN tüm haberler
// 10 kutudaki haberler kalan içinde de olabilir (kullanıcı kuralı: "ana pencerede olmayanlar")
function getRemaining(
  articles: PublishedArticle[],
  topBoxes: (PublishedArticle | null)[],
  sideBoxes: (PublishedArticle | null)[],
  bottomBoxes: (PublishedArticle | null)[],
  mainSlider: PublishedArticle[],
): PublishedArticle[] {
  const usedInSlider = new Set(mainSlider.map(a => a.id));
  // Ana pencerede (20 haber) OLMAYAN tüm haberleri dön
  // 10 kutudaki tekrar kontrolü yok — kullanıcı "tekrar olabilir" dedi
  return articles.filter(a => !usedInSlider.has(a.id));
}

// ===== UI Component'ler =====

function HeartCounter({ articleId }: { articleId: string }) {
  const { hearts, userLiked, toggleHeart } = useHeart(articleId);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleHeart(); }}
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition ${userLiked ? 'text-rose-600' : 'text-muted-foreground hover:text-rose-600'}`}
    >
      <Heart className={`h-3.5 w-3.5 ${userLiked ? 'fill-rose-600' : ''}`} />
      <span className="tabular-nums">{hearts}</span>
    </button>
  );
}

// Büyük kart (üst 4 kutu + alt 4 kutu için)
function NewsCardLarge({ article, onOpen }: { article: PublishedArticle; onOpen: (id: string) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(article.id)}
      className="group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-md hover:border-foreground/20"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {/* Logo her zaman arka planda — görsel yüklenemezse görünür */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/trlogo2.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-50" />
        </div>
        {/* Görsel varsa üstte — yüklenemezse gizlenir, logo görünür */}
        {article.imageUrl && (
          <img
            src={proxyImageUrl(article.imageUrl) || undefined}
            alt={article.aiTitle}
            loading="lazy"
            className="relative h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.aiTitle}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-1.5 border-t border-border/50">
          <HeartCounter articleId={article.id} />
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            <Clock className="h-3 w-3" />
            {dateTimeShort(article.latestPublishedAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}

// Orta kart (yan 2 kutu için)
function NewsCardMedium({ article, onOpen }: { article: PublishedArticle; onOpen: (id: string) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(article.id)}
      className="group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-md hover:border-foreground/20"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted flex-shrink-0">
        {/* Logo her zaman arka planda — görsel yüklenemezse görünür */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/trlogo2.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-50" />
        </div>
        {/* Görsel varsa üstte — yüklenemezse gizlenir, logo görünür */}
        {article.imageUrl && (
          <img
            src={proxyImageUrl(article.imageUrl) || undefined}
            alt={article.aiTitle}
            loading="lazy"
            className="relative h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 min-h-0">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition group-hover:text-news">
          {article.aiTitle}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-1.5 border-t border-border/50">
          <HeartCounter articleId={article.id} />
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            <Clock className="h-3 w-3" />
            {dateTimeShort(article.latestPublishedAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}

// Ana pencere slider — 20 haber, tek tek göster, oklarla kayar, loop yapar
// Altında 1-20 sayfa numaraları (aktif olan kırmızı)
function MainSlider({ articles, onOpen }: { articles: PublishedArticle[]; onOpen: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollToTop = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      setCurrentIndex(0);
    }
  };

  const goToIndex = (index: number) => {
    if (!scrollRef.current) return;
    const width = scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left: index * width, behavior: 'smooth' });
    setCurrentIndex(index);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const width = el.clientWidth;
    if (width === 0) return;
    const currentIdx = Math.round(el.scrollLeft / width);

    if (direction === 'right') {
      if (currentIdx >= articles.length - 1) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
        setCurrentIndex(0);
      } else {
        el.scrollTo({ left: (currentIdx + 1) * width, behavior: 'smooth' });
        setCurrentIndex(currentIdx + 1);
      }
    } else {
      if (currentIdx <= 0) {
        const max = el.scrollWidth - el.clientWidth;
        el.scrollTo({ left: max, behavior: 'smooth' });
        setCurrentIndex(articles.length - 1);
      } else {
        el.scrollTo({ left: (currentIdx - 1) * width, behavior: 'smooth' });
        setCurrentIndex(currentIdx - 1);
      }
    }
  };

  // Scroll event — kullanıcı manuel kaydırırsa currentIndex güncelle
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const width = el.clientWidth;
        if (width === 0) return;
        const idx = Math.round(el.scrollLeft / width);
        if (idx >= 0 && idx < articles.length) {
          setCurrentIndex(idx);
        }
      }, 100);
    };
    el.addEventListener('scroll', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, [articles.length]);

  return (
    <div className="relative h-full flex flex-col">
      {/* Sol ok */}
      <button
        type="button"
        onClick={() => scroll('left')}
        className="absolute left-0 top-[45%] -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition shadow-lg"
        aria-label="Önceki"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Sağ ok */}
      <button
        type="button"
        onClick={() => scroll('right')}
        className="absolute right-0 top-[45%] -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition shadow-lg"
        aria-label="Sonraki"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Yatay scroll — tek kart görünür, loop yapar */}
      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {articles.map((a, i) => (
          <div
            key={a.id}
            className="snap-start flex-shrink-0 w-full h-full relative"
          >
            <Card
              role="button"
              tabIndex={0}
              onClick={() => onOpen(a.id)}
              className="group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition hover:shadow-lg"
            >
              {/* Görsel — yüksekliğin yarısı kadar (16/9 aspect) */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted flex-shrink-0">
                {/* Logo her zaman arka planda — görsel yüklenemezse görünür */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src="/trlogo2.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-50" />
                </div>
                {/* Görsel varsa üstte — yüklenemezse gizlenir, logo görünür */}
                {a.imageUrl && (
                  <img
                    src={proxyImageUrl(a.imageUrl) || undefined}
                    alt={a.aiTitle}
                    loading="lazy"
                    className="relative h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {/* Başa Dön butonu — sağ üst, her kartta */}
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="absolute top-2 right-2 flex h-7 items-center justify-center rounded-full bg-black/60 text-white text-[10px] font-bold shadow-md px-2 hover:bg-black/80 transition z-10"
                  aria-label="Başa Dön"
                >
                  ↑ Başa Dön
                </button>
              </div>
              {/* Başlık + kalp — kalan yüksekliği doldur (özet yok) */}
              <div className="flex flex-1 flex-col gap-2 p-4 min-h-0">
                <h3 className="line-clamp-3 text-base font-bold leading-snug text-foreground transition group-hover:text-news">
                  {a.aiTitle}
                </h3>
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-border/50">
                  <HeartCounter articleId={a.id} />
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                    <Clock className="h-3 w-3" />
                    {dateTimeLong(a.latestPublishedAt)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* PAGINATION — pencere içine entegre, oklar + numaralar */}
      <div className="flex items-center justify-center gap-1.5 py-2 bg-slate-800 border-t-2 border-slate-700 rounded-b-lg">
        {/* Sol ok */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scroll('left'); }}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 transition shadow-md"
          aria-label="Önceki"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Sayfa numaraları */}
        <div className="flex items-center gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {articles.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); goToIndex(i); }}
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold transition ${
                i === currentIndex
                  ? 'bg-red-600 text-white shadow-lg scale-110 ring-2 ring-red-400'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
              }`}
              aria-label={`Sayfa ${i + 1}`}
              aria-current={i === currentIndex}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Sağ ok */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scroll('right'); }}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 transition shadow-md"
          aria-label="Sonraki"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ===== Ana component =====

export function PublicMain() {
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Arama
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublishedArticle[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Haber detayı (?haber=ID)
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  // Mount'ta articles yükle
  useEffect(() => {
    let cancelled = false;
    fetch('/api/published-articles?layout=all&status=published', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haberler yüklenemedi');
        const json = (await r.json()) as { articles: PublishedArticle[] };
        return json;
      })
      .then((data) => {
        if (cancelled) return;
        setArticles(data.articles ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // URL'de ?haber=ID varsa aç
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const haber = params.get('haber');
    if (haber) setOpenArticleId(haber);

    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      setOpenArticleId(p.get('haber'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openArticle = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('haber', id);
    window.history.pushState({}, '', url.toString());
    setOpenArticleId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closeArticle = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('haber')) {
      setOpenArticleId(null);
      return;
    }
    url.searchParams.delete('haber');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Arama yap
  const handleSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/published-articles?search=${encodeURIComponent(query)}&status=published`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Arama yapılamadı');
      const json = (await r.json()) as { articles?: PublishedArticle[] };
      setSearchResults(json.articles ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSearch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  // Hesaplamalar
  const topBoxes = getTopBoxes(articles);
  const sideBoxes = getSideBoxes(articles, topBoxes);
  const bottomBoxes = getBottomBoxes(articles, topBoxes, sideBoxes);
  const mainSlider = getMainSlider(articles);
  const remaining = getRemaining(articles, topBoxes, sideBoxes, bottomBoxes, mainSlider);

  // Arama sonuçları varsa onu göster
  if (searchResults !== null) {
    return (
      <main className="flex-1 bg-background">
        {/* Arama çubuğu sticky */}
        <div className="sticky top-[152px] z-20 bg-background border-b border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-1">
            <form onSubmit={onSearchSubmit} className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5">
              <Search className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Haberlerde ara..."
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-5 px-1"
              />
              <Button type="submit" size="sm" disabled={searching || !searchQuery.trim()} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-5 px-2 py-0">
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                <span className="hidden sm:inline">Ara</span>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearSearch} className="gap-1 text-[10px] h-5 px-1.5 py-0">
                <X className="h-3 w-3" /> Temizle
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
          {searching ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />)}
            </div>
          ) : searchResults.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <Search className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Haber bulunamadı</p>
              <p className="text-xs text-muted-foreground">"{searchQuery}" için sonuç yok.</p>
            </Card>
          ) : (
            <>
              <div className="mb-3 text-xs text-muted-foreground">
                "<strong className="text-foreground">{searchQuery}</strong>" için {searchResults.length} haber bulundu
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map(a => (
                  <PublishedArticleCard key={a.id} article={a} onOpen={openArticle} />
                ))}
              </div>
              <div className="mt-6 flex justify-center gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={clearSearch} className="gap-1.5 text-sm">
                  <Home className="h-4 w-4" /> Ana Sayfa
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  // Haber detayı açıksa
  if (openArticleId) {
    const article = articles.find(a => a.id === openArticleId);
    if (article) {
      return (
        <main className="flex-1 bg-background">
          {/* Arama çubuğu sticky */}
          <div className="sticky top-[152px] z-20 bg-background border-b border-border">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-1">
              <form onSubmit={onSearchSubmit} className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5">
                <Search className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Haberlerde ara..."
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-5 px-1"
                />
                <Button type="submit" size="sm" disabled={searching || !searchQuery.trim()} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-5 px-2 py-0">
                  {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  <span className="hidden sm:inline">Ara</span>
                </Button>
              </form>
            </div>
          </div>

          <div className="mx-auto max-w-3xl py-4 px-4 sm:px-6">
            <div className="mb-4 flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={closeArticle} className="gap-1.5 text-sm">
                <ArrowLeft className="h-4 w-4" /> Geri
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setOpenArticleId(null); window.history.pushState({}, '', '/'); }} className="gap-1.5 text-sm">
                <Home className="h-4 w-4" /> Ana Sayfa
              </Button>
            </div>

            {article.imageUrl ? (
              <div className="mb-6 flex justify-center">
                <div className="relative aspect-[16/9] w-full max-w-2xl overflow-hidden rounded-xl bg-muted">
                  <img src={proxyImageUrl(article.imageUrl) || undefined} alt={article.aiTitle} className="h-full w-full object-cover" />
                </div>
              </div>
            ) : (
              <div className="mb-6 flex justify-center">
                <div className="relative flex aspect-[16/9] w-full max-w-2xl items-center justify-center overflow-hidden rounded-xl bg-muted">
                  <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-20 w-auto object-contain opacity-60" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {dateTimeLong(article.latestPublishedAt)}
              </span>
            </div>

            <h1 className="text-2xl font-bold leading-tight mb-4">{article.aiTitle}</h1>
            <div className="prose prose-sm max-w-none">
              <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">{article.aiSummary}</p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4">
              <HeartCounter articleId={article.id} />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeArticle} className="gap-1.5 text-sm">
                  <ArrowLeft className="h-4 w-4" /> Geri
                </Button>
              </div>
            </div>
          </div>
        </main>
      );
    }
  }

  // Normal ana sayfa akışı
  return (
    <main className="flex-1 bg-background">
      {/* Arama çubuğu — sticky, kompakt (tek karakter yüksekliği) */}
      <div className="sticky top-[152px] z-20 bg-background border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-1">
          <form onSubmit={onSearchSubmit} className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5">
            <Search className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Haberlerde ara..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-5 px-1"
            />
            <Button type="submit" size="sm" disabled={searching || !searchQuery.trim()} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-5 px-2 py-0">
              {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              <span className="hidden sm:inline">Ara</span>
            </Button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
            <div className="grid grid-rows-2 gap-4">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        </div>
      ) : articles.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Henüz haber yok</p>
          </Card>
        </div>
      ) : (
        <>
          {/* 1. ÜST 4 KUTU: Siyaset[0], Siyaset[1], Ekonomi[0], Ekonomi[1] */}
          <section className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {topBoxes.map((a, i) => a ? (
                <NewsCardLarge key={a.id} article={a} onOpen={openArticle} />
              ) : (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
              ))}
            </div>
          </section>

          {/* 2. ANA PENCERE (20 haber) + YAN 2 KUTU — yükseklikleri eşit */}
          <section className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Sol: Ana pencere (20 haber, tek tek, oklarla kayar) */}
              <div className="lg:col-span-2 flex flex-col gap-2 min-h-[400px] sm:min-h-[480px]">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground/80">Ana Haberler</h2>
                  <span className="text-[10px] text-muted-foreground">{mainSlider.length} haber — oklarla gezin</span>
                </div>
                <div className="flex-1 min-h-0">
                  <MainSlider articles={mainSlider} onOpen={openArticle} />
                </div>
              </div>

              {/* Sağ: 2 kutu alt alta — toplam yükseklik ana pencereye eşit, her biri yarım */}
              <div className="grid grid-rows-2 gap-4 min-h-[400px] sm:min-h-[480px]">
                {sideBoxes.map((a, i) => a ? (
                  <div key={a.id} className="min-h-0">
                    <NewsCardMedium article={a} onOpen={openArticle} />
                  </div>
                ) : (
                  <Skeleton key={i} className="rounded-xl" />
                ))}
              </div>
            </div>
          </section>

          {/* 3. ALT 4 KUTU: Kamu[0], Spor[0], Bilim[0], Kültür[0] */}
          <section className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {bottomBoxes.map((a, i) => a ? (
                <NewsCardLarge key={a.id} article={a} onOpen={openArticle} />
              ) : (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
              ))}
            </div>
          </section>

          {/* 4. KALAN HABERLER — 3'lü gruplar halinde alt alta */}
          {remaining.length > 0 && (
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Daha Fazla Haber</span>
                <Badge variant="secondary" className="text-[10px]">{remaining.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {remaining.map(a => (
                  <PublishedArticleCard key={a.id} article={a} onOpen={openArticle} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
