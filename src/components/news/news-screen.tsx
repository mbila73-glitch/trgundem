'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { Newspaper, FileText, FolderTree, Star, Loader2, AlertCircle, ChevronDown, ArrowLeft, Home, Heart, Clock, Search, X, Save, RotateCcw, Archive, Trash2, Edit3, Upload, Crop as CropIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PublishedArticleCard } from './published-article-card';
import { ImageEditor } from './image-editor';
import { useHeart } from '@/lib/use-heart';
import { proxyImageUrl, dateTimeLong, dateTimeShort, colorForName, categoryBadgeText, normalizeTr } from '@/lib/format';
import type { PublishedArticle } from '@/lib/types';
import { toast } from 'sonner';
const SUB_TABS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'all', label: "Türkiye'de Gündem", icon: Newspaper },
  { id: 'guncel', label: 'Siyaset', icon: FileText },
  { id: 'kamu', label: 'Kamu / Resmi', icon: FolderTree },
  { id: 'ekonomi', label: 'Ekonomi / Finans', icon: FolderTree },
  { id: 'bilim', label: 'Bilim / Teknoloji', icon: FolderTree },
  { id: 'kultur', label: 'Kültür / Sanat', icon: FolderTree },
  { id: 'spor', label: 'Spor / Magazin', icon: FolderTree },
  { id: 'ozel', label: 'Özel Haber', icon: Star },
];

const CATEGORY_MAP: Record<string, string> = {
  guncel: 'Siyaset',
  kamu: 'Kamu / Resmi',
  ekonomi: 'Ekonomi / Finans',
  bilim: 'Bilim / Teknoloji',
  spor: 'Spor / Magazin',
  kultur: 'Kültür / Sanat',
  ozel: 'Özel',
};

const CATEGORY_LIMITS: Record<string, number> = {
  'Siyaset': 15,
  'Kamu / Resmi': 8,
  'Ekonomi / Finans': 10,
  'Spor / Magazin': 8,
  'Bilim / Teknoloji': 5,
  'Kültür / Sanat': 8,
  'Özel': 30,
};

// Stable FNV-1a hash so SSR and CSR produce the same seed (avoids hydration mismatch).
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededInt(seed: number, min: number, max: number): number {
  const range = max - min + 1;
  return min + (seed % range);
}

function HorizontalLikeBar({ articleId }: { articleId: string }) {
  const { hearts, userLiked, toggleHeart } = useHeart(articleId);

  return (
    <div className="mt-auto flex items-center gap-3 pt-2 border-t border-border/50">
      <button type="button" onClick={toggleHeart} className={`inline-flex items-center gap-1.5 text-xs font-medium transition ${userLiked ? 'text-rose-600' : 'text-muted-foreground hover:text-rose-600'}`}>
        <Heart className={`h-4 w-4 ${userLiked ? 'fill-rose-600' : ''}`} />
        <span className="tabular-nums">{hearts}</span>
      </button>
    </div>
  );
}

// Inline article detail component (not a dialog)
function ArticleDetailInline({
  articleId,
  onBack,
}: {
  articleId: string;
  onBack: () => void;
}) {
  const [article, setArticle] = useState<PublishedArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/published-articles?limit=100&status=published`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haber yüklenemedi');
        const json = (await r.json()) as { articles: PublishedArticle[] };
        return json.articles?.find((a) => a.id === articleId) ?? null;
      })
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mx-auto h-[277px] w-full max-w-md rounded-xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Haber bulunamadı</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Geri Dön
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-4">
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('article');
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home className="h-4 w-4" />
          Ana Sayfa
        </Button>
      </div>

      {/* Görsel: 10 satır yüksekliğinde (~277px), genişlik aynı — aspect 16/9.9 (10% daha uzun) */}
      {article.imageUrl ? (
        <div className="mb-6 flex justify-center">
          <div className="relative aspect-[16/9.9] w-full max-w-md overflow-hidden rounded-xl bg-muted">
            <img
              src={proxyImageUrl(article.imageUrl) || undefined}
              alt={article.aiTitle}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mb-6 flex justify-center">
          <div className="relative flex aspect-[16/9.9] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-muted">
            <img src="/logo_TRG.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-60" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {dateTimeLong(article.latestPublishedAt)}
        </span>
      </div>

      <h1 className="text-2xl font-bold leading-tight mb-4">{article.aiTitle}</h1>

      <div className="prose prose-sm max-w-none">
        <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {article.aiSummary}
        </p>
      </div>

      {/* Like / Dislike bar — haberin altında */}
      <HorizontalLikeBar articleId={article.id} />

      {/* Geri + Ana Sayfa — haber sonunda */}
      <div className="mt-6 flex items-center gap-2 border-t border-border/50 pt-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-sm" onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('article');
          window.history.pushState({}, '', url.toString());
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}>
          <Home className="h-4 w-4" />
          Ana Sayfa
        </Button>
      </div>
    </div>
  );
}

export function NewsScreen() {
  const [active, setActive] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Arama state'leri
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublishedArticle[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Track which article is open (from URL ?article=<id>)
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  // === INLINE EDITING — admin token + edit mode ===
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editCategory, setEditCategory] = useState('Siyaset');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImageUrl, setEditorImageUrl] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Admin token'ı localStorage'dan oku
  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (t) setAdminToken(t);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'admin_token') {
        setAdminToken(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Inline edit başlat
  const handleStartEdit = useCallback((a: PublishedArticle) => {
    setEditingId(a.id);
    setEditTitle(a.aiTitle);
    setEditSummary(a.aiSummary);
    setEditImage(a.imageUrl || '');
    setEditCategory(a.category);
    setOpenArticleId(null); // detay view kapat, grid'e dön
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditTitle('');
    setEditSummary('');
    setEditImage('');
  }, []);

  // Yayınla — DB'ye PATCH + isEdited=true, yerinde kal (refetch YOK)
  const handlePublishEdit = useCallback(async (id: string) => {
    if (!adminToken) { toast.error('Yönetici girişi gerekli'); return; }
    if (!editTitle.trim() || !editSummary.trim()) { toast.error('Başlık ve özet zorunlu'); return; }
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/admin/published/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          aiTitle: editTitle.trim(),
          aiSummary: editSummary.trim(),
          imageUrl: editImage || null,
          category: editCategory,
          isEdited: true,
        }),
      });
      if (!r.ok) {
        if (r.status === 401) { toast.error('Oturum süresi doldu — yeniden giriş yapın'); localStorage.removeItem('admin_token'); setAdminToken(null); return; }
        throw new Error(`HTTP ${r.status}`);
      }
      // LOCAL STATE GÜNCELLE — refetch YOK, makale yerinde kalır
      setArticles(prev => prev.map(a => a.id === id ? {
        ...a,
        aiTitle: editTitle.trim(),
        aiSummary: editSummary.trim(),
        imageUrl: editImage || null,
        category: editCategory,
        isEdited: true,
        editedAt: new Date().toISOString(),
      } : a));
      toast.success('Yayınlandı — yeşil çerçeve');
      setEditingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yayınlama hatası');
    } finally {
      setSavingEdit(false);
    }
  }, [adminToken, editTitle, editSummary, editImage, editCategory]);

  // Arşive al — DELETE, makale listeden kaldır
  const handleArchiveInline = useCallback(async (id: string) => {
    if (!adminToken) return;
    if (!confirm('Bu haberi arşive taşımak istediğinize emin misiniz?')) return;
    try {
      const r = await fetch(`/api/admin/published/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setArticles(prev => prev.filter(a => a.id !== id));
      toast.success('Arşive taşındı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Arşiv hatası');
    }
  }, [adminToken]);

  // Görsel yükle (bilgisayardan)
  const handleFileUpload = useCallback(async (file: File, title: string) => {
    if (!adminToken) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/admin/upload${title ? `?title=${encodeURIComponent(title)}` : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json.ok) {
        setEditImage(json.url);
        toast.success('Görsel yüklendi');
      } else throw new Error(json.error || 'Yükleme hatası');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
    }
  }, [adminToken]);

  // ImageEditor save handler
  const handleEditorSave = useCallback((url: string) => {
    setEditImage(url);
    setEditorOpen(false);
  }, []);

  // === INLINE EDIT FORM — makale kartının yerine geçen düzenleme formu ===
  const renderEditForm = (a: PublishedArticle) => (
    <Card className="border-2 border-blue-500 shadow-lg shadow-blue-500/20 p-4 space-y-3 col-span-full sm:col-span-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-blue-600">✎ Düzenleme Modu</span>
        <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Başlık</Label>
        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-sm" placeholder="Haber başlığı" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Özet</Label>
        <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={6} className="text-sm resize-y" placeholder="Haber özeti" />
        <p className="text-[10px] text-muted-foreground">{editSummary.trim().split(/\s+/).filter(Boolean).length} kelime</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Görsel</Label>
        <div className="flex gap-1.5">
          <Input value={editImage} onChange={(e) => setEditImage(e.target.value)} className="text-xs h-8 flex-1" placeholder="Görsel URL veya /uploads/..." />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, editTitle); }} />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-8 w-8 p-0">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          </Button>
          {editImage && (
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditorImageUrl(editImage); setEditorTitle(editTitle); setEditorOpen(true); }} className="h-8 w-8 p-0">
              <CropIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {editImage && <img src={proxyImageUrl(editImage) || undefined} alt="" className="max-h-32 w-full object-cover rounded" />}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Kategori</Label>
        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs">
          <option value="Siyaset">Siyaset</option>
          <option value="Kamu / Resmi">Kamu / Resmi</option>
          <option value="Ekonomi / Finans">Ekonomi / Finans</option>
          <option value="Bilim / Teknoloji">Bilim / Teknoloji</option>
          <option value="Kültür / Sanat">Kültür / Sanat</option>
          <option value="Spor / Magazin">Spor / Magazin</option>
          <option value="Özel">Özel</option>
        </select>
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <Button type="button" size="sm" onClick={() => handlePublishEdit(a.id)} disabled={savingEdit || !editTitle.trim() || !editSummary.trim()} className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Yayınla
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> İptal
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => handleArchiveInline(a.id)} className="gap-1.5 text-amber-600 hover:text-amber-700 border-amber-300">
          <Archive className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );

  // === KART RENDER — edit modunda edit form, normalde PublishedArticleCard ===
  const renderCard = (a: PublishedArticle, i: number) => {
    // Edit modunda → edit form göster
    if (editingId === a.id) return renderEditForm(a);

    // Admin giriş yapmış → "Düzenle" düğmesi overlay ile kart göster
    return (
      <div className="relative group">
        {adminToken && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleStartEdit(a); }}
            className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md opacity-0 group-hover:opacity-100 transition hover:bg-blue-700"
            title="Düzenle"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
        <PublishedArticleCard article={a} onOpen={(id) => openArticle(id)} isEdited={a.isEdited} />
      </div>
    );
  };

  // On mount, check URL for ?article=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    if (articleId) {
      setOpenArticleId(articleId);
    }
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const articleId = params.get('article');
      setOpenArticleId(articleId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Open article: push URL state
  const openArticle = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('article', id);
    window.history.pushState({}, '', url.toString());
    setOpenArticleId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Close article (go home): URL'deki ?article= parametresini sil ve popstate tetikle.
  // Bu, logoya tıklanınca çalışan handleHomeClick ile AYNI mantık — yani
  // "Tüm Haberler" sekmesi de, "Ana Sayfa" butonu da, logolar da aynı davranışı sergiler.
  const closeArticle = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('article')) {
      setOpenArticleId(null);
      return;
    }
    url.searchParams.delete('article');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Go back to previous page in browser history (browser back button behavior).
  // "Geri" butonu için: ana sayfaya değil, kullanıcının geldiği önceki sayfaya gider.
  // Eğer önceki sayfa yoksa (doğrudan article linki açılmışsa), closeArticle fallback'i
  // çağrılıp URL temizlenir ve ana listeye dönülür.
  const goBack = useCallback(() => {
    if (typeof window === 'undefined') return;
    // history.back() asenkron — popstate dinleyicisi state'i güncelleyecek.
    // Eğer history'de önceki sayfa yoksa (referrless navigation), back() hiçbir şey
    // yapmaz. Bu yüzden kısa bir timeout ile kontrol edip fallback uyguluyoruz.
    const hadArticle = new URL(window.location.href).searchParams.has('article');
    window.history.back();
    if (hadArticle) {
      // 300ms sonra hala article açıksa, back() hiçbir şey yapmadı demektir — fallback.
      setTimeout(() => {
        const stillHasArticle = new URL(window.location.href).searchParams.has('article');
        if (stillHasArticle) {
          closeArticle();
        }
      }, 300);
    }
  }, [closeArticle]);

  // Load articles when tab changes
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => setLoading(true));
    Promise.resolve().then(() => setError(null));

    // 'all' kategorisinde layout=all → 50 haber TEK BATCH (Diğer Haberler yok)
    // Kategori bazında ise per kategori limit
    const url =
      active === 'all'
        ? '/api/published-articles?layout=all&status=published'
        : `/api/published-articles?category=${encodeURIComponent(
            CATEGORY_MAP[active] ?? 'Güncel',
          )}&limit=${CATEGORY_LIMITS[CATEGORY_MAP[active] ?? 'Güncel'] ?? 25}&status=published`;

    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Haberler yüklenemedi');
        const json = (await r.json()) as {
          articles: PublishedArticle[];
          hasMore?: boolean;
        };
        return json;
      })
      .then((data) => {
        if (cancelled) return;
        setArticles(data.articles ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
        setArticles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const current = SUB_TABS.find((t) => t.id === active) ?? SUB_TABS[0];

  // Arama yap — API'yi çağır, searchResults'a koy
  const handleSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/published-articles?search=${encodeURIComponent(query)}&status=published`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Arama yapılamadı');
      const json = (await r.json()) as { articles?: PublishedArticle[] };
      setSearchResults(json.articles ?? []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Ara düğmesine basınca
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSearch(searchQuery);
  };

  // Aramayı temizle, ana sayfaya dön
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
      {/* Category tabs + Arama çubuğu — sticky (kaybolmasın) */}
      <nav
        role="tablist"
        aria-label="Haber kategorileri"
        className="sticky z-20 mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-1.5 shadow-sm"
        style={{ top: '160px' }}
      >
        {/* MOBİL: Tek buton + dropdown */}
        <div className="sm:hidden relative">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(o => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm"
          >
            <span className="inline-flex items-center gap-2">
              <current.icon className="h-4 w-4" />
              {current.label}
              {articles.length > 0 && !openArticleId && (
                <span className="rounded bg-white/20 px-1.5 text-[10px] tabular-nums">{articles.length}</span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {mobileMenuOpen && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-border bg-card shadow-lg overflow-hidden">
              {SUB_TABS.map((tab) => {
                const isActive = tab.id === active;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActive(tab.id);
                      setMobileMenuOpen(false);
                      if (openArticleId) closeArticle();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium transition border-b border-border last:border-b-0 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* MASAÜSTÜ: Tüm sekmeler yan yana */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5">
          {SUB_TABS.map((tab) => {
            const isActive = tab.id === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActive(tab.id);
                  if (openArticleId) closeArticle();
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && articles.length > 0 && !openArticleId && (
                  <span className="ml-1 rounded bg-muted-foreground/20 px-1.5 text-[10px] tabular-nums">
                    {articles.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Ana Sayfa + Arama çubuğu — kategori sekmelerinin altında */}
        <div className="mt-1 flex items-center gap-1">
          <a href="/" className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-8 px-3 flex-shrink-0 rounded">
            <Home className="h-3 w-3" />
            <span className="hidden sm:inline">Ana Sayfa</span>
          </a>
          <form onSubmit={onSearchSubmit} className="flex-1 flex items-center gap-1 rounded border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5">
            <Search className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Haberlerde ara..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-6 px-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={searching || !searchQuery.trim()}
              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-6 px-2 py-0"
            >
              {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              <span className="hidden sm:inline">Ara</span>
          </Button>
          {searchResults !== null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSearch}
              className="gap-1 text-[10px] h-6 px-1.5 py-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              <span className="hidden sm:inline">Temizle</span>
            </Button>
          )}
        </form>
        </div>
      </nav>

      {/* Article detail (inline, not dialog) OR search results OR news grid */}
      {openArticleId ? (
        <ArticleDetailInline articleId={openArticleId} onBack={goBack} />
      ) : searchResults !== null ? (
        /* ARAMA SONUÇLARI BLOĞU — çubuğun altında listelenir */
        searching ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
            ))}
          </div>
        ) : searchResults.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Search className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Haber bulunamadı</p>
            <p className="text-xs text-muted-foreground">"{searchQuery}" için sonuç yok. Farklı bir kelime deneyin.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={clearSearch} className="gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" /> Temizle
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Arama sonuçları başlığı */}
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span>"<strong className="text-foreground">{searchQuery}</strong>" için {searchResults.length} haber bulundu</span>
            </div>

            {/* Arama sonuçları grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((a) => (
                renderCard(a, 0)
              ))}
            </div>

            {/* Ana Sayfa + Geri düğmeleri — arama sonuçlarının altında */}
            <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={clearSearch}
                className="gap-1.5 text-sm"
              >
                <Home className="h-4 w-4" />
                Ana Sayfa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { clearSearch(); }}
                className="gap-1.5 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Geri
              </Button>
            </div>

            {/* Normal ana sayfa akışı — baş haber dahil tüm haberler (arama altında devam eder) */}
            {articles.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Newspaper className="h-3.5 w-3.5" />
                  <span>Tüm Haberler</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {articles.map((a, i) => (
                    <div key={a.id} className={i === 0 ? 'col-span-full' : ''}>
                      {i === 0 ? (
                        <div className="flex h-full min-h-[200px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md hover:border-foreground/20 sm:flex-row" onClick={() => openArticle(a.id)} role="button" tabIndex={0}>
                          {a.imageUrl ? (
                            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px]">
                              <img src={proxyImageUrl(a.imageUrl) || undefined} alt={a.aiTitle} className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                          ) : (
                            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px] flex items-center justify-center">
                              <img src="/logo_TRG.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-50" />
                            </div>
                          )}
                          <div className="flex flex-1 flex-col gap-2 p-6">
                            <h3 className="text-xl font-bold leading-tight text-foreground hover:text-news">{a.aiTitle}</h3>
                            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{a.aiSummary}</p>
                            <div className="mt-auto flex items-center justify-between pt-1 border-t border-border/50">
                              <HorizontalLikeBar articleId={a.id} />
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground/60 font-bold tabular-nums">
                                  {categoryBadgeText(a.category, a.sourceCount)}
                                </span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">{dateTimeShort(a.latestPublishedAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        renderCard(a, i)
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : articles.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <current.icon className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {current.label} sekmesinde henüz haber yok.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {active === 'ozel'
                ? 'Özel olarak işaretlediğiniz haberler burada toplanacak.'
                : 'Bu kategoride henüz haber yok.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a, i) => (
              <div key={a.id} className={i === 0 && !openArticleId ? 'col-span-full' : ''}>
                {i === 0 && !openArticleId ? (
                  <div className="flex h-full min-h-[200px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md hover:border-foreground/20 sm:flex-row" onClick={() => openArticle(a.id)} role="button" tabIndex={0}>
                    {a.imageUrl ? (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px]">
                        <img src={proxyImageUrl(a.imageUrl) || undefined} alt={a.aiTitle} className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    ) : (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-auto sm:w-1/2 sm:min-h-[200px] flex items-center justify-center">
                        <img src="/logo_TRG.jpg" alt="TRGUNDEM" className="max-h-[90%] max-w-[90%] object-contain opacity-50" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-2 p-6">
                      <h3 className="text-xl font-bold leading-tight text-foreground hover:text-news">{a.aiTitle}</h3>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{a.aiSummary}</p>
                      <HorizontalLikeBar articleId={a.id} />
                    </div>
                  </div>
                ) : (
                  renderCard(a, i)
                )}
              </div>
            ))}
          </div>

          {/* "Diğer Haberler" düğmesi kalktı — 50 haber tek batch yükleniyor */}
        </>
      )}

      {/* Görsel Düzenle — kırpma/crop modal'ı */}
      <ImageEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        imageUrl={editorImageUrl}
        title={editorTitle}
        onSave={handleEditorSave}
        token={adminToken}
      />
    </section>
  );
}
