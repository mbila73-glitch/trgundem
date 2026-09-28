'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Source } from '@/lib/types';

type Props = {
  onAdded?: (s: Source) => void;
  trigger?: React.ReactNode;
};

const POPULAR_SUGGESTIONS: Array<{ name: string; url: string; category: string }> = [
  {
    name: 'Anadolu Ajansı — Gündem',
    url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel',
    category: 'Güncel',
  },
  {
    name: 'TRT Haber — Sondakika',
    url: 'https://www.trthaber.com/sondakika.rss',
    category: 'Güncel',
  },
  {
    name: 'Sözcü — Tümü',
    url: 'https://www.sozcu.com.tr/rss/all.xml',
    category: 'Güncel',
  },
  {
    name: 'Bloomberg HT',
    url: 'https://www.bloomberght.com/rss',
    category: 'Ekonomi / Finans',
  },
  {
    name: 'Webrazzi — Teknoloji',
    url: 'https://webrazzi.com/kategori/teknoloji/feed',
    category: 'Bilim / Teknoloji',
  },
  {
    name: 'Evrim Ağacı',
    url: 'https://evrimagaci.org/rss.xml',
    category: 'Bilim / Teknoloji',
  },
  {
    name: 'NTV Spor — Futbol',
    url: 'https://www.ntvspor.net/rss/kategori/futbol',
    category: 'Spor / Magazin',
  },
];

export function AddSourceDialog({ onAdded, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          category: category.trim() || null,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Kayıt başarısız');
      toast.success(`"${json.source.name}" kaynağı eklendi`);
      onAdded?.(json.source as Source);
      setName('');
      setUrl('');
      setCategory('');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ekleme hatası');
    } finally {
      setSubmitting(false);
    }
  };

  const applySuggestion = (s: { name: string; url: string; category: string }) => {
    setName(s.name);
    setUrl(s.url);
    setCategory(s.category);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Kaynak Ekle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni RSS Kaynağı Ekle</DialogTitle>
          <DialogDescription>
            Haberleri çekilecek RSS beslemesinin adı, URL&apos;i ve kategorisini
            girin. Ekledikten sonra ilk yenileme otomatik yapılır.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Kaynak adı</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. BBC Türkçe"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">RSS URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/rss.xml"
              type="url"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Kategori (opsiyonel)</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Örn. Genel, Teknoloji, Spor"
            />
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Popüler kaynaklar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SUGGESTIONS.map((s) => (
                <button
                  type="button"
                  key={s.url}
                  onClick={() => applySuggestion(s)}
                  className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground/80 transition hover:border-foreground/30 hover:bg-muted"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              İptal
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Ekleniyor…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Ekle ve Yenile
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
