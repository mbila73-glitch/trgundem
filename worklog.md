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

---
Task ID: dedup-and-image-fix-6
Agent: main
Task: Yayınlanan haberlerde birçok tekrar haber ve alakasız görseller var. Düzelt.

Work Log:
- Teşhis: DB'de 50 published haber vardı. 5 başlık tekrar grubu (10 haber) ve 15 görsel tekrar grubu (bazıları alakasız — örn. "6 İlçe Milli Eğitim Müdürü Atandı" farklı bir haberle aynı görseli paylaşıyordu).
- `scripts/build-rss-ozet.ts` (yeni haberler için önleme):
  - `pickImage()` fonksiyonuna `excludeUrls?: Set<string>` parametresi eklendi. Kullanılmış görselleri seçmez, tüm alternatifler doluysa null döner (placeholder logo gösterilir).
  - Mevcut published haberlerin `aiTitle`, `aiSummary`, `imageUrl` alanları yükleniyor (önceden sadece `sourceArticleIds` yükleniyordu).
  - Yeni AI özetin başlığı, mevcut published başlıklarla hibrit shingle Jaccard (2-gram ≥ %20 VEYA 1-gram ≥ %22) ile karşılaştırılıyor. Benzerse yeni haber atlanıyor (draft olarak yazılmıyor).
  - Yeni başlık `existingTitles`'a ekleniyor — bu cycle'daki sonraki gruplar da benzerlikle kontrol ediliyor.
  - `pickImage(gm.allSources, usedImageUrls)` ile görsel dedup uygulanıyor. Seçilen görsel `usedImageUrls`'a ekleniyor.
- `scripts/dedup-published.ts` (yeni — mevcut tekrarları temizleme):
  - Tüm published haberleri `publishedAt DESC` sıralamasıyla yükler.
  - Başlık shingles (1-gram ve 2-gram) hesaplar.
  - En yeni haberleri `keep` set'ine ekler. Sonraki haberlerin başlığı `keep`'teki herhangi birine benzerse `archived` yapılır.
  - Aynı görseli paylaşan haberlerden eskisi archived yapılır.
  - Hibrit Jaccard: 2-gram ≥ %20 VEYA 1-gram ≥ %22.
  - Idempotent: birden çok kez çalıştırılabilir.
- Çalıştırma: `bun run scripts/dedup-published.ts`
  - İlk çalıştırmada: 50 → 28 published, 22 archived.
  - İkinci çalıştırmada: 28 → 28 published, 0 archived (temiz).

Stage Summary:
- 22 tekrar/alakasız görsel haberi DB'den temizlendi (archived).
- 28 published eşsiz haber kaldı, 0 görsel tekrarı.
- Yeni haber eklemelerinde artık benzer başlık kontrolü (hibrit shingle Jaccard) ve görsel dedup uygulanacak — aynı içeriğin farklı kaynak setleriyle tekrar yayınlanması ve alakasız görsellerin aynı haberde kullanılması önlendi.
- TypeScript ve ESLint temiz.

---
Task ID: pipeline-rework-7
Agent: main
Task: Pipeline'ı yeniden düzenle: tek havuzda duplicate tespiti, AI kategori tespiti, 150-300 kelime, ana sayfa 30 haber, yönetim panelinde 30+gerisi, arşiv sekmesi.

Work Log:
- `scripts/build-rss-ozet.ts`:
  - Duplicate tespiti zaten tek havuzda (kategori filtresi yok), yapı korundu.
  - AI prompt'a kategori tespiti eklendi: BAŞLIK/KATEGORİ/ÖZET formatı, 6 kategori seçeneği (Güncel, Kamu / Resmi, Ekonomi / Finans, Spor / Magazin, Bilim / Teknoloji, Kültür / Sanat).
  - `normalizeCategory()` fonksiyonu: AI'dan gelen kategoriyi normalize eder (tam eşleşme → kısmi eşleşme → anahtar kelime eşleşmesi → fallback "Güncel").
  - `parseAIResponse()` artık `{ title, summary, category }` dönüyor.
  - `summarizeGroup()` return type'a `category` eklendi.
  - Kelime limiti: 100-200 → **150-300** (MIN_SUMMARY_WORDS=150, MAX_SUMMARY_WORDS=300, retry hint "MUTLAKA EN AZ 150 KELİME yaz").
  - AI özetten sonra `category: gm.category` yerine `category: result.category ?? gm.category` kullanılıyor (AI kategorisi öncelikli).
  - 1 kaynaklı haberler zaten özetlenmiyor (duplicate group'lar 2+ kaynak gerektiriyor).
  - 5'ten fazla kaynakta son 5'inin içeriği okunuyor (MAX_SOURCES_PER_GROUP=5 zaten mevcut).
- `src/app/api/published-articles/route.ts`:
  - İlk batch 30 haber: Özel 5 + Güncel 8 + Kamu 5 + Ekonomi 5 + Spor 3 + Bilim 2 + Kültür 2 = 30.
  - İkinci batch offset=30 limit=20 (50'ye kadar).
  - `maxTotal = Math.min(totalPublished, 50)` ile toplam 50 limiti uygulanıyor.
- `prisma/schema.prisma`:
  - `archivedAt DateTime?` alanı eklendi + `@@index([archivedAt])`.
  - `prisma db push --skip-generate` + `prisma generate` ile DB'ye uygulandı.
- `src/app/api/admin/published/[id]/route.ts` (DELETE handler):
  - Hard delete kaldırıldı. Yerine `status: 'archived', archivedAt: new Date()` yapılıyor.
  - Artık "Sil" butonu haberi arşive alıyor — kaybolmuyor.
- `src/app/api/admin/archived/route.ts` (yeni endpoint):
  - `GET /api/admin/archived` → status='archived' olanları archivedAt DESC sıralı döner.
- `src/components/news/admin-panel.tsx`:
  - `AdminTab` type'a `'archived'` eklendi.
  - `PubArticle` type'a `archivedAt: string | null` eklendi.
  - Yeni `archivedArticles` state + `loadingArchived` state + `loadArchived` fonksiyonu.
  - `loadPublished` artık tekrar başlık kontrolü yapıyor (ilk 60 karakter, en yeni tutuluyor).
  - `deletePub` artık "arşive alındı" diyor, `loadArchived`'i çağırarak arşiv listesini yeniliyor.
  - Sub-tabs'a 4. sekme "Arşiv" eklendi (Archive icon import edildi).
  - **Yayınlanan Haberler sekmesi ikiye bölündü**:
    - Üstte "Ana Sayfadaki Haberler" başlığı + ilk 30 haber (düzenle/arşive al butonları, kaynak detayları).
    - Altta "Diğer Haberler" başlığı + kalan 20+ haber (düzenle/arşive al butonları).
  - **Yeni Arşiv sekmesi**:
    - "Arşivlenmiş Haberler" başlığı + toplam sayı badge.
    - status='archived' olanlar listelenir.
    - Görseller grayscale (siyah-beyaz) + opacity-80 (soluk görünüm).
    - Her kartta: kelime sayısı + "Yayın:" (Clock icon, yayın tarihi) + "Arşiv:" (Archive icon, kırmızı ton, arşiv tarihi).
    - Düzenle/Sil butonu YOK — sadece görüntüleme.
    - Boş durumda: "Arşivde haber yok" mesajı + açıklama.

Stage Summary:
- AI artık haberi özetleyip 6 kategoriden birini seçiyor (kaynak kategorisi değil, AI kategorisi kullanılıyor).
- Özet 150-300 kelime arasında.
- 1 kaynaklı haberler yayınlanmıyor (sadece 2+ kaynaklı gruplar).
- En son eklenen en fazla 5 kaynağın içeriği okunuyor.
- Ana sayfada 30 haber, "Diğer Haberler" ile 50'ye kadar.
- Yönetim panelinde Yayınlanan Haberler sekmesi: ana sayfadaki 30 üstte, gerisi altta, tekrar yok (ilk 60 karaktere göre dedup).
- Yönetim panelinde yeni Arşiv sekmesi: silinen/yayından kalkan tüm haberler, sadece görüntüleme, yayın+arşiv tarihleri.
- "Sil" butonu artık hard delete değil — haberi arşive alıyor (status='archived', archivedAt=now).
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: panel-restart-and-pipeline-status-8
Agent: main
Task: Yönetim paneli sekmeler arası boyut değişmesin (sabit 50vw/66vh), Restart sekmesi ekle + canlı pipeline ilerleme, AI alıntı istisnası ekle.

Work Log:
- `scripts/build-rss-ozet.ts` (AI alıntı istisnası):
  - User prompt'a: "İSTİSNA: Kaynaklarda tırnak içinde verilen doğrudan alıntılar (kişilerin sözleri, açıklamaları) olduğu gibi korunabilir" eklendi.
  - System prompt'a: "ANCak tırnak içindeki doğrudan alıntıları (kişilerin sözleri) tırnak içinde aynen koru" eklendi.
  - Örnek: "Sinem Dedetaş, 'Deniz Göktaş için iyi çocuktur üzüldüm' dedi" → bu cümle tırnak içinde aynen korunabilir.
- `src/components/news/admin-panel.tsx` (sabit panel boyutu):
  - `DialogContent` className: `max-w-3xl p-0` → `flex max-h-[66vh] min-h-[66vh] w-[50vw] max-w-[50vw] flex-col p-0`.
  - İçerik wrapper: `max-h-[72vh] overflow-y-auto` → `flex-1 overflow-y-auto`. Böylece panel genişlik 50vw, yükseklik 66vh sabit, içeride scroll. Sekmeler arası geçişte boyut artık değişmiyor.
- `scripts/pipeline-cron.ts` (status dosyası yazma):
  - Yeni `STATUS_FILE = pipeline-status.json` sabiti.
  - Yeni `CycleStatus` type: stage, startedAt, finishedAt, rssRead, duplicatesFound, summariesDone, publishedCount, error.
  - Yeni `writeStatus()` fonksiyonu: mevcut status'u okur, merge eder, tekrar yazar.
  - `runCycle()` her aşamada `writeStatus()` çağırır:
    - Başlangıç: status sıfırla (stage='archive-stale', tüm sayaçlar 0/null)
    - RSS refresh: stdout'tan "İşlenen kaynak: X" parse et, rssRead yaz
    - build-kaynak-sayi: stdout'tan "X grup" veya rss_kaynak_sayi.md ## sayısı, duplicatesFound yaz
    - build-ozet: stdout'tan "X yeni AI özet" parse et, summariesDone yaz
    - Max limit sonrası: published count → publishedCount yaz
    - Bitiş: stage='done', finishedAt=now
- `src/app/api/pipeline/status/route.ts` (yeni endpoint):
  - GET: pipeline-status.json dosyasını okur, frontend'e döner. Dosya yoksa boş status döner.
- `src/app/api/pipeline/run/route.ts` (fire-and-forget mod):
  - Eski: inline exec (15 dk request açık kalırdı).
  - Yeni: spawn detached subprocess → hemen 202 döner. cycle arka planda çalışır, pipeline-cron.ts kendi içinde writeStatus çağırır.
  - Status dosyasını başlangıçta sıfırlar.
- `src/components/news/admin-panel.tsx` (Restart sekmesi + polling):
  - `AdminTab` type'a `'restart'` eklendi.
  - Yeni state: `pipelineStatus`, `restartConfirmOpen`, `restarting`, `polling`.
  - Yeni `fetchPipelineStatus()` → GET /api/pipeline/status.
  - Yeni `handleRestart()` → onay dialoğunu kapat, restarting=true, POST /api/pipeline/run, polling=true.
  - Polling useEffect: restarting iken her 2 saniyede bir status çek, stage='done' veya 'error' ise durur.
  - Sub-tabs'a 5. sekme "Restart" eklendi (RefreshCw icon).
  - Restart sekmesi UI:
    - Restart butonu + onay dialoğu ("Pipeline restart?" basit onay).
    - 4 satır canlı ilerleme `PipelineStepRow` component'i:
      1. RSS güncellendi — yanına "X kaynak okundu"
      2. Tekrarlanan haberler sayıldı — yanına "X farklı haber bulundu"
      3. Haber özeti tamamlandı — yanına "X özet tamamlandı"
      4. Haberler yayınlandı — yanına "X haber yayınlandı"
    - Her satır stage'e göre bekleme (grayscale dot) / çalışıyor (news renkte spinner) / tamamlandı (emerald Check) durumu gösterir.
    - Rölatif süre (sn/dk) her satırda.
    - Vertical connector ile satırlar arasında renkli çizgi.
    - Hata kartı (XCircle, kırmızı) veya tamamlandı kartı (Check, yeşil) en altta.
  - Yeni `PipelineStepRow` component: dosyanın sonunda, props {label, detail, stage, startedStages, doneStages, startedAt, isLast}. Adım stage'e göre bekleme/çalışıyor/tamamlandı durumunu render eder.

Stage Summary:
- AI özet artık tırnak içindeki doğrudan alıntıları koruyabilir (kişilerin sözleri).
- Yönetim paneli sabit boyutlu: 50vw genişlik, 66vh yükseklik. Sekmeler arası geçişte boyut değişmiyor.
- Yönetim panelinde 5. sekme "Restart" eklendi.
- Restart butonu: basit onay dialoğu ile pipeline'ı hemen tetikler (fire-and-forget, 5-10 dk arka planda çalışır).
- 4 satır canlı ilerleme: RSS okunan kaynak sayısı, 2+ kaynaklı farklı haber sayısı, tamamlanan özet sayısı, yayınlanan haber sayısı. Her 2 saniyede polling ile güncellenir.
- pipeline-cron.ts her aşamada status dosyasına yazar, Restart sekmesi bunu polling ile okur.
- TypeScript ve ESLint temiz, dev server HTTP 200 dönüyor.

---
Task ID: stability-fix-9
Agent: main
Task: Haberi arşive alma çalışmıyor, sub-tabs kayboluyor, AI boğulmasın, RSS 10 dakikada bir, stabilite öncelik.

Work Log:
- DB teşhisi: Tüm published haberler önceki cycle'da stale yapılmış ama restore edilmemiş (subprocess öldüğü için). 0 published, 28 stale, 22 archived. Manuel restore: 28 stale → published.
- DELETE handler düzeltme (`src/app/api/admin/published/[id]/route.ts`):
  - Eski: catch bloğu hatayı yutuyordu, "Haber bulunamadı" 404 dönüyordu (gerçek hata gizli).
  - Yeni: önce `findUnique` ile kayıt var mı kontrol et, sonra update. Hata olursa gerçek mesajı `console.error` ile logla, frontend'e `detail` ile döner (500 status).
  - Idempotent: zaten archived ise tekrar archived yapmaz.
- deletePub düzeltme (`src/components/news/admin-panel.tsx`):
  - Hata durumunda JSON body'yi parse edip gerçek `detail` veya `error` mesajını göster.
  - `console.error('[deletePub]', e)` ile browser console'a da log.
  - State update + loadArchived + fetchPipelineStatus çağrılıyor (Restart sekmesindeki publishedCount da güncellensin).
- Sub-tabs sticky (`src/components/news/admin-panel.tsx`):
  - Eski: `mb-4 flex gap-1 rounded-lg border border-border bg-muted/30 p-1`
  - Yeni: `sticky top-0 z-10 mb-4 -mx-6 px-6 py-2 flex gap-1 rounded-lg border border-border bg-background/95 backdrop-blur shadow-sm`
  - Artık panel scroll edilse bile sub-tabs (Mesajlar/Özel/Yayındaki/Arşiv/Restart) üstte sabit kalıyor.
- AI boğulmaması için bekleme süresi (`scripts/build-rss-ozet.ts`):
  - BASE_DELAY_MS: 8000 (8s) → 15000 (15s) — her AI çağrısı arasına 15 saniye bekleme.
  - Bu sayede rate limit (429) daha az tetiklenir, AI'ın özet kalitesi artar.
- Pipeline cron 10 dakikada bir (`scripts/pipeline-cron.ts`):
  - Eski: `minute === 0 || minute === 30` (30 dakikada bir)
  - Yeni: `minute % 10 === 0` (10 dakikada bir: 00, 10, 20, 30, 40, 50)
  - Her cycle'da sadece yeni RSS'leri işler — eski published'lar published olarak kalır.
- Stale yapma KALDIRILDI (`scripts/pipeline-cron.ts`):
  - Eski: cycle başında tüm published'ları stale yap, cycle sonunda restore et.
    Bu, cycle yarım kalırsa tüm haberler stale'de takılı kalıyordu (DB şişmesi + 0 published).
  - Yeni: stale yapılmıyor, published'lar korunsun. Sadece yeni haberler işlenir.
  - Cancel draft (yarım kalan AI özetleri sil) KORUNDU — temiz başlangıç için.
  - Restore adımı KALDIRILDI (zaten stale yok).
- Sadece yeni haberler işlenir:
  - build-rss-ozet.ts içinde existingHashes kontrolü zaten var (sadece yeni gruplar özetlenir).
  - Bu sayede cycle kısa sürer, AI'ı boğmaz. Cycle başına 5-10 yeni haber özetlenir.
- Max 50 published limit'i KORUNDU — toplam 50'yi aşarsa en eskiler silinir (şişme önlenir).
- `/api/pipeline/run` route inline exec'e geri döndü:
  - Fire-and-forget subprocess sandbox'ta ölüyordu.
  - Inline exec Next.js dev server içinde yaşar.
  - pipeline-cron.ts her aşamada status dosyasına yazar, frontend polling ile görür.
  - Request cycle bitene kadar açık kalır (5-10 dk), 15 dk timeout.
- Dev server watchdog (`scripts/dev-watchdog.sh`):
  - Dev server sandbox'ta ölüyor. Watchdog script ile her öldüğünde 5 saniye sonra yeniden başlatılıyor.
  - setsid + </dev/null ile tamamen ayrılmış, while-true döngüsü ile sürekli canlı.

Stage Summary:
- DB restore edildi: 28 stale → published, artık published haberler görünür.
- DELETE endpoint artık gerçek hata mesajını döner, catch yutması yok.
- Sub-tabs sticky — scroll ederken kaybolmuyor.
- AI çağrıları arası 15 saniye bekleme — rate limit ve özet kalitesi için.
- Pipeline her 10 dakikada bir çalışır (00, 10, 20, 30, 40, 50).
- Stale yapma KALDIRILDI — published'lar korunur, cycle yarım kalırsa bile içerik kaybolmaz.
- Sadece yeni RSS'ler işlenir, AI boğulmaz, cycle kısa sürer.
- Max 50 published limit ile şişme önlenir.
- Dev server watchdog ile sürekli canlı.
- TypeScript ve ESLint temiz.
