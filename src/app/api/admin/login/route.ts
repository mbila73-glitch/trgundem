import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = 'Trgundem123';

// POST /api/admin/login
// body: { password: string }
// returns: { ok: true, token: string } or { ok: false, error: string }
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 });
  }
  const { password } = body as { password?: string };

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: 'Şifre hatalı' }, { status: 401 });
  }

  // Simple token: base64(password:timestamp) — client stores in localStorage
  const token = Buffer.from(`${password}:${Date.now()}`).toString('base64');
  return NextResponse.json({ ok: true, token });
}
