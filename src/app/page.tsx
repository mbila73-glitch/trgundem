'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader, type Tab } from '@/components/news/site-header';
import { NewsFeed } from '@/components/news/news-feed';
import { SourcesPanel } from '@/components/news/sources-panel';
import { Button } from '@/components/ui/button';

type Stats = { totalSources: number; totalArticles: number };

export default function Home() {
  const [tab, setTab] = useState<Tab>('feed');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

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
    } catch {
      /* ignore stats errors */
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/feeds/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await r.json()) as {
        results?: {
          sourceName: string;
          added: number;
          fetched: number;
          error?: string;
        }[];
        error?: string;
      };
      if (!r.ok) throw new Error(json.error || 'Yenileme başarısız');
      const results = json.results ?? [];
      const totalAdded = results.reduce((acc, x) => acc + x.added, 0);
      const failed = results.filter((x) => x.error);
      toast.success(
        `${results.length} kaynak yenilendi · ${totalAdded} yeni haber çekildi`,
      );
      if (failed.length > 0) {
        toast.warning(
          `${failed.length} kaynak başarısız: ${failed
            .slice(0, 3)
            .map((x) => x.sourceName)
            .join(', ')}`,
        );
      }
      setRefreshSignal((s) => s + 1);
      await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yenileme hatası');
    } finally {
      setRefreshing(false);
    }
  }, [loadStats]);

  const handleInitialSeed = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/sources?action=seed', { method: 'POST' });
      const json = (await r.json()) as {
        added?: number;
        refreshResults?: { added: number; sourceName: string; error?: string }[];
      };
      const added = json.added ?? 0;
      if (added > 0) {
        toast.success(`${added} varsayılan kaynak eklendi ve yenilendi`);
      }
      const results = json.refreshResults ?? [];
      const totalNew = results.reduce((acc, x) => acc + x.added, 0);
      if (totalNew > 0) {
        toast.message(`${totalNew} yeni haber çekildi`);
      }
      setRefreshSignal((s) => s + 1);
      await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed hatası');
    } finally {
      setRefreshing(false);
    }
  }, [loadStats]);

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
                  Haber Özet, BBC Türkçe, NTV, TRT Haber, Hürriyet ve The
                  Guardian gibi popüler RSS kaynaklarından haberleri çeker ve
                  her birini yapay zeka ile 3 cümlede özetler. Aşağıdaki
                  butona basarak varsayılan kaynakları ekleyip ilk yenilemeyi
                  başlatabilirsiniz.
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
                    Varsayılan kaynakları ekle
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTab('sources')}
                    size="lg"
                  >
                    Kendi kaynaklarımı ekleyeceğim
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
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            <span className="font-semibold text-foreground/80">Haber Özet</span>
            {' — '}
            RSS + AI özetlenen Türkçe haber sitesi
          </p>
          <p>
            Yapay zeka desteği ile{' '}
            <span className="text-news">GLM</span> · Next.js 16
          </p>
        </div>
      </footer>
    </div>
  );
}
