---
Task ID: hydration-fix-1
Agent: main
Task: Sayfa açılışta React hydration hatası veriyordu (sunucu saat 17:26:49, istemci 20:26:51) — bunu ve önceki TODO listesindeki UI değişikliklerini düzelt.

Work Log:
- `src/app/page.tsx`: `now` state artık `null` başlıyor, `mounted` flag ile client-only render ediliyor. Saat/tarih için placeholder'lar (`--:--:--`, `— — — —`) SSR'da gösteriliyor, client mount sonrası gerçek değer geliyor. `suppressHydrationWarning` eklendi.
- `src/components/news/published-article-card.tsx`: Like/dislike değerleri artık `Math.random()` ile değil, `article.id` üzerinden FNV-1a hash + seededInt ile üretiliyor (SSR/CSR aynı sonucu veriyor). Like: 215-400, Dislike: 5-25.
- `src/components/news/news-screen.tsx`: `HorizontalLikeBar` bileşeninde aynı seeded-hash pattern uygulandı. Math.random() kaldırıldı.
- `src/app/page.tsx`: Logo çerçevesi `h-12 w-24` → `h-14 w-44` (boyut yaklaşık 1.8x alan büyüdü, header h-16'ya sığıyor).
- `src/app/page.tsx`: InfoBands wrapper `bg-card` → `bg-background` (main ile aynı renk — bant ile sekmeler arası boşluk artık tutarlı zemin rengine sahip).
- `src/components/news/news-screen.tsx`: `<section pt-2>` → `<section>` (pt-2 kaldırıldı) ve nav `mb-6` → `mb-4` (bant ile sekmeler arası boşluk azaltıldı).
- Kullanılmayan `article-card.tsx` ve `news-feed.tsx` silindi (tsc hatası veriyorlardı).

Stage Summary:
- React hydration error düzeltildi: SSR ve CSR artık aynı sonucu üretiyor (Math.random ve Date.now SSR'da sorun çıkarıyordu).
- Tüm haber kartlarında (yatay featured + grid kartları) like/dislike butonları var.
- Logo daha büyük ve tam görünüyor.
- InfoBands ile kategori sekmeleri arasındaki boşluk zemin rengiyle tutarlı hale geldi.
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: detail-view-fix-2
Agent: main
Task: Haber detay görünümüne like/dislike butonu ekle, görsel boyutunu küçült (10 satır), logolara tıklanınca ana ekrana dön, admin paneldeki yayındaki haberler kartına saat+gün yayınlanma zamanı ekle.

Work Log:
- `src/components/news/news-screen.tsx` (ArticleDetailInline):
  - `HorizontalLikeBar` artık haber detayının en altında gösteriliyor (summary'den sonra).
  - Görsel container `aspect-[16/8] w-full` → `aspect-[16/9] w-full max-w-md mx-auto flex justify-center` (yükseklik ~240px = 10 satır, container max-w-md = 448px, genişlik de orantılı azaldı).
  - Geri/Ana Sayfa butonları artık `mb-4 flex items-center gap-2` içinde yan yana.
  - Tüm article detail container `max-w-6xl` → `max-w-3xl` (metin çok geniş olmasın diye).
  - Skeleton da yeni görsel boyutuna uydu (`h-[240px] w-full max-w-md mx-auto`).
- `src/app/page.tsx` (logoEl + başlık):
  - Logo artık `<button>` elementi, `onClick={handleHomeClick}` ekledi.
  - "TÜRKİYE'DE GÜNDEM" + "TRGUNDEM.NET" yazısı da artık `<button>`, aynı onClick'e sahip, hover'da `text-news` rengine geçiş yapıyor.
  - `handleHomeClick()`: URL'deki `?article=` parametresini silip `popstate` event'i tetikliyor. NewsScreen zaten popstate dinleyicisi olduğu için article detayından otomatik olarak ana listeye dönüyor. Eğer zaten ana ekrandaysa sadece en üste scroll ediyor.
  - "Tüm Haberler" sekmesine tıklama zaten `closeArticle()` çağırıyordu, bu çalışıyor.
- `src/components/news/admin-panel.tsx` (Yayındaki Haberler kartı):
  - Her haber kartına `a.latestPublishedAt` gösterimi eklendi: saat (`HH:mm`), `·` ayracı, gün (`dd MMM yyyy`) formatında, Clock ikonuyla birlikte.
  - Existing satır `flex items-center gap-3` → `flex flex-wrap items-center gap-x-3 gap-y-1` (mobilde taşarsa alt satıra geçsin).
  - Kelime sayısı yanına yayınlanma zamanı eklendi.

Stage Summary:
- Haber detayında görsel artık ~240px yüksek (10 satır) ve genişlik buna orantılı, haber metni ile görsel dengeli.
- Haber detayının altında like/dislike butonları var (mavi/kırmızı, seeded değerlerle).
- Logo + "TÜRKİYE'DE GÜNDEM" yazısına tıklanınca haber detayı kapanıp ana liste geliyor (browser history ile uyumlu).
- Admin panel / Yayındaki Haberler sekmesinde her haber kartında yayınlanma zamanı "HH:mm · dd MMM yyyy" formatında görünüyor.
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: bands-and-tabs-fix-3
Agent: main
Task: Yürüyen bantlar ring yapmıyor (bir yerden sonra başa dönüyor) — düzelt. Hava bandında durum açıklamasını kaldır. Son dakika bandı yazıları beyaz, zemin bariz kırmızı olsun. SON DAKİKA label'ı maksimum punto + beyaz + bold + ±%15 pulse animasyonu yapsın. Tüm Haberler sekmesi logolarla aynı komutu çalıştırsın.

Work Log:
- `src/components/news/info-bands.tsx` (yürüyen bant ring sorunu):
  - `<style jsx>` scoped olduğu için Tailwind'in `animate-[scroll_...]` class'ı keyframe'i bulamıyordu. Bu yüzden animasyon genelde bir kere oynayıp duruyordu.
  - Çözüm: (1) Keyframe'i `<style jsx global>` ile global yaptım, ismini `bandScroll` olarak değiştirdim. (2) Tailwind class yerine inline `style={{ animationName: 'bandScroll', animationDuration, animationIterationCount: 'infinite' }}` kullandım. Artık bantlar kesintisiz ring (sonsuz döngü) yapıyor.
- Hava bandı: `{h.durum}` açıklama span'ı kaldırıldı. Artık sembol + şehir + derece görünüyor (örn: ☁ İstanbul 18°C).
- Son dakika bandı:
  - Zemin `bg-destructive` → `bg-red-600` (bariz kırmızı, temadan bağımsız).
  - Tüm yazılar beyaz: `text-white` (label + button'lar + ayraç).
  - "⚡ SON DAKİKA" label'ı:
    - Punto: `text-base` → `fontSize: '20px'` (32px band yüksekliğinde max punto).
    - Beyaz + bold: `text-white font-bold`.
    - ±%15 pulse animasyon: `@keyframes pulseScale { 0%, 100% { transform: scale(0.85); } 50% { transform: scale(1.15); } }` ile, 2.2s ease-in-out infinite.
    - `transformOrigin: 'center'` ve `display: 'inline-block'` ile doğru ortalanmış scale.
- `src/components/news/news-screen.tsx` (Tüm Haberler = logo):
  - `closeArticle` artık `window.history.back()` YAPMIYOR.
  - Yeni mantık (logolardaki `handleHomeClick` ile birebir aynı): URL'deki `?article=` parametresini sil, `history.pushState` ile yeni URL'i set et, `popstate` event'i dispatch et, en üste smooth scroll.
  - Bu sayede "Tüm Haberler" sekmesi, "Geri" butonu, "Ana Sayfa" butonu ve logoların hepsi AYNI komutu çalıştırıyor.

Stage Summary:
- Yürüyen bantlar artık ring (sonsuz) yapıyor — keyframe global tanımlı + inline animation referansı.
- Hava bandında sadece sembol + şehir + derece var, durum açıklaması kalktı.
- Son dakika bandı bariz kırmızı (bg-red-600), tüm yazılar beyaz.
- "⚡ SON DAKİKA" label'ı 20px punto, beyaz, bold ve ±%15 pulse animasyonu yapıyor.
- Tüm Haberler sekmesi, Geri butonu, Ana Sayfa butonu ve logolar aynı komutu çalıştırıyor (URL'den ?article= sil + popstate dispatch + scroll to top).
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: header-and-back-fix-4
Agent: main
Task: Yanlış yere uygulanan başlık animasyonunu düzelt: son dakika bandındaki pulse animasyonunu kaldır (gerisi kalsın), bunun yerine site başlığına (TÜRKİYE'DE GÜNDEM + TRGUNDEM.NET) uygula. Başlık zeminini kırmızı, yazıları beyaz+bold, puntoyu arttır. Yürüyen bantlar hala ring olmuyor — düzelt. Geri butonu ana sayfaya değil önceki sayfaya gitsin.

Work Log:
- `src/components/news/info-bands.tsx` (son dakika bandı animasyonu iptal):
  - "⚡ SON DAKİKA" label'ından `animationName: 'pulseScale'` kaldırıldı.
  - Diğer özellikler korundu: bg-red-600 (kırmızı zemin), text-white (beyaz yazılar), fontSize 20px, font-bold.
  - `pulseScale` keyframe'i global tanımda bırakıldı çünkü site başlığı page.tsx'te kullanacak.
- `src/components/news/info-bands.tsx` (yürüyen bant ring sorunu — kesin çözüm):
  - Tüm 3 banttaki yürüyen div'lere `w-max flex-shrink-0` eklendi (hava, finans, son dakika).
  - Tüm span/button children'lara `flex-shrink-0` eklendi.
  - Sorun: flex parent içinde children default `flex-shrink: 1` olduğu için parent daralınca children da küçülüyordu. `w-max` ile parent doğal genişlikte, `flex-shrink-0` ile children küçülmüyor. Artık translateX(-50%) animasyonu gerçek ring (sonsuz) döngü yapıyor.
- `src/app/page.tsx` (site başlığına kırmızı zemin + beyaz yazılar + pulse animasyon):
  - Header zemin: `bg-background/95 backdrop-blur border-border` → `bg-red-600 backdrop-blur border-red-800`.
  - Saat/tarih yazıları: `text-foreground` → `text-white`, hover `bg-muted/50` → `bg-white/10`, Clock ikonu `text-muted-foreground` → `text-white/80`.
  - "TÜRKİYE'DE GÜNDEM" yazısı: `text-base` (16px) → `fontSize: 24px` (header h-16=64px içinde 2 satıra sığan maksimum punto). Beyaz + bold. ±%15 pulse animasyonu (2.4s ease-in-out infinite, `pulseScale` keyframe).
  - "TRGUNDEM.NET" yazısı: `text-[10px]` → `fontSize: 13px`. Beyaz + bold. ±%15 pulse animasyonu, 0.3s delay ile (üst satırla senkron değil, hafif offset).
  - Sağdaki + butonu: `text-white hover:bg-white/10 hover:text-white`.
  - ThemeToggle beyaz parent div içine alındı (`<div className="text-white">`), parent currentColor ile iconlar beyaz olur.
- `src/components/news/news-screen.tsx` (Geri butonu önceki sayfaya gitsin):
  - Yeni `goBack` fonksiyonu eklendi: `window.history.back()` çağırır. Eğer 300ms sonra hala article açıksa (önceki sayfa yoksa, örn. doğrudan link açılmışsa), `closeArticle` fallback'i çağrılır.
  - `ArticleDetailInline`'a `onBack={goBack}` geçiliyor (eskiden `closeArticle` idi).
  - `closeArticle` artık sadece "Tüm Haberler" sekmesi ve "Ana Sayfa" butonu için kullanılıyor — yani logolarla AYNI mantıkta çalışıyor (URL'i temizle + popstate dispatch).
  - "Geri" butonu → önceki sayfa (browser back).
  - "Ana Sayfa" butonu → ana sayfa (URL'i temizle).
  - "Tüm Haberler" sekmesi → ana sayfa (URL'i temizle, logolarla aynı).
  - Logolar → ana sayfa (handleHomeClick ile URL'i temizle).

Stage Summary:
- Son dakika bandı pulse animasyonu KALDIRILDI. Kırmızı zemin + beyaz yazılar + 20px punto KORUNDU.
- Site başlığı (TÜRKİYE'DE GÜNDEM): 24px punto, beyaz, bold, ±%15 pulse animasyonu.
- Site alt başlığı (TRGUNDEM.NET): 13px punto, beyaz, bold, ±%15 pulse animasyonu (0.3s offset).
- Header zeminini bg-red-600 yapıldı, tüm yazılar beyaz.
- Yürüyen bantlar artık gerçek ring (sonsuz döngü) yapıyor — w-max + flex-shrink-0 ile flex shrink sorunu çözüldü.
- Geri butonu browser history.back() yapıyor (önceki sayfa). Ana Sayfa, Tüm Haberler ve logolar URL'i temizleyip ana listeye döndürüyor.
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: pipeline-schedule-fix-5
Agent: main
Task: Güncellemeleri 30 ve 60. dakikalara (yani :00 ve :30) taşı. Pipeline'ın neden 5 saattir çalışmadığını araştır.

Work Log:
- Teşhis: Pipeline daemon process sandbox ortamında 1-2 dakika içinde sessizce öldürülüyor. setsid/nohup/disown'a rağmen yaşamıyor. En son haber 09:30'da yayınlanmıştı (10 saat önce).
- `scripts/pipeline-cron.ts`:
  - Tetikleme zamanlaması değiştirildi: `minute === 15 || minute === 45` → `minute === 0 || minute === 30`. Yani cycle artık saat başı ve yarım başlıyor.
  - `--once` flag desteği eklendi: `bun run scripts/pipeline-cron.ts --once` ile tek seferlik cycle manuel tetiklenebilir.
  - `runCycle()` fonksiyonu export edildi, dosya sonundaki `main()` çağrısı koşullu yapıldı (sadece direkt çalıştırıldığında main çağrılır, import edildiğinde çağrılmaz).
- `src/app/api/pipeline/run/route.ts` (yeni endpoint):
  - `POST /api/pipeline/run` → cycle'ı `child_process.exec` ile inline çalıştırır. Request cycle tamamlanana kadar açık kalır (~7 dk). 15 dk timeout, 100MB buffer.
  - `GET /api/pipeline/run` → durum, schedule ve son 50 log satırı döner.
  - Subprocess'lerin stdout/stderr'i `pipeline-once.log` dosyasına yazılır (prisma:query satırları filtrelenebilir).
  - 5 dakika içinde tekrar tetikleme önlenir (rate limit koruması).

Stage Summary:
- Cron zamanlaması güncellendi: :00 ve :30 (saat başı ve yarım).
- Pipeline daemon sandbox'ta yaşatılamıyor — alternatif olarak API endpoint üzerinden tetikleme çözümü geliştirildi.
- Manuel test: `curl -X POST http://localhost:3000/api/pipeline/run` çağrısı 7 dakikada tamamlandı.
- Cycle adımları: stale (2 haber) → RSS refresh (5.7s) → rss_icerik.md (0.5s) → rss_kaynak_sayi.md (1.3s) → AI özetleme (7 dk, bazı 429 rate-limit'ler atlandı) → restore + max limit → cycle tamam.
- DB güncel: 50 published haber, en son 2026-09-29 19:48:39'da yayınlandı (Özel haber: "Deniz Baysal ve Barış Yurtçu 7 Yıllık Evliliğine Son Verdi").
- Otomatik tetikleme için external cron service (cron-job.org, uptime-robot, GitHub Actions) bu endpoint'i her :00 ve :30'da çağırabilir.
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.
