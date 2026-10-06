import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  try {
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

    // Güvenli dosya adı — orijinal adı sanitize et + timestamp ekle
    const ext = path.extname(file.name).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext) ? ext : '.jpg';
    const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;

    // uploads klasörü yoksa oluştur
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, fileName);
    const bytes = new Uint8Array(await file.arrayBuffer());
    fs.writeFileSync(filePath, bytes);

    const url = `/uploads/${fileName}`;
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Yükleme hatası' }, { status: 500 });
  }
}
