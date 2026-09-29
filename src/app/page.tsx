'use client';

import { useState } from 'react';
import { Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { NewsScreen } from '@/components/news/news-screen';
import { InfoBands } from '@/components/news/info-bands';
import { AdminPanel } from '@/components/news/admin-panel';
import { ReaderContactForm } from '@/components/news/reader-contact-form';
import { ThemeToggle } from '@/components/news/theme-toggle';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [readerFormOpen, setReaderFormOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header — 2 satır */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-20 flex-col items-center justify-center gap-0 py-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <span className="text-xl font-bold">T</span>
              </span>
              <div className="flex flex-col leading-none">
                <span className="text-lg font-bold tracking-tight">Türkiye'de Gündem</span>
                <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">TRGUNDEM.NET</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => setAdminOpen(true)} aria-label="Abone Girişi" className="h-9 w-9">
            <span className="text-xl">+</span>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Bilgi bantları — sticky */}
      <div className="sticky top-20 z-30">
        <InfoBands />
      </div>

      <main className="flex-1">
        <NewsScreen />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {/* Okuyucu temsilcisi butonu */}
          <div className="mb-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setReaderFormOpen(true)} className="gap-2 text-sm">
              <Mail className="h-4 w-4" />
              Okuyucu Temsilcisine Ulaşınız
            </Button>
          </div>

          {/* Site Kuralları ve İlkeleri */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setRulesOpen(!rulesOpen)}
              className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
            >
              Site Kuralları ve İlkeleri
              {rulesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {rulesOpen && (
              <div
                onClick={() => setRulesOpen(false)}
                className="mt-4 cursor-pointer space-y-3 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground leading-relaxed"
              >
                <p><strong>1. Telif Hakkı ve Kaynak Gösterme:</strong> Sitemizde yer alan tüm haber içerikleri, kaynak RSS beslemelerinden alınan bilgilerden özetlenerek yeniden kaleme edilmiştir. Hiçbir içerik, orijinal kaynağından birebir kopyalanmamıştır. Her haberin orijinal kaynak bağlantısı sayfamızda açıkça belirtilmektedir.</p>
                <p><strong>2. İçerik Üretimi:</strong> Haber özetleri, yapay zeka desteğiyle kaynak metinleri yeniden ifade ederek hazırlanmaktadır. Özetler, orijinal haber cümleleriyle birebir aynı değildir ve bağımsız bir üretimdir.</p>
                <p><strong>3. Kaynak Sorumluluğu:</strong> Sitemizde yer alan haberlerin içeriklerinden ilgili kaynak kuruluşlar sorumludur. Sitemiz yalnızca haberleri özetleyerek sunar ve kaynakların içeriğini onaylamaz.</p>
                <p><strong>4. Kullanıcı Mesajları:</strong> Okuyucu temsilcisine gönderilen mesajlar, argo ve küfürlü içeriklere otomatik olarak filtrelenir. Mesajlar site yönetimi tarafından değerlendirilir ve uygun olmayanlar yayından kaldırılır.</p>
                <p><strong>5. Gizlilik:</strong> Sitemiz, kullanıcıları otomatik olarak tanımlamaz. Okuyucu temsilcisine gönderilen mesajlarda paylaştığınız bilgiler yalnızca mesajınızı yanıtlamak için kullanılır ve üçüncü taraflarla paylaşılmaz.</p>
                <p><strong>6. Finansal Veriler:</strong> Döviz kurları, Resmî Gazete ve Türkiye Cumhuriyet Merkez Bankası (TCMB) verilerinden alınmaktadır. Hava durumu bilgileri Meteoroloji Genel Müdürlüğü verilerine dayanmaktadır. Bu veriler bilgilendirme amaçlıdır ve yatırım tavsiyesi niteliği taşımaz.</p>
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
    </div>
  );
}
