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
