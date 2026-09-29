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
