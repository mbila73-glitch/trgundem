import { NextRequest, NextResponse } from 'next/server';

// Node.js runtime — edge runtime'da process.env okunamıyor, nodejs zorunlu
export const runtime = 'nodejs';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'gundem2026';
const COOKIE_NAME = 'trgundem_access';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cookie kontrol
  const access = req.cookies.get(COOKIE_NAME);
  if (access === SITE_PASSWORD) {
    return NextResponse.next();
  }

  // Şifre yoksa giriş sayfasına yönlendir
  const loginUrl = new URL('/giris', req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // API'leri, _next statik dosyaları, giriş sayfasını ve favicon'ı hariç tut
  matcher: ['/((?!api|_next|giris|favicon).*)'],
};
