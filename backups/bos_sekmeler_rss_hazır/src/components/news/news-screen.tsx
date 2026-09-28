'use client';

import { useState } from 'react';
import { Newspaper, Sparkles, FileText, FolderTree, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Sub-tab definitions for the News screen.
// Order matters: "Tüm Haberler" first, then 6 categories, then "Özel Haber" last.
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

export function NewsScreen() {
  const [active, setActive] = useState<string>('all');
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
            </button>
          );
        })}
      </nav>

      {/* Empty placeholder for the active sub-tab */}
      <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <current.icon className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          {current.label}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Bu sekme şu an boş. Haberler burada listelenecek.
        </p>
        {active === 'ozel' && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-news">
            <Sparkles className="h-3 w-3" />
            Özel olarak işaretlediğiniz haberler burada toplanır
          </p>
        )}
      </Card>
    </section>
  );
}
