# Yedek: haber_sade

**Tarih:** 29 Eyl 2026 09:36
**Boyut:** 30 MB
**Dosya sayısı:** 126

## Önceki yedeklerden (bos_sekmeler_rss_hazır, ai_ozet_pipeline_hazir) farkı

Bu yedek, kullanıcı ile birlikte geliştirilen haber sisteminin son halidir:
- Hibrit shingle+Jaccard algoritması (2-gram + 1-gram) ile 2+ farklı kaynaklı haber grupları tespiti
- AI paraphrase özet üretimi (en az 100 kelime, telif güvenli)
- Incremental + auto-publish (her 3 draft'ta bir, zaman bekleme yok)
- Cycle mantığı: 15 ve 45. dakikalarda tetiklenir
- Eski haberler "stale" yapılır, bu cycle'da gelirse restore, gelmezse sayfada kalır
- Yetişmeyen draft'lar yeni cycle başında silinir (iptal)

## Mevcut durum

### DB
- 47 published AI özet (UI'da görünür)
- 0 draft
- 0 stale
- 0 archived
- 3636 makale, 59 RSS kaynağı

### Pipeline
- pipeline-cron.ts: 15 ve 45'te cycle başlatır
  1. Stale: published → stale
  2. Cancel: draft'ları sil (önceki cycle'dan kalan)
  3. RSS refresh
  4. build rss_icerik.md
  5. find-duplicate-news (hibrit shingle+Jaccard)
  6. build-rss-ozet (AI özet + her 3 draft'ta auto-publish)
  7. Restore: stale → published (güncellenmeyen haberler sayfada kalsın)

### Kurallar
- Kategori limitleri: Güncel 10, Kamu/Resmi 7, Ekonomi/Finans 7, Spor/Magazin 5, Bilim/Teknoloji 3, Kültür/Sanat 3
- Tüm Haberler: 6+4+4+3+2+1 = 20 haber
- En yüksek kaynak sayısından başla özetlemeye (sourceCount DESC)
- 3'er 3'er publish (zaman bekleme yok)
- Yeni cycle gelene kadar yetişmeyen draft'lar iptal edilir
- Aynı haber güncellendiyse eskisini sil yenisini koy
- Güncellenmeyen haberler sayfada kalsın
- En az 100 kelime özet, telif güvenli (paraphrase)
- Türkçe imla kurallarına dikkat (kaza vs kazı, ekler, ki bağlacı)

### Çıktı dosyaları
- rss_icerik.md (2.3 MB) — tüm RSS makaleleri kategori bazında
- rss_kaynak_sayi.md (348 KB) — 216 tekrar grubu (farklı kaynaklar arası)
- rss_ozet.md (98 KB) — 34+ AI paraphrase özet (kategori bazında)

### Dosya yapısı
```
haber_sade/
├── prisma/schema.prisma          # Source + Article + PublishedArticle (isFeatured, stale status)
├── scripts/
│   ├── build-rss-icerik.ts       # rss_icerik.md üretir
│   ├── build-rss-ozet.ts         # AI paraphrase + auto-publish (her 3 draft'ta)
│   ├── find-duplicate-news.py    # hibrit shingle+Jaccard duplicate tespiti
│   ├── pipeline-cron.ts          # cycle scheduler (15/45'te tetikler)
│   ├── seed-sources.ts           # 59 default kaynağı sil+ekle
│   ├── sync-sources.ts           # DB ↔ DEFAULT_SOURCES senkronize
│   └── trigger-refresh.ts       # arka plan RSS yenileme
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── articles/        # GET (kategori/featured filtre) + PATCH [id]
│   │   │   ├── feeds/refresh/    # POST (child_process.spawn)
│   │   │   ├── icerik/           # GET (rss_icerik.md indir) + POST (rebuild)
│   │   │   ├── published-articles/ # GET (layout=all/kategori) + POST (publish-drafts/rebuild)
│   │   │   ├── sources/          # GET, POST (CRUD + seed + replace-defaults)
│   │   │   └── summarize/        # POST (z-ai-web-dev-sdk)
│   │   ├── globals.css           # warm editorial palette
│   │   ├── layout.tsx
│   │   └── page.tsx              # 3-sekmeli iskelet
│   ├── components/news/
│   │   ├── icerik-dosyasi.tsx    # rss_icerik.md önizleme
│   │   ├── news-screen.tsx      # 8 alt-sekme + PublishedArticle çek
│   │   ├── published-article-card.tsx
│   │   ├── published-article-dialog.tsx
│   │   ├── site-header.tsx       # 3 ana sekme
│   │   ├── sources-panel.tsx     # sadece liste
│   │   ├── theme-toggle.tsx
│   │   ├── article-card.tsx     # eski (yıldız butonu)
│   │   ├── article-detail-dialog.tsx # eski
│   │   ├── news-feed.tsx        # eski
│   │   └── add-source-dialog.tsx # eski
│   └── lib/
│       ├── ai.ts                # summarizeArticle / summarizePending
│       ├── db.ts
│       ├── format.ts            # Türkçe tarih, fmtDate, truncate
│       ├── rss.ts               # DEFAULT_SOURCES (59 URL, 6 kategori)
│       ├── types.ts             # + PublishedArticle tipi
│       └── utils.ts
├── db/custom.db                  # 3636 makale + 59 kaynak + 47 published
├── download/
│   ├── rss_icerik.md
│   ├── rss_icerik.txt
│   ├── rss_kaynak_sayi.md
│   ├── rss_kaynak_sayi.txt
│   ├── rss_ozet.md
│   ├── rss_ozet.txt
│   └── *.png (ekran görüntüleri)
├── package.json, bun.lock, tsconfig.json, next.config.ts
├── tailwind.config.ts, postcss.config.mjs, eslint.config.mjs
├── components.json, Caddyfile, .env
└── README.md (bu dosya)
```

## Geri yükleme

```bash
cp -r /home/z/my-project/backups/haber_sade/* /home/z/my-project/
cp /home/z/my-project/backups/haber_sade/.env /home/z/my-project/

# Dev server
cd /home/z/my-project && nohup bun run dev > dev.log 2>&1 & disown

# Cron (15 ve 45'te cycle)
cd /home/z/my-project && setsid bash -c 'exec bun run scripts/pipeline-cron.ts' > scripts/cron.log 2>&1 < /dev/null & disown

# Manuel cycle tetikleme (test için)
bun run scripts/trigger-refresh.ts
bun run scripts/build-rss-icerik.ts
python3 scripts/find-duplicate-news.py
bun run scripts/build-rss-ozet.ts
```

## Üretim notu

Bu yedek, kullanıcının şu talimatları doğrultusunda geliştirilmiştir:
1. "0 ve 30'da tüm RSS'leri çek, say, en yüksek kaynağa sahip haberlerden başla"
2. "Özeti hazır olan haberleri hazırlandıkça 3'er 3'er yayınla"
3. "3 dakika diye bir zaman belirtmedim" — zaman aralığı yok, 3'er adet
4. "Tüm özetler hazırsa sonraki bekleme hepsini ver"
5. "Yeni döngüye kadar özetlerin hepsi yetişmediyse kalanları iptal et"
6. "15 ve 45. dakikalarda cycle başlat"
7. "En az 100 kelime özet"
8. "Türkçe imla kurallarına dikkat (kaza vs kazı)"
9. "Aynı haber güncellendiyse eskisini sil, güncellenmeyen haber sayfada kalsın"
