import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

// 5 Gemini API key — .env'den oku
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

// POST /api/ai-reply
//   body: { message: '...', senderName?: '...', senderEmail?: '...' }
//   AI mesajı okur, profesyonel mantıklı tutarlı cevap taslağı üretir.
//   Admin panelde "Cevapla" butonuna basınca tetiklenir.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }
  const { message, senderName, senderEmail } = body as {
    message?: string;
    senderName?: string;
    senderEmail?: string;
  };

  if (!message?.trim()) {
    return NextResponse.json(
      { error: 'message alanı zorunludur' },
      { status: 400 },
    );
  }

  const keys = getGeminiKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'AI key yapılandırılmamış' },
      { status: 500 },
    );
  }

  // AI prompt — profesyonel, mantıklı, tutarlı cevap taslağı üret
  const senderGreeting = senderName?.trim() || 'Okurumuz';
  const prompt = [
    'Sen TrGündem (trgundem.net) okuyucu temsilcisisin. Aşağıdaki okuyucu mesajını oku ve mantıklı, tutarlı, profesyonel bir yanıt taslağı hazırla.',
    '',
    'KURALLAR:',
    '1. Türkçe yaz.',
    '2. Sayın ' + senderGreeting + ' ile başla, Saygılarımızla TrGündem Okuyucu Temsilciliği ile bitir.',
    '3. Mesajın içeriğine göre mantıklı bir cevap ver — jenerik metin yazma.',
    '4. Eğer mesaj bir şikayetse: gerekli inceleme yapılacağını, hassasiyetle ele alınacağını belirt.',
    '5. Eğer mesaj bir öneriyse: değerlendirildiğini ve ilgili ekibe iletildiğini belirt.',
    '6. Eğer mesaj bir soruysa: doğrudan cevap ver (soru netse) veya ilgili birim tarafından dönüş yapılacağını belirt (soru spesifik değilse).',
    '7. Eğer mesaj telif hakkı / kişilik hakkı ihlali içeriyorsa: ilgili içeriğin inceleneceğini, hak ihlali değerlendirilirse yayından kaldırılacağını belirt.',
    '8. Mesaja küfür/hakaret içeriyorsa (AI bunu yakaladıysa): yine nazik kal, mesajınız incelenmiştir gibi nötr bir cevap ver.',
    '9. Maksimum 200 kelime olsun — kısa ve öz.',
    '10. Sadece yanıt metnini yaz, başka hiçbir şey ekleme (başlık, etiket, markdown formatı yok).',
    '',
    'OKUYUCU MESAJI:',
    message,
    '',
    'YANIT TASLAĞI:',
  ].join('\n');

  // 5 key retry mantığı — 429/403'da sıradaki key'e geç
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const currentKey = keys[attempt % keys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${currentKey}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.6 },
        }),
      });
      const result = await resp.json();
      if (result.error) {
        // 403 (unregistered) veya 429 (kota) → sıradaki key'e geç
        if (result.error.code === 403 || result.error.code === 429) {
          continue;
        }
        // Diğer hatalar: son denemeyse hata dön
        if (attempt === keys.length - 1) {
          return NextResponse.json(
            { error: `AI hatası: ${result.error.message || 'bilinmeyen'}` },
            { status: 502 },
          );
        }
        continue;
      }
      if (
        result.candidates &&
        result.candidates[0] &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts[0]
      ) {
        const text = (result.candidates[0].content.parts[0].text as string).trim();
        return NextResponse.json({ ok: true, reply: text });
      }
      if (attempt === keys.length - 1) {
        return NextResponse.json(
          { error: 'AI yanıt üretmedi' },
          { status: 502 },
        );
      }
    } catch (e) {
      if (attempt === keys.length - 1) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'AI bağlantı hatası' },
          { status: 502 },
        );
      }
      // ağ hatası → sıradaki key
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Tüm AI key\'leri denendi, cevap alınamadı' },
    { status: 502 },
  );
}
