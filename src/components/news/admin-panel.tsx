'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Trash2, Mail, Clock, Loader2, CheckSquare, Square, CheckCheck, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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

type Message = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
};

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
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

  useEffect(() => {
    const saved = localStorage.getItem('admin_token');
    if (saved) setToken(saved);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoggingIn(true);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = (await r.json()) as { ok?: boolean; token?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Giriş başarısız');
      localStorage.setItem('admin_token', json.token!);
      setToken(json.token!);
      setPassword('');
      toast.success('Giriş başarılı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setLoggingIn(false);
    }
  };

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoadingMsgs(true);
    try {
      const r = await fetch('/api/admin/messages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        localStorage.removeItem('admin_token');
        setToken(null);
        toast.error('Oturum süresi doldu, tekrar giriş yapın');
        return;
      }
      const json = (await r.json()) as { messages?: Message[] };
      setMessages(json.messages ?? []);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mesajlar yüklenemedi');
    } finally {
      setLoadingMsgs(false);
    }
  }, [token]);

  useEffect(() => {
    if (open && token) {
      void loadMessages();
    }
  }, [open, token, loadMessages]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const r = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Silinemedi');
      setMessages((arr) => arr.filter((m) => m.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Mesaj silindi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatası');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/messages/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      );
      setMessages((arr) => arr.filter((m) => !selectedIds.has(m.id)));
      toast.success(`${ids.length} mesaj silindi`);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu silme hatası');
    } finally {
      setBulkDeleting(false);
    }
  };

  const deleteAll = async () => {
    setBulkDeleting(true);
    try {
      const ids = messages.map((m) => m.id);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/messages/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      );
      setMessages([]);
      setSelectedIds(new Set());
      toast.success(`${ids.length} mesaj silindi (tümü)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tümünü silme hatası');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const r = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await r.json()) as {
        ok?: boolean;
        deleted?: { publishedArticles: number; articles: number; readerMessages: number };
        message?: string;
        error?: string;
      };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Sıfırlama başarısız');
      const d = json.deleted!;
      setResetResult(
        `Silindi: ${d.articles} makale, ${d.publishedArticles} özet, ${d.readerMessages} mesaj. RSS yenileme başlatıldı.`
      );
      setMessages([]);
      setSelectedIds(new Set());
      // Reload page after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (e) {
      setResetResult(e instanceof Error ? e.message : 'Sıfırlama hatası');
    } finally {
      setResetting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setMessages([]);
    setSelectedIds(new Set());
  };

  const newCount = messages.filter((m) => m.status === 'new').length;
  const allSelected = messages.length > 0 && selectedIds.size === messages.length;
  const resetConfirmed = resetConfirm.trim().toLowerCase() === 'evet';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Yönetici Paneli
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto news-scroll px-6 pb-6 pt-4">
            {!token ? (
              <form onSubmit={handleLogin} className="mx-auto max-w-sm space-y-4 py-8">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <Lock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Yönetici paneline erişmek için şifre girin
                  </p>
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifre"
                  autoFocus
                  className="text-center"
                />
                <Button
                  type="submit"
                  disabled={loggingIn || !password.trim()}
                  className="w-full gap-2"
                >
                  {loggingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Giriş Yap
                </Button>
              </form>
            ) : (
              <div>
                {/* Header with counts + logout + reset */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Okuyucu Mesajları ({messages.length})
                    </span>
                    {newCount > 0 && (
                      <Badge className="bg-news text-news-foreground">
                        {newCount} yeni
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                      className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Siteyi Sıfırla
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs">
                      Çıkış
                    </Button>
                  </div>
                </div>

                {/* Bulk action buttons */}
                {messages.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAll}
                      disabled={bulkDeleting}
                      className="gap-1.5 text-xs"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      {allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deleteSelected}
                      disabled={bulkDeleting || selectedIds.size === 0}
                      className="gap-1.5 text-xs"
                    >
                      {bulkDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Seçilenleri Sil ({selectedIds.size})
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={bulkDeleting}
                          className="gap-1.5 text-xs text-destructive hover:text-destructive"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Tümünü Sil
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tüm mesajları sil?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {messages.length} mesajın tamamı kalıcı olarak silinecek. Bu işlem geri alınamaz.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={deleteAll}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Tümünü Sil
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {/* Messages list */}
                {loadingMsgs ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <Card className="flex flex-col items-center gap-3 p-10 text-center">
                    <Mail className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Henüz okuyucu mesajı yok
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isSelected = selectedIds.has(m.id);
                      return (
                        <Card
                          key={m.id}
                          className={`p-4 ${m.status === 'new' ? 'border-news/40 bg-news/[0.04]' : ''} ${isSelected ? 'ring-2 ring-news/40' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(m.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold">{m.name}</h4>
                                {m.status === 'new' && (
                                  <Badge className="bg-news text-news-foreground text-[9px]">
                                    YENİ
                                  </Badge>
                                )}
                                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {new Date(m.createdAt).toLocaleString('tr-TR')}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {m.email} · {m.subject}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                                {m.message}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(m.id)}
                              disabled={deletingId === m.id}
                              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label="Sil"
                            >
                              {deletingId === m.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation dialog — full-screen red warning */}
      <Dialog open={resetOpen} onOpenChange={(o) => {
        if (!o && !resetting) {
          setResetOpen(false);
          setResetConfirm('');
          setResetResult(null);
        }
      }}>
        <DialogContent className="max-w-md border-2 border-destructive/50">
          {resetResult ? (
            // Result screen
            <div className="p-6 text-center">
              {resetting ? (
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-destructive" />
              ) : (
                <>
                  <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                  <p className="text-sm font-medium">{resetResult}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Sayfa 3 saniye içinde yenilenecek...
                  </p>
                </>
              )}
            </div>
          ) : (
            // Warning + confirmation screen
            <div className="space-y-6 p-2">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <h2 className="text-xl font-bold text-destructive">
                  TÜM SİTE İÇERİĞİ SİLİNECEKTİR
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tüm RSS makaleleri, AI özetleri, yayındaki haberler ve okuyucu mesajları kalıcı olarak silinecek.
                  Bu işlem geri alınamaz. Sıfırlama sonrası RSS yenileme otomatik başlayacaktır.
                </p>
                <p className="mt-3 text-base font-semibold">
                  Emin misiniz?
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-center text-sm font-medium">
                  Onaylamak için <span className="text-destructive font-bold">evet</span> yazın:
                </p>
                <Input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder="evet"
                  className="text-center text-lg font-semibold"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setResetOpen(false);
                    setResetConfirm('');
                  }}
                  disabled={resetting}
                >
                  İptal
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-2"
                  onClick={handleReset}
                  disabled={!resetConfirmed || resetting}
                >
                  {resetting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Onayla
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
