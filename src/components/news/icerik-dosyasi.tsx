'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileDown,
  Hash,
  Newspaper,
  CheckCircle2,
  AlignLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type FileInfo = {
  ok: boolean;
  path: string;
  sizeBytes: number;
  sizeKb: number;
  lastModified: string;
  lineCount: number;
  totalArticles: number;
  totalSources: number;
  withDescription: number;
  preview: string;
  error?: string;
};

type Props = {
  refreshSignal?: number;
};

export function IcerikDosyasi({ refreshSignal = 0 }: Props) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/icerik?format=json', { cache: 'no-store' });
      const json = (await r.json()) as FileInfo;
      if (!r.ok) throw new Error((json as { error?: string }).error || 'Yükleme hatası');
      setInfo(json);
    } catch (e) {
      setInfo(null);
      toast.error(e instanceof Error ? e.message : 'Dosya yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Poll every 5s while a rebuild is running
  useEffect(() => {
    if (!building) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [building, load]);

  const handleRebuild = async () => {
    setBuilding(true);
    try {
      const r = await fetch('/api/icerik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(json.error || 'Yeniden oluşturma başlatılamadı');
      toast.success('Dosya yeniden oluşturuluyor (arka planda)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İstek hatası');
      setBuilding(false);
    }
    setTimeout(() => setBuilding(false), 15000);
  };

  const handleDownload = () => {
    window.open('/api/icerik', '_blank');
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">İçerik Dosyası</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tüm RSS haberleri kaynak linki, yayın zamanı ve RSS açıklaması ile{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">rss_icerik.md</code>{' '}
            dosyasında saklanır. Sitede yayınlanmaz, dosya olarak tutulur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRebuild}
            disabled={building}
            className="gap-1.5"
          >
            {building ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Dosyayı Yeniden Oluştur
          </Button>
        </div>
      </header>

      {loading ? (
        <Card className="p-6">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-4 h-32 w-full" />
        </Card>
      ) : !info ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Dosya bulunamadı. &ldquo;Dosyayı Yeniden Oluştur&rdquo; butonuna
            basın.
          </p>
          <Button size="sm" variant="outline" onClick={handleRebuild}>
            Oluştur
          </Button>
        </Card>
      ) : (
        <>
          {/* Stats cards */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              icon={FileText}
              label="Dosya boyutu"
              value={`${info.sizeKb.toLocaleString('tr-TR')} KB`}
            />
            <StatCard
              icon={Hash}
              label="Satır sayısı"
              value={info.lineCount.toLocaleString('tr-TR')}
            />
            <StatCard
              icon={Newspaper}
              label="Toplam makale"
              value={info.totalArticles.toLocaleString('tr-TR')}
            />
            <StatCard
              icon={FileDown}
              label="Kaynak sayısı"
              value={String(info.totalSources)}
            />
            <StatCard
              icon={AlignLeft}
              label="Açıklamalı makale"
              value={info.withDescription.toLocaleString('tr-TR')}
            />
            <StatCard
              icon={CheckCircle2}
              label="Son güncelleme"
              value={new Date(info.lastModified).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          </div>

          {/* File path + download */}
          <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-news/10 text-news">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-sm font-medium">/download/rss_icerik.md</p>
                <p className="text-xs text-muted-foreground">
                  Markdown formatı · {info.sizeKb.toLocaleString('tr-TR')} KB ·{' '}
                  {info.lineCount.toLocaleString('tr-TR')} satır
                </p>
              </div>
            </div>
            <Button onClick={handleDownload} size="sm" className="gap-1.5">
              <Download className="h-4 w-4" />
              İndir (.md)
            </Button>
          </Card>

          {/* Preview */}
          <Card className="overflow-hidden">
            <header className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                İçerik önizlemesi (ilk 8 KB)
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {info.lineCount.toLocaleString('tr-TR')} satırın tamamı için indirin
              </Badge>
            </header>
            <pre className="max-h-[500px] overflow-auto news-scroll bg-muted/20 p-4 text-[11px] leading-relaxed text-foreground/80">
              <code className="font-mono whitespace-pre-wrap">{info.preview}</code>
            </pre>
          </Card>

          {/* Background job indicator */}
          {building && (
            <div className="sticky bottom-4 z-30 mx-auto w-fit rounded-full border border-news/40 bg-background/95 px-4 py-1.5 text-xs shadow-md backdrop-blur">
              <span className="inline-flex items-center gap-2 text-news">
                <Loader2 className="h-3 w-3 animate-spin" />
                Dosya yeniden oluşturuluyor…
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}
