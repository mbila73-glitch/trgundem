import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// POST /api/admin/upload
// Görsel yükleme — /var/www/public/uploads/ klasörüne kaydet
// image-editor.tsx kırpma işlemi sonrası bu endpoint'i çağırır
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 400 });
    }

    // Dosya adı — title parametresi varsa kullan, yoksa timestamp
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || '';
    const ext = file.name.split('.').pop() || 'jpg';
    const safeName = title
      ? title.toLowerCase().replace(/[^a-z0-9çğıüşö]/gi, '').slice(0, 30)
      : 'crop';
    const fileName = `${safeName}_${Date.now()}.${ext}`;
    const uploadDir = '/var/www/public/uploads';
    const filePath = path.join(uploadDir, fileName);

    // Klasör yoksa oluştur
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}

    // Dosyayı kaydet
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Public URL döndür
    const publicUrl = `/uploads/${fileName}`;
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
