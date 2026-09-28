# Yedek: bos_sekmeler_rss_hazır

**Tarih:** 28 Eyl 2026 17:19
**Boyut:** 26 MB
**Dosya sayısı:** 105

## İçerik

Bu yedek, "boş sekmeler + RSS katalog hazır" durumunun tam bir kopyasıdır.

### Proje yapısı

```
bos_sekmeler_rss_hazır/
├── prisma/                    # Prisma şema (Article.isFeatured dahil)
│   └── schema.prisma
├── scripts/                   # Tüm çalıştırılabilir scriptler
│   ├── build-rss-icerik.ts    # rss_icerik.md dosyasını üretir (AI özet yok, kategori etiketli)
│   ├── find-duplicate-news.py # rss_kaynak_sayi.md üretir (aynı kaynağı tek sayar)
│   ├── seed-sources.ts        # Tüm kaynakları silip 59 default kaynağı ekler
│   ├── sync-sources.ts        # DB'yi DEFAULT_SOURCES ile senkronize eder
│   └── trigger-refresh.ts     # Arka planda RSS yenileme
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── articles/      # GET (list+filter) + PATCH [id] (isFeatured toggle)
│   │   │   ├── feeds/refresh/ # POST (child_process.spawn + setsid)
│   │   │   ├── icerik/        # GET (dosya indir/önizle) + POST (yeniden oluştur)
│   │   │   ├── sources/       # GET, POST (CRUD + seed + replace-defaults)
│   │   │   ├── summarize/     # POST (z-ai-web-dev-sdk ile AI özet — kullanımda değil)
│   │   │   └── route.ts
│   │   ├── globals.css        # Warm editorial palette (--news accent)
│   │   ├── layout.tsx
│   │   └── page.tsx           # 3-sekmeli minimal iskelet (Haberler/İçerik/Kaynaklar)
│   ├── components/
│   │   ├── theme-provider.tsx
│   │   ├── ui/                # shadcn/ui bileşenleri
│   │   └── news/
│   │       ├── icerik-dosyasi.tsx     # rss_icerik.md önizleme + indir
│   │       ├── news-screen.tsx        # 8 alt-sekme (Tümü + 6 kategori + Özel), içerik BOŞ
│   │       ├── site-header.tsx         # 3 ana sekme + tema toggle
│   │       ├── sources-panel.tsx       # Sadece listele (ekle/sil/yenile YOK)
│   │       ├── theme-toggle.tsx
│   │       ├── article-card.tsx       # Yıldız butonu (Özel işaretleme)
│   │       ├── article-detail-dialog.tsx # Eski, kullanımda değil
│   │       ├── news-feed.tsx          # Eski, kullanımda değil
│   │       └── add-source-dialog.tsx  # Eski, kullanımda değil
│   ├── hooks/
│   └── lib/
│       ├── ai.ts             # summarizeArticle / summarizePending (z-ai-web-dev-sdk)
│       ├── db.ts             # Prisma client singleton
│       ├── format.ts         # Türkçe tarih, truncate, colorForName, vb.
│       ├── rss.ts            # DEFAULT_SOURCES (59 URL, 6 kategori), refreshAllActiveSources
│       ├── types.ts          # ArticleListItem, Source, RefreshResult, vb.
│       └── utils.ts
├── db/
│   └── custom.db             # 59 kaynak + 2609 makale (isFeatured=false)
├── download/
│   ├── rss_icerik.md         # 1.7 MB, 27313 satır — her makale: başlık/yayın/kategori/link/açıklama
│   ├── rss_kaynak_sayi.md    # 31 KB, 845 satır — 34 tekrar grubu (farklı kaynaklar arası)
│   └── *.png                 # Ekran görüntüleri
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

### Sekmeler (BOŞ içerik)
- **Haberler** sekmesinin altında 8 alt-sekme var, hepsi BOŞ:
  1. Tüm Haberler
  2. Güncel
  3. Kamu / Resmi
  4. Ekonomi / Finans
  5. Bilim / Teknoloji
  6. Spor / Magazin
  7. Kültür / Sanat
  8. Özel Haber (en sağda, favoriler için)
- **İçerik Dosyası** sekmesi: rss_icerik.md önizleme + indir + yeniden oluştur
- **Kaynaklar** sekmesi: 59 RSS kaynağını listeler (ekle/sil/yenile YOK)

### Veritabanı
- 59 RSS kaynağı (6 kategori)
- 2609 makale
- isFeatured alanı ekli (hepsi false)
- AI özet alanları var (summary, summarizedAt, summaryError) ama **bu aşamada AI özet kullanılmıyor**

### Çıktı dosyaları
- `download/rss_icerik.md`: Her makale için başlık + yayın + kategori + kaynak linki + RSS açıklaması (AI özet YOK)
- `download/rss_kaynak_sayi.md`: 34 tekrar grubu, sadece farklı kaynaklar arası (Onedio'nun kendi içindeki 24 burç varyasyonu gibi aynı-kaynak tekrarları sayılmaz)

## Geri yükleme

```bash
# Tüm dosyaları orijinal konumlara geri kopyala
cp -r /home/z/my-project/backups/bos_sekmeler_rss_hazır/* /home/z/my-project/
cp -r /home/z/my-project/backups/bos_sekmeler_rss_hazır/.env /home/z/my-project/
# Dev server'ı başlat
cd /home/z/my-project && bun run dev
```

## Üretim notu

Bu yedek, kullanıcının "özet hazırlama, sekmelerin altı boş dursun, haber ekleme, rss ekleme, boş kalsın. sadece sekmeleri hazırla." talimatından sonraki durumu yansıtır.

- AI özet çıkarma özelliği dosyalarda mevcut ama UI'da tetiklenmiyor
- Kaynak ekleme/silme UI butonları kaldırıldı (API endpoint'leri hala mevcut)
- Haber ekleme özelliği yok
- Sekmelerin içi tamamen boş placeholder
