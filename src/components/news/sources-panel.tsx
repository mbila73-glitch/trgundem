'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Newspaper,
  Power,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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

export function SourcesPanel({ onSourcesChange }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Kaynaklar</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            RSS beslemelerini ekleyin, kapatın veya tek tek yenileyin.
            Tüm haberler bu kaynaklardan çekilir.
          </p>
        </div>
        <AddSourceDialog onAdded={() => { load(); onSourcesChange?.(); }} />
      </header>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Henüz kaynak yok. İlk RSS kaynağınızı ekleyin.
          </p>
          <AddSourceDialog onAdded={() => { load(); onSourcesChange?.(); }} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <Card
              key={s.id}
              className={`flex flex-col gap-3 p-4 ${s.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback
                    className={`text-xs font-semibold ${colorForName(s.name)}`}
                  >
                    {initials(s.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {s.name}
                    </h3>
                    {s.category && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase tracking-wide"
                      >
                        {s.category}
                      </Badge>
                    )}
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
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Newspaper className="h-3 w-3" />
                  {s._count.articles} haber
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
                        <AlertDialogTitle>
                          Kaynağı sil?
                        </AlertDialogTitle>
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
