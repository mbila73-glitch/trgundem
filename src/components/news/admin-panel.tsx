'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Lock, Trash2, Mail, Clock, Loader2, CheckSquare, Square, CheckCheck,
  AlertTriangle, RotateCcw, ArrowLeft, ExternalLink, Save, Globe, Star,
  Newspaper, FileText, FolderTree, Edit3, X, Upload, Archive, RefreshCw, Check, XCircle,
  AlertCircle, Maximize2, Minimize2, Send, MessageSquare, Heart, Search, Sparkles, Plus, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { normalizeTr } from '@/lib/format';
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

type Message = { id: string; name: string; email: string; subject: string; message: string; ip?: string | null; status: string; reply?: string | null; repliedAt?: string | null; createdAt: string };
type PubArticle = { id: string; aiTitle: string; aiSummary: string; imageUrl: string | null; category: string; wordCount: number; sourceCount: number; sourceArticleIds: string; publishedAt: string | null; latestPublishedAt: string; archivedAt: string | null; initialHearts: number; clickHearts: number; };
type AdminTab = 'messages' | 'custom' | 'published' | 'archived' | 'pending';

const CATEGORIES = ['Güncel', 'Kamu / Resmi', 'Ekonomi / Finans', 'Spor / Magazin', 'Bilim / Teknoloji', 'Kültür / Sanat'];

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('messages');
  const [archivedSubtab, setArchivedSubtab] = useState<'articles' | 'messages'>('articles');

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Mesaja cevap state'leri
  const [replyingId, setReplyingId] = useState<string | null>(null); // hangi mesajda editör açık
  const [replyDraft, setReplyDraft] = useState(''); // editördeki metin
  const [generatingReply, setGeneratingReply] = useState<string | null>(null); // AI taslak üretiyor (mesaj id)
  const [sendingReply, setSendingReply] = useState<string | null>(null); // cevap gönderiliyor (mesaj id)
  const [archivingMsg, setArchivingMsg] = useState<string | null>(null); // mesaj arşivleniyor (id)

  // Arama state'leri — her sekmede ayrı arama
  const [msgSearch, setMsgSearch] = useState(''); // Mesajlar sekmesinde ara
  const [pubSearch, setPubSearch] = useState(''); // Yayında sekmesinde ara
  const [archivedSearch, setArchivedSearch] = useState(''); // Arşiv sekmesinde ara
  const [pendingSearch, setPendingSearch] = useState(''); // Tekrar sekmesinde ara

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
  const [customCategory, setCustomCategory] = useState<string[]>(['Özel']);
  const [customContent, setCustomContent] = useState(''); // tam metin
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [searchResults, setSearchResults] = useState<{site: string; url: string; title: string; content: string; images: string[]}[]>([]);
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<Set<string>>(new Set());
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [trustedSites, setTrustedSites] = useState<{id: string; name: string; searchUrl: string}[]>([]);
  const [showTrustedSites, setShowTrustedSites] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [foundSources, setFoundSources] = useState<{site: string; url: string; title: string}[]>([]);
  const [fetchedImages, setFetchedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Published articles state
  const [pubArticles, setPubArticles] = useState<PubArticle[]>([]);
  const [archivedArticles, setArchivedArticles] = useState<PubArticle[]>([]);
  const [pendingArticles, setPendingArticles] = useState<PubArticle[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

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
  const [editCategory, setEditCategory] = useState<string[]>([]);
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

  // Duplicate (Tekrarlar) haberleri yükle — eski birebir aynı başlıklar
  const loadPending = useCallback(async () => {
    if (!token) return;
    setLoadingPending(true);
    try {
      const r = await fetch('/api/admin/published?status=duplicate', { headers: { Authorization: `Bearer ${token}` } });
      const json = (await r.json()) as { articles?: PubArticle[] };
      setPendingArticles(json.articles ?? []);
    } catch { toast.error('Tekrar haberler yüklenemedi'); }
    finally { setLoadingPending(false); }
  }, [token]);

  // Pending aksiyon: 1) Yayınla + eskiyi arşive, 2) Sadece yayınla, 3) Yoksay (arşive)
  const handlePendingAction = useCallback(async (id: string, action: 'publish_archive_old' | 'publish_only' | 'dismiss') => {
    if (!token) return;
    setPendingAction(id + action);
    try {
      let body: { status: string; archiveOld?: boolean };
      if (action === 'publish_archive_old') {
        body = { status: 'published', archiveOld: true };
      } else if (action === 'publish_only') {
        body = { status: 'published' };
      } else {
        body = { status: 'archived' };
      }
      const r = await fetch(`/api/admin/published/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error || 'İşlem başarısız');
      if (action === 'publish_archive_old') toast.success('Yayınlandı — eski arşive taşındı');
      else if (action === 'publish_only') toast.success('Yayınlandı');
      else toast.success('Bekleyen haber yoksayıldı');
      // Listeyi yenile
      setPendingArticles(prev => prev.filter(p => p.id !== id));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setPendingAction(null); }
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
      if (adminTab === 'archived') { void loadArchived(); void loadMessages(); }
      if (adminTab === 'pending') void loadPending();
      if (adminTab === 'custom') void loadTrustedSites();
    }
  }, [open, token, adminTab, loadMessages, loadPublished, loadArchived, loadPending]);

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

  // Mesaja cevap editörünü aç
  const openReplyEditor = (m: Message) => {
    if (replyingId === m.id) {
      // Açık olan editörü kapat
      setReplyingId(null);
      setReplyDraft('');
      return;
    }
    setReplyingId(m.id);
    setReplyDraft(m.reply || ''); // mevcut cevap varsa onu yükle, tekrar düzenlenebilsin
  };

  // AI ile cevap taslağı üret
  const handleGenerateReply = async (m: Message) => {
    setGeneratingReply(m.id);
    try {
      const r = await fetch('/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: m.message, senderName: m.name, senderEmail: m.email }),
      });
      const json = (await r.json()) as { ok?: boolean; reply?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Taslak üretilemedi');
      setReplyDraft(json.reply || '');
      setReplyingId(m.id); // AI üretince editörü aç
      toast.success('AI taslak hazır, düzenleyip gönderebilirsiniz');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI taslak hatası');
    } finally {
      setGeneratingReply(null);
    }
  };

  // Cevabı gönder (SMTP ile okuyucuya + DB'ye kaydet)
  const handleSendReply = async (id: string) => {
    if (!replyDraft.trim()) {
      toast.error('Cevap metni boş');
      return;
    }
    setSendingReply(id);
    try {
      const r = await fetch(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reply: replyDraft.trim() }),
      });
      const json = (await r.json()) as { ok?: boolean; reply?: string; repliedAt?: string; emailSent?: boolean; emailReason?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Cevap gönderilemedi');
      // Mesajı listede güncelle
      setMessages(a => a.map(m => m.id === id ? { ...m, reply: json.reply || replyDraft.trim(), repliedAt: json.repliedAt || new Date().toISOString(), status: 'read' } : m));
      toast.success(json.emailSent ? 'Cevap gönderildi — okuyucuya mail atıldı' : 'Cevap kaydedildi ama mail gönderilemedi');
      // Editörü kapat
      setReplyingId(null);
      setReplyDraft('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cevap hatası');
    } finally {
      setSendingReply(null);
    }
  };

  // Mesajı arşivle
  const handleArchiveMessage = async (id: string) => {
    setArchivingMsg(id);
    try {
      const r = await fetch(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'archived' }),
      });
      const json = (await r.json()) as { ok?: boolean; status?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Arşivleme başarısız');
      // Mesajı listeden KALDIRMA — sadece status'ünü 'archived' yap
      // Böylece Mesajlar sekmesinde filter ile gizlenir, Arşiv sekmesinde filter ile görünür
      setMessages(a => a.map(m => m.id === id ? { ...m, status: 'archived' } : m));
      toast.success('Mesaj arşivlendi — Arşiv sekmesinin altındaki "Arşivlenen Mesajlar" bölümünden görüntüleyebilirsiniz', { duration: 5000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Arşiv hatası');
    } finally {
      setArchivingMsg(null);
    }
  };

  const toggleSelect = (id: string) => setSelectedIds(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => {
    const visible = messages.filter(m => m.status !== 'archived');
    setSelectedIds(selectedIds.size === visible.length ? new Set() : new Set(visible.map(m => m.id)));
  };

  const deleteSelected = async () => {
    setBulkDeleting(true);
    try { await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/admin/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })));
      setMessages(a => a.filter(m => !selectedIds.has(m.id))); toast.success(`${selectedIds.size} mesaj silindi`); setSelectedIds(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setBulkDeleting(false); }
  };

  const deleteAllMsgs = async () => {
    setBulkDeleting(true);
    try {
      // Sadece Mesajlar sekmesinde görünenleri (archived olmayanları) sil
      const visible = messages.filter(m => m.status !== 'archived');
      await Promise.all(visible.map(m => fetch(`/api/admin/messages/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })));
      const visibleIds = new Set(visible.map(m => m.id));
      setMessages(a => a.filter(m => !visibleIds.has(m.id)));
      setSelectedIds(new Set());
      toast.success('Tüm mesajlar silindi');
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
      const json = (await r.json()) as { ok?: boolean; title?: string; description?: string; content?: string; images?: string[]; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Getirilemedi');
      setCustomTitle(json.title || '');
      setCustomSummary(json.description || '');
      setCustomContent(json.content || '');
      setFetchedImages(json.images ?? []);
      setCustomImage(json.images?.[0] || '');
      toast.success('Haber çekildi — tam içerik hazır');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setFetching(false); }
  };

  const handleSaveCustom = async () => {
    if (!customTitle.trim() || !customSummary.trim()) return;
    setSaving(true);
    try {
      for (const cat of customCategory) {
        await fetch('/api/admin/custom-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'save', title: customTitle, summary: customSummary, imageUrl: customImage || null, category: cat }),
        });
      }
      toast.success(`${customCategory.length} kategoride yayınlandı: ${customCategory.join(', ')}`);
      setFetchUrl(''); setCustomTitle(''); setCustomSummary(''); setCustomImage(''); setCustomContent(''); setFetchedImages([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setSaving(false); }
  };

  // AI özeti oluştur — çekilen tam metinden
  const handleAiSummary = async () => {
    if (!customContent || customContent.length < 100) {
      toast.error('Önce URL\'den haber çekin');
      return;
    }
    setGeneratingSummary(true);
    try {
      const r = await fetch('/api/admin/custom-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'ai-summarize', title: customTitle, content: customContent }),
      });
      const json = (await r.json()) as { ok?: boolean; summary?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'AI özet üretilemedi');
      setCustomSummary(json.summary || '');
      toast.success('AI özeti hazır');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI hatası');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Konu ara — güvenilen sitelerde tara (özet üretmez, sadece kaynakları + görselleri listeler)
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    // Eski sonuçları temizle
    setSearchResults([]);
    setSelectedSourceUrls(new Set());
    setSelectedImageUrl(null);
    setCustomTitle('');
    setCustomSummary('');
    setCustomImage('');
    setCustomContent('');
    setFoundSources([]);
    try {
      const r = await fetch('/api/admin/custom-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'search', query: searchQuery }),
      });
      const json = (await r.json()) as { ok?: boolean; sources?: {site: string; url: string; title: string; content: string; images: string[]}[]; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Arama başarısız');
      const sources = json.sources ?? [];
      setSearchResults(sources);
      // Varsayılan: tüm kaynakları işaretle
      setSelectedSourceUrls(new Set(sources.map(s => s.url)));
      // Varsayılan görsel: en çok tekrarlanan veya ilk kaynaktan ilk görsel
      const allImages = sources.flatMap(s => s.images);
      if (allImages.length > 0) {
        const counts: Record<string, number> = {};
        for (const img of allImages) counts[img] = (counts[img] || 0) + 1;
        let best = allImages[0];
        let maxCount = 0;
        for (const [img, count] of Object.entries(counts)) {
          if (count > maxCount) { maxCount = count; best = img; }
        }
        setSelectedImageUrl(best);
        setCustomImage(best);
      }
      // Title state'i en ilgili kaynaktan al
      if (sources.length > 0) setCustomTitle(sources[0].title);
      setFoundSources(sources.map(s => ({ site: s.site, url: s.url, title: s.title })));
      toast.success(`${sources.length} kaynak bulundu — istediklerinizi seçip "AI Özetle" düğmesine basın`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Arama hatası');
    } finally {
      setSearching(false);
    }
  };

  // AI Özetle — seçili kaynaklardan AI özeti üret
  const handleSummarizeSelected = async () => {
    if (selectedSourceUrls.size === 0) {
      toast.error('En az bir kaynak seçin');
      return;
    }
    setSummarizing(true);
    try {
      const selectedSources = searchResults
        .filter(s => selectedSourceUrls.has(s.url))
        .map(s => ({ title: s.title, content: s.content }));
      const r = await fetch('/api/admin/custom-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'summarize-selected', sources: selectedSources, query: searchQuery }),
      });
      const json = (await r.json()) as { ok?: boolean; summary?: string; title?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Özet başarısız');
      setCustomSummary(json.summary || '');
      if (json.title) setCustomTitle(json.title);
      if (selectedImageUrl) setCustomImage(selectedImageUrl);
      toast.success('AI özeti hazır');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Özet hatası');
    } finally {
      setSummarizing(false);
    }
  };

  // Güvenilen siteleri yükle
  const loadTrustedSites = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/admin/trusted-sites', { headers: { Authorization: `Bearer ${token}` } });
      const json = (await r.json()) as { sites?: {id: string; name: string; searchUrl: string}[] };
      setTrustedSites(json.sites ?? []);
    } catch {}
  }, [token]);

  // Güvenilen site ekle
  const handleAddTrustedSite = async () => {
    if (!newSiteName.trim() || !newSiteUrl.trim()) return;
    try {
      const r = await fetch('/api/admin/trusted-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newSiteName, searchUrl: newSiteUrl }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Eklenemedi');
      setNewSiteName(''); setNewSiteUrl('');
      void loadTrustedSites();
      toast.success('Güvenilen site eklendi');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
  };

  // Güvenilen site sil
  const handleDeleteTrustedSite = async (id: string) => {
    try {
      await fetch(`/api/admin/trusted-sites/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      void loadTrustedSites();
      toast.success('Site silindi');
    } catch (e) { toast.error('Silme hatası'); }
  };

  // Published article handlers
  const startEdit = (a: PubArticle) => {
    setEditingId(a.id);
    setEditTitle(a.aiTitle);
    setEditSummary(a.aiSummary);
    setEditImage(a.imageUrl || '');
    // Mevcut kategoriyi işaretli olarak yükle
    setEditCategory(a.category ? [a.category] : ['Özel']);
  };
  const cancelEdit = () => { setEditingId(null); setEditTitle(''); setEditSummary(''); setEditImage(''); setEditCategory([]); };
  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      // İlk seçili kategori kayıt için kullanılır (multi-kategori yeni haber ekle formunda)
      const cat = editCategory.length > 0 ? editCategory[0] : 'Özel';
      const r = await fetch(`/api/admin/published/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aiTitle: editTitle, aiSummary: editSummary, imageUrl: editImage || null, category: cat }) });
      if (!r.ok) throw new Error('Güncellenemedi');
      setPubArticles(a => a.map(x => x.id === id ? { ...x, aiTitle: editTitle, aiSummary: editSummary, imageUrl: editImage || null, category: cat } : x));
      toast.success('Haber güncellendi'); cancelEdit();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Hata'); }
    finally { setSavingEdit(false); }
  };
  const deletePub = async (id: string, hard: boolean = false) => {
    try {
      const r = await fetch(`/api/admin/published/${id}${hard ? '?hard=true' : ''}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({})) as { error?: string; detail?: string });
        throw new Error(err.detail || err.error || `HTTP ${r.status}`);
      }
      setPubArticles(a => a.filter(x => x.id !== id));
      toast.success(hard ? 'Haber kalıcı olarak silindi' : 'Haber arşive alındı');
      void loadArchived();
      void fetchPipelineStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      toast.error(hard ? `Silinemedi: ${msg}` : `Arşive alınamadı: ${msg}`);
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
  const allSelected = (() => {
    const visible = messages.filter(m => m.status !== 'archived');
    return visible.length > 0 && selectedIds.size === visible.length;
  })();
  const resetConfirmed = resetConfirm.trim().toLowerCase() === 'evet';

  // File upload handler (for both custom article and published edit)
  const [uploading, setUploading] = useState(false);
  const handleFileUpload = async (file: File, onDone: (url: string) => void, title?: string) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const uploadUrl = `/api/admin/upload${title ? `?title=${encodeURIComponent(title)}` : ''}`;
      const r = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
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
        <DialogContent className={`flex flex-col p-0 transition-all duration-200 ${fullscreen ? 'w-screen h-screen max-w-none max-h-none min-w-screen min-h-screen rounded-none border-0' : 'w-[80vw] h-[80vh] max-w-[80vw] max-h-[80vh] min-w-[80vw] min-h-[80vh]'}`}>
          <DialogHeader className="px-3 pt-3 pb-0 sm:px-6 sm:pt-6">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base"><Lock className="h-4 w-4 sm:h-5 sm:w-5" /> <span className="hidden sm:inline">Yönetici Paneli</span><span className="sm:hidden">Panel</span></span>
              {token && (
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} className="gap-1 text-[10px] sm:text-xs text-destructive hover:text-destructive border-destructive/30 px-2 sm:px-3">
                    <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" /><span className="hidden sm:inline">Siteyi</span><span className="sm:hidden">Sıfırla</span>
                  </Button>
                  <Button variant="default" size="sm" onClick={() => setRestartConfirmOpen(true)} disabled={restarting} className="gap-1 text-[10px] sm:text-xs bg-news hover:bg-news/90 text-news-foreground border-blue-500 px-2 sm:px-3">
                    {restarting ? <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" /> : <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}<span className="hidden sm:inline">Akışı</span><span className="sm:hidden">Akış</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFullscreen(f => !f)}
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground hover:text-foreground"
                    title={fullscreen ? 'Küçült' : 'Tam Ekran'}
                  >
                    {fullscreen ? <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="text-[10px] sm:text-xs px-2 sm:px-3">Çıkış</Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto news-scroll px-3 pb-3 sm:px-6 sm:pb-6 pt-2">
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
                <div className="sticky top-0 z-10 mb-3 sm:mb-4 -mx-3 sm:-mx-6 px-2 sm:px-6 py-2 flex gap-0.5 sm:gap-1 overflow-x-auto rounded-lg border border-border bg-background/95 backdrop-blur shadow-sm">
                  {([['messages', 'Mesajlar', Mail], ['custom', 'Özel Haber', Star], ['published', 'Yayında', Newspaper], ['archived', 'Arşiv', Archive], ['pending', 'Tekrar', AlertCircle]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setAdminTab(id)} className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium transition relative flex-shrink-0 ${adminTab === id ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
                      {id === 'pending' && pendingArticles.length > 0 && (
                        <Badge className="ml-0.5 sm:ml-1 bg-news text-news-foreground text-[9px] px-1.5 py-0.5 rounded-full">{pendingArticles.length}</Badge>
                      )}
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
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Tüm mesajları sil?</AlertDialogTitle><AlertDialogDescription>{messages.filter(m => m.status !== 'archived').length} mesajın tamamı silinecek. (Arşivdeki mesajlar korunur)</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction onClick={deleteAllMsgs} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Tümünü Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                    {loadingMsgs ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
                    : messages.filter(m => m.status !== 'archived').length === 0 ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><Mail className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Henüz okuyucu mesajı yok</p></Card>
                    : <>
                      {/* Mesaj arama çubuğu */}
                      <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
                        <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <Input
                          type="text"
                          value={msgSearch}
                          onChange={(e) => setMsgSearch(e.target.value)}
                          placeholder="Mesajlarda ara (ad, e-posta, konu, mesaj)..."
                          className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-6 px-1"
                        />
                        {msgSearch && (
                          <button type="button" onClick={() => setMsgSearch('')} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-3">{messages.filter(m => m.status !== 'archived').filter(m => {
                        if (!msgSearch.trim()) return true;
                        const q = normalizeTr(msgSearch);
                        return (normalizeTr(m.name).includes(q) ||
                                normalizeTr(m.email).includes(q) ||
                                normalizeTr(m.subject).includes(q) ||
                                normalizeTr(m.message).includes(q));
                      }).map(m => { const sel = selectedIds.has(m.id); return (
                      <Card key={m.id} className={`p-4 ${m.status === 'new' ? 'border-news/40 bg-news/[0.04]' : ''} ${sel ? 'ring-2 ring-news/40' : ''} ${m.repliedAt ? 'border-emerald-300 dark:border-emerald-700' : ''}`}>
                        <div className="flex items-start gap-3">
                          <Checkbox checked={sel} onCheckedChange={() => toggleSelect(m.id)} className="mt-1" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold">{m.name}</h4>
                              {m.status === 'new' && <Badge className="bg-news text-news-foreground text-[9px]">YENİ</Badge>}
                              {m.repliedAt && (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[9px] gap-1">
                                  <Check className="h-3 w-3" />YANITLANDI
                                </Badge>
                              )}
                              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(m.createdAt).toLocaleString('tr-TR')}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {m.email} · {m.subject}
                              {m.ip && m.ip !== 'bilinmiyor' && (
                                <span className="ml-2 text-[10px] text-rose-600 dark:text-rose-400 font-mono">IP: {m.ip}</span>
                              )}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{m.message}</p>

                            {/* Cevap yazma editörü — sadece bu mesajda açıkken göster */}
                            {replyingId === m.id && (
                              <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                  <Send className="h-3.5 w-3.5" />
                                  Cevap ({m.email})
                                  {generatingReply === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-news" />}
                                </div>
                                <Textarea
                                  value={replyDraft}
                                  onChange={(e) => setReplyDraft(e.target.value)}
                                  rows={5}
                                  placeholder="Cevabınızı buraya yazın..."
                                  className="resize-y min-h-[120px]"
                                  disabled={sendingReply === m.id}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSendReply(m.id)}
                                    disabled={sendingReply === m.id || !replyDraft.trim()}
                                    className="gap-1.5 text-xs"
                                  >
                                    {sendingReply === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Gönder
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleGenerateReply(m)}
                                    disabled={generatingReply === m.id}
                                    className="gap-1.5 text-xs"
                                  >
                                    {generatingReply === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                                    AI ile Taslak Üret
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setReplyingId(null); setReplyDraft(''); }}
                                    className="gap-1.5 text-xs"
                                  >
                                    <X className="h-3.5 w-3.5" />İptal
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Daha önce gönderilmiş cevap — editör kapalıyken göster */}
                            {replyingId !== m.id && m.reply && (
                              <div className="mt-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  <Check className="h-3.5 w-3.5" />
                                  Gönderilen cevap
                                  {m.repliedAt && (
                                    <span className="ml-auto inline-flex items-center gap-1 text-[10px]">
                                      <Clock className="h-3 w-3" />
                                      {new Date(m.repliedAt).toLocaleString('tr-TR')}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{m.reply}</p>
                              </div>
                            )}
                          </div>

                          {/* Sağdaki butonlar: Cevapla + Arşivle + Sil */}
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openReplyEditor(m)}
                              className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-news"
                              title="Cevap Yaz"
                              disabled={sendingReply === m.id || archivingMsg === m.id}
                            >
                              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchiveMessage(m.id)}
                              disabled={archivingMsg === m.id || deletingId === m.id}
                              className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-amber-600"
                              title="Arşivle"
                            >
                              {archivingMsg === m.id ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Archive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(m.id)}
                              disabled={deletingId === m.id || archivingMsg === m.id}
                              className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive"
                              title="Sil"
                            >
                              {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                            </Button>
                          </div>
                        </div>
                      </Card>); })}</div>
                    </>}
                  </div>
                )}

                {/* Custom article tab */}
                {adminTab === 'custom' && (
                  <div className="space-y-4">
                    {/* Konu Arama — güvenilen sitelerde tara */}
                    <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                      <Label className="text-xs font-bold text-blue-700 dark:text-blue-300">Konu ile Haber Ara (Güvenilen Siteler)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder='Örn: "Ali Emre Ballı intihar etmiş"'
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={handleSearch}
                          disabled={searching || !searchQuery.trim()}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          Tara
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Güvenilen sitelerde konuyu arar, kaynakları ve görselleri listeler. Sonra istediklerinizi seçip "AI Özetle" düğmesine basın.</p>
                    </div>

                    {/* Veya URL'den çek */}
                    <div className="text-center text-[10px] text-muted-foreground">— VEYA —</div>
                    <form onSubmit={handleFetch} className="flex gap-2">
                      <Input value={fetchUrl} onChange={(e) => setFetchUrl(e.target.value)} placeholder="https://ornek.com/haber-basligi" className="flex-1" />
                      <Button type="submit" disabled={fetching || !fetchUrl.trim()} className="gap-2">{fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}Getir</Button>
                    </form>

                    {/* Tarama Sonuçları — kaynak listesi (checkbox'lı) + görseller (radio benzeri) */}
                    {searchResults.length > 0 && (
                      <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-muted-foreground">TARAMA SONUÇLARI ({searchResults.length} kaynak · {selectedSourceUrls.size} seçili)</p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSummarizeSelected}
                            disabled={summarizing || selectedSourceUrls.size === 0}
                            className="gap-1.5 text-xs h-7 bg-blue-600 hover:bg-blue-700"
                          >
                            {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            AI Özetle ({selectedSourceUrls.size})
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {searchResults.map((s, i) => (
                            <div key={s.url} className="rounded border border-border/50 bg-background/50 p-1.5">
                              <label className="flex items-start gap-1.5 text-[10px] cursor-pointer">
                                <Checkbox
                                  checked={selectedSourceUrls.has(s.url)}
                                  onCheckedChange={(checked) => {
                                    setSelectedSourceUrls(prev => {
                                      const next = new Set(prev);
                                      if (checked) next.add(s.url);
                                      else next.delete(s.url);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="font-bold text-news min-w-[16px] text-right">{i+1}.</span>
                                <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-1 min-w-0 hover:underline">
                                  <span className="font-semibold text-foreground/80">{s.site}</span>
                                  <span className="text-muted-foreground"> — {s.title}</span>
                                </a>
                              </label>
                              {/* Bu kaynaktaki görseller */}
                              {s.images && s.images.length > 0 && (
                                <div className="mt-1.5 ml-7 flex flex-wrap gap-1.5">
                                  {s.images.map((img, j) => (
                                    <button
                                      key={j}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (selectedImageUrl === img) {
                                          setSelectedImageUrl(null);
                                          setCustomImage('');
                                        } else {
                                          setSelectedImageUrl(img);
                                          setCustomImage(img);
                                        }
                                      }}
                                      className={`relative h-12 w-16 overflow-hidden rounded border-2 ${selectedImageUrl === img ? 'border-news' : 'border-transparent'} flex-shrink-0`}
                                    >
                                      <img src={img} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }} />
                                      {selectedImageUrl === img && <span className="absolute inset-0 bg-news/20 flex items-center justify-center"><Check className="h-3 w-3 text-white" /></span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customTitle && (
                      <div className="space-y-4 rounded-lg border border-border p-4">
                        <div className="space-y-1.5"><Label>Başlık</Label><Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} /></div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label>Özet</Label>
                            <Button type="button" size="sm" variant="outline" onClick={handleAiSummary} disabled={generatingSummary || !customContent} className="gap-1.5 text-xs">
                              {generatingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              AI Özeti Oluştur
                            </Button>
                          </div>
                          <Textarea value={customSummary} onChange={(e) => setCustomSummary(e.target.value)} rows={6} className="resize-none" />
                        </div>
                        <div className="space-y-1.5"><Label>Görsel URL</Label><Input value={customImage} onChange={(e) => setCustomImage(e.target.value)} placeholder="https://..." />
                          <div className="flex items-center gap-2 mt-1">
                            <Label htmlFor="custom-file" className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted inline-flex items-center gap-1.5">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Bilgisayardan Yükle</Label>
                            <input id="custom-file" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, (url) => setCustomImage(url), customTitle); }} />
                          </div>
                          {/* Görsel penceresi — büyük önizleme */}
                          {customImage && (
                            <div className="mt-2 rounded-md border border-border overflow-hidden bg-muted/30 relative">
                              <img
                                src={customImage}
                                alt="Özel haber görseli"
                                className="w-full h-48 object-contain"
                                onError={(e) => {
                                  const t = e.currentTarget as HTMLImageElement;
                                  t.style.display = 'none';
                                  const ph = t.parentElement?.querySelector('[data-placeholder]') as HTMLElement | null;
                                  if (ph) ph.style.display = 'flex';
                                }}
                              />
                              <div data-placeholder style={{ display: 'none' }} className="w-full h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                                <ImageIcon className="h-8 w-8" />
                                <p className="text-[10px]">Görsel yüklenemedi — URL geçersiz veya erişilemiyor</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(customImage).then(() => toast.success('Görsel URL kopyalandı'))}
                                className="absolute top-1 right-1 rounded bg-background/80 backdrop-blur px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
                              >URL</button>
                            </div>
                          )}
                          {fetchedImages.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{fetchedImages.map((img, i) => <button key={i} type="button" onClick={() => setCustomImage(img)} className={`h-16 w-24 overflow-hidden rounded border-2 ${customImage === img ? 'border-news' : 'border-transparent'}`}><img src={img} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></button>)}</div>}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Kategori (birden fazla seçebilirsiniz)</Label>
                          <div className="grid grid-cols-2 gap-1.5 p-2 rounded-md border border-border bg-muted/30">
                            {['Özel', 'Siyaset', 'Ekonomi / Finans', 'Kamu / Resmi', 'Bilim / Teknoloji', 'Kültür / Sanat', 'Spor / Magazin'].map(cat => (
                              <label key={cat} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox
                                  checked={customCategory.includes(cat)}
                                  onCheckedChange={(checked) => {
                                    if (checked) setCustomCategory([...customCategory, cat]);
                                    else setCustomCategory(customCategory.filter(c => c !== cat));
                                  }}
                                />
                                {cat}
                              </label>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Haber seçtiğiniz kategorilerin hepsinde en üstte yerleşir</p>
                        </div>
                        <Button onClick={handleSaveCustom} disabled={saving || !customTitle.trim() || !customSummary.trim()} className="w-full gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Kaydet ve Yayınla</Button>
                      </div>
                    )}
                    {!customTitle && !fetching && !searching && searchResults.length === 0 && <Card className="flex flex-col items-center gap-3 p-10 text-center"><Star className="h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Konu yazıp "Tara" düğmesine basın veya URL yapıştırıp "Getir" düğmesine basın.</p></Card>}

                    {/* Güvenilen Siteler Yönetimi */}
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">Güvenilen Siteler ({trustedSites.length})</Label>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setShowTrustedSites(!showTrustedSites)} className="text-xs gap-1">
                          {showTrustedSites ? 'Gizle' : 'Yönet'}
                        </Button>
                      </div>
                      {showTrustedSites && (
                        <div className="space-y-3">
                          {/* Site ekleme formu */}
                          <div className="flex gap-2">
                            <Input
                              value={newSiteName}
                              onChange={(e) => setNewSiteName(e.target.value)}
                              placeholder="Site adı (örn: Sözcü)"
                              className="flex-1 text-xs"
                            />
                            <Input
                              value={newSiteUrl}
                              onChange={(e) => setNewSiteUrl(e.target.value)}
                              placeholder="Arama URL (örn: https://sozcu.com.tr/ara/?q={query})"
                              className="flex-1 text-xs"
                            />
                            <Button type="button" size="sm" onClick={handleAddTrustedSite} disabled={!newSiteName.trim() || !newSiteUrl.trim()} className="gap-1 text-xs">
                              <Plus className="h-3.5 w-3.5" /> Ekle
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{'{query}'} placeholder olan URL girin. Sistem aramada bunu konu ile değiştirir.</p>
                          {/* Site listesi */}
                          {trustedSites.length > 0 ? (
                            <div className="space-y-1">
                              {trustedSites.map(s => (
                                <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs font-medium">{s.name}</span>
                                    <span className="ml-2 text-[10px] text-muted-foreground truncate">{s.searchUrl}</span>
                                  </div>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => handleDeleteTrustedSite(s.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">Henüz güvenilen site yok. Ekleyin.</p>
                          )}
                        </div>
                      )}
                    </div>
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

                        {/* Yayında arama çubuğu */}
                        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
                          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <Input
                            type="text"
                            value={pubSearch}
                            onChange={(e) => setPubSearch(e.target.value)}
                            placeholder="Yayındaki haberlerde ara (başlık, özet)..."
                            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-6 px-1"
                          />
                          {pubSearch && (
                            <button type="button" onClick={() => setPubSearch('')} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="mb-6 space-y-3">
                          {pubArticles.slice(0, 30).filter(a => {
                            if (!pubSearch.trim()) return true;
                            const q = normalizeTr(pubSearch);
                            return normalizeTr(a.aiTitle).includes(q) || normalizeTr(a.aiSummary).includes(q);
                          }).map(a => (
                            <Card key={a.id} className="p-4">
                              {editingId === a.id ? (
                                <div className="space-y-3">
                                  <div className="space-y-1"><Label className="text-xs">Başlık</Label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
                                  <div className="space-y-1"><Label className="text-xs">Özet</Label><Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={5} className="resize-none" /></div>
                                  <div className="space-y-1"><Label className="text-xs">Görsel URL</Label><Input value={editImage} onChange={(e) => setEditImage(e.target.value)} />
                                  <div className="flex items-center gap-2 mt-1">
                                    <Label htmlFor="edit-file" className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted inline-flex items-center gap-1.5">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Bilgisayardan Yükle</Label>
                                    <input id="edit-file" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, (url) => setEditImage(url), editTitle); }} />
                                    {editImage && <img src={editImage} alt="" className="h-10 w-16 rounded object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                  </div>
                                  </div>
                                  {/* Kategori seçimi — mevcut kategori işaretli */}
                                  <div className="space-y-1">
                                    <Label className="text-xs">Kategori (ilk seçili kayıt için kullanılır)</Label>
                                    <div className="grid grid-cols-2 gap-1.5 p-2 rounded-md border border-border bg-muted/30">
                                      {['Özel', 'Siyaset', 'Ekonomi / Finans', 'Kamu / Resmi', 'Bilim / Teknoloji', 'Kültür / Sanat', 'Spor / Magazin'].map(cat => (
                                        <label key={cat} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                          <Checkbox
                                            checked={editCategory.includes(cat)}
                                            onCheckedChange={(checked) => {
                                              if (checked) setEditCategory([...editCategory.filter(c => c !== cat), cat]);
                                              else setEditCategory(editCategory.filter(c => c !== cat));
                                            }}
                                          />
                                          {cat}
                                        </label>
                                      ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Çoklu kategori için "Özel Haber Ekle" bölümünü kullanın. Burada ilk seçili kategori habere uygulanır.</p>
                                  </div>
                                  <div className="flex gap-2"><Button size="sm" onClick={() => saveEdit(a.id)} disabled={savingEdit} className="gap-1.5">{savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Kaydet</Button><Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1.5"><X className="h-3.5 w-3.5" />İptal</Button></div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2 sm:gap-3">
                                  {a.imageUrl && <div className="h-14 w-20 sm:h-16 sm:w-24 flex-shrink-0 overflow-hidden rounded"><img src={a.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></div>}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 sm:gap-2"><h4 className="text-sm font-semibold line-clamp-1">{a.aiTitle}</h4><Badge variant="secondary" className="text-[9px] flex-shrink-0">{a.category}</Badge></div>
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.aiSummary}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                      <span className="hidden sm:inline">{a.wordCount} kelime</span>
                                      <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                                        <Heart className="h-3 w-3 fill-rose-500" />
                                        <span className="font-medium tabular-nums">{a.initialHearts ?? 0}+{a.clickHearts ?? 0}</span>
                                      </span>
                                      {a.latestPublishedAt && (
                                        <span className="inline-flex items-center gap-1 tabular-nums">
                                          <Clock className="h-3 w-3" />
                                          {new Date(a.latestPublishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                          <span className="text-border">·</span>
                                          {new Date(a.latestPublishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
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
                                  <div className="flex flex-shrink-0 items-center gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => startEdit(a)} title="Düzenle" className="h-8 w-8 text-muted-foreground hover:text-news"><Edit3 className="h-4 w-4" /></Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" title="Arşive Al" className="h-8 w-8 text-muted-foreground hover:text-amber-600"><Archive className="h-4 w-4" /></Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Haberi arşive al?</AlertDialogTitle>
                                          <AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi arşive alınacak (yayından kalkacak). Arşiv sekmesinden görüntülenebilir ve istenirse tekrar yayına alınabilir.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deletePub(a.id, false)} className="bg-amber-600 text-white hover:bg-amber-700">Arşive Al</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" title="Kalıcı Sil" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Haberi kalıcı sil?</AlertDialogTitle>
                                          <AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ — haber veritabanından ve kalp kayıtlarından tamamen kaldırılacak. Devam edilsin mi?</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deletePub(a.id, true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Kalıcı Sil</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
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
                                      <Button variant="ghost" size="icon" onClick={() => startEdit(a)} title="Düzenle" className="h-8 w-8 text-muted-foreground hover:text-news"><Edit3 className="h-4 w-4" /></Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="icon" title="Arşive Al" className="h-8 w-8 text-muted-foreground hover:text-amber-600"><Archive className="h-4 w-4" /></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Haberi arşive al?</AlertDialogTitle>
                                            <AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi arşive alınacak. Arşiv sekmesinden tekrar yayına alınabilir.</AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deletePub(a.id, false)} className="bg-amber-600 text-white hover:bg-amber-700">Arşive Al</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="icon" title="Kalıcı Sil" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Haberi kalıcı sil?</AlertDialogTitle>
                                            <AlertDialogDescription>{a.aiTitle.slice(0, 60)} haberi kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ.</AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deletePub(a.id, true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Kalıcı Sil</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
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
                    : archivedArticles.length === 0 && messages.filter(m => m.status === 'archived').length === 0 ? (
                      <Card className="flex flex-col items-center gap-3 p-10 text-center">
                        <Archive className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Arşivde içerik yok</p>
                        <p className="text-xs text-muted-foreground/70">Yayından kaldırılan haberler ve arşivlenen mesajlar burada listelenir.</p>
                      </Card>
                    ) : (
                      <>
                        {/* Alt sekmeler — Arşivlenen Haberler | Arşivlenen Mesajlar */}
                        <div className="mb-4 flex gap-2 border-b border-border pb-2">
                          <button
                            type="button"
                            onClick={() => setArchivedSubtab('articles')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
                              archivedSubtab === 'articles'
                                ? 'bg-secondary text-secondary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Arşivlenen Haberler
                            {archivedArticles.length > 0 && (
                              <Badge variant="secondary" className="text-[10px]">{archivedArticles.length}</Badge>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchivedSubtab('messages')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
                              archivedSubtab === 'messages'
                                ? 'bg-secondary text-secondary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Arşivlenen Mesajlar
                            {messages.filter(m => m.status === 'archived').length > 0 && (
                              <Badge variant="secondary" className="text-[10px]">{messages.filter(m => m.status === 'archived').length}</Badge>
                            )}
                          </button>
                        </div>

                        {/* Arşiv arama çubuğu — her iki alt sekmede de çalışır */}
                        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
                          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <Input
                            type="text"
                            value={archivedSearch}
                            onChange={(e) => setArchivedSearch(e.target.value)}
                            placeholder={archivedSubtab === 'articles' ? 'Arşivdeki haberlerde ara...' : 'Arşivdeki mesajlarda ara...'}
                            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-6 px-1"
                          />
                          {archivedSearch && (
                            <button type="button" onClick={() => setArchivedSearch('')} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Arşivlenen Haberler içeriği */}
                        {archivedSubtab === 'articles' && (
                          <div>
                            {archivedArticles.length === 0 ? (
                              <Card className="flex flex-col items-center gap-3 p-8 text-center">
                                <Archive className="h-8 w-8 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Arşivde haber yok</p>
                              </Card>
                            ) : (
                              <div className="space-y-3">
                                {archivedArticles.filter(a => {
                                  if (!archivedSearch.trim()) return true;
                                  const q = normalizeTr(archivedSearch);
                                  return normalizeTr(a.aiTitle).includes(q) || normalizeTr(a.aiSummary).includes(q);
                                }).map(a => (
                                  <Card key={a.id} className="p-4 opacity-80">
                                    <div className="flex items-start gap-3">
                                      {a.imageUrl && <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded grayscale"><img src={a.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} /></div>}
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2"><h4 className="text-sm font-semibold line-clamp-1">{a.aiTitle}</h4><Badge variant="secondary" className="text-[9px]">{a.category}</Badge></div>
                                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.aiSummary}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                          <span>{a.wordCount} kelime</span>
                                          {a.publishedAt && (
                                            <span className="inline-flex items-center gap-1 tabular-nums">
                                              <Clock className="h-3 w-3" />
                                              <span className="font-medium">Yayın:</span>
                                              {new Date(a.publishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                              <span className="text-border">·</span>
                                              {new Date(a.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                          )}
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
                            )}
                          </div>
                        )}

                        {/* Arşivlenen Mesajlar içeriği */}
                        {archivedSubtab === 'messages' && (
                          <div>
                            {messages.filter(m => m.status === 'archived').length === 0 ? (
                              <Card className="flex flex-col items-center gap-3 p-8 text-center">
                                <Mail className="h-8 w-8 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Arşivde mesaj yok</p>
                              </Card>
                            ) : (
                              <div className="space-y-3">
                                {messages.filter(m => m.status === 'archived').filter(m => {
                                  if (!archivedSearch.trim()) return true;
                                  const q = normalizeTr(archivedSearch);
                                  return (normalizeTr(m.name).includes(q) ||
                                          normalizeTr(m.email).includes(q) ||
                                          normalizeTr(m.subject).includes(q) ||
                                          normalizeTr(m.message).includes(q));
                                }).map(m => (
                                  <Card key={m.id} className="p-4 opacity-80">
                                    <div className="flex items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-sm font-semibold">{m.name}</h4>
                                          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {new Date(m.createdAt).toLocaleString('tr-TR')}
                                          </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {m.email} · {m.subject}
                                          {m.ip && m.ip !== 'bilinmiyor' && (
                                            <span className="ml-2 text-[10px] text-rose-600 dark:text-rose-400 font-mono">IP: {m.ip}</span>
                                          )}
                                        </p>
                                        <p className="mt-2 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{m.message}</p>
                                        {m.reply && (
                                          <div className="mt-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-2">
                                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                              <Check className="h-3 w-3" />
                                              Gönderilen cevap
                                              {m.repliedAt && (
                                                <span className="ml-auto inline-flex items-center gap-1 text-[10px]">
                                                  <Clock className="h-3 w-3" />
                                                  {new Date(m.repliedAt).toLocaleString('tr-TR')}
                                                </span>
                                              )}
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{m.reply}</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-shrink-0 items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              const r = await fetch(`/api/admin/messages/${m.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                body: JSON.stringify({ status: 'read' }),
                                              });
                                              if (!r.ok) throw new Error('Geri yüklenemedi');
                                              void loadMessages();
                                              toast.success('Mesaj tekrar aktif edildi');
                                            } catch (e) {
                                              toast.error('Geri yükleme hatası');
                                            }
                                          }}
                                          className="h-8 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                          Tekrar Aktif Et
                                        </Button>
                                      </div>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Restart tab — pipeline'ı hemen tetikler + canlı ilerleme */}
                {/* Pending (Olası Tekrar) tab — %50+ benzer başlıkla gelen ama birebir aynı olmayan haberler */}
                {adminTab === 'pending' && (
                  <div className="space-y-3">
                    {loadingPending ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
                    : pendingArticles.length === 0 ? (
                      <Card className="flex flex-col items-center gap-3 p-10 text-center">
                        <Check className="h-10 w-10 text-emerald-500" />
                        <p className="text-sm text-muted-foreground">Bekleyen tekrar haberi yok</p>
                        <p className="text-xs text-muted-foreground/70">%50+ benzer başlıkla gelen ama birebir olmayan haberler burada listelenir.</p>
                      </Card>
                    ) : (
                      <>
                        <Card className="border-2 border-news/30 bg-news/[0.03] p-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 flex-shrink-0 text-news mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-foreground">{pendingArticles.length} olası tekrar haberi beklemede</p>
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                Bu haberler mevcut yayındaki haberlerle %50+ benzerlik taşıyo ama birebir aynı başlık değiller.
                                Aşağıdaki düğmelerle karar verin:
                                <span className="font-medium text-foreground"> Yayınla+Arşive</span> (eskisini arşive, yenisini yayınla),
                                <span className="font-medium text-foreground"> Sadece Yayınla</span> (eskisi de kalsın),
                                <span className="font-medium text-foreground"> Yoksay</span> (bekleme listesinden kaldır).
                              </p>
                            </div>
                          </div>
                        </Card>

                        {/* Pending arama çubuğu */}
                        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
                          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <Input
                            type="text"
                            value={pendingSearch}
                            onChange={(e) => setPendingSearch(e.target.value)}
                            placeholder="Tekrar haberlerde ara (başlık, özet)..."
                            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-xs h-6 px-1"
                          />
                          {pendingSearch && (
                            <button type="button" onClick={() => setPendingSearch('')} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {pendingArticles.filter(a => {
                          if (!pendingSearch.trim()) return true;
                          const q = normalizeTr(pendingSearch);
                          return normalizeTr(a.aiTitle).includes(q) || normalizeTr(a.aiSummary).includes(q);
                        }).map(a => (
                          <Card key={a.id} className="p-4 border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
                            <div className="flex items-start gap-3">
                              {a.imageUrl && <img src={a.imageUrl} alt="" className="h-16 w-24 rounded object-cover flex-shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="text-[10px]" variant="secondary">{a.category}</Badge>
                                  <Badge className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300">{a.sourceCount} kaynak</Badge>
                                  <span className="text-[10px] text-muted-foreground">{a.wordCount} kelime</span>
                                </div>
                                <h4 className="mt-1 text-sm font-semibold text-foreground line-clamp-2">{a.aiTitle}</h4>
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{a.aiSummary}</p>
                                <div className="mt-3 flex gap-1.5 flex-wrap">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    disabled={pendingAction === a.id + 'publish_archive_old'}
                                    onClick={() => handlePendingAction(a.id, 'publish_archive_old')}
                                    className="gap-1 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    {pendingAction === a.id + 'publish_archive_old' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    Yayınla + Eskiyi Arşive
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pendingAction === a.id + 'publish_only'}
                                    onClick={() => handlePendingAction(a.id, 'publish_only')}
                                    className="gap-1 text-xs h-7 border-blue-500 text-blue-700 hover:bg-blue-50"
                                  >
                                    {pendingAction === a.id + 'publish_only' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Newspaper className="h-3 w-3" />}
                                    Sadece Yayınla
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pendingAction === a.id + 'dismiss'}
                                    onClick={() => handlePendingAction(a.id, 'dismiss')}
                                    className="gap-1 text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    {pendingAction === a.id + 'dismiss' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Yoksay
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Restart onay dialog — sekmeden bağımsız (header'daki mavi düğmeden açılır) */}
          <AlertDialog open={restartConfirmOpen} onOpenChange={setRestartConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Akışı başlat?</AlertDialogTitle>
                <AlertDialogDescription>
                  Pipeline hemen tetiklenecek: RSS kaynakları okunacak, tekrarlayan haberler gruplanacak, AI özet üretilecek ve yayınlanacak. Bu işlem 1-3 dakika sürebilir. Onaylıyor musunuz?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestart} className="bg-news text-news-foreground hover:bg-news/90 gap-2">
                  <RefreshCw className="h-4 w-4" /> Başlat
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
