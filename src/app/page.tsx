'use client';

import { useState, useEffect } from 'react';
import { Mail, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { NewsScreen } from '@/components/news/news-screen';
import { InfoBands } from '@/components/news/info-bands';
import { AdminPanel } from '@/components/news/admin-panel';
import { ReaderContactForm } from '@/components/news/reader-contact-form';
import { ThemeToggle } from '@/components/news/theme-toggle';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function Home() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [readerFormOpen, setReaderFormOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (d: Date) => {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between py-1">
            {/* Sol: Saat + Tarih + Takvim */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="flex flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left transition hover:bg-muted/50 cursor-pointer">
                  <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {formatTime(now)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(now)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
                  className="rounded-lg border"
                />
              </PopoverContent>
            </Popover>

            {/* Orta: Logo + Başlık */}
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg shadow-md">
                <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col leading-none gap-1">
                <span className="text-lg font-bold tracking-tight uppercase animate-[fadeIn_1s_ease-in]" style={{ animation: 'gradientShift 3s ease-in-out infinite' }}>
                  TÜRKİYE'DE GÜNDEM
                </span>
                <span className="text-xs font-bold tracking-[0.3em] text-muted-foreground uppercase">TRGUNDEM.NET</span>
              </div>
            </div>

            {/* Sağ: + + Tema */}
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => setAdminOpen(true)} aria-label="Abone Girişi" className="h-9 w-9">
                <span className="text-xl">+</span>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Bilgi bantları */}
      <div className="sticky top-20 z-30">
        <InfoBands />
      </div>

      <main className="flex-1">
        <NewsScreen />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setReaderFormOpen(true)} className="gap-2 text-sm">
              <Mail className="h-4 w-4" />
              Okuyucu Temsilcisine Ulaşınız
            </Button>
          </div>
          <div className="border-t border-border pt-4">
            <button type="button" onClick={() => setRulesOpen(!rulesOpen)} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition">
              Site Kuralları ve İlkeleri
              {rulesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {rulesOpen && (
              <div onClick={() => setRulesOpen(false)} className="mt-4 cursor-pointer space-y-3 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground leading-relaxed">
                <p><strong>1. Telif Hakkı ve Kaynak Gösterme:</strong> Sitemizde yer alan tüm haber içerikleri, kaynak RSS beslemelerinden alınan bilgilerden özetlenerek yeniden kaleme alınmıştır. Hiçbir içerik, orijinal kaynağından birebir kopyalanmamıştır. Her haberin orijinal kaynak bağlantısı sayfamızda açıkça belirtilmektedir.</p>
                <p><strong>2. İçerik Üretimi:</strong> Haber özetleri, yapay zeka desteğiyle kaynak metinleri yeniden ifade ederek hazırlanmaktadır. Özetler, orijinal haber cümleleriyle birebir aynı değildir ve bağımsız bir üretimdir.</p>
                <p><strong>3. Kaynak Sorumluluğu:</strong> Sitemizde yer alan haberlerin içeriklerinden ilgili kaynak kuruluşlar sorumludur. Sitemiz yalnızca haberleri özetleyerek sunar ve kaynakların içeriğini onaylamaz.</p>
                <p><strong>4. Kullanıcı Mesajları:</strong> Okuyucu temsilcisine gönderilen mesajlar, argo ve küfürlü içeriklere otomatik olarak filtrelenir. Mesajlar site yönetimi tarafından değerlendirilir ve uygun olmayanlar yayından kaldırılır.</p>
                <p><strong>5. Gizlilik:</strong> Sitemiz, kullanıcıları otomatik olarak tanımlamaz. Okuyucu temsilcisine gönderilen mesajlarda paylaştığınız bilgiler yalnızca mesajınızı yanıtlamak için kullanılır ve üçüncü taraflarla paylaşılmaz.</p>
                <p><strong>6. Finansal Veriler:</strong> Döviz kurları, Türkiye Cumhuriyet Merkez Bankası (TCMB) verilerinden alınmaktadır. BIST 100 ve Ons Altın verileri Yahoo Finance'ten alınmaktadır. Hava durumu bilgileri Meteoroloji Genel Müdürlüğü verilerine dayanmaktadır. Bu veriler bilgilendirme amaçlıdır ve yatırım tavsiyesi niteliği taşımaz.</p>
                <p><strong>7. İçerik Güncellemesi:</strong> Haberler, kaynak RSS beslemelerinden belirli aralıklarla otomatik olarak çekilmekte ve özetlenmektedir. Haber içerikleri zaman içinde güncellenebilir veya kaldırılabilir.</p>
                <p className="text-center text-xs text-muted-foreground/60 pt-2">Bu açıklamayı kapatmak için buraya tıklayınız.</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-center">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">TRGUNDEM.NET</span> — Türkiye'nin gündemi
            </p>
          </div>
        </div>
      </footer>

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      <ReaderContactForm open={readerFormOpen} onClose={() => setReaderFormOpen(false)} />

      <style jsx global>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
