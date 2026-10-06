import { NextRequest, NextResponse } from 'next/server';

// GET /api/img?url=<görsel URL>
// Görseli proxy eder — orijinal URL gizlenir, trgundem.net üzerinden serve edilir
// Cache: 1 gün (browser + CDN)
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new NextResponse('URL gerekli', { status: 400 });
  }

  // Güvenlik: sadece http/https URL'lerine izin ver
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return new NextResponse('Geçersiz URL', { status: 400 });
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return new NextResponse('Görsel yüklenemedi', { status: 502 });
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    // Sadece görsel content-type'larına izin ver
    if (!contentType.startsWith('image/')) {
      return new NextResponse('Görsel değil', { status: 400 });
    }

    const buffer = await resp.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400', // 1 gün cache
        'X-Content-Type-Options': 'nosniff',
        // ImageEditor canvas.toBlob için — cross-origin görsel CORS'a ihtiyaç duyar
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new NextResponse('Proxy hatası', { status: 502 });
  }
}
