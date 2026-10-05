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

// 5 Gemini API key — .env'den oku (ai-reply ile aynı mantık)
function getGeminiKeys(): string[] {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ];
  const result: string[] = [];
  for (const c of candidates) {
    if (c && c.length > 0) result.push(c);
  }
  return result;
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';

// Okuyucunun IP adresini al — Nginx X-Forwarded-For/X-Real-IP/CF-Connecting-IP
function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
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
  const to = process.env.SMTP_USER;
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

// AI ile mesajı anlam bazlı kontrol et — küfür, hakaret, tehdit, spam yakala
// Yazım varyasyonlarını da yakalar (s1kt1r, f*ck, a.q, amk gibi)
type AiFilterResult =
  | { appropriate: true }
  | { appropriate: false; reason: string; word?: string }
  | { error: string }; // AI çalışamazsa

async function checkMessageWithAI(message: string): Promise<AiFilterResult> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    return { error: 'no-api-keys' };
  }

  const prompt = [
    'Sen bir mesaj moderatörüsün. Aşağıdaki okuyucu mesajını oku ve değerlendir.',
    '',
    'KURALLAR:',
    '1. Mesajda küfür, hakaret, argo, cinsel içerik, tehdit, ırkçı/cinsiyetçi/ableist söylem var mı?',
    '2. Spam, reklam, dolandırıcılık, kimlik avı girişimi var mı?',
    '3. Mesaj bir haber sitesinin okuyucu temsilcisine gönderilebilecek uygun bir mesaj mı?',
    '4. Yazım varyasyonlarını da yakala: s1kt1r, s!ktir, f*ck, a.q, amk, $1kt1r, p1ç, g0t gibi',
    '   karakter değişimi veya noktalama ile gizlenmiş küfürleri tespit et.',
    '5. Ancak LEGITIMATE haber açısından geçen kelimeleri yanlış yakalama:',
    '   "özel" kelimesi normal, "özel hayat" normal, "Bakan" normal, "Bakanlar Kurulu" normal.',
    '',
    'Cevap formatı (SADECE JSON, başka hiçbir şey yazma):',
    '{"appropriate": true|false, "reason": "kısa sebep", "word": "yakalanan kelime veya boş"}',
    '',
    'Örnekler:',
    '- Temiz mesaj → {"appropriate": true, "reason": "uygun", "word": ""}',
    '- Küfür → {"appropriate": false, "reason": "küfür", "word": "siktir"}',
    '- Hakaret → {"appropriate": false, "reason": "hakaret", "word": "salak herif"}',
    '- Spam reklam → {"appropriate": false, "reason": "spam", "word": "kazan kazan"}',
    '',
    'OKUYUCU MESAJI:',
    '"""',
    message,
    '"""',
  ].join('\n');

  // 5 key retry — 429/403'da sıradaki key'e geç
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const currentKey = keys[attempt % keys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${currentKey}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
        }),
      });
      const result = await resp.json();
      if (result.error) {
        // 403 (unregistered) veya 429 (kota) → sıradaki key'e geç
        if (result.error.code === 403 || result.error.code === 429) {
          continue;
        }
        // Diğer hatalar → sıradaki key'e geç ama logla
        console.error('[reader-message AI] error', result.error.code, result.error.message);
        continue;
      }
      if (
        result.candidates &&
        result.candidates[0] &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts[0]
      ) {
        const rawText = (result.candidates[0].content.parts[0].text as string).trim();
        // markdown ```json ... ``` temizle
        const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        // JSON parse — regex ile ilk {...} blokunu bul
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]) as {
              appropriate?: boolean;
              reason?: string;
              word?: string;
            };
            if (typeof parsed.appropriate === 'boolean') {
              if (parsed.appropriate) {
                return { appropriate: true };
              }
              return {
                appropriate: false,
                reason: typeof parsed.reason === 'string' ? parsed.reason : 'uygun değil',
                word: typeof parsed.word === 'string' && parsed.word.length > 0 ? parsed.word : undefined,
              };
            }
          } catch (e) {
            console.error('[reader-message AI] JSON parse hatası:', e instanceof Error ? e.message : 'unknown', 'text:', cleaned);
          }
        }
        // AI cevap verdi ama JSON parse edilemedi → son deneme değilse devam, son denemeyse fallback
        if (attempt === keys.length - 1) {
          return { error: 'ai-parse-failed' };
        }
        continue;
      }
    } catch (e) {
      console.error('[reader-message AI] ağ hatası (deneme ' + (attempt + 1) + '/' + keys.length + '):', e instanceof Error ? e.message : 'unknown');
      // ağ hatası → sıradaki key
      continue;
    }
  }
  // Tüm key'ler denendi, hiçbiri çalışmadı
  return { error: 'all-keys-failed' };
}

// POST /api/reader-message — submit a reader message (no auth)
// body: { name, email, subject, message }
// 1. IP al
// 2. IP limiti kontrol (günde max 10 mesaj)
// 3. Hızlı kelime kontrolü (PROFANITY_WORDS)
// 4. AI ile anlam bazlı kontrol (yazım varyasyonlarını yakala)
// 5. Hepsi geçerse DB'ye kaydet + SMTP mail gönder
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

  if (!name?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: 'Ad ve mesaj zorunludur' },
      { status: 400 },
    );
  }

  // IP al
  const ip = getClientIp(req);

  // ====== GÜNLÜK IP LİMİTİ KONTROLÜ — max 10 mesaj/gün ======
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await db.readerMessage.count({
      where: {
        ip,
        createdAt: { gte: oneDayAgo },
        // 'deleted' olmayanları say — silinenler limite sayılmasın
        status: { not: 'deleted' },
      },
    });
    if (recentCount >= 10) {
      return NextResponse.json(
        {
          ok: true,
          rateLimited: true,
          message: 'Günlük mesaj atma limitiniz dolmuştur. Lütfen yarın tekrar deneyiniz.',
        },
        { status: 200 },
      );
    }
  } catch (e) {
    // Limit kontrolü hata verirse devam et (fallback) — ama logla
    console.error('[reader-message] IP limit kontrol hatası:', e instanceof Error ? e.message : 'unknown');
  }

  // ====== ADIM 1: HIZLI KELİME KONTROLÜ (anlık) ======
  // Mevcut kelime listesi ile birebir kontrol
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

  // ====== ADIM 2: AI İLE ANLAM BAZLI KONTROL ======
  // Yazım varyasyonlarını yakalar (s1kt1r, f*ck, a.q, gizlenmiş tehdit vb.)
  // AI çalışmazsa fallback: kelime kontrolü yeterli sayılır, mesaj geçsin
  const aiResult = await checkMessageWithAI(message);
  if ('error' in aiResult) {
    // AI çalışamadı — mevcut kelime kontrolü temiz dedi, devam et
    console.warn('[reader-message] AI kontrol atlandı:', aiResult.error);
  } else if (!aiResult.appropriate) {
    // AI mesajı reddetti — iade et
    return NextResponse.json(
      {
        ok: true,
        rejected: true,
        profanityWord: aiResult.word || aiResult.reason,
        message: 'Mesajınız iade edilerek IP adresiniz kayıt altına alınmıştır, Lütfen ' + (aiResult.word || aiResult.reason) + ' ifadesini düzeltiniz',
      },
      { status: 200 },
    );
  }

  // ====== ADIM 3: DB'YE KAYDET + SMTP MAIL GÖNDER ======
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
