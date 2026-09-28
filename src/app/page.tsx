'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader, type Tab } from '@/components/news/site-header';
import { NewsFeed } from '@/components/news/news-feed';
import { SourcesPanel } from '@/components/news/sources-panel';
import { Button } from '@/components/ui/button';

type Stats = { totalSources: number; totalArticles: number };

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_DURATION_MS = 90_000; // stop polling after this long

export default function Home() {
  const [tab, setTab] = useState<Tab>('feed');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const pollAbort = useRef<AbortController | null>(null);
  const pollStartTs = useRef<number>(0);
  const lastArticleCount = useRef<number>(0);
  const stableSince = useRef<number>(0);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/sources', { cache: 'no-store' });
      const json = (await r.json()) as {
        sources: { _count: { articles: number } }[];
      };
      const totalSources = json.sources?.length ?? 0;
      const totalArticles =
        json.sources?.reduce(
          (acc, s) => acc + (s._count?.articles ?? 0),
          0,
        ) ?? 0;
      setStats({ totalSources, totalArticles });
      return { totalSources, totalArticles };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Polling loop: continues until either (a) max duration is reached,
  // (b) article count stops growing for 2 consecutive polls.
  const poll = useCallback(async () => {
    const controller = new AbortController();
    pollAbort.current = controller;
    pollStartTs.current = Date.now();
    lastArticleCount.current = stats?.totalArticles ?? 0;
    stableSince.current = 0;

    const tick = async () => {
      if (controller.signal.aborted) return;
      const elapsed = Date.now() - pollStartTs.current;
      if (elapsed > POLL_MAX_DURATION_MS) {
        stopPolling('Zaman aşımı');
        return;
      }
      const r = await loadStats();
      if (!r) return;
      if (r.totalArticles === lastArticleCount.current) {
        stableSince.current += 1;
        if (stableSince.current >= 2) {
          stopPolling('Tamamlandı');
          return;
        }
      } else {
        stableSince.current = 0;
        lastArticleCount.current = r.totalArticles;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  }, [loadStats, stats?.totalArticles]);

  const stopPolling = useCallback(
    async (reason: 'Tamamlandı' | 'Zaman aşımı') => {
      if (pollAbort.current) {
        pollAbort.current.abort();
        pollAbort.current = null;
      }
      setRefreshing(false);
      const r = await loadStats();
      if (r) {
        toast.success(
          `${reason} · ${r.totalArticles.toLocaleString('tr-TR')} makale mevcut`,
        );
      } else {
        toast.success(reason);
      }
      setRefreshSignal((s) => s + 1);
    },
    [loadStats],
  );

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/feeds/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await r.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(json.error || 'Yenileme başlatılamadı');
      toast.success('Arka plan yenilemesi başlatıldı');
      // Start polling for progress
      void poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yenileme hatası');
      setRefreshing(false);
    }
  }, [poll]);

  const handleInitialSeed = useCallback(async () => {
    setRefreshing(true);
    try {
      // Trigger the same refresh-all flow — defaults are already seeded
      const r = await fetch('/api/feeds/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(json.error || 'Yenileme başlatılamadı');
      toast.success('Arka plan yenilemesi başlatıldı');
      void poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Başlatma hatası');
      setRefreshing(false);
    }
  }, [poll]);

  const hasSources = (stats?.totalSources ?? 0) > 0;
  const hasArticles = (stats?.totalArticles ?? 0) > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader
        active={tab}
        onChange={setTab}
        onRefresh={handleRefreshAll}
        refreshing={refreshing}
        totalSources={stats?.totalSources ?? undefined}
        totalArticles={stats?.totalArticles ?? undefined}
      />

      <main className="flex-1">
        {/* First-run banner: no sources yet */}
        {!refreshing && !hasSources && (
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border border-news/30 bg-news/[0.06] p-8 sm:p-12">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-news/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-news">
                  <Sparkles className="h-3 w-3" />
                  Hoş geldiniz
                </div>
                <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                  RSS kaynaklarınızı bağlayın, AI özetlerinizi hazırlayalım
                </h1>
                <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                  Haber Özet; Güncel, Kamu, Ekonomi, Bilim, Kültür ve Spor
                  kategorilerinde 160+ RSS kaynağından haberleri çeker ve her
                  birini yapay zeka ile 3 cümlede özetler. Sağ üstteki
                  &ldquo;Beslemeleri Yenile&rdquo; butonuna basarak haberleri
                  çekmeye başlayın.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    onClick={handleInitialSeed}
                    disabled={refreshing}
                    className="gap-2"
                    size="lg"
                  >
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Haberleri Çek
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTab('sources')}
                    size="lg"
                  >
                    Kaynakları Yönet
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {refreshing && !hasArticles && (
          <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-news" />
              <p className="text-sm text-muted-foreground">
                RSS beslemeleri çekiliyor, lütfen bekleyin…
              </p>
              {stats && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {stats.totalArticles.toLocaleString('tr-TR')} makale ·{' '}
                  {stats.totalSources} kaynak
                </p>
              )}
            </div>
          </section>
        )}

        {!refreshing && (hasSources || hasArticles) && (
          <>
            {tab === 'feed' ? (
              <NewsFeed
                refreshSignal={refreshSignal}
                onRefreshComplete={() => loadStats()}
              />
            ) : (
              <SourcesPanel onSourcesChange={() => loadStats()} />
            )}
          </>
        )}

        {/* When refreshing AND has articles, show live counter banner */}
        {refreshing && hasArticles && (
          <div className="sticky bottom-4 z-30 mx-auto w-fit rounded-full border border-news/40 bg-background/95 px-4 py-1.5 text-xs shadow-md backdrop-blur">
            <span className="inline-flex items-center gap-2 text-news">
              <Loader2 className="h-3 w-3 animate-spin" />
              Yenileniyor…{' '}
              <span className="tabular-nums">
                {(stats?.totalArticles ?? 0).toLocaleString('tr-TR')} makale ·{' '}
                {stats?.totalSources ?? 0} kaynak
              </span>
            </span>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            <span className="font-semibold text-foreground/80">Haber Özet</span>
            {' — '}
            RSS + AI özetlenen Türkçe haber sitesi
          </p>
          <p>
            6 kategori · 160 kaynak · Yapay zeka{' '}
            <span className="text-news">GLM</span> · Next.js 16
          </p>
        </div>
      </footer>
    </div>
  );
}
