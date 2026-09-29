'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { NewsScreen } from '@/components/news/news-screen';
import { AdminPanel } from '@/components/news/admin-panel';
import { ReaderContactForm } from '@/components/news/reader-contact-form';
import { ThemeToggle } from '@/components/news/theme-toggle';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [readerFormOpen, setReaderFormOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sade header — sadece logo + "+" + tema */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <span className="text-lg font-bold">H</span>
            </span>
            <span className="text-base font-semibold tracking-tight">
              Haber
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAdminOpen(true)}
              aria-label="Yönetici"
              className="h-9 w-9"
            >
              <span className="text-xl">+</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <NewsScreen />
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:px-6">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">Haber</span>
            {' — '}
            Güncel haber portalı
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReaderFormOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Mail className="h-3.5 w-3.5" />
            Okuyucu Temsilcisine Ulaşınız
          </Button>
        </div>
      </footer>

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      <ReaderContactForm open={readerFormOpen} onClose={() => setReaderFormOpen(false)} />
    </div>
  );
}
