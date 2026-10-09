import { NextRequest, NextResponse } from 'next/server';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'gundem2026';
const COOKIE_NAME = 'trgundem_access';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const password = (body as { password?: string }).password?.trim();

  if (password === SITE_PASSWORD) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, SITE_PASSWORD, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 gün
      path: '/',
      sameSite: 'lax',
    });
    return res;
  }

  return NextResponse.json({ ok: false, error: 'Hatalı şifre' }, { status: 401 });
}
