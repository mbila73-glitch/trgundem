import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/published-articles
//   ?category=Siyaset           -> filter by category
//   ?limit=30&offset=0           -> pagination
//   ?status=draft|published      -> default: published
//   ?layout=all                  -> ANA SAYFA 50 HABER (TEK BATCH)
//                                 Baş: Özel varsa ilk Özel, yoksa en yüksek sourceCount
//                                 Kategori kotaları (baş hariç):
//                                   Siyaset 14 + Ekonomi 10 + Kamu 8 + Kültür 6 + Spor 6 + Bilim 4 = 48
//                                 Baş ile birlikte = 49-50
//                                 Eksik varsa: round-robin ile 50'ye tamamla
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
    return NextResponse.json({ articles: filtered, total: filtered.length, hasMore: false });
  }

  if (layout === 'all') {
    // ====== ANA SAYFA 50 HABER (TEK BATCH) ======
    const excludeIds: string[] = [];

    // 1. Baş haber seçimi
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

    // 2. Kategori kotaları — baş hariç 49 koltuk
    //    Siyaset 14 + Ekonomi 10 + Kamu 8 + Kültür 6 + Spor 6 + Bilim 4 = 48
    //    Eğer Özel baş varsa 48 + 1 = 49, 1 koltuk round-robin
    //    Eğer Özel baş yoksa 48 + 1 (Siyaset'in başı) = 49 → 1 koltuk round-robin
    const quotas: Array<{ cat: string; limit: number }> = [
      { cat: 'Siyaset', limit: 14 },
      { cat: 'Ekonomi / Finans', limit: 10 },
      { cat: 'Kamu / Resmi', limit: 8 },
      { cat: 'Kültür / Sanat', limit: 6 },
      { cat: 'Spor / Magazin', limit: 6 },
      { cat: 'Bilim / Teknoloji', limit: 4 },
    ];

    let all: any[] = basHaber ? [basHaber] : [];
    const extrasByCat: Record<string, any[]> = {};

    for (const { cat, limit } of quotas) {
      const items = await db.publishedArticle.findMany({
        where: { category: cat, status, id: { notIn: excludeIds } },
        orderBy: { latestPublishedAt: 'desc' },
        take: limit + 30,
      });
      const kota = items.slice(0, limit);
      kota.forEach(i => { all.push(i); excludeIds.push(i.id); });
      extrasByCat[cat] = items.slice(limit);
    }

    // 3. Round-robin: 50'ye tamamla
    let roundIndex = 0;
    while (all.length < 50 && roundIndex < 100) {
      let added = false;
      for (const { cat } of quotas) {
        if (extrasByCat[cat] && extrasByCat[cat][roundIndex]) {
          all.push(extrasByCat[cat][roundIndex]);
          excludeIds.push(extrasByCat[cat][roundIndex].id);
          added = true;
        }
        if (all.length >= 50) break;
      }
      roundIndex++;
      if (!added) break;
    }

    // 50 ile sınırla
    all = all.slice(0, 50);

    return NextResponse.json({
      articles: all,
      total: all.length,
      hasMore: false, // Tek batch — "Diğer Haberler" YOK
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
