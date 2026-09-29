'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Trash2, Mail, Clock, CheckCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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

  // Load token from localStorage on mount
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
      toast.success('Mesaj silindi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatası');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setMessages([]);
  };

  const newCount = messages.filter((m) => m.status === 'new').length;

  return (
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
            // Login form
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
            // Messages list
            <div>
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
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs">
                  Çıkış
                </Button>
              </div>

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
                  {messages.map((m) => (
                    <Card
                      key={m.id}
                      className={`p-4 ${m.status === 'new' ? 'border-news/40 bg-news/[0.04]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
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
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
