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

function YayinIlkeleri({ onContactClick }: { onContactClick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border pt-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition">
        Yayın İlkeleri, Yayın Politikası ve Kullanım Kuralları
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} className="mt-4 cursor-pointer space-y-4 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground leading-relaxed max-h-[60vh] overflow-y-auto news-scroll">
          <p className="font-medium text-foreground/80">TrGündem, Türkiye'de ve dünyada meydana gelen güncel gelişmeleri, kamuoyunu ilgilendiren olayları ve farklı alanlardaki haberleri okuyucularına ulaştırmak amacıyla faaliyet gösteren bağımsız bir dijital haber platformudur.</p>
          <p>TrGündem'in temel amacı; gelişmeleri araştırmak, farklı kaynaklardan edinilen bilgileri karşılaştırmak ve okuyuculara özgün, anlaşılır, tarafsız ve bilgilendirici haber içerikleri sunmaktır.</p>
          <p className="font-bold text-foreground mt-4">1. Bağımsızlık ve yayın anlayışı</p>
          <p>TrGündem herhangi bir siyasi partiye, siyasi oluşuma, kamu kurumuna, özel şirkete, medya kuruluşuna veya çıkar grubuna bağlı değildir. Yayın faaliyetleri bağımsız bir anlayışla yürütülür. Herhangi bir kişi, kurum, kuruluş veya siyasi oluşum adına propaganda, tanıtım veya yönlendirme amacıyla yayın yapılmaz. Haberlerin hazırlanmasında kamu yararı, doğruluk, tarafsızlık, ifade özgürlüğü ve okuyucunun haber alma hakkı esas alınır. TrGündem'de yayımlanan haberler, ilgili kişi veya kurumların görüşlerini ya da resmî açıklamalarını yansıtmak zorunda değildir. Haber içerikleri, yayıncının bağımsız değerlendirme ve editoryal çalışma sürecinin ürünüdür.</p>
          <p className="font-bold text-foreground mt-4">2. Haberlerin hazırlanması ve özgün içerik politikası</p>
          <p>TrGündem'de yayımlanan haberler; basın açıklamaları, resmî duyurular, kurumsal açıklamalar, kamuya açık belgeler ve diğer erişilebilir bilgi kaynaklarından yararlanılarak hazırlanabilir. Güncel gelişmeler, mümkün olduğu ölçüde birden fazla bağımsız kaynaktan takip edilir. Farklı kaynaklardan edinilen bilgiler karşılaştırılır, doğrulanmaya çalışılır ve haberin konusu ile ilgisi çerçevesinde değerlendirilir. Haber içerikleri, kaynaklardan edinilen bilgilerin özgün bir şekilde değerlendirilmesi ve editoryal çalışma sonucunda hazırlanır. TrGündem'in amacı; gelişmeleri farklı kaynaklardan araştırarak okuyucuya, anlaşılır ve özgün bir haber anlatımı sunmaktır. Yapay zekâ araçları, haberlerin araştırılması, sınıflandırılması, özetlenmesi, karşılaştırılması, dil ve anlatımının geliştirilmesi gibi editoryal süreçlerde yardımcı araç olarak kullanılabilir. Kaynağı bulunmayan, doğrulanamayan veya gerçeğe aykırı olabilecek iddiaların haber olarak sunulmaması esastır.</p>
          <p className="font-bold text-foreground mt-4">3. Kaynak gösterme ve doğrulama</p>
          <p>Özellikle kamu kurumlarının açıklamaları, resmî kararlar, istatistikler ve kamuoyunu ilgilendiren gelişmeler haberleştirilirken bilgilerin asıl kaynağından kontrol edilmesine özen gösterilir. Birden fazla kaynak arasında çelişki bulunması hâlinde bu durumun haberin anlatımına yansıtılması, kesinleşmemiş bilgilerin kesinleşmiş gibi sunulmaması ve gerekli görüldüğünde haberin güncellenmesi esastır.</p>
          <p className="font-bold text-foreground mt-4">4. Tarafsızlık, doğruluk ve kamu yararı</p>
          <p>TrGündem, haberlerin hazırlanmasında kişisel görüşlerden, ön yargılardan ve yönlendirici anlatımlardan mümkün olduğunca uzak durmayı amaçlar. Kamuoyunu ilgilendiren olaylarda farklı tarafların açıklamalarına, mevcut bilgi ve belgelere ve olayın bağlamına yer verilmesine önem verilir. İddialar, kesinleşmiş yargı kararları veya doğrulanmış olgular gibi sunulmaz. Soruşturma, dava ve idari inceleme süreçlerinde kişilerin masumiyet karinesi ve savunma hakları gözetilir. Haber başlıklarının içeriği doğru yansıtması, okuyucuyu yanıltmaması ve yalnızca dikkat çekmek amacıyla gerçeğe aykırı veya abartılı ifadeler kullanılmaması temel yayın ilkelerindendir.</p>
          <p className="font-bold text-foreground mt-4">5. Telif hakları, görseller ve diğer içerikler</p>
          <p>TrGündem, haber metinleri, fotoğraflar, videolar, grafikler, logolar ve diğer içerikler üzerindeki telif haklarına ve fikrî mülkiyet haklarına saygı gösterir. Haberlerde kullanılan görsel ve diğer materyallerin mümkün olduğu ölçüde lisanslı, kullanımına izin verilmiş, kamu malı niteliğinde veya ilgili kullanım koşulları çerçevesinde kullanılabilir olmasına dikkat edilir. TrGündem, hak sahipliğine ilişkin makul ve somut bir bildirim ulaşması hâlinde ilgili içeriği inceler. Hak sahipliği, kullanım izni veya hukuka uygunluk konusunda sorun bulunduğunun değerlendirilmesi durumunda ilgili içerik, koşullara göre düzeltilir, değiştirilir, kaynak ve izin bilgileri güncellenir veya yayından kaldırılır. Hak sahiplerinin, eserlerinin veya görsellerinin izinsiz kullanıldığını düşünmeleri hâlinde iletişim kanalları üzerinden başvuruda bulunmaları mümkündür. Bu tür başvuruların hızlı ve dikkatli şekilde değerlendirilmesi, gerekli görülen durumlarda ilgili içerik hakkında geçici önlem alınması ve başvuru sahibine geri dönüş yapılması hedeflenir.</p>
          <p className="font-bold text-foreground mt-4">6. Düzeltme, güncelleme ve içerik kaldırma politikası</p>
          <p>TrGündem, yayımlanan içeriklerde hata veya eksiklik bulunabileceğini kabul eder ve doğruluğu etkileyen hususların düzeltilmesine önem verir. Okuyucular, haberlerde yer alan maddi hataları, eksik bilgileri, yanlış tarihleri, hatalı isimleri, güncelliğini yitirmiş bilgileri veya hukuki haklarını ilgilendiren hususları bildirebilir. Başvurular değerlendirilirken: Bildirilen hususun haberin hangi bölümünü ilgilendirdiği incelenir. Mümkün olduğu ölçüde belge, kayıt, resmî açıklama veya diğer doğrulanabilir bilgiler dikkate alınır. Haklı bulunan maddi hatalar düzeltilir ve gerekli görüldüğünde haber güncellenir. Haber içeriğinin hukuka aykırı olduğu veya yayında kalmasının hak ihlaline yol açabileceği değerlendirildiğinde içerik kaldırılabilir ya da erişimi sınırlandırılabilir. Düzeltme veya güncelleme yapılması hâlinde, mümkün olduğu ölçüde okuyucunun değişikliği anlayabilmesi için güncelleme bilgisi belirtilir. İçeriğin kaldırılması, düzeltilmesi veya güncellenmesi talepleri somut olayın koşulları, hukuki yükümlülükler ve ilgili haklar çerçevesinde değerlendirilir. Kanunen yayımlanması gereken düzeltme ve cevap metinleri ile yetkili mercilerin kararları bakımından ilgili mevzuat hükümleri uygulanır.</p>
          <p className="font-bold text-foreground mt-4">7. Kişilik hakları ve özel hayatın korunması</p>
          <p>TrGündem, haber hazırlarken kişilerin şeref ve itibarına, özel hayatına, kişisel verilerine ve hukuken korunan diğer haklarına saygı gösterir. Kamu yararı bulunmayan özel hayat bilgilerinin yayımlanmamasına, kişisel verilerin gereksiz şekilde açıklanmamasına ve haberin konusu ile ilgisi bulunmayan kişilerin zarar görmemesine özen gösterilir. Çocukların, mağdurların, suçtan zarar görenlerin ve korunmaya ihtiyaç duyan kişilerin kimliklerinin açıklanmaması gereken durumlarda gerekli hassasiyet gösterilir. Suç isnatları, soruşturmalar ve yargı süreçleri haberleştirilirken kesinleşmiş karar bulunmadıkça kişilerin suçlu olduğu yönünde kesin ifadeler kullanılmaz.</p>
          <p className="font-bold text-foreground mt-4">8. Reklam, sponsorluk ve ticari içerikler</p>
          <p>TrGündem'in editoryal içerikleri ile reklam ve ticari tanıtım faaliyetleri birbirinden ayrıdır. Reklam, sponsorluk veya ücret karşılığı yayımlanan içeriklerin, yürürlükteki mevzuatın gerektirdiği ölçüde okuyucu tarafından anlaşılabilir şekilde belirtilmesi esastır. Ticari ilişkiler, haberlerin doğruluğunu, bağımsızlığını ve editoryal değerlendirmesini etkilememelidir. Herhangi bir kurum veya kuruluşla reklam ya da ticari ilişki bulunması, o kurumun TrGündem'in yayın politikasını belirlediği veya editoryal kararlar üzerinde yetkili olduğu anlamına gelmez.</p>
          <p className="font-bold text-foreground mt-4">9. Okuyucu yorumları ve kullanıcı katkıları</p>
          <p>Okuyucuların görüş ve değerlendirmelerini ifade edebilmeleri önemsenir. Bununla birlikte yorumlarda hakaret, tehdit, kişisel verilerin izinsiz paylaşılması, ayrımcılık, hukuka aykırı içerik veya üçüncü kişilerin haklarını ihlal edebilecek ifadeler bulunmaması gerekir. TrGündem, yürürlükteki mevzuat ve platform kuralları çerçevesinde hukuka aykırı olduğu değerlendirilen yorumları kaldırabilir, görünürlüğünü sınırlandırabilir veya ilgili kullanıcıların yorum yapmasını engelleyebilir. Kullanıcılar tarafından gönderilen yorumlar, aksi açıkça belirtilmedikçe TrGündem'in editoryal görüşü veya kurumsal açıklaması olarak değerlendirilmemelidir.</p>
          <p className="font-bold text-foreground mt-4">10. Bağımsız yayıncılık ve kurumsal bağlantılar</p>
          <p>TrGündem bağımsız bir dijital yayın platformudur. Herhangi bir haber ajansının, gazetenin, televizyon kanalının, siyasi partinin, kamu kurumunun veya başka bir medya kuruluşunun resmî internet sitesi olduğu iddiasında değildir. Başka kurum ve kuruluşların adlarına, logolarına veya içeriklerine haberlerde yer verilmesi, ilgili kurumla ortaklık, temsilcilik, sponsorluk veya resmî bağlantı bulunduğu anlamına gelmez. TrGündem'de yer verilen görüşler, açıklamalar ve değerlendirmeler, ilgili kaynaklarına atfedilir. Bu görüşlerin aktarılması, TrGündem'in söz konusu görüşleri benimsediği anlamına gelmez.</p>
          <p className="font-bold text-foreground mt-4">11. Başvuru, şikâyet ve iletişim</p>
          <p>Telif hakkı, görsel kullanımı, kaynak gösterimi, yanlış veya eksik bilgi, kişilik hakları, düzeltme, cevap ve içerik kaldırma talepleri için TrGündem'in Okuyucu Temsilcisine Ulaşınız Mesaj kanalı kullanılabilir.{' '}
            <button type="button" onClick={(e) => { e.stopPropagation(); onContactClick(); }} className="font-semibold text-news hover:underline cursor-pointer">Mesaj yollamak için tıklayınız.</button>
          </p>
          <p>Başvuruların sağlıklı değerlendirilebilmesi için başvuruda mümkün olduğu ölçüde şu bilgilere yer verilmesi rica olunur: İlgili haberin başlığı ve internet adresi (URL). Başvurunun konusu ve talep edilen işlem. İddia edilen hata, hak ihlali veya telif sorununun açıklaması. Varsa hak sahipliğini veya bildirilen hususu destekleyen belge, izin, bağlantı veya diğer bilgiler. Başvuru sahibine ulaşılabilecek iletişim bilgileri. Başvurular, ilgili içeriğin niteliğine ve hukuki gerekliliklere göre değerlendirilir. Gerekli görüldüğünde ek bilgi veya belge talep edilebilir. TrGündem, haklı ve doğrulanabilir başvurular doğrultusunda gerekli düzeltme, güncelleme, kaldırma veya diğer uygun işlemleri yapmayı amaçlar.</p>
          <p className="font-bold text-foreground mt-4">12. Yayın politikasının güncellenmesi</p>
          <p>TrGündem, yayın ilkelerini, teknolojik gelişmeler, yayın faaliyetlerinin kapsamı ve yürürlükteki mevzuattaki değişiklikler doğrultusunda güncelleyebilir. Yapılan değişiklikler bu sayfa üzerinden yayımlanır. Güncel metin, internet sitesinde yayımlandığı tarihten itibaren geçerli olur.</p>
          <p className="text-center text-foreground/80 font-medium mt-4">TrGündem'i takip eden tüm okuyucularımıza teşekkür ederiz.</p>
          <p className="text-center text-muted-foreground/60 text-xs mt-2">Bu açıklamayı kapatmak için buraya tıklayınız.</p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [readerFormOpen, setReaderFormOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    // Hydration-safe mount: SSR renders placeholders (--:--:-- and '— — — —'),
    // client renders real time after mount. Calling setState here is the
    // canonical pattern for time-dependent content.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const initialDate = new Date();
    setNow(initialDate);
    setSelectedDate(initialDate);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (d: Date) => {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
  };

  const formatTime = (d: Date) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Logo veya başlığa tıklanınca: eğer bir haber detayı açıksa kapat ve ana listeye dön.
  // NewsScreen URL'deki ?article= parametresini dinler (popstate), bu yüzden
  // parametreyi silip popstate tetiklemek yeterli.
  const handleHomeClick = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('article')) {
      // Zaten ana ekrandayız, sadece en üste kaydır
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    url.searchParams.delete('article');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const logoEl = (
    <button
      type="button"
      onClick={handleHomeClick}
      aria-label="Ana sayfaya dön"
      title="Ana sayfaya dön"
      className="flex h-14 w-44 flex-shrink-0 items-center justify-center overflow-hidden rounded-md shadow-md transition hover:shadow-lg hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-full w-full object-contain" />
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-red-800 bg-red-600 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between py-1">
            {/* Sol: Saat + Tarih */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button type="button" suppressHydrationWarning className="flex flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left transition hover:bg-white/10 cursor-pointer">
                  <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-white">
                    <Clock className="h-4 w-4 text-white/80" />
                    {mounted && now ? formatTime(now) : '--:--:--'}
                  </span>
                  <span className="text-[10px] text-white/70" suppressHydrationWarning>
                    {mounted && now ? formatDate(now) : '— — — —'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setCalendarOpen(false); }} className="rounded-lg border" />
              </PopoverContent>
            </Popover>

            {/* Orta: Logo + Başlık + Logo */}
            <div className="flex items-center gap-6">
              {logoEl}
              <button
                type="button"
                onClick={handleHomeClick}
                aria-label="Ana sayfaya dön"
                title="Ana sayfaya dön"
                className="flex flex-col leading-none gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                <span
                  className="font-bold tracking-tight uppercase text-white whitespace-nowrap"
                  style={{
                    fontSize: '24px',
                    lineHeight: '1.1',
                    animationName: 'pulseScale',
                    animationDuration: '7.2s',
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite',
                    display: 'inline-block',
                    transformOrigin: 'center',
                  }}
                >
                  TÜRKİYE'DE GÜNDEM
                </span>
                <span
                  className="font-bold tracking-[0.3em] uppercase text-center text-white"
                  style={{
                    fontSize: '13px',
                    lineHeight: '1.1',
                    animationName: 'pulseScale',
                    animationDuration: '7.2s',
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite',
                    animationDelay: '0.3s',
                    display: 'inline-block',
                    transformOrigin: 'center',
                  }}
                >
                  TRGUNDEM.NET
                </span>
              </button>
              {logoEl}
            </div>

            {/* Sağ: + + Tema */}
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => setAdminOpen(true)} aria-label="Abone Girişi" className="h-9 w-9 text-white hover:bg-white/10 hover:text-white">
                <span className="text-xl">+</span>
              </Button>
              <div className="text-white">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-16 z-30 bg-background">
        <InfoBands />
      </div>

      <main className="flex-1 bg-background">
        <NewsScreen />
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setReaderFormOpen(true)} className="gap-2 text-sm">
              <Mail className="h-4 w-4" />
              Okuyucu Temsilcisine Ulaşınız
            </Button>
          </div>
          <YayinIlkeleri onContactClick={() => setReaderFormOpen(true)} />
          <div className="mt-4 flex justify-center">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">TRGUNDEM.NET</span> — Bağımsız, özgün ve çok kaynaklı haber platformu
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
      `}</style>
    </div>
  );
}
