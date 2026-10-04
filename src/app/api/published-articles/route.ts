import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/published-articles
//   ?category=Güncel           -> filter by category
//   ?limit=30&offset=0          -> pagination
//   ?status=draft|published     -> default: published
//   ?layout=all                 -> "Tüm Haberler" layout: Özel 1 + kategori kotaları
//                                 (Özel 1 + Güncel 8 + Kamu 5 + Ekonomi 5 + Spor 3 + Bilim 2 + Kültür 2) = 26 → 25'e ayarla
//   ?layout=all&offset=25&limit=25 -> "Diğer Haberler" (ikinci batch, kategorisiz, en yeni)
//                                    toplam max 50 haber
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const layout = sp.get('layout');
  const status = sp.get('status') ?? 'published';

  if (layout === 'all') {
    const offset = Number(sp.get('offset') ?? 0);

    if (offset === 0) {
      // ====== ANA SAYFA 25 HABER DÜZENİ ======
      // 1. BAŞ HABER: Özel kategoride varsa ilk Özel, yoksa en yüksek sourceCount (en çok tekrar eden)
      // 2. KATEGORI KOTALARI (baş hariç):
      //    Siyaset 7 + Ekonomi 5 + Kamu 4 + Kültür 3 + Spor 3 + Bilim 2 = 24
      //    Baş ile birlikte = 25
      // 3. Eksik kategori varsa: ROUND-ROBIN
      //    Her kategorinin "kota fazlası" 1'er 1'er sırayla eklenir
      //    Örn: 18 haber yerleşti, 19. = Siyaset 8., 20. = Ekonomi 6., 21. = Kamu 5., vs.

      const excludeIds: string[] = [];

      // 1. Baş haber seçimi
      let basHaber = null;
      const ozel = await db.publishedArticle.findMany({
        where: { category: 'Özel', status },
        orderBy: { latestPublishedAt: 'desc' },
        take: 1,
      });
      if (ozel.length > 0) {
        basHaber = ozel[0];
      } else {
        basHaber = await db.publishedArticle.findFirst({
          where: { status },
          orderBy: [{ sourceCount: 'desc' }, { latestPublishedAt: 'desc' }],
        });
      }
      if (basHaber) excludeIds.push(basHaber.id);

      // 2. Kategori kotaları — sırayla
      const quotas: Array<{ cat: string; limit: number }> = [
        { cat: 'Siyaset', limit: 7 },
        { cat: 'Ekonomi / Finans', limit: 5 },
        { cat: 'Kamu / Resmi', limit: 4 },
        { cat: 'Kültür / Sanat', limit: 3 },
        { cat: 'Spor / Magazin', limit: 3 },
        { cat: 'Bilim / Teknoloji', limit: 2 },
      ];

      let all = basHaber ? [basHaber] : [];
      // Her kategori için: kota kadarını all'a koy, kalanı extras'a (round-robin için)
      const extrasByCat: Record<string, any[]> = {};

      for (const { cat, limit } of quotas) {
        // Tüm kategori haberlerini al (kota + fazla)
        const items = await db.publishedArticle.findMany({
          where: { category: cat, status, id: { notIn: excludeIds } },
          orderBy: { latestPublishedAt: 'desc' },
          take: limit + 20, // kota + en az 20 fazla (round-robin için)
        });
        // İlk 'limit' kadarı kota
        const kota = items.slice(0, limit);
        kota.forEach(i => { all.push(i); excludeIds.push(i.id); });
        // Kalanlar extra (round-robin pool)
        extrasByCat[cat] = items.slice(limit);
      }

      // 3. Eksik kategori varsa: ROUND-ROBIN
      // Her kategorinin 1 fazlasını sırayla al, 25'e tamamla
      let roundIndex = 0;
      while (all.length < 25 && roundIndex < 50) {
        let added = false;
        for (const { cat } of quotas) {
          if (extrasByCat[cat] && extrasByCat[cat][roundIndex]) {
            all.push(extrasByCat[cat][roundIndex]);
            added = true;
          }
          if (all.length >= 25) break;
        }
        roundIndex++;
        if (!added) break; // hiç extra kalmadı
      }

      // Toplam 25 ile sınırla
      all = all.slice(0, 25);

      const totalPublished = await db.publishedArticle.count({ where: { status } });
      const maxTotal = Math.min(totalPublished, 50);
      return NextResponse.json({
        articles: all,
        total: all.length,
        totalPublished: maxTotal,
        hasMore: maxTotal > all.length,
      });
    }

    // İkinci batch ("Diğer Haberler"): kategorisiz, en yeni kalanlar (offset 25'den itibaren)
    const limit = Math.min(Number(sp.get('limit') ?? 25), 25);
    const articles = await db.publishedArticle.findMany({
      where: { status },
      orderBy: { latestPublishedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const totalPublished = await db.publishedArticle.count({ where: { status } });
    const maxTotal = Math.min(totalPublished, 50);
    return NextResponse.json({
      articles,
      total: articles.length,
      totalPublished: maxTotal,
      hasMore: offset + articles.length < maxTotal,
    });
  }

  const limit = Math.min(Number(sp.get('limit') ?? 30), 100);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);
  const category = sp.get('category');

  const where: { category?: string; status: string } = { status };
  if (category) where.category = category;

  const [articles, total] = await Promise.all([
    db.publishedArticle.findMany({
      where,
      orderBy: { latestPublishedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.publishedArticle.count({ where }),
  ]);

  return NextResponse.json({ articles, total, limit, offset });
}

// POST /api/published-articles
//   ?action=publish-drafts  -> promote all drafts to published
//   ?action=rebuild         -> trigger the build-rss-ozet.ts script in background
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');

  if (action === 'publish-drafts') {
    await db.publishedArticle.updateMany({
      where: { status: 'published' },
      data: { status: 'archived' },
    });
    const r = await db.publishedArticle.updateMany({
      where: { status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
    });
    return NextResponse.json({ promoted: r.count });
  }

  if (action === 'rebuild') {
    const { spawn } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const scriptPath = resolve(process.cwd(), 'scripts/build-rss-ozet.ts');
    const child = spawn(
      'setsid',
      ['bash', '-c', `exec bun run ${scriptPath}`],
      { detached: true, stdio: 'ignore', cwd: process.cwd() },
    );
    child.unref();
    return NextResponse.json(
      { ok: true, message: 'Arka planda rss_ozet rebuild başlatıldı', childPid: child.pid },
      { status: 202 },
    );
  }

  return NextResponse.json(
    { error: 'Geçersiz action. Kullanım: ?action=publish-drafts veya ?action=rebuild' },
    { status: 400 },
  );
}
