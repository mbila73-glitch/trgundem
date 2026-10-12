import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeArticle, sanitizeArticles } from '@/lib/format';

// GET /api/published-articles
//   ?category=Siyaset           -> filter by category
//   ?limit=30&offset=0           -> pagination
//   ?status=draft|published      -> default: published
//   ?layout=all                  -> ANA SAYFA 70 HABER (TEK BATCH)
//                                 Baş: Özel varsa ilk Özel, yoksa en yüksek sourceCount
//                                 Kategori kotaları (baş hariç):
//                                   Siyaset 20 + Ekonomi 15 + Kamu 12 + Kültür 8 + Spor 8 + Bilim 6 = 69
//                                 Baş ile birlikte = 70
//                                 Eksik varsa: round-robin ile 70'ye tamamla
//                                 hasMore: false ("Diğer Haberler" yok)
//   ?search=<text>               -> aiTitle contains (case-insensitive)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const layout = sp.get('layout');
  const status = sp.get('status') ?? 'published';
  const search = sp.get('search')?.trim();

  // Arama — Türkçe karakter normalize + büyük/küçük harf duyarsız
  // SQLite LIKE Türkçe karakterler için insensitive değil, bu yüzden JS tarafında filter yapıyoruz
  if (search && search.length > 0) {
    const normalizeTr = (s: string): string =>
      String(s || '')
        .toLowerCase()
        .replace(/İ/g, 'i').replace(/I/g, 'ı')
        .replace(/Ş/g, 's').replace(/Ç/g, 'c')
        .replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
        .replace(/Ö/g, 'o')
        .replace(/ı/g, 'i').replace(/ş/g, 's')
        .replace(/ç/g, 'c').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o')
        .trim();

    const normalizedSearch = normalizeTr(search);
    // Tüm published'ları çek (limit 300), JS tarafında normalize filter
    const all = await db.publishedArticle.findMany({
      where: { status },
      orderBy: { latestPublishedAt: 'desc' },
      take: 300,
    });
    const filtered = all
      .filter(a => normalizeTr(a.aiTitle).includes(normalizedSearch))
      .slice(0, 50);
    return NextResponse.json({ articles: sanitizeArticles(filtered), total: filtered.length, hasMore: false });
  }

  if (layout === 'all') {
    // ====== ANA SAYFA 50 HABER (TEK BATCH) ======
    // User: "baş haber kaynak sayısına göre en fazla olan haber olacak.
    //        baştan itibaren: Siyaset 5, Ekonomi 5, Dünya 2, Kamu 3, Kültür 2, Spor 2, Bilim 2
    //        = 22 (baş dahil). Sonra aynı sıra ile 50'ye tamamla."

    const excludeIds: string[] = [];

    // 1. Baş haber: en yüksek sourceCount'lu (kategori bağımsız)
    let basHaber: any = null;
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

    // 2. Kategori sıralaması ve her turda alınacak sayı
    const cats = ['Siyaset', 'Ekonomi / Finans', 'Dünya', 'Kamu / Resmi', 'Kültür / Sanat', 'Spor / Magazin', 'Bilim / Teknoloji'];
    const perRound = [5, 5, 2, 3, 2, 2, 2]; // her turda her kategoriden kaç tane
    const catArticles: Record<string, any[]> = {};

    // Her kategoriden makaleleri al (son bilgiler önce)
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      const items = await db.publishedArticle.findMany({
        where: { category: cat, status, id: { notIn: excludeIds } },
        orderBy: { latestPublishedAt: 'desc' },
        take: 50,
      });
      // "Konu ile ilgili son bilgiler" öncelikli
      const sonBilgiler = items.filter((a: any) => a.aiSummary?.includes('Konu ile ilgili son bilgiler şu şekildedir:'));
      const normal = items.filter((a: any) => !a.aiSummary?.includes('Konu ile ilgili son bilgiler şu şekildedir:'));
      catArticles[cat] = [...sonBilgiler, ...normal];
    }

    // 3. Round-robin: baş + kategori sırası ile 50'ye tamamla
    let all: any[] = basHaber ? [basHaber] : [];
    const catPointers: Record<string, number> = {};
    cats.forEach(cat => { catPointers[cat] = 0; });

    while (all.length < 50) {
      let addedThisRound = false;
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        const count = perRound[i];
        for (let j = 0; j < count; j++) {
          if (catPointers[cat] < catArticles[cat].length && all.length < 50) {
            all.push(catArticles[cat][catPointers[cat]]);
            catPointers[cat]++;
            addedThisRound = true;
          }
        }
        if (all.length >= 50) break;
      }
      if (!addedThisRound) break; // kategorilerde makale kalmadı
    }

    return NextResponse.json({
      articles: sanitizeArticles(all),
      total: all.length,
      hasMore: false,
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

  return NextResponse.json({ articles: sanitizeArticles(articles), total, limit, offset });
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
