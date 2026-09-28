'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Newspaper,
  Power,
  Clock,
  FolderTree,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AddSourceDialog } from './add-source-dialog';
import type { Source, RefreshResult } from '@/lib/types';
import { colorForName, hostFromUrl, initials, relativeTime } from '@/lib/format';

type Props = {
  onSourcesChange?: () => void;
};

const ALL = '__all__';

export function SourcesPanel({ onSourcesChange }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/sources', { cache: 'no-store' });
      const json = (await r.json()) as { sources: Source[] };
      setSources(json.sources ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaynaklar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, { count: number; articles: number }>();
    for (const s of sources) {
      const cat = s.category ?? '(Diğer)';
      const prev = map.get(cat) ?? { count: 0, articles: 0 };
      map.set(cat, {
        count: prev.count + 1,
        articles: prev.articles + (s._count?.articles ?? 0),
      });
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sources]);

  const filtered = useMemo(() => {
    if (categoryFilter === ALL) return sources;
    return sources.filter((s) => (s.category ?? '(Diğer)') === categoryFilter);
  }, [sources, categoryFilter]);

  const totalArticles = useMemo(
    () =>
      sources.reduce(
        (acc, s) => acc + (s._count?.articles ?? 0),
        0,
      ),
    [sources],
  );

  const handleToggle = async (s: Source, active: boolean) => {
    setBusyId(s.id);
    try {
      const r = await fetch(`/api/sources/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!r.ok) throw new Error('Güncellenemedi');
      setSources((arr) =>
        arr.map((x) => (x.id === s.id ? { ...x, active } : x)),
      );
      toast.success(
        `"${s.name}" ${active ? 'aktif edildi' : 'devre dışı bırakıldı'}`,
      );
      onSourcesChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncelleme hatası');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (s: Source) => {
    setBusyId(s.id);
    try {
      const r = await fetch(`/api/sources/${s.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Silinemedi');
      setSources((arr) => arr.filter((x) => x.id !== s.id));
      toast.success(`"${s.name}" silindi`);
      onSourcesChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatası');
    } finally {
      setBusyId(null);
    }
  };

  const handleRefreshOne = async (s: Source) => {
    setRefreshingId(s.id);
    try {
      const r = await fetch(`/api/sources/${s.id}`, { method: 'POST' });
      const json = (await r.json()) as { result: RefreshResult };
      if (json.result.error) {
        toast.error(
          `"${s.name}" yenilenemedi: ${json.result.error.slice(0, 80)}`,
        );
      } else {
        toast.success(
          `"${s.name}" yenilendi · ${json.result.added} yeni haber`,
        );
      }
      await load();
      onSourcesChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yenileme hatası');
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Kaynaklar</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {sources.length} kaynak · {totalArticles.toLocaleString('tr-TR')}{' '}
            makale · {categories.length} kategori
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]" aria-label="Kategori filtrele">
              <FolderTree className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue placeholder="Kategori seç" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tüm kategoriler</SelectItem>
              {categories.map(([cat, info]) => (
                <SelectItem key={cat} value={cat}>
                  {cat} ({info.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddSourceDialog
            onAdded={() => {
              load();
              onSourcesChange?.();
            }}
          />
        </div>
      </header>

      {/* Category chips for quick filter */}
      {!loading && categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter(ALL)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              categoryFilter === ALL
                ? 'border-foreground/30 bg-secondary text-secondary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/20'
            }`}
          >
            Tümü ({sources.length})
          </button>
          {categories.map(([cat, info]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                categoryFilter === cat
                  ? 'border-news/40 bg-news/10 text-news'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/20'
              }`}
            >
              {cat} ({info.count} · {info.articles.toLocaleString('tr-TR')})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Newspaper className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Bu kategoride kaynak yok.
            </p>
          </Card>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <Card
              key={s.id}
              className={`flex flex-col gap-3 p-4 ${s.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback
                    className={`text-xs font-semibold ${colorForName(s.name)}`}
                  >
                    {initials(s.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold" title={s.name}>
                      {s.name}
                    </h3>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-news"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{hostFromUrl(s.url)}</span>
                  </a>
                  {s.category && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[9px] uppercase tracking-wide"
                    >
                      {s.category}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Newspaper className="h-3 w-3" />
                  {(s._count?.articles ?? 0).toLocaleString('tr-TR')} haber
                </span>
                {s.lastFetched && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {relativeTime(s.lastFetched)}
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={s.active}
                    onCheckedChange={(v) => handleToggle(s, v)}
                    disabled={busyId === s.id}
                    aria-label="Kaynak aktif"
                  />
                  <span className="inline-flex items-center gap-1">
                    <Power className="h-3 w-3" />
                    {s.active ? 'Aktif' : 'Pasif'}
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRefreshOne(s)}
                    disabled={refreshingId === s.id || busyId === s.id}
                    className="h-8 gap-1 px-2 text-xs"
                  >
                    {refreshingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Yenile
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === s.id}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Kaynağı sil?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <strong>{s.name}</strong> kaynağı ve bu kaynağa ait
                          tüm haberler kalıcı olarak silinecek.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(s)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Sil
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
