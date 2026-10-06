import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

// POST /api/admin/upload — multipart/form-data, file alanı
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 400 });
    }

    // Dosya tipi kontrolü
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: 'Sadece görsel dosyaları (JPEG, PNG, WebP, GIF) yüklenebilir' },
        { status: 400 },
      );
    }

    // Boyut kontrolü — max 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: 'Dosya çok büyük (max 10MB)' },
        { status: 400 },
      );
    }

    // uploads klasörü yoksa oluştur
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Dosya adı — benzersiz
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `haber-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // Dosyayı yaz
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // URL döndür
    const url = `/uploads/${fileName}`;
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error('[admin/upload] hata:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Yükleme hatası' },
      { status: 500 },
    );
  }
}
