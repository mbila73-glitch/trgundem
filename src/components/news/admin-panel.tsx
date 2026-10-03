'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Lock, Trash2, Mail, Clock, Loader2, CheckSquare, Square, CheckCheck,
  AlertTriangle, RotateCcw, ArrowLeft, ExternalLink, Save, Globe, Star,
  Newspaper, FileText, FolderTree, Edit3, X, Upload, Archive, RefreshCw, Check, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

type Message = { id: string; name: string; email: string; subject: string; message: string; status: string; createdAt: string };
type PubArticle = { id: string; aiTitle: string; aiSummary: string; imageUrl: string | null; category: string; wordCount: number; sourceCount: number; sourceArticleIds: string; publishedAt: string | null; latestPublishedAt: string; archivedAt: string | null; };
type AdminTab = 'messages' | 'custom' | 'published' | 'archived' | 'restart';

const CATEGORIES = ['Güncel', 'Kamu / Resmi', 'Ekonomi / Finans', 'Spor / Magazin', 'Bilim / Teknoloji', 'Kültür / Sanat'];

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('messages');

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Custom article state
  const [fetchUrl, setFetchUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customSummary, setCustomSummary] = useState('');
  const [customImage, setCustomImage] = useState('');
  const [customCategory] = useState('Özel');
  const [fetchedImages, setFetchedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Published articles state
  const [pubArticles, setPubArticles] = useState<PubArticle[]>([]);
  const [archivedArticles, setArchivedArticles] = useState<PubArticle[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);

  // Restart tab state
  type PipelineStatus = {
    stage: string;
    startedAt: string | null;
    finishedAt: string | null;
    rssRead: number | null;
    duplicatesFound: number | null;
    summariesDone: number | null;
    publishedCount: number | null;
    error: string | null;
  };
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [polling, setPolling] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editImage, setEditImage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { const s = localStorage.getItem('admin_token'); if (s) setToken(s); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoggingIn(true);
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const json = (await r.json()) as { ok?: boolean; token?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Giriş başarısız');
      localStorage.setItem('admin_token', json.token!);
      setToken(json.token!); setPassword('');
      toast.success('Giriş başarılı');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setLoggingIn(false); }
  };

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoadingMsgs(true);
    try {
      const r = await fetch('/api/admin/messages', { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { localStorage.removeItem('admin_token'); setToken(null); toast.error('Oturum süresi doldu'); return; }
      const json = (await r.json()) as { messages?: Message[] };
      setMessages(json.messages ?? []); setSelectedIds(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Yükleme hatası'); }
    finally { setLoadingMsgs(false); }
  }, [token]);

  const loadPublished = useCallback(async () => {
    if (!token) return;
    setLoadingPub(true);
    try {
      const r = await fetch('/api/admin/published', { headers: { Authorization: `Bearer ${token}` } });
      const json = (await r.json()) as { articles?: PubArticle[] };
      // Tekrar başlık kontrolü — aynı başlıkla 2+ kayıt varsa, en yeni olanı tut.
      // Bu admin panelinde aynı haberin tekrar tekrar görünmesini önler.
      const seen = new Set<string>();
      const dedup: PubArticle[] = [];
      for (const a of (json.articles ?? []).sort(
        (x, y) => new Date(y.latestPublishedAt).getTime() - new Date(x.latestPublishedAt).getTime(),
      )) {
        const key = a.aiTitle.trim().toLowerCase().slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(a);
      }
      setPubArticles(dedup);
    } catch { toast.error('Haberler yüklenemedi'); }
    finally { setLoadingPub(false); }
  }, [token]);

  const loadArchived = useCallback(async () => {
    if (!token) return;
    setLoadingArchived(true);
    try {
      const r = await fetch('/api/admin/archived', { headers: { Authorization: `Bearer ${token}` } });
      const json = (await r.json()) as { articles?: PubArticle[] };
      setArchivedArticles(json.articles ?? []);
    } catch { toast.error('Arşiv yüklenemedi'); }
    finally { setLoadingArchived(false); }
  }, [token]);

  // Restart: pipeline status çek + (restarting iken polling)
  const fetchPipelineStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/pipeline/status', { cache: 'no-store' });
      if (!r.ok) return;
      const json = await r.json();
      // Route yanıtı: { ok, currentStatus, recentLog } — currentStatus içinde
      const status = json.currentStatus || json;
      setPipelineStatus({
        stage: status.stage,
        startedAt: status.startedAt,
        finishedAt: status.finishedAt,
        rssRead: status.rssRead,
        duplicatesFound: status.duplicatesFound,
        summariesDone: status.summariesDone,
        publishedCount: status.publishedCount,
        error: status.error,
      });
      // Pipeline bitti → restarting false
      if (status.stage === 'done' || status.stage === 'error') {
        setRestarting(false);
        setPolling(false);
      }
    } catch { /* ignore */ }
  }, []);

  const handleRestart = useCallback(async () => {
    setRestartConfirmOpen(false);
    setRestarting(true);
    try {
      const r = await fetch('/api/pipeline/run', { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error || 'Pipeline başlatılamadı');
      toast.success('Pipeline Başlatıldı — Arka Planda Çalışıyor');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setRestarting(false);
    }
  }, []);

  useEffect(() => {
    if (open && token) {
      if (adminTab === 'messages') void loadMessages();
      if (adminTab === 'published') void loadPublished();
      if (adminTab === 'archived') void loadArchived();
      if (adminTab === 'restart') void fetchPipelineStatus();
    }
  }, [open, token, adminTab, loadMessages, loadPublished, loadArchived, fetchPipelineStatus]);

  // Restart polling — restarting iken her 2 saniyede bir status çek
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      void fetchPipelineStatus();
      // Eğer stage 'done' veya 'error' ise polling durur
      if (pipelineStatus?.stage === 'done' || pipelineStatus?.stage === 'error') {
        setPolling(false);
        setRestarting(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, pipelineStatus?.stage, fetchPipelineStatus]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try { const r = await fetch(`/api/admin/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Silinemedi');
      setMessages(a => a.filter(m => m.id !== id));
      setSelectedIds(p => { const n = new Set(p); n.delete(id); return n; });
      toast.success('Mesaj silindi');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setDeletingId(null); }
  };

  const toggleSelect = (id: string) => setSelectedIds(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedIds(selectedIds.size === messages.length ? new Set() : new Set(messages.map(m => m.id)));

  const deleteSelected = async () => {
    setBulkDeleting(true);
    try { await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/admin/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })));
      setMessages(a => a.filter(m => !selectedIds.has(m.id))); toast.success(`${selectedIds.size} mesaj silindi`); setSelectedIds(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setBulkDeleting(false); }
  };

  const deleteAllMsgs = async () => {
    setBulkDeleting(true);
    try { await Promise.all(messages.map(m => fetch(`/api/admin/messages/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })));
      setMessages([]); setSelectedIds(new Set()); toast.success('Tüm mesajlar silindi');
    } catch { toast.error('Tümünü silme hatası'); }
    finally { setBulkDeleting(false); }
  };

  // Custom article handlers
  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fetchUrl.trim()) return;
    setFetching(true);
    try {
      const r = await fetch('/api/admin/custom-article', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'fetch', url: fetchUrl }) });
      const json = (await r.json()) as { ok?: boolean; title?: string; description?: string; images?: string[]; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Getirilemedi');
      setCustomTitle(json.title || '');
      setCustomSummary(json.description || '');
      setFetchedImages(json.images ?? []);
      setCustomImage(json.images?.[0] || '');
      toast.success('Haber içeriği getirildi');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setFetching(false); }
  };

  const handleSaveCustom = async () => {
    if (!customTitle.trim() || !customSummary.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/custom-article', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'save', title: customTitle, summary: customSummary, imageUrl: customImage || null, category: customCategory }) });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Kaydedilemedi');
      toast.success('Özel haber yayınlandı');
      setFetchUrl(''); setCustomTitle(''); setCustomSummary(''); setCustomImage(''); setFetchedImages([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setSaving(false); }
  };

  // Published article handlers
  const startEdit = (a: PubArticle) => { setEditingId(a.id); setEditTitle(a.aiTitle); setEditSummary(a.aiSummary); setEditImage(a.imageUrl || ''); };
  const cancelEdit = () => { setEditingId(null); setEditTitle(''); setEditSummary(''); setEditImage(''); };
  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/admin/published/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aiTitle: editTitle, aiSummary: editSummary, imageUrl: editImage || null }) });
      if (!r.ok) throw new Error('Güncellenemedi');
      setPubArticles(a => a.map(x => x.id === id ? { ...x, aiTitle: editTitle, aiSummary: editSummary, imageUrl: editImage || null } : x));
      toast.success('Haber güncellendi'); cancelEdit();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setSavingEdit(false); }
  };
  const deletePub = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/published/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({})) as { error?: string; detail?: string });
        throw new Error(err.detail || err.error || `HTTP ${r.status}`);
      }
      // Local state'i hemen güncelle — UI akıcı olsun
      setPubArticles(a => a.filter(x => x.id !== id));
      toast.success('Haber arşive alındı');
      // Arşiv listesini de yenile — eğer kullanıcı arşiv sekmesine geçerse güncel görür
      void loadArchived();
      // Restart sekmesindeki publishedCount'u da güncelle
      void fetchPipelineStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      toast.error(`Arşive alınamadı: ${msg}`);
      console.error('[deletePub]', e);
    }
  };

  // Reset handlers
  const handleReset = async () => {
    setResetting(true); setResetResult(null);
    try {
      const r = await fetch('/api/admin/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const json = (await r.json()) as { ok?: boolean; deleted?: { publishedArticles: number; articles: number; readerMessages: number }; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Sıfırlama başarısız');
      const d = json.deleted!;
      setResetResult(`Silindi: ${d.articles} makale, ${d.publishedArticles} özet, ${d.readerMessages} mesaj. Yenileme başlatıldı.`);
      setMessages([]); setSelectedIds(new Set()); setPubArticles([]);
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) { setResetResult(e instanceof Error ? e.message : 'Hata'); }
    finally { setResetting(false); }
  };

  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const [sourceLinks, setSourceLinks] = useState<{ [key: string]: Array<{ title: string; link: string; source: string }> }>({});
  const [loadingSources, setLoadingSources] = useState(false);

  const toggleSources = async (articleId: string, sourceIdsJson: string) => {
    if (expandedSources === articleId) {
      setExpandedSources(null);
      return;
    }
    setExpandedSources(articleId);
    if (sourceLinks[articleId]) return;

    setLoadingSources(true);
    try {
      let ids: string[] = [];
      try { ids = JSON.parse(sourceIdsJson); } catch { /* ignore */ }
      if (ids[0] === 'custom' || ids.length === 0) {
        setSourceLinks(prev => ({ ...prev, [articleId]: [] }));
        return;
      }
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const r = await fetch(`/api/articles/${id}`, { cache: 'no-store' });
          if (!r.ok) return null;
          const json = (await r.json()) as { article: { title: string; link: string; source: { name: string } } };
          return { title: json.article.title, link: json.article.link, source: json.article.source.name };
        } catch { return null; }
      }));
      const valid = results.filter((r): r is { title: string; link: string; source: string } => r !== null);
      setSourceLinks(prev => ({ ...prev, [articleId]: valid }));
    } catch { /* ignore */ }
    finally { setLoadingSources(false); }
  };

  const handleLogout = () => { localStorage.removeItem('admin_token'); setToken(null); setMessages([]); setSelectedIds(new Set()); setPubArticles([]); setArchivedArticles([]); setAdminTab('messages'); onClose(); };
  const newCount = messages.filter(m => m.status === 'new').length;
  const allSelected = messages.length > 0 && selectedIds.size === messages.length;
  const resetConfirmed = resetConfirm.trim().toLowerCase() === 'evet';

  // File upload handler (for both custom article and published edit)
  const [uploading, setUploading] = useState(false);
  const handleFileUpload = async (file: File, onDone: (url: string) => void) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const r = await fetch('/api/admin/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      const json = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Yükleme hatası');
      onDone(json.url!);
      toast.success('Görsel yüklendi');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Yükleme hatası'); }
    finally { setUploading(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="flex max-h-[66vh] min-h-[66vh] w-[50vw] max-w-[50vw] flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Lock className="h-5 w-5" /> Yönetici Paneli</span>
              {token && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30">
                    <RotateCcw className="h-3.5 w-3.5" /> Siteyi Sıfırla
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs">Çıkış</Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto news-scroll px-6 pb-6 pt-2">
            {!token ? (
              <form onSubmit={handleLogin} className="mx-auto max-w-sm space-y-4 py-8">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted"><Lock className="h-6 w-6 text-muted-foreground" /></div>
                  <h2 className="text-lg font-bold">Abone Girişi</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Telefonunuza gelen kodu giriniz</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Telefon numaranızı giriniz</label>
                  <Input type="tel" placeholder="05XX XXX XX XX" className="text-center" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Kodu giriniz</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="• • • • • •" autoFocus className="text-center" />
                </div>
                <Button type="submit" disabled={loggingIn || !password.trim()} className="w-full gap-2">{loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Giriş Yap</Button>
              </form>
            ) : (
              <>
                {/* Sub-tabs — sticky (scroll ederken kaybolmasın) */}
                <div className="sticky top-0 z-10 mb-4 -mx-6 px-6 py-2 flex gap-1 rounded-lg border border-border bg-background/95 backdrop-blur shadow-sm">
                  {([['messages', 'Mesajlar', Mail], ['custom', 'Özel Haber Ekle', Star], ['published', 'Yayındaki Haberler', Newspaper], ['archived', 'Arşiv', Archive], ['restart', 'Akışı Başlat', RefreshCw]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setAdminTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${adminTab === id ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>

                {/* Messages tab */}
                {adminTab === 'messages' && (
                  <div>
                    {messages.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={selectAll} disabled={bulkDeleting} className="gap-1.5 text-xs">{allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}{allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}</Button>
                        <Button variant="outline" size="sm" onClick={deleteSelected} disabled={bulkDeleting || selectedIds.size === 0} className="gap-1.5 text-xs">{bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Seçilenleri Sil ({selectedIds.size})</Button>
                        <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={bulkDeleting} className="gap-1.5 text-xs text-destructive hover:text-destructive"><CheckCheck className="h-3.5 w-3.5" />Tümünü Sil</Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Tüm mesajları sil?</AlertDialogTitle><AlertDialogDescription>{messages.length} mesajın tamamı silinecek.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction onClick={deleteAllMsgs} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Tümünü Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                    {loadingMsgs ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
                    : messages.length === 0 ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><Mail className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Henüz okuyucu mesajı yok</p></Card>
                    : <div className="space-y-3">{messages.map(m => { const sel = selectedIds.has(m.id); return (
                      <Card key={m.id} className={`p-4 ${m.status === 'new' ? 'border-news/40 bg-news/[0.04]' : ''} ${sel ? 'ring-2 ring-news/40' : ''}`}>
                        <div className="flex items-start gap-3"><Checkbox checked={sel} onCheckedChange={() => toggleSelect(m.id)} className="mt-1" />
                          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h4 className="text-sm font-semibold">{m.name}</h4>{m.status === 'new' && <Badge className="bg-news text-news-foreground text-[9px]">YENİ</Badge>}<span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{new Date(m.createdAt).toLocaleString('tr-TR')}</span></div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{m.email} · {m.subject}</p><p className="mt-2 text-sm leading-relaxed text-foreground/80">{m.message}</p></div>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive">{deletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>
                        </div></Card>); })}</div>}
                  </div>
                )}

                {/* Custom article tab */}
                {adminTab === 'custom' && (
                  <div className="space-y-4">
                    <form onSubmit={handleFetch} className="flex gap-2">
                      <Input value={fetchUrl} onChange={(e) => setFetchUrl(e.target.value)} placeholder="https://ornek.com/haber-basligi" className="flex-1" />
                      <Button type="submit" disabled={fetching || !fetchUrl.trim()} className="gap-2">{fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}Getir</Button>
                    </form>
                    {customTitle && (
                      <div className="space-y-4 rounded-lg border border-border p-4">
                        <div className="space-y-1.5"><Label>Başlık</Label><Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Özet</Label><Textarea value={customSummary} onChange={(e) => setCustomSummary(e.target.value)} rows={6} className="resize-none" /></div>
                        <div className="space-y-1.5"><Label>Görsel URL</Label><Input value={customImage} onChange={(e) => setCustomImage(e.target.value)} placeholder="https://..." />
                          <div className="flex items-center gap-2 mt-1">
                            <Label htmlFor="custom-file" className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted inline-flex items-center gap-1.5">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Bilgisayardan Yükle</Label>
                            <input id="custom-file" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, (url) => setCustomImage(url)); }} />
                            {customImage && <img src={customImage} alt="" className="h-10 w-16 rounded object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                          </div>
                          {fetchedImages.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{fetchedImages.map((img, i) => <button key={i} type="button" onClick={() => setCustomImage(img)} className={`h-16 w-24 overflow-hidden rounded border-2 ${customImage === img ? 'border-news' : 'border-transparent'}`}><img src={img} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></button>)}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground">Kategori: Özel (otomatik)</div>
                        <Button onClick={handleSaveCustom} disabled={saving || !customTitle.trim() || !customSummary.trim()} className="w-full gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Kaydet ve Yayınla</Button>
                      </div>
                    )}
                    {!customTitle && !fetching && <Card className="flex flex-col items-center gap-3 p-10 text-center"><Star className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">URL yapıştırıp "Getir" butonuna basın. Haber başlığı, özeti ve görselleri otomatik çekilecektir.</p></Card>}
                  </div>
                )}

                {/* Published articles tab — 30 ana sayfalık üstte, gerisi altta */}
                {adminTab === 'published' && (
                  <div>
                    {loadingPub ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
                    : pubArticles.length === 0 ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><Newspaper className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Yayında haber yok</p></Card>
                    : (
                      <>
                        {/* Üstte: ana sayfadaki ilk 30 haber */}
                        <div className="mb-3 flex items-center gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ana Sayfadaki Haberler</h3>
                          <Badge variant="secondary" className="text-[10px]">{Math.min(30, pubArticles.length)}</Badge>
                        </div>
                        <div className="mb-6 space-y-3">
                          {pubArticles.slice(0, 30).map(a => (
                            <Card key={a.id} className="p-4">
                              {editingId === a.id ? (
                                <div className="space-y-3">
                                  <div className="space-y-1"><Label className="text-xs">Başlık</Label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
                                  <div className="space-y-1"><Label className="text-xs">Özet</Label><Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={5} className="resize-none" /></div>
                                  <div className="space-y-1"><Label className="text-xs">Görsel URL</Label><Input value={editImage} onChange={(e) => setEditImage(e.target.value)} />
                                  <div className="flex items-center gap-2 mt-1">
                                    <Label htmlFor="edit-file" className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted inline-flex items-center gap-1.5">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Bilgisayardan Yükle</Label>
                                    <input id="edit-file" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, (url) => setEditImage(url)); }} />
                                    {editImage && <img src={editImage} alt="" className="h-10 w-16 rounded object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                  </div>
                                  </div>
                                  <div className="flex gap-2"><Button size="sm" onClick={() => saveEdit(a.id)} disabled={savingEdit} className="gap-1.5">{savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Kaydet</Button><Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1.5"><X className="h-3.5 w-3.5" />İptal</Button></div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-3">
                                  {a.imageUrl && <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded"><img src={a.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></div>}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2"><h4 className="text-sm font-semibold line-clamp-1">{a.aiTitle}</h4><Badge variant="secondary" className="text-[9px]">{a.category}</Badge></div>
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.aiSummary}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                      <span>{a.wordCount} kelime</span>
                                      {a.latestPublishedAt && (
                                        <span className="inline-flex items-center gap-1 tabular-nums">
                                          <Clock className="h-3 w-3" />
                                          {new Date(a.latestPublishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                          <span className="text-border">·</span>
                                          {new Date(a.latestPublishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                      )}
                                      {a.sourceCount >= 1 && (
                                        <button type="button" onClick={() => toggleSources(a.id, a.sourceArticleIds)} className="inline-flex items-center gap-0.5 text-news hover:underline">
                                          {a.sourceCount} kaynak {expandedSources === a.id ? '▲' : '▼'}
                                        </button>
                                      )}
                                    </div>
                                    {expandedSources === a.id && (
                                      <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
                                        {loadingSources ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                                         sourceLinks[a.id]?.length ? (
                                          <div className="space-y-1">
                                            {sourceLinks[a.id].map((s, i) => (
                                              <a key={i} href={s.link} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-muted-foreground hover:text-news">
                                                {i + 1}. {s.title.slice(0, 60)} — <span className="font-medium">{s.source}</span>
                                              </a>
                                            ))}
                                          </div>
                                        ) : <p className="text-[11px] text-muted-foreground">Kaynak bulunamadı</p>}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-shrink-0 items-center gap-1"><Button variant="ghost" size="icon" onClick={() => startEdit(a)} className="h-8 w-8 text-muted-foreground hover:text-news"><Edit3 className="h-4 w-4" /></Button>
                                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Haberi arşive al?</AlertDialogTitle><AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi arşive alınacak (yayından kalkacak). Arşiv sekmesinden görüntülenebilir.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction onClick={() => deletePub(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Arşive Al</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>

                        {/* Altta: 30'dan sonraki haberler + kategori haberleri */}
                        {pubArticles.length > 30 && (
                          <>
                            <div className="mb-3 flex items-center gap-2">
                              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Diğer Haberler</h3>
                              <Badge variant="secondary" className="text-[10px]">{pubArticles.length - 30}</Badge>
                            </div>
                            <div className="space-y-3">
                              {pubArticles.slice(30).map(a => (
                                <Card key={a.id} className="p-4">
                                  <div className="flex items-start gap-3">
                                    {a.imageUrl && <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded"><img src={a.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></div>}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2"><h4 className="text-sm font-semibold line-clamp-1">{a.aiTitle}</h4><Badge variant="secondary" className="text-[9px]">{a.category}</Badge></div>
                                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.aiSummary}</p>
                                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                        <span>{a.wordCount} kelime</span>
                                        {a.latestPublishedAt && (
                                          <span className="inline-flex items-center gap-1 tabular-nums">
                                            <Clock className="h-3 w-3" />
                                            {new Date(a.latestPublishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            <span className="text-border">·</span>
                                            {new Date(a.latestPublishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-shrink-0 items-center gap-1">
                                      <Button variant="ghost" size="icon" onClick={() => startEdit(a)} className="h-8 w-8 text-muted-foreground hover:text-news"><Edit3 className="h-4 w-4" /></Button>
                                      <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Haberi arşive al?</AlertDialogTitle><AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi arşive alınacak.</AlertDialogDescription></AlertDialogHeader>
                                          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction onClick={() => deletePub(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Arşive Al</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Archived articles tab — sadece görüntüleme, düzenle/sil yok */}
                {adminTab === 'archived' && (
                  <div>
                    {loadingArchived ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
                    : archivedArticles.length === 0 ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><Archive className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Arşivde haber yok</p><p className="text-xs text-muted-foreground/70">Yayından kaldırılan haberler burada listelenir.</p></Card>
                    : (
                      <>
                        <div className="mb-3 flex items-center gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Arşivlenmiş Haberler</h3>
                          <Badge variant="secondary" className="text-[10px]">{archivedArticles.length}</Badge>
                        </div>
                        <div className="space-y-3">
                          {archivedArticles.map(a => (
                            <Card key={a.id} className="p-4 opacity-80">
                              <div className="flex items-start gap-3">
                                {a.imageUrl && <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded grayscale"><img src={a.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></div>}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2"><h4 className="text-sm font-semibold line-clamp-1">{a.aiTitle}</h4><Badge variant="secondary" className="text-[9px]">{a.category}</Badge></div>
                                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.aiSummary}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                    <span>{a.wordCount} kelime</span>
                                    {/* Yayınlandığı tarih */}
                                    {a.publishedAt && (
                                      <span className="inline-flex items-center gap-1 tabular-nums">
                                        <Clock className="h-3 w-3" />
                                        <span className="font-medium">Yayın:</span>
                                        {new Date(a.publishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                        <span className="text-border">·</span>
                                        {new Date(a.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      </span>
                                    )}
                                    {/* Arşive alındığı tarih */}
                                    {a.archivedAt && (
                                      <span className="inline-flex items-center gap-1 tabular-nums text-destructive/80">
                                        <Archive className="h-3 w-3" />
                                        <span className="font-medium">Arşiv:</span>
                                        {new Date(a.archivedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                        <span className="text-border">·</span>
                                        {new Date(a.archivedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Tekrar Yayına Al butonu */}
                                <div className="flex flex-shrink-0 items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={async () => {
                                    try {
                                      const r = await fetch(`/api/admin/published/${a.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ status: 'published' }),
                                      });
                                      if (!r.ok) throw new Error('Geri yüklenemedi');
                                      toast.success('Haber Tekrar Yayında');
                                      void loadArchived();
                                      void loadPublished();
                                    } catch (e) {
                                      toast.error('Geri yükleme hatası');
                                    }
                                  }} className="h-8 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Tekrar Yayına Al
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Restart tab — pipeline'ı hemen tetikler + canlı ilerleme */}
                {adminTab === 'restart' && (
                  <div className="space-y-4">
                    {/* Restart butonu */}
                    <Card className="border-2 border-news/30 bg-news/[0.03] p-5">
                      <div className="flex items-start gap-3">
                        <RefreshCw className={`h-8 w-8 flex-shrink-0 text-news ${restarting ? 'animate-spin' : ''}`} />
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-foreground">Akışı Başlat</h3>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            RSS kaynaklarını hemen okur, tekrarlayan haberleri gruplar, AI ile özetler ve yayınlarar. Sıralı çalışır:
                            <span className="font-medium text-foreground"> RSS okuma → tekrar tespiti → AI özetleme → yayınlama</span>.
                            Canlı ilerleme aşağıda görünür.
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => setRestartConfirmOpen(true)}
                              disabled={restarting}
                              className="gap-2"
                            >
                              <RefreshCw className="h-4 w-4" />
                              {restarting ? 'Çalışıyor...' : 'Pipeline Restart'}
                            </Button>
                            {restarting && (
                              <Button size="sm" variant="outline" onClick={() => { setRestarting(false); setPolling(false); }} className="gap-1.5">
                                <XCircle className="h-4 w-4" /> İzlemeyi Durdur
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Restart onay dialoğu */}
                    <AlertDialog open={restartConfirmOpen} onOpenChange={setRestartConfirmOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Pipeline restart?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Mevcut tüm published haberler 'stale' yapılacak, RSS kaynakları yeniden okunacak ve AI özet pipeline'ı hemen başlayacak. Bu işlem 5-10 dakika sürebilir. Onaylıyor musunuz?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                          <AlertDialogAction onClick={handleRestart} className="bg-news text-news-foreground hover:bg-news/90 gap-2">
                            <RefreshCw className="h-4 w-4" /> Restart
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Canlı ilerleme — 4 satır */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Canlı İlerleme</h3>
                      <PipelineStepRow
                        label="RSS güncellendi"
                        detail={pipelineStatus?.rssRead != null ? `${pipelineStatus.rssRead} kaynak okundu` : null}
                        stage={pipelineStatus?.stage ?? null}
                        startedStages={['refresh', 'build-icerik', 'build-kaynak-sayi', 'build-ozet', 'done']}
                        doneStages={['build-icerik', 'build-kaynak-sayi', 'build-ozet', 'done']}
                        startedAt={pipelineStatus?.startedAt ?? null}
                      />
                      <PipelineStepRow
                        label="Tekrarlanan haberler sayıldı"
                        detail={pipelineStatus?.duplicatesFound != null ? `${pipelineStatus.duplicatesFound} farklı haber bulundu` : null}
                        stage={pipelineStatus?.stage ?? null}
                        startedStages={['build-kaynak-sayi', 'build-ozet', 'done']}
                        doneStages={['build-ozet', 'done']}
                        startedAt={pipelineStatus?.startedAt ?? null}
                      />
                      <PipelineStepRow
                        label="Haber özeti tamamlandı"
                        detail={pipelineStatus?.summariesDone != null ? `${pipelineStatus.summariesDone} özet tamamlandı` : null}
                        stage={pipelineStatus?.stage ?? null}
                        startedStages={['build-ozet', 'done']}
                        doneStages={['done']}
                        startedAt={pipelineStatus?.startedAt ?? null}
                      />
                      <PipelineStepRow
                        label="Haberler yayınlandı"
                        detail={pipelineStatus?.publishedCount != null ? `${pipelineStatus.publishedCount} haber yayınlandı` : null}
                        stage={pipelineStatus?.stage ?? null}
                        startedStages={['done']}
                        doneStages={['done']}
                        startedAt={pipelineStatus?.startedAt ?? null}
                        isLast
                      />
                    </div>

                    {/* Hata varsa */}
                    {pipelineStatus?.error && (
                      <Card className="border-destructive/50 bg-destructive/[0.04] p-4">
                        <div className="flex items-start gap-2">
                          <XCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
                          <div>
                            <p className="text-sm font-semibold text-destructive">Hata oluştu</p>
                            <p className="mt-1 text-xs text-muted-foreground">{pipelineStatus.error}</p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Tamamlandı mesajı */}
                    {pipelineStatus?.stage === 'done' && (
                      <Card className="border-emerald-500/40 bg-emerald-500/[0.04] p-4">
                        <div className="flex items-start gap-2">
                          <Check className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                          <div>
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Pipeline tamamlandı</p>
                            {pipelineStatus.finishedAt && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Bitiş: {new Date(pipelineStatus.finishedAt).toLocaleTimeString('tr-TR')}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <Dialog open={resetOpen} onOpenChange={(o) => { if (!o && !resetting) { setResetOpen(false); setResetConfirm(''); setResetResult(null); } }}>
        <DialogContent className="max-w-md border-2 border-destructive/50">
          {resetResult ? (
            <div className="p-6 text-center">{resetting ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-destructive" /> : <><AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" /><p className="text-sm font-medium">{resetResult}</p><p className="mt-2 text-xs text-muted-foreground">Sayfa 3 saniye içinde yenilenecek...</p></>}</div>
          ) : (
            <div className="space-y-6 p-2">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"><AlertTriangle className="h-8 w-8 text-destructive" /></div>
                <h2 className="text-xl font-bold text-destructive">TÜM SİTE İÇERİĞİ SİLİNECEKTİR</h2>
                <p className="mt-2 text-sm text-muted-foreground">Tüm makaleler, özetler ve okuyucu mesajları silinecek. Bu işlem geri alınamaz. Sıfırlama sonrası yenileme otomatik başlayacaktır.</p>
                <p className="mt-3 text-base font-semibold">Emin misiniz?</p>
              </div>
              <div className="space-y-2"><p className="text-center text-sm font-medium">Onaylamak için <span className="text-destructive font-bold">evet</span> yazın:</p><Input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="evet" className="text-center text-lg font-semibold" autoFocus /></div>
              <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => { setResetOpen(false); setResetConfirm(''); }} disabled={resetting}>İptal</Button><Button variant="destructive" className="flex-1 gap-2" onClick={handleReset} disabled={!resetConfirmed || resetting}>{resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Onayla</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Pipeline adım satırı — Restart sekmesinde 4 adımı gösterir.
// stage'e göre "beklemede", "çalışıyor", "tamamlandı" durumlarını işler.
type PipelineStepRowProps = {
  label: string;
  detail: string | null;            // "X kaynak okundu" gibi
  stage: string | null;             // pipeline-cron.ts'in yazdığı stage
  startedStages: string[];          // bu adım hangi stage'lerde "çalışıyor"/"tamamlandı" sayılır
  doneStages: string[];             // bu adım hangi stage'lerde "tamamlandı" sayılır (startedStages'ın alt kümesi)
  startedAt: string | null;         // cycle başlangıç zamanı (rölatif süre göstermek için)
  isLast?: boolean;                 // son adım için connector çizmesin
};

function PipelineStepRow({ label, detail, stage, startedStages, doneStages, startedAt, isLast }: PipelineStepRowProps) {
  const isDone = stage != null && doneStages.includes(stage);
  const isStarted = stage != null && startedStages.includes(stage);
  const isWaiting = !isStarted;

  // Durum ikonu
  const icon = isDone
    ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><Check className="h-4 w-4" /></span>
    : isStarted
      ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-news/15 text-news"><Loader2 className="h-4 w-4 animate-spin" /></span>
      : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground/50" /></span>;

  // Rölatif süre (basit)
  let elapsed = '';
  if (startedAt && (isStarted || isDone)) {
    const ms = Date.now() - new Date(startedAt).getTime();
    const sec = Math.round(ms / 1000);
    if (sec < 60) elapsed = `${sec}sn`;
    else elapsed = `${Math.floor(sec / 60)}dk ${sec % 60}sn`;
  }

  return (
    <div className="relative flex items-start gap-3 pb-3">
      {/* Vertical connector */}
      {!isLast && (
        <div
          className={`absolute left-[14px] top-7 h-full w-0.5 ${isDone ? 'bg-emerald-500/30' : isStarted ? 'bg-news/30' : 'bg-muted'}`}
          style={{ minHeight: '16px' }}
        />
      )}
      <div className="relative z-10 flex-shrink-0">{icon}</div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-medium ${isDone ? 'text-emerald-700 dark:text-emerald-400' : isStarted ? 'text-foreground' : 'text-muted-foreground'}`}>
            {label}
          </p>
          {elapsed && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{elapsed}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isDone && detail ? detail : isStarted ? (detail ?? 'Çalışıyor...') : 'Beklemede'}
        </p>
      </div>
    </div>
  );
}
