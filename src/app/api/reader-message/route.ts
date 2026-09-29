import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Türkçe argo/küfür kelime listesi (normalize edilmiş halleriyle)
const PROFANITY_WORDS: string[] = [
  'amk', 'aq', 'amına', 'amina', 'amın', 'amin', 'yarrak', 'yarak', 'pic',
  'pıç', 'oc', 'oç', 'sik', 'siktir', 'göt', 'got', 'pezevenk', 'pezeveng',
  'oruspu', 'orospu', 'kahpe', 'pezevenk', 'ebenin', 'götünü', 'gotunu',
  'sikimi', 'sikimi', 'amını', 'amina', 'yarragi', 'yarragi', 'yarrak',
  'oç', 'oc', 'mal', 'salak', 'gerizekalı', 'gerizekali', 'aptal',
  'ibne', 'iban', 'top', 'puşt', 'pust', 'velet', 'piç', 'pic',
  'amq', 'amcık', 'amcik', 'yavsak', 'yavşak', 'şerefsiz', 'serefsiz',
  'götler', 'gotler', 'sokarim', 'sokarım', 'soktim', 'soktum',
  'amme', 'yarram', 'yarram', 'bok', 'boku', 'boktan', 'bk',
];

function containsProfanity(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ');
  for (const w of words) {
    if (PROFANITY_WORDS.includes(w)) return true;
  }
  // Also check substrings for compound words
  for (const pw of PROFANITY_WORDS) {
    if (normalized.includes(pw) && pw.length > 3) return true;
  }
  return false;
}

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

  // Only name and message are required; email is optional
  if (!name?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: 'Ad ve mesaj zorunludur' },
      { status: 400 },
    );
  }

  // Profanity check
  if (containsProfanity(message)) {
    return NextResponse.json(
      { ok: true, rejected: true, message: 'Mesajınız iade edilmiştir' },
      { status: 200 },
    );
  }

  try {
    const created = await db.readerMessage.create({
      data: {
        name: name.trim().slice(0, 120),
        email: (email?.trim() || '(belirtilmedi)').slice(0, 200),
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
