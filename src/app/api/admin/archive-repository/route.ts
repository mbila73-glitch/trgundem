// Arşiv Deposu API
// GET /api/admin/archive-repository
//   (no params) — /var/www/archives/ klasöründeki tüm .json.gz dosyalarını listeler
//   ?file=FILENAME — belirli bir arşiv dosyasının içeriğini döner (decompress)
//   ?search=KEYWORD — tüm arşiv dosyalarında arama yapar (title, summary, category)
//
// Dosya formatı: archives-YYYY-MM-DD_HHMM-daysN.json.gz
//   - gzip ile sıkıştırılmış JSON
//   - { exportedAt, cutoff, thresholdDays, count, articles: [...] }

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ARCHIVES_DIR = '/var/www/archives';

// Admin auth
function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === (process.env.ADMIN_PASSWORD || 'Trgundem123');
  } catch { return false; }
}

// Dosya adından tarih çıkar: archives-2026-10-09_1200-days1.json.gz → 2026-10-09
function parseDateFromFilename(filename: string): { date: string; time: string; thresholdDays: number } | null {
  const m = filename.match(/archives-(\d{4}-\d{2}-\d{2})_(\d{4})-days(\d+)\.json\.gz$/);
  if (!m) return null;
  return { date: m[1], time: m[2], thresholdDays: parseInt(m[3], 10) };
}

// Arşiv dosyasını oku + decompress + JSON parse
async function readArchiveFile(filepath: string): Promise<any> {
  const buffer = await readFile(filepath);
  const decompressed = zlib.gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf8'));
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const url = new URL(req.url);
  const fileName = url.searchParams.get('file');
  const search = url.searchParams.get('search');

  // Arşiv klasörü yoksa
  if (!existsSync(ARCHIVES_DIR)) {
    return NextResponse.json({
      ok: true,
      files: [],
      message: 'Henüz arşiv deposu yok (klasör yok). İlk günlük sıkıştırma 00:00\'da yapılacak.',
    });
  }

  // 1. BELİRLİ BİR DOSYANIN İÇERİĞİNİ DÖNDÜR
  if (fileName) {
    const filepath = path.join(ARCHIVES_DIR, fileName);
    // Path traversal koruması — sadece dosya adı, path yok
    if (!fileName.endsWith('.json.gz') || fileName.includes('/') || fileName.includes('..')) {
      return NextResponse.json({ error: 'Geçersiz dosya adı' }, { status: 400 });
    }
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: 'Dosya bulunamadı: ' + fileName }, { status: 404 });
    }
    try {
      const data = await readArchiveFile(filepath);
      const stats = statSync(filepath);
      return NextResponse.json({
        ok: true,
        file: {
          filename: fileName,
          size: stats.size,
          sizeKB: Math.round(stats.size / 1024),
          ...parseDateFromFilename(fileName),
        },
        archive: data,
      });
    } catch (e) {
      return NextResponse.json({ error: 'Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
    }
  }

  // 2. ARAMA — tüm arşiv dosyalarında
  if (search) {
    const keyword = search.trim().toLowerCase();
    if (keyword.length < 3) {
      return NextResponse.json({ error: 'Arama için en az 3 karakter gerekli' }, { status: 400 });
    }
    const files = readdirSync(ARCHIVES_DIR).filter(f => f.endsWith('.json.gz'));
    const results: any[] = [];
    for (const f of files) {
      const filepath = path.join(ARCHIVES_DIR, f);
      try {
        const data = await readArchiveFile(filepath);
        const parsed = parseDateFromFilename(f);
        // Her makalede keyword ara — title, summary, category'de
        for (const article of data.articles || []) {
          const title = (article.aiTitle || '').toLowerCase();
          const summary = (article.aiSummary || '').toLowerCase();
          const category = (article.category || '').toLowerCase();
          if (title.includes(keyword) || summary.includes(keyword) || category.includes(keyword)) {
            results.push({
              ...article,
              archiveDate: parsed?.date,
              archiveFile: f,
            });
          }
        }
      } catch (e) {
        // Dosya bozuksa atla
        continue;
      }
    }
    return NextResponse.json({
      ok: true,
      search: keyword,
      results: results.slice(0, 200), // max 200 sonuç (UI limiti)
      totalCount: results.length,
      searchedFiles: files.length,
    });
  }

  // 3. DOSYA LİSTESİ
  const files = readdirSync(ARCHIVES_DIR).filter(f => f.endsWith('.json.gz'));
  const fileInfos = files.map(f => {
    const filepath = path.join(ARCHIVES_DIR, f);
    const stats = statSync(filepath);
    const parsed = parseDateFromFilename(f);
    return {
      filename: f,
      size: stats.size,
      sizeKB: Math.round(stats.size / 1024),
      createdAt: stats.mtime.toISOString(),
      ...parsed,
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')); // en yeni üstte

  // Özet istatistikler
  const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);
  return NextResponse.json({
    ok: true,
    files: fileInfos,
    summary: {
      totalFiles: fileInfos.length,
      totalSizeKB: Math.round(totalSize / 1024),
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      oldestDate: fileInfos.length > 0 ? fileInfos[fileInfos.length - 1].date : null,
      newestDate: fileInfos.length > 0 ? fileInfos[0].date : null,
    },
  });
}
