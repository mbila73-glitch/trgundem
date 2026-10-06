import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { slugify } from '@/lib/format';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Production: /var/www/public/uploads/ (build'lerden etkilenmez)
// Dev: process.cwd()/public/uploads/
const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.NODE_ENV === 'production' ? '/var/www/public/uploads' : path.join(process.cwd(), 'public', 'uploads'));

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// Form data: file=... (multipart) — Bilgisayardan yükleme
// Query: ?title=Haber Başlığı — slug dosya adı için
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const title = sp.get('title') || '';

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Dosya çok büyük (maks 10MB)' }, { status: 413 });
    }

    // Sadece resim olabilir
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Sadece görsel yüklenebilir' }, { status: 400 });
    }

    // Dosya adı: slug-haber-basligi-{random6}.jpg
    // Slug boşsa (title verilmemişse) → img-{timestamp}-{random6}.jpg
    const ext = path.extname(file.name).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext) ? ext : '.jpg';
    const slug = slugify(title);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const fileName = slug
      ? `${slug}-${randomSuffix}${safeExt}`
      : `img-${Date.now()}-${randomSuffix}${safeExt}`;

    // uploads klasörü yoksa oluştur
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const filePath = path.join(UPLOADS_DIR, fileName);
    const bytes = new Uint8Array(await file.arrayBuffer());
    fs.writeFileSync(filePath, bytes);

    const url = `/uploads/${fileName}`;
    return NextResponse.json({ ok: true, url, fileName });
  } catch (e) {
    console.error('[upload] Hata:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Yükleme hatası' }, { status: 500 });
  }
}

// Dış URL'den görsel indir + /uploads/ altına kaydet (custom-article save action'ı için)
// Body: { url: string, title: string } — title slug için
// Returns: { ok: true, url: '/uploads/...'} — yerel URL
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  try {
    const data = (await req.json()) as { url?: string; title?: string };
    if (!data.url || !data.url.startsWith('http')) {
      return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 });
    }

    const resp = await fetch(data.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `Görsel indirilemedi: HTTP ${resp.status}` }, { status: 502 });
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL bir görsel değil' }, { status: 400 });
    }

    // Uzantıyı content-type'dan al
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
    };
    const ext = extMap[contentType] || '.jpg';

    const slug = slugify(data.title);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const fileName = slug
      ? `${slug}-${randomSuffix}${ext}`
      : `img-${Date.now()}-${randomSuffix}${ext}`;

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const filePath = path.join(UPLOADS_DIR, fileName);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    fs.writeFileSync(filePath, bytes);

    const url = `/uploads/${fileName}`;
    return NextResponse.json({ ok: true, url, fileName });
  } catch (e) {
    console.error('[upload PUT] Hata:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'İndirme hatası' }, { status: 500 });
  }
}
