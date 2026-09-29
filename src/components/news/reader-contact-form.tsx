'use client';

import { useState } from 'react';
import { Loader2, Send, Mail } from 'lucide-react';
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

export function ReaderContactForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/reader-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(json.error || 'Gönderilemedi');
      toast.success('Mesajınız iletildi. İlginiz için teşekkürler!');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderme hatası');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Okuyucu Temsilcisine Ulaşın
          </DialogTitle>
          <DialogDescription>
            Görüş, öneri ve şikayetlerinizi bize iletebilirsiniz. Mesajınız yönetici
            paneline iletilecektir.
          </DialogDescription>
        </DialogHeader>
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
            <Label htmlFor="r-email">E-posta *</Label>
            <Input
              id="r-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@email.com"
              required
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
              disabled={submitting || !name.trim() || !email.trim() || !message.trim()}
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
      </DialogContent>
    </Dialog>
  );
}
