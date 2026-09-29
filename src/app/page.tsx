'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { SiteHeader, type Tab } from '@/components/news/site-header';
import { NewsScreen } from '@/components/news/news-screen';
import { IcerikDosyasi } from '@/components/news/icerik-dosyasi';
import { SourcesPanel } from '@/components/news/sources-panel';
import { AdminPanel } from '@/components/news/admin-panel';
import { ReaderContactForm } from '@/components/news/reader-contact-form';
import { Button } from '@/components/ui/button';

type Stats = { totalSources: number; totalArticles: number };

export default function Home() {
  const [tab, setTab] = useState<Tab>('news');
  const [stats, setStats] = useState<Stats | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [readerFormOpen, setReaderFormOpen] = useState(false);

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
    Promise.resolve().then(() => loadStats());
  }, [loadStats]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader
        active={tab}
        onChange={setTab}
        totalSources={stats?.totalSources ?? undefined}
        totalArticles={stats?.totalArticles ?? undefined}
        onAdminClick={() => setAdminOpen(true)}
      />

      <main className="flex-1">
        {tab === 'news' && <NewsScreen />}
        {tab === 'icerik' && <IcerikDosyasi />}
        {tab === 'sources' && <SourcesPanel onSourcesChange={() => loadStats()} />}
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            <span className="font-semibold text-foreground/80">Haber Özet</span>
            {' — '}
            RSS kategori derleyici
          </p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReaderFormOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Mail className="h-3.5 w-3.5" />
              Okuyucu Temsilcisine Ulaşınız
            </Button>
            <p>
              6 kategori · 59 kaynak · Çıktı{' '}
              <code className="rounded bg-muted px-1 py-0.5">rss_icerik.md</code>
            </p>
          </div>
        </div>
      </footer>

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      <ReaderContactForm open={readerFormOpen} onClose={() => setReaderFormOpen(false)} />
    </div>
  );
}
