import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';

const ADMIN_PASSWORD = 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

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

// Okuyucuya cevap maili gönder
async function sendReplyEmail(data: {
  toEmail: string;
  toName: string;
  originalSubject: string;
  originalMessage: string;
  reply: string;
}) {
  const transport = getSmtpTransport();
  if (!transport) return { sent: false, reason: 'no-smtp-config' };
  // E-posta "belirtilmedi" ise gönderme
  if (!data.toEmail || data.toEmail === '(belirtilmedi)' || !data.toEmail.includes('@')) {
    return { sent: false, reason: 'no-valid-email' };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `YANIT: ${data.originalSubject || 'Mesajınız}'}`;
  const text = [
    `Sayın ${data.toName},`,
    ``,
    `TrGündem okuyucu temsilciliğine göndermiş olduğunuz mesaja aşağıdaki yanıtı iletiyoruz:`,
    ``,
    `---`,
    data.reply,
    `---`,
    ``,
    `Orijinal mesajınız:`,
    data.originalMessage,
    ``,
    `Saygılarımızla,`,
    `TrGündem Okuyucu Temsilciliği`,
    `temsilci@trgundem.net`,
    `https://www.trgundem.net`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="background: #dc2626; color: white; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 18px;">TrGündem Okuyucu Temsilciliği — Yanıt</h2>
      </div>
      <p style="margin: 0 0 16px;">Sayın <strong>${data.toName}</strong>,</p>
      <p style="margin: 0 0 16px;">TrGündem okuyucu temsilciliğine göndermiş olduğunuz mesaja aşağıdaki yanıtı iletiyoruz:</p>
      <div style="margin: 16px 0; padding: 16px; background: #f9fafb; border-radius: 6px; border-left: 4px solid #dc2626;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">YANIT:</h3>
        <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${data.reply}</p>
      </div>
      <details style="margin-top: 16px;">
        <summary style="cursor: pointer; font-size: 12px; color: #9ca3af;">Orijinal mesajınızı görüntüle</summary>
        <div style="margin-top: 8px; padding: 12px; background: #f3f4f6; border-radius: 6px; font-size: 13px; color: #4b5563; white-space: pre-wrap;">${data.originalMessage}</div>
      </details>
      <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">Saygılarımızla,<br><strong>TrGündem Okuyucu Temsilciliği</strong><br>temsilci@trgundem.net<br>https://www.trgundem.net</p>
    </div>
  `;
  try {
    const info = await transport.sendMail({ from, to: data.toEmail, subject, text, html });
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

// PATCH /api/admin/messages/[id]
//   body { reply: '...' }   → okuyucuya SMTP ile cevap gönder + DB'ye reply+repliedAt kaydet + status='read'
//   body { status: 'archived' } → mesajı arşivle (status='archived')
//   body { status: 'read' }     → mesajı okundu işaretle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const data = body as { reply?: string; status?: string };

  // 1. CEVAP GÖNDER: { reply: '...' }
  if (typeof data.reply === 'string' && data.reply.trim()) {
    try {
      const msg = await db.readerMessage.findUnique({ where: { id } });
      if (!msg) {
        return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 });
      }
      // DB'ye cevabı + repliedAt + status='read' kaydet
      const updated = await db.readerMessage.update({
        where: { id },
        data: {
          reply: data.reply.trim().slice(0, 5000),
          repliedAt: new Date(),
          status: 'read',
        },
      });
      // SMTP ile okuyucuya cevap maili gönder (async — bekleme)
      const mailResult = await sendReplyEmail({
        toEmail: msg.email,
        toName: msg.name,
        originalSubject: msg.subject,
        originalMessage: msg.message,
        reply: data.reply.trim(),
      });
      return NextResponse.json({
        ok: true,
        id: updated.id,
        repliedAt: updated.repliedAt,
        reply: updated.reply,
        emailSent: mailResult.sent,
        emailReason: mailResult.sent ? undefined : mailResult.reason,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Cevap gönderme hatası' },
        { status: 500 },
      );
    }
  }

  // 2. ARŞİVLE / OKUNDU: { status: 'archived' | 'read' }
  if (typeof data.status === 'string') {
    const validStatus = ['new', 'read', 'archived', 'deleted'];
    if (!validStatus.includes(data.status)) {
      return NextResponse.json(
        { error: 'Geçersiz status. Geçerli değerler: ' + validStatus.join(', ') },
        { status: 400 },
      );
    }
    try {
      const updated = await db.readerMessage.update({
        where: { id },
        data: { status: data.status },
      });
      return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
    } catch {
      return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 });
    }
  }

  return NextResponse.json(
    { error: 'Geçersiz istek. body { reply } veya { status } gönderin' },
    { status: 400 },
  );
}

// DELETE /api/admin/messages/[id] — soft-delete (status → deleted)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await db.readerMessage.update({
      where: { id },
      data: { status: 'deleted' },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Mesaj bulunamadı' }, { status: 404 });
  }
}
