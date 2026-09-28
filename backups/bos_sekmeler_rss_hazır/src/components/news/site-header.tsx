'use client';

import { FileText, FolderTree, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import { Badge } from '@/components/ui/badge';

export type Tab = 'news' | 'icerik' | 'sources';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
  totalSources?: number;
  totalArticles?: number;
};

export function SiteHeader({ active, onChange, totalSources, totalArticles }: Props) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'news', label: 'Haberler', icon: Newspaper, badge: totalArticles },
    { id: 'icerik', label: 'İçerik Dosyası', icon: FileText },
    { id: 'sources', label: 'Kaynaklar', icon: FolderTree, badge: totalSources },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Newspaper className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight">
              Haber Özet
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              RSS · Kategori derleyici
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-[1.25rem] px-1.5 text-[10px] tabular-nums"
                  >
                    {tab.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav */}
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 pb-2 sm:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
