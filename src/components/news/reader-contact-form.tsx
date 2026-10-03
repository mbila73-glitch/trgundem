'use client';

import { useState } from 'react';
import { Loader2, Send, Mail, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type Status = { type: 'success' | 'rejected'; text: string } | null;

export function ReaderContactForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText('temsilci@trgundem.net');
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (e) {
      const textArea = document.createElement('textarea');
      textArea.value = 'temsilci@trgundem.net';
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2000); } catch (err) {}
      document.body.removeChild(textArea);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const r = await fetch('/api/reader-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || '(belirtilmedi)', subject, message }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string; rejected?: boolean };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Gönderilemedi');

      if (json.rejected) {
        setStatus({ type: 'rejected', text: 'Mesajınız iade edilmiştir' });
        setMessage('');
        setTimeout(() => setStatus(null), 2000);
      } else {
        // Önce pencereyi kapat, formu temizle
        setName('');
        setEmail('');
        setSubject('');
        setMessage('');
        onClose();
        setTimeout(function() {
          toast.success('Mesajınız Tarafımıza Ulaşmıştır Teşekkürler', {
            position: 'top-center',
            style: {
              background: '#10b981',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              padding: '14px 28px',
              borderRadius: '12px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 24px rgba(16,185,129,0.3)',
            }
          });
        }, 1000);
      }
    } catch (e) {
      setStatus({
        type: 'rejected',
        text: e instanceof Error ? e.message : 'Gönderme hatası',
      });
      setTimeout(() => setStatus(null), 2000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Okuyucu Temsilcisine Ulaşın
          </DialogTitle>
          <DialogDescription>
            <span>Görüş, öneri ve şikayetlerinizi bize iletebilirsiniz.</span>
            <button
              type="button"
              onClick={copyEmail}
              className="mt-2 flex items-center gap-1.5 text-news hover:underline font-medium text-sm transition"
            >
              {emailCopied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-600">E-posta adresi kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>temsilci@trgundem.net</span>
                </>
              )}
            </button>
          </DialogDescription>
        </DialogHeader>

        {status ? (
          // Status message — visible for 2 seconds
          <div
            className={`flex items-center justify-center gap-3 rounded-lg p-8 ${
              status.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle2 className="h-8 w-8" />
            ) : (
              <XCircle className="h-8 w-8" />
            )}
            <p className="text-lg font-semibold">{status.text}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Ad Soyad *</Label>
              <Input
                id="r-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adınız"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-email">E-posta (isteğe bağlı)</Label>
              <Input
                id="r-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-subject">Konu</Label>
              <Input
                id="r-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Mesajınızın konusu"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-message">Mesaj *</Label>
              <Textarea
                id="r-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mesajınızı buraya yazın"
                required
                rows={5}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting || !name.trim() || !message.trim()}
                className="w-full gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Gönder
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
