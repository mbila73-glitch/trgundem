'use client';

import { FileText, RefreshCw, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type Tab = 'icerik' | 'sources';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  totalSources?: number;
  totalArticles?: number;
};

export function SiteHeader({
  active,
  onChange,
  onRefresh,
  refreshing,
  totalSources,
  totalArticles,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <FileText className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight">
              Haber Özet
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              RSS · AI özet
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => onChange('icerik')}
            className={`relative inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition ${
              active === 'icerik'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            İçerik Dosyası
            {typeof totalArticles === 'number' && totalArticles > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 min-w-[1.25rem] px-1.5 text-[10px] tabular-nums"
              >
                {totalArticles}
              </Badge>
            )}
          </button>
          <button
            type="button"
            onClick={() => onChange('sources')}
            className={`relative inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition ${
              active === 'sources'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Kaynaklar
            {typeof totalSources === 'number' && totalSources > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 min-w-[1.25rem] px-1.5 text-[10px] tabular-nums"
              >
                {totalSources}
              </Badge>
            )}
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">
                {refreshing ? 'Yenileniyor…' : 'Beslemeleri Yenile'}
              </span>
              <span className="sm:hidden">Yenile</span>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav */}
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 pb-2 sm:hidden">
        <button
          type="button"
          onClick={() => onChange('icerik')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
            active === 'icerik'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground'
          }`}
        >
          İçerik
        </button>
        <button
          type="button"
          onClick={() => onChange('sources')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
            active === 'sources'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground'
          }`}
        >
          Kaynaklar
        </button>
      </div>
    </header>
  );
}
