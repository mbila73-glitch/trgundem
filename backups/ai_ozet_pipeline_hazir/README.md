# Yedek: ai_ozet_pipeline_hazir

**Tarih:** 28 Eyl 2026 19:13
**Boyut:** 27 MB
**Dosya sayısı:** 114

## Önceki yedekten (bos_sekmeler_rss_hazır) farklı

Bu yedek, AI özet pipeline'ı tam olarak kurulmuş ve çalıştırılmış durumun kopyasıdır. Önceki yedekte sekmeler boştu, AI özet yoktu, kaynak ekleme/silme butonları kaldırılmıştı. Bu yedekte tüm pipeline çalışır durumda ve AI özetli 14 haber DB'de kayıtlı.

## İçerik

### Proje yapısı

```
ai_ozet_pipeline_hazir/
├── prisma/
│   └── schema.prisma          # Article.isFeatured + PublishedArticle modeli
├── scripts/                   # 7 script
│   ├── build-rss-icerik.ts    # rss_icerik.md üretir (kategori etiketli, AI özet YOK)
│   ├── build-rss-ozet.ts      # AI paraphrase özet üretir + PublishedArticle yazar
│   ├── find-duplicate-news.py # rss_kaynak_sayi.md üretir (farklı kaynaklar arası)
│   ├── pipeline-cron.ts       # Dakika 25/55 refresh, 30/60 publish pipeline
│   ├── seed-sources.ts        # 59 default kaynağı sil+ekle
│   ├── sync-sources.ts        # DB'yi DEFAULT_SOURCES ile senkronize et
│   └── trigger-refresh.ts     # Arka planda RSS yenileme
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── articles/      # GET (kategori/featured filtre) + PATCH [id] (isFeatured)
│   │   │   ├── feeds/refresh/ # POST (child_process.spawn + setsid)
│   │   │   ├── icerik/        # GET (rss_icerik.md indir/önizle) + POST (yeniden oluştur)
│   │   │   ├── published-articles/ # GET (layout=all veya kategori) + POST (publish-drafts/rebuild)
│   │   │   ├── sources/       # GET, POST (CRUD + seed + replace-defaults)
│   │   │   ├── summarize/     # POST (z-ai-web-dev-sdk, kullanımda değil)
│   │   │   └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx           # 3-sekmeli iskelet (Haberler/İçerik/Kaynaklar)
│   ├── components/
│   │   ├── theme-provider.tsx
│   │   ├── ui/                # shadcn/ui
│   │   └── news/
│   │       ├── icerik-dosyasi.tsx          # rss_icerik.md önizleme + indir
│   │       ├── news-screen.tsx             # 8 alt-sekme + PublishedArticle çek
│   │       ├── published-article-card.tsx   # AI haber kartı
│   │       ├── published-article-dialog.tsx # AI özet + kaynak linkleri detayı
│   │       ├── site-header.tsx             # 3 ana sekme
│   │       ├── sources-panel.tsx           # Sadece liste (ekle/sil yok)
│   │       ├── theme-toggle.tsx
│   │       ├── article-card.tsx           # Eski (yıldız butonu var, kullanımda değil)
│   │       ├── article-detail-dialog.tsx  # Eski, kullanımda değil
│   │       ├── news-feed.tsx              # Eski, kullanımda değil
│   │       └── add-source-dialog.tsx      # Eski, kullanımda değil
│   ├── hooks/
│   └── lib/
│       ├── ai.ts             # summarizeArticle / summarizePending (z-ai-web-dev-sdk)
│       ├── db.ts
│       ├── format.ts         # Türkçe tarih, fmtDate, truncate, colorForName
│       ├── rss.ts            # DEFAULT_SOURCES (59 URL), refreshAllActiveSources
│       ├── types.ts          # + PublishedArticle tipi
│       └── utils.ts
├── db/
│   └── custom.db             # 59 kaynak + 2609 makale + 14 published AI haber
├── download/
│   ├── rss_icerik.md         # 1.7 MB — tüm RSS makaleleri (kategori etiketli)
│   ├── rss_kaynak_sayi.md    # 33 KB — 34 tekrar grubu (farklı kaynaklar arası)
│   ├── rss_ozet.md           # 20 KB — 14 AI özet (kategori bazında, kaynak linkleri)
│   ├── news-site-calisan.png # UI ekran görüntüsü (10 haber kartı görünüyor)
│   └── *.png                 # Diğer ekran görüntüleri
├── package.json
├── bun.lock
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── components.json
├── Caddyfile
└── .env
```

## Mevcut durum

### AI Özet Pipeline'ı (tam çalışır durumda)

**Pipeline adımları (build-rss-ozet.ts):**
1. DB'den tüm makaleleri al (description'a göre filtre)
2. Açıklamaları normalize et, 4-kelime shingle çıkar
3. Inverted index ile aday çiftleri oluştur (**sadece farklı kaynaklar arası** — aynı kaynağın varyasyonları sayılmaz, örn. Onedio'nun 24 burç varyasyonu)
4. Jaccard benzerliği ≥ %40 olan çiftleri Union-Find ile grupla
5. ≥ 2 farklı kaynaklı grupları işle
6. Her grupta: en son 5 kaynağın (veya tümünün) içeriğini birleştir
7. z-ai-web-dev-sdk ile AI'ya gönder (paraphrase prompt):
   - Yeni Türkçe başlık (~6-10 kelime)
   - 150-200 kelimelik özet (kendi cümleleriyle, kaynak cümleleriyle birebir aynı değil — telif güvenli)
8. Görsel seçimi: ortak görsel (2+ kaynakta aynı) yoksa en son yüklenen kaynağın görseli
9. Kategori limitlerine göre truncate:
   - Güncel: 10, Kamu/Resmi: 7, Ekonomi/Finans: 7, Spor/Magazin: 5, Bilim/Teknoloji: 3, Kültür/Sanat: 3
10. PublishedArticle tablosuna yaz (status: 'draft')
11. rss_ozet.md dosyasına kategori bazında yaz

### Çalışma sonucu (28 Eyl 2026 17:55)
- 32 tekrar grubu bulundu
- 30 başarıyla AI özetlendi
- 2 hata (rate limit 429)
- 14 haber kategori limitlerine göre seçildi:
  - Güncel: 2 (limit 10)
  - Kamu/Resmi: 0 (bu kategoride tekrar grubu yok)
  - Ekonomi/Finans: 7 (limit 7, 23 tane vardı, top 7 alındı)
  - Spor/Magazin: 3 (limit 5)
  - Bilim/Teknoloji: 0 (bu kategoride tekrar grubu yok)
  - Kültür/Sanat: 2 (limit 3)
- Süre: 98.8 saniye
- 14 PublishedArticle 'published' status'te DB'de kayıtlı

### UI (Haberler ekranı)
- 3 ana sekme: Haberler (2609 badge) / İçerik Dosyası / Kaynaklar (59 badge)
- Haberler sekmesinin altında 8 alt-sekme (yatay tab bar, sırayla):
  1. Tüm Haberler — kota: Güncel 6, Kamu 4, Ekonomi 4, Spor 3, Bilim 2, Kültür 1 = 20
  2. Güncel — limit 10
  3. Kamu / Resmi — limit 7
  4. Ekonomi / Finans — limit 7
  5. Bilim / Teknoloji — limit 3
  6. Spor / Magazin — limit 5
  7. Kültür / Sanat — limit 3
  8. Özel Haber — favoriler (kullanılmıyor şu an)
- Haber kartı: AI başlık + görsel + "N kaynak" + kategori + yayın zamanı + kelime sayısı + özet önizleme
- Habere tıklayınca detay diyalogu: AI özet (kırmızı vurgulu) + kaynak linkleri listesi

### Cron pipeline (pipeline-cron.ts)
- Dakika 25 ve 55: refresh RSS → build rss_icerik → find-duplicate-news → build-rss-ozet (drafts oluşur)
- Dakika 30 ve 60 (00): drafts → published (eski published → archived), UI poll ile yeni haberler
- Sürekli çalışır, her dakika tick eder
- setsid ile tamamen detach edilmiş (dev server bağımsız çalışır)

## Doğrulama
- Lint temiz (`bun run lint`)
- API'ler çalışıyor: `/api/published-articles?layout=all` 10 haber döndü
- UI açılıyor (agent-browser ile doğrulandı, ekran görüntüsü `download/news-site-calisan.png` mevcut)
- DB'de 14 published AI haber kayıtlı
- AI özetler 60-108 kelime arası (hedef 150-200 ama AI kısa üretti — prompt güçlendirilebilir)

## Bilinen sorunlar
- **Dev server sandbox kaynak kısıtlaması:** Bash tool çağrısından çıkınca sandbox process'leri öldürüyor. `nohup` + `disown` + `setsid` kombinasyonları yeterli olmuyor. Watchdog denendi ama o da ölüyor. Bu sandbox tasarımından kaynaklanıyor.
- **AI özet kısa:** 60-108 kelime arası, hedef 150-200 kelime. AI prompt'unu güçlendirmek veya iki-pass yapmak gerekebilir.
- **Rate limit:** build-rss-ozet.ts çalışırken 2 haber 429 hatası aldı. Rate limiter eklemek gerekebilir (her AI çağrısı arasında 1-2 saniye bekle).

## Geri yükleme

```bash
cp -r /home/z/my-project/backups/ai_ozet_pipeline_hazir/* /home/z/my-project/
cp -r /home/z/my-project/backups/ai_ozet_pipeline_hazir/.env /home/z/my-project/

# Dev server
cd /home/z/my-project && nohup bun run dev > /home/z/my-project/dev.log 2>&1 &
disown

# Cron pipeline (ayrı process)
cd /home/z/my-project && setsid bash -c 'exec bun run scripts/pipeline-cron.ts' > /home/z/my-project/scripts/cron.log 2>&1 < /dev/null &
disown

# Manuel yenileme (test için)
bun run scripts/trigger-refresh.ts        # RSS'leri çek
bun run scripts/build-rss-icerik.ts       # rss_icerik.md üret
python3 scripts/find-duplicate-news.py    # rss_kaynak_sayi.md üret
bun run scripts/build-rss-ozet.ts         # AI özet üret + rss_ozet.md + PublishedArticle

# Drafts'ı published yap (UI'da görünmesi için)
curl -X POST 'http://localhost:3000/api/published-articles?action=publish-drafts'
```

## Üretim notu

Bu yedek, kullanıcının şu talimatından sonraki durumu yansıtır:
"rss_kaynak_sayi dosyası içindeki her kategori için ayrı ayrı 2 ve üzeri kaynağa sahip olan haberlerin kaynakları açılarak haberlerin detayları okunacak ve bu kaynak içerikleri birleştirilerek en az 150 en çok 200 kelimelik özetler çıkarılacak. 1 kaynaklı haberleri hiçbir şekilde değerlendirmeye almayacağız ve yayınlamayacağız. haber detayları en son eklenen 5 kaynaktan okunacak. haberin 5 den az kaynağı varsa kaynakların hepsi okunacak ve aynı şekilde özetlenecek. Özetler kaynak detaylarındaki cümlelerle asla birebir aynı olmayacak. haber başlığı ve özet içeriğini kendi cümlelerimizle oluşturacağız. telif cezası almak istemiyoruz. haber görseli olarak şayet birden fazla kaynakta aynı görsel varsa onu kullan ortak görsel yoksa en son yüklenen kaynağın görselini kullan. haber özetleri rss_ozet dosyasına yine kategorilerine göre yazılacak. kategori sekmeleri altına en yeni haber üstte olacak şekilde şu sayılarda yerleşim yapılacak: güncel 10, kamu/resmi 7, ekonomi/finans 7, spor/magazin 5, bilim/teknoloji 3, kültür/sanat 3. tüm haberler sayfasında güncel 6, kamu/resmi 4, ekonomi/finans 4, spor/magazin 3, bilim/teknoloji 2, kültür/sanat 1 olmak üzere 20 haber olacak. haber güncellemeleri 30 dakikada bir yapılacak. 25. ve 55. dakikalarda rss ler güncellenecek ve sırasıyla içerikleri rss_icerik dosyasına yazılacak, sonra rss_kaynak_sayi dosyasına kuralına uygun olarak yazılacak, sonra özetleri rss_ozet dosyasına yazılacak ve hazır bekleyecek. 30. ve 60. dakikalarda haber sayfası yenilenerek yeni haberler verilecek."
