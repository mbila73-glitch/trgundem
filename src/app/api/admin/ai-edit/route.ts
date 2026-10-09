// AI Düzenle — mevcut haber metnini AI ile yeniden yaz
// AI özet pipeline'ından FARKLI:
//   - AI özet: kaynak metinden YENİ özet üretir (plagiarizm kontrolü, kelime sınırı, reklam filtresi var)
//   - AI Düzenle: MEVCUT metni akıcı hale getirir (HİÇBİR kısıtlama yok — plagiarizm/wordcount/ad filter YOK)
//   - Amaç: zorlama ifadeleri yaygın popüler ifadelerle değiştir, akıcı haber metni yap
//
// Öncelik: EVREN (auto) → Gemini fallback
// Kullanım: POST /api/admin/ai-edit { title, summary }
// Response: { ok: true, editedTitle, editedSummary }

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// EVREN API key
function getEvrenKey(): string | null {
  try {
    const k = fs.readFileSync('/var/www/.evren-key', 'utf8').trim();
    return k || null;
  } catch { return null; }
}

// Gemini keys
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const keyFiles = ['/var/www/.gemini-key', '/var/www/.gemini-key3', '/var/www/.gemini-key4', '/var/www/.gemini-key5', '/var/www/.gemini-key6'];
  for (const file of keyFiles) {
    try {
      const k = fs.readFileSync(file, 'utf8').trim();
      if (k) keys.push(k);
    } catch {}
  }
  if (keys.length === 0) {
    for (const env of ['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6']) {
      const k = process.env[env];
      if (k && k.length > 0) keys.push(k);
    }
  }
  return keys;
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const { title, summary } = body as { title?: string; summary?: string };

  if (!title && !summary) {
    return NextResponse.json({ error: 'Başlık veya özet gerekli' }, { status: 400 });
  }

  // AI Düzenle prompt — kısıtlama: min 150 max 300 KELIME
  // Amaç: zorlama ifadeleri doğal/popüler ifadelerle değiştir, akıcı yap
  const prompt = `Aşağıdaki haber metnini Türkçe olarak yeniden yaz. Kurallar:
- Zorlama, yapay veya resmi ifadeleri doğal, günlük ve yaygın popüler ifadelerle değiştir
- Metni akıcı ve okunabilir bir haber diline çevir
- Anlamı koru, yeni bilgi ekleme
- Başlığı kısa ve etkileyici yap
- ÖZET MİNIMUM 150, MAKSİMUM 300 KELİME OLMALI — bu sınırlara mutlaka uy
- Özeti 2-3 paragraf halinde akıcı yaz
- Kopyalama kontrolü, reklam filtresi YOK — sadece metni düzelt
- Sadece metni düzelt, haber içeriğini değiştirme

BAŞLIK: ${title || '(boş)'}

ÖZET: ${summary || '(boş)'}

ÇIKTI FORMATI (kesinlikle bu formatta):
BAŞLIK: [yeniden yazılmış başlık]
---
ÖZET: [yeniden yazılmış özet — 150-300 kelime]`;

  // 1. EVREN (öncelik)
  const evrenKey = getEvrenKey();
  const evrenApiBase = process.env.EVREN_API_BASE || 'https://evren-llmapi.ssyz.org.tr/v1';
  const evrenModel = process.env.EVREN_MODEL || 'auto';
  if (evrenKey) {
    try {
      const resp = await fetch(evrenApiBase.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${evrenKey}` },
        body: JSON.stringify({
          model: evrenModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const result = await resp.json();
        const content = result.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          const parsed = parseAIEditResponse(content);
          if (parsed.title || parsed.summary) {
            return NextResponse.json({ ok: true, ...parsed, provider: 'evren' });
          }
        }
      }
    } catch {}
  }

  // 2. Gemini fallback
  const keys = getGeminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await resp.json();
      if (result.error) continue;
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        const parsed = parseAIEditResponse(text);
        if (parsed.title || parsed.summary) {
          return NextResponse.json({ ok: true, ...parsed, provider: 'gemini' });
        }
      }
    } catch { continue; }
  }

  return NextResponse.json({ error: 'AI Düzenle başarısız — tüm sağlayıcılar denendi' }, { status: 502 });
}

// AI cevabını parse et — "BAŞLIK: xxx \n---\n ÖZET: xxx" formatını ayır
function parseAIEditResponse(text: string): { title: string; summary: string } {
  const trimmed = text.trim();
  let title = '';
  let summary = '';

  // Format 1: "BAŞLIK: xxx --- ÖZET: xxx"
  const match1 = trimmed.match(/BAŞLIK:\s*(.+?)(?:\s*---|\s*\n---|\nÖZET:)\s*(.+)/s);
  if (match1) {
    title = match1[1].trim();
    summary = match1[2].replace(/^ÖZET:\s*/i, '').trim();
    return { title, summary };
  }

  // Format 2: "BAŞLIK: xxx" ve "ÖZET: xxx" ayrı satırlarda
  const titleMatch = trimmed.match(/BAŞLIK:\s*(.+)/);
  const summaryMatch = trimmed.match(/ÖZET:\s*([\s\S]+)/);
  if (titleMatch) title = titleMatch[1].trim();
  if (summaryMatch) summary = summaryMatch[1].trim();

  // Format 3: tek parça — başlık ilk satır, gerisi özet
  if (!title && !summary) {
    const lines = trimmed.split('\n');
    if (lines.length > 1) {
      title = lines[0].trim();
      summary = lines.slice(1).join('\n').trim();
    } else {
      summary = trimmed;
    }
  }

  return { title, summary };
}
