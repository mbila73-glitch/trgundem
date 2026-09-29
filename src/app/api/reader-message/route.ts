import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/reader-message — submit a reader message (no auth)
// body: { name, email, subject, message }
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const { name, email, subject, message } = body as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
  };

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: 'Ad, e-posta ve mesaj zorunludur' },
      { status: 400 },
    );
  }

  try {
    const created = await db.readerMessage.create({
      data: {
        name: name.trim().slice(0, 120),
        email: email.trim().slice(0, 200),
        subject: (subject?.trim() ?? '(Konusuz)').slice(0, 200),
        message: message.trim().slice(0, 5000),
        status: 'new',
      },
    });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Kayıt hatası' },
      { status: 500 },
    );
  }
}
