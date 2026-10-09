// /api/admin/upload — kırpılan/düzenlenen görselleri /var/www/public/uploads/ altına kaydeder
// ImageEditor (crop) bu endpoint'i çağırır: POST /api/admin/upload?title=...
// Body: FormData { file: Blob }
// Response: { ok: true, url: '/uploads/...', filename: '...' } | { error: string }
//
// Dosya adı: title'dan slug üretilir (örn: "Bakan Açıklaması" → "bakan-aciklamasi-<hash>.jpg")
// Path traversal koruması: filename sadece [a-z0-9-] karakterleri içerir
//
// Üretim ortamı: /var/www/public/uploads/ (build'lerden etkilenmez)
// Dev: process.cwd()/public/uploads/

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';
const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.NODE_ENV === 'production' ? '/var/www/public/uploads' : path.join(process.cwd(), 'public', 'uploads'));
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — ImageEditor kırpma + görsel yükleme için yeterli

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch { return false; }
}

// Türkçe karakterleri Latin'e çevir + slug oluştur
function slugify(s: string): string {
  return (s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i').replace(/Ş/g, 's').replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Güvenli dosya adı — sadece [a-z0-9-] karakterleri, path traversal yok
function safeFilename(title: string | null): string {
  const slug = slugify(title || '');
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const base = slug || 'image';
  return `${base}-${timestamp}-${random}.jpg`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  try {
    // FormData al
    const formData = await req.formData();
    const file = formData.get('file');
    const title = formData.get('title') as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya yok (FormData "file" alanı boş)' }, { status: 400 });
    }

    // Boyut kontrolü
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `Dosya çok büyük: ${Math.round(file.size / 1024 / 1024 * 10) / 10} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      }, { status: 413 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Dosya boş (0 byte)' }, { status: 400 });
    }

    // Dosya adı üret
    const filename = safeFilename(title);
    const filepath = path.join(UPLOADS_DIR, filename);

    // Klasör yoksa oluştur
    if (!existsSync(UPLOADS_DIR)) {
      try { await mkdir(UPLOADS_DIR, { recursive: true }); }
      catch (e) {
        return NextResponse.json({ error: 'Uploads klasörü oluşturulamadı: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
      }
    }

    // Dosyayı yaz
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const url = `/uploads/${filename}`;
    return NextResponse.json({
      ok: true,
      url,
      filename,
      size: file.size,
      sizeKB: Math.round(file.size / 1024),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upload] Hata:', msg);
    return NextResponse.json({ error: 'Yükleme hatası: ' + msg }, { status: 500 });
  }
}
