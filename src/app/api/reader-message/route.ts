import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import { findProfanity } from '@/lib/profanity';

// SMTP yapılandırması — .env'den okur
function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// Okuyucunun IP adresini al — Nginx X-Forwarded-For/X-Real-IP/CF-Connecting-IP
function getClientIp(req: NextRequest): string {
  // Önce Cloudflare/CDN (en güvenilir) — gerçek client IP'si
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  // Nginx: X-Real-IP
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  // Nginx proxy chain: X-Forwarded-For — virgülle ayrılmış listedir,
  // ilk eleman en dıştaki (gerçek client) IP'dir
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return 'bilinmiyor';
}

// Okuyucu mesajını komple içeriğiyle (IP dahil) mail'a gönder
async function sendReaderEmailMessage(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ip: string;
}) {
  const transport = getSmtpTransport();
  if (!transport) return { sent: false, reason: 'no-smtp-config' };
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const to = process.env.SMTP_USER; // kendisine gönderir (temsilci@trgundem.net)
  const subject = `[TRGUNDEM] Yeni Okuyucu Mesajı — ${data.subject || '(Konusuz)'}`;
  const text = [
    `Yeni bir okuyucu mesajı alındı.`,
    ``,
    `Ad Soyad: ${data.name}`,
    `E-posta: ${data.email}`,
    `Konu: ${data.subject}`,
    `IP Adresi: ${data.ip}`,
    ``,
    `Mesaj:`,
    ``,
    data.message,
    ``,
    `---`,
    `Bu mesaj otomatik olarak trgundem.net okuyucu temsilci formundan gönderilmiştir.`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="background: #0ea5e9; color: white; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 18px;">Yeni Okuyucu Mesajı</h2>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; font-weight: bold; width: 100px; color: #374151;">Ad Soyad:</td><td style="padding: 8px;">${data.name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">E-posta:</td><td style="padding: 8px;">${data.email}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Konu:</td><td style="padding: 8px;">${data.subject}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">IP Adresi:</td><td style="padding: 8px; color: #dc2626; font-weight: bold;">${data.ip}</td></tr>
      </table>
      <div style="margin-top: 16px; padding: 16px; background: #f9fafb; border-radius: 6px; border-left: 4px solid #0ea5e9;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">MESAJ:</h3>
        <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${data.message}</p>
      </div>
      <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">Bu mesaj otomatik olarak trgundem.net okuyucu temsilci formundan gönderilmiştir.</p>
    </div>
  `;
  try {
    const info = await transport.sendMail({ from, to, subject, text, html });
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
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

  // IP al — hem DB'ye kaydet hem mail'e ekle
  const ip = getClientIp(req);

  // Profanity check — yakalanan kelimeyi döndür (mesaj silinmez, kullanıcı düzeltsin)
  const profanityWord = findProfanity(message);
  if (profanityWord) {
    return NextResponse.json(
      {
        ok: true,
        rejected: true,
        profanityWord,
        message: 'Mesajınız iade edilerek IP adresiniz kayıt altına alınmıştır, Lütfen ' + profanityWord + ' kelimesini düzeltiniz',
      },
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
        ip,
        status: 'new',
      },
    });

    // SMTP ile komple mesajı (IP dahil) mail'a gönder (DB kaydı sonrası, async — bekleme)
    // Hata olsa bile POST başarılı sayılır (mail gönderilemezse DB'de yine de kayıtlı)
    sendReaderEmailMessage({
      name: created.name,
      email: created.email,
      subject: created.subject,
      message: created.message,
      ip,
    }).catch((e) => {
      console.error('[reader-message] mail gönderme hatası:', e);
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Kayıt hatası' },
      { status: 500 },
    );
  }
}
