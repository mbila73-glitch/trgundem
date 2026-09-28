'use client';

import { useCallback, useEffect, useState } from 'react';
import { SiteHeader, type Tab } from '@/components/news/site-header';
import { NewsScreen } from '@/components/news/news-screen';
import { IcerikDosyasi } from '@/components/news/icerik-dosyasi';
import { SourcesPanel } from '@/components/news/sources-panel';

type Stats = { totalSources: number; totalArticles: number };

export default function Home() {
  const [tab, setTab] = useState<Tab>('news');
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
    // Defer to a microtask so setState happens in a callback, not in the effect body
    Promise.resolve().then(() => loadStats());
  }, [loadStats]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader
        active={tab}
        onChange={setTab}
        totalSources={stats?.totalSources ?? undefined}
        totalArticles={stats?.totalArticles ?? undefined}
      />

      <main className="flex-1">
        {tab === 'news' && <NewsScreen />}
        {tab === 'icerik' && <IcerikDosyasi />}
        {tab === 'sources' && <SourcesPanel onSourcesChange={() => loadStats()} />}
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            <span className="font-semibold text-foreground/80">Haber Özet</span>
            {' — '}
            RSS kategori derleyici
          </p>
          <p>
            6 kategori · 59 kaynak · Çıktı{' '}
            <code className="rounded bg-muted px-1 py-0.5">rss_icerik.md</code>
          </p>
        </div>
      </footer>
    </div>
  );
}
