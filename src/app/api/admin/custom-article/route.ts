import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as path from 'path';
import * as fs from 'fs';
import { slugify } from '@/lib/format';
import dns from 'node:dns';

// Node.js fetch IPv6 sorununu önlemek için DNS'i IPv4'e zorla
// "fetch failed" hatası genelde IPv6 DNS çözümleme hatasından kaynaklanır
dns.setDefaultResultOrder('ipv4first');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trgundem123';

// Production: /var/www/public/uploads/ (build'lerden etkilenmez)
// Dev: process.cwd()/public/uploads/
const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.NODE_ENV === 'production' ? '/var/www/public/uploads' : path.join(process.cwd(), 'public', 'uploads'));

// Dış URL'den görsel indir + /uploads/ altına slug dosya adı ile kaydet
// Dış URL → yerel URL'e çevirir. Hata olursa null döner.
async function downloadExternalImage(url: string, title: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;

    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
    };
    const ext = extMap[contentType] || '.jpg';

    const slug = slugify(title);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const fileName = slug
      ? `${slug}-${randomSuffix}${ext}`
      : `img-${Date.now()}-${randomSuffix}${ext}`;

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const filePath = path.join(UPLOADS_DIR, fileName);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    fs.writeFileSync(filePath, bytes);

    return `/uploads/${fileName}`;
  } catch (e) {
    console.error('[downloadExternalImage] Hata:', e);
    return null;
  }
}

// HTML entity'leri decode et — &#039; &#x27; &quot; &amp; vb.
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Site adını temizle — küçük harf ise baş harfleri büyüt
function capitalizeSite(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  // Tüm küçükse → kelime kelime büyüt
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.split(/\s+/).map(w =>
      w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w
    ).join(' ');
  }
  return trimmed;
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
    return decoded.split(':')[0] === ADMIN_PASSWORD;
  } catch { return false; }
}

// 5 Gemini API key
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ];
  for (const c of candidates) {
    if (c && c.length > 0) keys.push(c);
  }
  return keys;
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';

// HTML'den tam içerik çıkar — başlık + açıklama + TAM METİN + görseller
function extractFromHtml(html: string, url: string) {
  // Title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) title = ogTitle[1].trim();

  // Description (meta)
  let description = '';
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch) description = descMatch[1].trim();
  if (!description) {
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDesc) description = ogDesc[1].trim();
  }

  // TAM METİN — tüm <p> tag'lerini topla (en zengin içerik)
  let fullText = '';
  const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of pMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 30) fullText += text + '\n\n';
  }
  // <article>, <div class="content"> gibi konteynerlerden de çek
  if (fullText.length < 200) {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const articleText = articleMatch[1].replace(/<[^>]+>/g, '').trim();
      if (articleText.length > 200) fullText = articleText.slice(0, 8000);
    }
  }
  fullText = fullText.slice(0, 8000); // max 8000 karakter

  // Images
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null && images.length < 15) {
    const src = match[1];
    if (src.match(/\.(jpg|jpeg|png|webp|gif)/i) && !src.includes('logo') && !src.includes('icon') && !src.includes('sprite') && !src.includes('avatar') && !src.includes('banner') && src.length > 20) {
      try {
        const absUrl = new URL(src, url).href;
        images.push(absUrl);
      } catch { /* skip */ }
    }
  }

  return { title: decodeHtmlEntities(title), description: decodeHtmlEntities(description.slice(0, 2000)), content: fullText, images };
}

// AI özeti üret — RSS pipeline protokolü ile AYNI telif güvenliği (150-300 kelime, 10 kural, retry'lar)
const MIN_WORDS = 150;
const MAX_WORDS = 300;
const MAX_TOKENS = 4000;

// Reklam/CTA/sponsorlu ifade listesi (pipeline-all.js ile birebir)
const AD_PHRASES = [
  'abone ol', 'bültenimize katıl', 'kaydol', 'üye ol', 'ücretsiz üye',
  'tıkla', 'buradan satın al', 'hemen indir', 'ücretsiz dene',
  'sponsorlu içerik', 'reklamdır', 'promosyon', 'indirim', 'fırsat',
  'ilginizi çekebilir', 'bunları da okuyun', 'diğer haberler', 'önerilen',
  'bizi takip edin', 'sosyal medya hesaplarımız', 'instagram hesabımız',
  'twitter hesabımız', 'youtube kanalımız', 'facebook sayfamız',
  'uygulamamızı indir', 'app store', 'google play', 'play store',
  'için tıklayın', 'detaylar için', 'bize ulaşın', 'iletişime geçin',
  'newsletter', 'subscribe', 'click here', 'buy now', 'download',
  'reklam geç', 'reklamı geç', 'sponsorlu'
];

function findAds(text: string): string[] {
  const normalized = String(text || '').toLowerCase();
  const found: string[] = [];
  for (const p of AD_PHRASES) {
    if (normalized.includes(p)) found.push(p);
  }
  return found;
}

// Plagiarizm kontrolü — AI cevabında 4+ kelimelik ardışık dizilim kaynak metinde var mı?
function findPlagiarism(aiText: string, sourceText: string): string[] {
  const normalize = (t: string): string => String(t || '')
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[İI]/g, 'i')
    .replace(/Ş/g, 's').replace(/Ç/g, 'c').replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ö/g, 'o')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ai = normalize(aiText);
  const src = normalize(sourceText);
  if (!ai || !src) return [];

  const aiWords = ai.split(' ');
  const found: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 4 <= aiWords.length; i++) {
    const chunk = aiWords.slice(i, i + 4).join(' ');
    if (chunk.length > 15 && src.includes(chunk) && !seen.has(chunk)) {
      seen.add(chunk);
      found.push(chunk);
    }
  }
  return found;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

async function aiSummarize(title: string, content: string): Promise<string | null> {
  if (!content || content.length < 100) return null;
  const keys = getGeminiKeys();
  if (keys.length === 0) return null;

  const combinedContent = content.slice(0, 8000);

  // Pipeline ile birebir aynı prompt + retry geri bildirim mantığı
  function buildPrompt(minW: number, prevText: string | null, plagiarismChunks: string[] | null, prevWordCount: number, prevAds: string[] | null): string {
    let prompt = 'Sen bağımsız bir haber editörüsün. Aşağıda farklı kaynaklardan gelen, aynı habere ait metinler var. ' +
      'Bu metinleri oku, ANLA, sonra KENDİ CÜMLELERİNLE bağımsız bir gazeteci gibi YENİDEN YAZ. ' +
      'Bu bir alıntı veya özet değildir — kendi özgün anlatımın olmalı.\n\n' +
      'TELİF GÜVENLİĞİ KURALLARI — ZORUNLU:\n' +
      '1. BİRBİR AYNI CÜMLE KESİNLİKLE OLMASIN. Kaynak metindeki hiçbir cümleyi aynen kopyalama.\n' +
      '   Cümleyi bölüm: özne + yüklem + nesne sırasını değiştir, eş anlamlı kelimeler kullan.\n' +
      '2. Kaynak metinle %30 DAN FAZLA kelime örtüşmesi yapma.\n' +
      '3. Cümle yapılarını tamamen değiştir:\n' +
      '   - Aktif cümleyi pasife çevir (önceledi → tarafından önelendi)\n' +
      '   - Olumsuzu olumlu, olumlu olumsuz yap (ifade değişmeden)\n' +
      '   - Düz cümleyi soru, soruyu düz cümleye çevir\n' +
      '   - Cümle sırasını değiştir (önce sonuç, sonra sebep — veya tersi)\n' +
      '4. Eş anlamlı kelimeler kullan:\n' +
      '   - "açıkladı" yerine "belirtti / ifadede bulundu / söyledi / dile getirdi"\n' +
      '   - "dedi" yerine "ifade etti / kaydetti / vurguladı / belirtti"\n' +
      '   - "yüzde" yerine "yüzde oranında / yüzde ... seviyesinde / ...-oranla"\n' +
      '   - "bugün" yerine "bu gün / yaşadığımız gün / günümüzde"\n' +
      '   - "başkanı" yerine "yöneticisi / temsilcisi / sözcüsü" (anlam uygunsa)\n' +
      '5. Kaynak metindeki İFADEYİ DEĞİL, ANLAMI aktar. Anlamı koru, ifadeyi değiştir.\n' +
      '6. Sayısal veriler (rakam, yüzde, tarih, saat) — ANLAMI KORU ANCAK FARKLI CÜMLEDE VER:\n' +
      '   Kaynakta "Borsa %2 yükseldi" yazıyorsa sen "Borsa endeksinde yüzde iki oranında artış gözlendi" yaz.\n' +
      '   Kaynakta "5 Ekim 2026" yazıyorsa sen "Ekim ayının beşinci günü / 2026 yılının ekim ayında" yaz.\n' +
      '7. Alıntı yapılmış sözleri ("..." içindeki ifadeler) AYNEN KORUMAK ZORUNLU DEĞİL — kendi cümlenle aktar.\n' +
      '8. Kişi adları ve kurum adları korunabilir ANCAK cümle içinde farklı konumlandır.\n' +
      '9. Eğer kaynak metinle çok benzer çıkarsa, kendini düzelt — farklı bir cümle kur.\n' +
      '10. 4+ kelimelik ardışık dizilim kaynak metinde varsa, bu bir kopyalama sayılır — DEĞİŞTİR.\n';

    if (prevText && plagiarismChunks && plagiarismChunks.length > 0) {
      prompt += '\nÖNCEKİ DENEMENDE KOPYALAMA TESPİT EDİLDİ. Şu ifadeler kaynak metinle birebir aynı:\n';
      plagiarismChunks.slice(0, 5).forEach((chunk, i) => {
        prompt += `  ${i + 1}. "${chunk}"\n`;
      });
      prompt += 'Bu ifadelerin hiçbirini yeniden yazdığın metinde aynen kullanma. ' +
        'Tamamen farklı cümle yapısı ve eş anlamlı kelimelerle yeniden yaz.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans için, kopyalama):\n' + prevText.slice(0, 1500) + '\n';
    }

    if (prevText && prevWordCount && prevWordCount < minW) {
      prompt += `\nÖNCEKİ DENEMEN ${prevWordCount} KELİME İDİ — YETERSİZ.\n`;
      prompt += `EN AZ ${minW} kelime yazman ZORUNLU. Önceki denemeyi referans al ama ` +
        'DAHA UZUN ve detaylı yaz. Haberin tüm detaylarını, bağlamını, arka planını, sonuçlarını ekle.\n';
      prompt += '\nÖNCEKİ DENEMEN (referans):\n' + prevText.slice(0, 1500) + '\n';
    }

    if (prevText && prevAds && prevAds.length > 0) {
      prompt += '\nÖNCEKİ DENEMENDE REKLAM TESPİT EDİLDİ. Şu reklam/CTA ifadeleri var:\n';
      prevAds.slice(0, 8).forEach((ad, i) => {
        prompt += `  ${i + 1}. "${ad}"\n`;
      });
      prompt += 'Bu ifadeleri ASLA yeniden yazdığın metinde kullanma. ' +
        'Haberin konusu reklam ile ilgili değilse, tüm reklam benzeri ifadeleri tamamen çıkar. ' +
        'Sadece haberin asıl içeriğini yaz.\n';
    }

    prompt += '\nİÇERİK KURALLARI:\n' +
      '1. Mantıksal tutarlılık: haberin anlamına sadık kal. Olmayan çıkarımlar yapma. ' +
      '"deprem öncesi 16 artçı" gibi saçma mantıksal hatalardan kaçın. Eylemi doğru özne yap, ' +
      'sayıları doğru kullan, eylem-sayı-özne ilişkisi bozukluğu yapma.\n' +
      '2. Terim kontrolü: teknik, siyasi, ekonomik, hukuki terimleri doğru kullan. ' +
      '"artçı" depremden sonra gelir (ön sarsıntı öncesi). Tarih, saat, yüzde, rakam bilgisini ' +
      'OLDUĞU GİBİ AL ANCAK farklı cümle yapısı içinde ver.\n' +
      '3. Kronoloji: olayların sırasını koru. Eski olayı "yeni" gibi, yeni olayı "eski" gibi sunma. ' +
      '"gelecek" olanı "geçmiş" gibi, "geçmiş" olanı "gelecek" gibi yazma.\n' +
      '4. İddia/yargı: haberde "iddia edildi" diyorsa "gerçekleşti" deme. "açıklandı" diyorsa ' +
      '"söylendi" deme. Belirsizliği koru.\n' +
      '5. Anlam kayması: "ekonomik büyüme" yerine "ekonomik küçülme" gibi zıt anlamlı kelime yazma.\n' +
      '6. BAŞLIK-ÖZET UYUMU: Özet yazdığın haber BAŞLIKTA belirtilen konu ile AYNI olmalıdır. ' +
      'Başlık "MHP Genel Başkanı Bahçeli" hakkında ise özet de BU konuyu anlatmalıdır. ' +
      'Başlıkta bahsedilen kişiler, kurumlar ve olaylar özette yer almalıdır. ' +
      'Eğer kaynak metinler farklı konuları içeriyorsa, SADECE başlıkla ilgili olan kısmı özetle. ' +
      'Başka bir haberin içeriğini BAŞLIKLA ALAKASIZ olarak özete dahil ETME.\n' +
      '7. MARKA REKLAM VE TANITIM FILTRESI: Eğer kaynak metin belirli bir markanın, ' +
      'ürünün veya şirketin TANITIMINI, REKLAMINI veya SPONSORLU İÇERİĞİNİ içeriyorsa, ' +
      'bu kısmı özete DAHİL ETME. Örnekler:\n' +
      '   - Otomobil markası tanıtımı: "Yeni X modeli tanıtıldı, işte özellikleri" → REKLAM, atla\n' +
      '   - Telefon markası tanıtımı: "Y markası yeni telefonunu çıkardı" → REKLAM, atla\n' +
      '   - Ürün tanıtımı: "Z ürünü ile tanışın" → REKLAM, atla\n' +
      '   Eğer haber bir markanın reklamını/tanıtımını yapıyorsa, bu içeriği ÖZETLEME. ' +
      '   Sadece tarafsız haber içeriğini özetle.\n' +
      '8. REKLAM VE SPONSORLU İÇERİK KALDIR: Kaynak metinde geçen reklam, sponsorlu içerik, ' +
      'çağrı aksiyonu (CTA) ifadelerini ASLA özete dahil etme. Örnekler:\n' +
      '   - "Abone ol", "Bültenimize katıl", "Kaydol", "Üye ol" → KALDIR\n' +
      '   - "Tıkla", "Buradan satın al", "Hemen indir", "Ücretsiz dene" → KALDIR\n' +
      '   - "Sponsorlu içerik", "Reklam", "Promosyon", "İndirim" → KALDIR\n' +
      '   - "İlginizi çekebilir", "Bunları da okuyun", "Diğer haberler", "Önerilen" → KALDIR\n' +
      '   - "Bizi takip edin", "Sosyal medya", "Instagram", "Twitter", "YouTube" (kanal yönlendirme) → KALDIR\n' +
      '   - "Uygulamamızı indir", "App Store", "Google Play" → KALDIR\n' +
      '   - Kaynak site adı, "için tıklayın", "detaylar için" gibi yönlendirme → KALDIR\n' +
      '   Eğer haberin ana konusu reklam değilse, reklam benzeri ifadeleri tamamen çıkar.\n';

    prompt += '\nUZUNLUK:\n' +
      `EN AZ ${minW} kelime olmalı — daha kısa yazma. ` +
      `EN ÇOK ${MAX_WORDS} kelime olmalı — daha uzun yazma. ${MAX_WORDS} kelime yeterli, haberi tamamla. ` +
      'Cümleni yarıda kesme, haber doğal bir sonuca ulaşmalı. ' +
      `ASLA ${MAX_WORDS} kelimeyi geçme — kısa ve öz tut.\n`;

    prompt += '\nÇIKTI FORMATI:\n' +
      'Türkçe yaz. Sadece yeniden yazılmış metni yaz, başka hiçbir şey ekleme ' +
      '(başlık, etiket, markdown, açıklama yok).\n\n' +
      'BAŞLIK (referans): ' + title + '\n\nKAYNAK HABER METİNLERİ:\n' + combinedContent;
    return prompt;
  }

  let bestText: string | null = null;
  let bestWordCount = 0;
  let prevAttemptText: string | null = null;
  let prevPlagiarism: string[] | null = null;
  let prevWordCount = 0;
  let prevAds: string[] | null = null;
  const deadKeys = new Set<number>();

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = attempt % keys.length;
    if (deadKeys.has(keyIdx)) continue;
    const key = keys[keyIdx];
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(MIN_WORDS, prevAttemptText, prevPlagiarism, prevWordCount, prevAds) }] }],
          generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(45000),
      });
      const result = await resp.json();
      if (result.error) {
        // 403/429 → bu key'i dead yap, diğer dene
        if (result.error.code === 403 || result.error.code === 429) {
          deadKeys.add(keyIdx);
          continue;
        }
        continue;
      }
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const clean = text.trim();
      const wc = countWords(clean);

      // 1. Plagiarizm kontrolü
      const plagiarism = findPlagiarism(clean, combinedContent);
      if (plagiarism.length > 0) {
        if (wc > bestWordCount) { bestText = clean; bestWordCount = wc; }
        prevAttemptText = clean;
        prevPlagiarism = plagiarism;
        prevWordCount = wc;
        prevAds = null;
        continue;
      }

      // 2. Reklam kontrolü
      const ads = findAds(clean);
      if (ads.length > 0) {
        if (wc > bestWordCount) { bestText = clean; bestWordCount = wc; }
        prevAttemptText = clean;
        prevPlagiarism = null;
        prevWordCount = wc;
        prevAds = ads;
        continue;
      }

      // 3. Yetersiz kelime kontrolü
      if (wc < MIN_WORDS) {
        if (wc > bestWordCount) { bestText = clean; bestWordCount = wc; }
        prevAttemptText = clean;
        prevPlagiarism = null;
        prevWordCount = wc;
        prevAds = null;
        continue;
      }

      // Üst limit — 300'den fazla varsa truncate (pipeline ile aynı)
      let finalText = clean;
      if (wc > MAX_WORDS) {
        const words = clean.split(/\s+/);
        finalText = words.slice(0, MAX_WORDS).join(' ');
        // Cümleyi yarıda kesme — son noktaya kadar al
        const lastPeriod = finalText.lastIndexOf('.');
        if (lastPeriod > MAX_WORDS * 0.7) {
          finalText = finalText.slice(0, lastPeriod + 1);
        }
      }

      return finalText;
    } catch {
      deadKeys.add(keyIdx);
      continue;
    }
  }

  return bestText;
}

// POST /api/admin/custom-article
//   { action: 'fetch', url } → { title, description, content, images[] }
//   { action: 'ai-summarize', title, content } → { summary }
//   { action: 'save', title, summary, imageUrl, category } → { ok, id }
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 }); }
  const data = body as { action?: string; url?: string; query?: string; title?: string; content?: string; summary?: string; imageUrl?: string | null; category?: string };

  // 1. FETCH — URL'den tam içerik çek
  if (data.action === 'fetch' && data.url) {
    try {
      const r = await fetch(data.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const { title, description, content, images } = extractFromHtml(html, data.url);
      return NextResponse.json({ ok: true, title, description, content, images });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sayfa okunamadı' }, { status: 500 });
    }
  }

  // 2. AI SUMMARIZE — tam metinden AI özeti üret
  if (data.action === 'ai-summarize' && data.content) {
    try {
      const summary = await aiSummarize(data.title || '', data.content);
      if (!summary) {
        return NextResponse.json({ error: 'AI özet üretilemedi (kota dolu veya hata)' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, summary });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'AI hatası' }, { status: 500 });
    }
  }

  // 2b. SEARCH — güvenilen sitelerde konuyu ara, içerik çek, görselleri topla (özet ÜRETMEZ)
  //     Frontend'e tüm kaynaklar + her birinin içeriği + görselleri döndürür
  //     Kullanıcı sonra seçili kaynaklardan AI özet ürettirir (summarize-selected action)
  if (data.action === 'search' && data.query) {
    try {
      // Güvenilen siteleri getir
      const sites = await db.trustedSite.findMany({ where: { active: true } });
      if (sites.length === 0) {
        return NextResponse.json({ error: 'Güvenilen site yok. Admin panelden ekleyin.' }, { status: 400 });
      }

      const query = data.query.trim();
      const queryLower = query.toLowerCase();

      // Stop word'leri filtrele — "ali", "emre", "ballı" gibi isimler alınsın, jenerik bağlaçlar atılsın
      const STOP_WORDS = new Set(['ve', 'ile', 'için', 'bu', 'şu', 'o', 'bir', 'çok', 'az', 'ya', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl', 'neden', 'niçin', 'niye', 'hangi', 'kimi', 'kim', 'veya', 'ama', 'fakat', 'lakin', 'ancak', 'mesela', 'örneğin', 'gibi', 'kadar', 'dair', 'ait', 'göre', 'rağmen', 'dahi', 'bile', 'ise', 'ya da', 'hem', 'yahut', 'veyahut']);
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

      // Link seçim eşiği — en az yarı anlamalı kelime eşleşmesi (min 1)
      const matchThreshold = Math.max(1, Math.ceil(queryWords.length / 2));

      // Kaynak yapısı: site + url + title + content + images
      const sources: { site: string; url: string; title: string; content: string; images: string[] }[] = [];

      // Her sitede ara
      for (const site of sites) {
        const searchUrl = site.searchUrl.replace('{query}', encodeURIComponent(query));
        try {
          const resp = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) continue;
          const html = await resp.text();

          // HTML'den haber linklerini bul
          const baseUrl = new URL(searchUrl);
          const domain = baseUrl.hostname;
          const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
          const seenLinks = new Set<string>();
          let linkMatch;
          const relevantLinks: { url: string; text: string; score: number }[] = [];

          while ((linkMatch = linkRegex.exec(html)) !== null) {
            const href = linkMatch[1];
            const linkText = linkMatch[2].replace(/<[^>]+>/g, '').trim();
            if (href.length > 15 && linkText.length > 20 && !seenLinks.has(href)) {
              try {
                let absUrl: string;
                if (href.startsWith('http')) {
                  absUrl = href;
                } else if (href.startsWith('/')) {
                  absUrl = new URL(href, searchUrl).href;
                } else {
                  continue;
                }
                // Ana sayfa, abonelik, arama, etiket, kategori sayfalarını atla
                if (absUrl.includes(domain)
                    && !absUrl.includes('/ara') && !absUrl.includes('/search')
                    && !absUrl.includes('/?s=') && !absUrl.includes('/arama')
                    && !absUrl.includes('/abone') && !absUrl.includes('/subscribe')
                    && !absUrl.includes('/kategori') && !absUrl.includes('/category')
                    && !absUrl.includes('/etiket') && !absUrl.includes('/tag')
                    && !absUrl.includes('/yazar') && !absUrl.includes('/author')
                    && !absUrl.includes('/sayfa') && !absUrl.includes('/page/')
                    && !absUrl.includes('/iletisim') && !absUrl.includes('/contact')
                    && !absUrl.includes('/hakkinda') && !absUrl.includes('/about')
                    && !absUrl.includes('/kunye') && !absUrl.includes('/privacy')
                    && !absUrl.endsWith(domain + '/') && !absUrl.endsWith(domain)
                    ) {
                  seenLinks.add(href);
                  const linkTextLower = linkText.toLowerCase();
                  const urlLower = absUrl.toLowerCase();
                  const matchCount = queryWords.filter(w =>
                    linkTextLower.includes(w) || urlLower.includes(w.replace(/\s/g, '-')) || urlLower.includes(w.replace(/\s/g, '_'))
                  ).length;
                  if (matchCount >= matchThreshold) {
                    relevantLinks.push({ url: absUrl, text: linkText, score: matchCount });
                  }
                }
              } catch { /* skip */ }
            }
          }

          // İlgili linkleri önceliklendir — en yüksek skor en üstte
          relevantLinks.sort((a, b) => b.score - a.score);
          // En iyi 3 linki çek (fallback YOK)
          const linksToFetch = relevantLinks.slice(0, 3);

          // Haberlerin içeriğini çek + görselleri topla
          for (const link of linksToFetch) {
            try {
              const articleResp = await fetch(link.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml',
                },
                signal: AbortSignal.timeout(10000),
              });
              if (!articleResp.ok) continue;
              const articleHtml = await articleResp.text();
              const extracted = extractFromHtml(articleHtml, link.url);
              if (extracted.content && extracted.content.length > 200) {
                sources.push({
                  site: capitalizeSite(site.name),
                  url: link.url,
                  title: decodeHtmlEntities(extracted.title || link.text),
                  content: extracted.content.slice(0, 8000),
                  images: extracted.images,
                });
              }
            } catch { /* skip */ }
          }
        } catch { /* skip site errors */ }
      }

      if (sources.length === 0) {
        return NextResponse.json({ error: 'Hiçbir sitede ilgili haber bulunamadı. Konuyu kontrol edin veya daha spesifik yazın.' }, { status: 404 });
      }

      // En ilgili kaynakları üste sırala — başlığında en çok arama kelimesi geçen
      sources.sort((a, b) => {
        const aCount = queryWords.filter(w => a.title.toLowerCase().includes(w)).length;
        const bCount = queryWords.filter(w => b.title.toLowerCase().includes(w)).length;
        return bCount - aCount;
      });

      return NextResponse.json({
        ok: true,
        query,
        sources,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Arama hatası' }, { status: 500 });
    }
  }

  // 2c. SUMMARIZE-SELECTED — frontend'den seçili kaynakları al, AI özeti üret
  //     Frontend "Tara" ile buldu, kaynakları seçti, şimdi "AI Özetle" düğmesi bu action'ı çağırır
  if (data.action === 'summarize-selected') {
    const selSources = (data.sources as { title: string; content: string }[]) || [];
    if (selSources.length === 0) {
      return NextResponse.json({ error: 'En az bir kaynak seçin' }, { status: 400 });
    }
    try {
      // Seçili kaynakların içeriğini birleştir
      const combinedContent = selSources.map(c => c.content).join('\n\n---\n\n').slice(0, 8000);
      const bestTitle = selSources[0]?.title || data.query || '';

      const summary = await aiSummarize(bestTitle, combinedContent);

      if (!summary) {
        return NextResponse.json({ error: 'AI özet üretilemedi (kota dolu veya hata)' }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        title: bestTitle,
        summary,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'AI hatası' }, { status: 500 });
    }
  }

  // 3. SAVE — haberi DB'ye kaydet (multi-kategori destekli)
  if (data.action === 'save') {
    if (!data.title?.trim() || !data.summary?.trim()) {
      return NextResponse.json({ error: 'Başlık ve özet zorunlu' }, { status: 400 });
    }
    try {
      // imageUrl dış URL ise indir, /uploads/ altına kaydet (slug dosya adı)
      // Yerel URL'ler (/uploads/... veya /api/img?...) olduğu gibi kalır
      let finalImageUrl: string | null = data.imageUrl || null;
      if (finalImageUrl && finalImageUrl.startsWith('http')) {
        const localUrl = await downloadExternalImage(finalImageUrl, data.title);
        if (localUrl) {
          finalImageUrl = localUrl;
        }
        // İndirme başarısız olursa dış URL'i koru (proxy ile serve edilir)
      }

      const created = await db.publishedArticle.create({
        data: {
          aiTitle: data.title.trim(),
          aiSummary: data.summary.trim(),
          imageUrl: finalImageUrl,
          category: data.category || 'Özel',
          wordCount: data.summary.trim().split(/\s+/).filter(Boolean).length,
          sourceArticleIds: JSON.stringify(['custom']),
          sourceCount: 999,
          initialHearts: Math.floor(Math.random() * (413 - 223 + 1)) + 223,
          clickHearts: 0,
          earliestPublishedAt: new Date(),
          latestPublishedAt: new Date(),
          status: 'published',
          publishedAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true, id: created.id, imageUrl: finalImageUrl }, { status: 201 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Kayıt hatası' }, { status: 500 });
    }
  }

  // 4. IMAGE-SEARCH — AI destekli telifsiz görsel arama
  //    AI, haber başlığı/metnine göre uygun arama sorgusu üretir
  //    Openverse API (https://api.openverse.org) ile telifsiz görseller arar
  //    Openverse: Creative Commons + Public Domain görseller — API key gerektirmez, ücretsiz
  //    manualQuery verilirse AI üretimini atlar, direkt kullanıcı kelimeleri ile arar
  if (data.action === 'image-search') {
    const query = (data.query || '').trim();
    const content = (data.content || '').trim();
    const manualQuery = (data.manualQuery || '').trim();
    if (!query && !content && !manualQuery) {
      return NextResponse.json({ error: 'Başlık, içerik veya arama kelimesi gerekli' }, { status: 400 });
    }

    try {
      // 1. AI'a haber metnini ver, en uygun arama sorgusunu üret (İngilizce — Openverse daha çok İngilizce içerik)
      //    Eğer manualQuery varsa, AI üretimini atla — kullanıcı kendi kelimelerini girdi
      const keys = getGeminiKeys();
      let aiSearchQuery = manualQuery || query || content.slice(0, 200);

      if (!manualQuery && keys.length > 0 && (content || query)) {
        const aiPrompt = [
          'You are an image search expert. I will search for images on Openverse (Creative Commons + Public Domain).',
          'Generate the BEST single search query (3-5 words, short and clear, in English) for finding relevant images for this news article.',
          'Translate to English if needed. Use simple, generic terms that match the subject.',
          'Examples: "politics announcement", "earthquake disaster", "financial market", "election results"',
          'Write ONLY the search query, nothing else (no title, no quotes, no explanation).',
          '',
          'TITLE: ' + query,
          '',
          'ARTICLE CONTENT:',
          (content || query).slice(0, 3000),
        ].join('\n');

        for (let attempt = 0; attempt < keys.length; attempt++) {
          const key = keys[attempt % keys.length];
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: aiPrompt }] }],
                generationConfig: { maxOutputTokens: 50, temperature: 0.3 },
              }),
              signal: AbortSignal.timeout(15000),
            });
            const result = await resp.json();
            if (result.error) {
              if (result.error.code === 403 || result.error.code === 429) continue;
              continue;
            }
            const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText) {
              // Temizle: yeni satırlar, tırnaklar, gereksiz boşluklar
              aiSearchQuery = aiText.trim().replace(/^["'`]|["'`]$/g, '').split('\n')[0].trim();
              if (aiSearchQuery.length > 0) break;
            }
          } catch { continue; }
        }
      }

      // 2. Openverse API ile telifsiz görsel ara
      //    Openverse: https://api.openverse.org/v1/images/
      //    Creative Commons + Public Domain görseller (Wikimedia, Flickr, vs.)
      const openverseUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(aiSearchQuery)}&page_size=10&mature=false&license_type=all-cc`;
      const ovResp = await fetch(openverseUrl, {
        headers: {
          'User-Agent': 'TRGundem/1.0 (https://trgundem.net)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!ovResp.ok) {
        const errText = await ovResp.text().catch(() => '');
        return NextResponse.json({
          error: `Openverse API hatası (HTTP ${ovResp.status}): ${errText.slice(0, 200)}`,
        }, { status: 502 });
      }
      const ovData = await ovResp.json() as { results?: Array<{ url?: string; title?: string; source?: string; foreign_landing_url?: string; creator?: string; creator_url?: string; license?: string; license_version?: string }> };
      const items = (ovData.results || [])
        .filter(item => item.url && item.url.match(/\.(jpg|jpeg|png|webp|gif)/i))
        .map(item => ({
          url: item.url!,
          title: item.title || '',
          source: item.source || item.foreign_landing_url || '',
        }));

      // Openverse'de az sonuç varsa, manuel query yoksa fallback olarak orijinal query (Türkçe başlık) ile dene
      if (items.length < 5 && !manualQuery && aiSearchQuery !== query) {
        const fallbackUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=10&mature=false&license_type=all-cc`;
        const fbResp = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'TRGundem/1.0 (https://trgundem.net)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (fbResp.ok) {
          const fbData = await fbResp.json() as { results?: Array<{ url?: string; title?: string; source?: string; foreign_landing_url?: string }> };
          const fbItems = (fbData.results || [])
            .filter(item => item.url && item.url.match(/\.(jpg|jpeg|png|webp|gif)/i))
            .map(item => ({
              url: item.url!,
              title: item.title || '',
              source: item.source || item.foreign_landing_url || '',
            }));
          // Openverse + fallback birleşimi, tekrar etmeyenler
          const allItems = [...items, ...fbItems];
          const seen = new Set<string>();
          const unique = allItems.filter(i => {
            if (seen.has(i.url)) return false;
            seen.add(i.url);
            return true;
          });
          return NextResponse.json({
            ok: true,
            query: aiSearchQuery,
            images: unique.slice(0, 10),
          });
        }
      }

      return NextResponse.json({
        ok: true,
        query: aiSearchQuery,
        images: items,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Görsel arama hatası' }, { status: 500 });
    }
  }

  // 5. IMAGE-SEARCH-GOOGLE — Google Custom Search API ile telifsiz görsel arama (2. seçenek)
  //    AI sorgu üretir, Google CSE'de telifsiz (CC) görseller arasından ilk 10'u getirir
  //    GOOGLE_API_KEY ve GOOGLE_CSE_ID env gerektirir (billing bağlı olmalı)
  if (data.action === 'image-search-google') {
    const query = (data.query || '').trim();
    const content = (data.content || '').trim();
    const manualQuery = (data.manualQuery || '').trim();
    if (!query && !content && !manualQuery) {
      return NextResponse.json({ error: 'Başlık, içerik veya arama kelimesi gerekli' }, { status: 400 });
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
    if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
      return NextResponse.json({
        error: 'Google API key/CSE ID eksik — .env dosyasına GOOGLE_API_KEY ve GOOGLE_CSE_ID ekleyin (billing bağlı olmalı)',
      }, { status: 500 });
    }

    try {
      // AI ile sorgu üret — Openverse ile aynı mantık
      const keys = getGeminiKeys();
      let aiSearchQuery = manualQuery || query || content.slice(0, 200);

      if (!manualQuery && keys.length > 0 && (content || query)) {
        const aiPrompt = [
          'You are an image search expert. I will search for images on Google Images (filtered to Creative Commons + Public Domain).',
          'Generate the BEST single search query (3-5 words, short and clear, in English) for finding relevant images for this news article.',
          'Translate to English if needed. Use simple, generic terms that match the subject.',
          'Examples: "politics announcement", "earthquake disaster", "financial market", "election results"',
          'Write ONLY the search query, nothing else (no title, no quotes, no explanation).',
          '',
          'TITLE: ' + query,
          '',
          'ARTICLE CONTENT:',
          (content || query).slice(0, 3000),
        ].join('\n');

        for (let attempt = 0; attempt < keys.length; attempt++) {
          const key = keys[attempt % keys.length];
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: aiPrompt }] }],
                generationConfig: { maxOutputTokens: 50, temperature: 0.3 },
              }),
              signal: AbortSignal.timeout(15000),
            });
            const result = await resp.json();
            if (result.error) {
              if (result.error.code === 403 || result.error.code === 429) continue;
              continue;
            }
            const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText) {
              aiSearchQuery = aiText.trim().replace(/^["'`]|["'`]$/g, '').split('\n')[0].trim();
              if (aiSearchQuery.length > 0) break;
            }
          } catch { continue; }
        }
      }

      // Google Custom Search API ile görsel ara
      // CSE 2026 itibarıyla "tüm web'de ara" kapatıldı — sadece belirli sitelerde arama
      // rights parametresi kaldırıldı (CSE zaten belirli sitelerde arama yapıyor)
      const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&searchType=image&q=${encodeURIComponent(aiSearchQuery)}&num=10`;
      console.log('[image-search-google] CSE URL:', cseUrl.slice(0, 120) + '...');
      let cseResp;
      try {
        cseResp = await fetch(cseUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'TRGundem/1.0 (https://trgundem.net)' },
        });
      } catch (fetchErr) {
        console.error('[image-search-google] fetch error:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
        return NextResponse.json({
          error: `Google API'ye erişilemedi: ${fetchErr instanceof Error ? fetchErr.message : 'bilinmeyen hata'}. VPS internet çıkışı veya TLS sorunu olabilir.`,
        }, { status: 502 });
      }
      if (!cseResp.ok) {
        const errText = await cseResp.text().catch(() => '');
        console.error('[image-search-google] HTTP', cseResp.status, ':', errText.slice(0, 300));
        return NextResponse.json({
          error: `Google API hatası (HTTP ${cseResp.status}): ${errText.slice(0, 300)}`,
        }, { status: 502 });
      }
      const cseData = await cseResp.json() as { items?: Array<{ link?: string; title?: string; image?: { contextLink?: string }; displayLink?: string }> };
      const items = (cseData.items || [])
        .filter(item => item.link)
        .map(item => ({
          url: item.link!,
          title: item.title || '',
          source: item.image?.contextLink || item.displayLink || '',
        }));

      return NextResponse.json({
        ok: true,
        query: aiSearchQuery,
        images: items,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Google görsel arama hatası' }, { status: 500 });
    }
  }

  // 6. IMAGE-SEARCH-PEXELS — Pexels API ile telifsiz görsel arama (3. seçenek)
  //    Ücretsiz, billing yok, 200 istek/saat, yüksek kaliteli görseller
  //    PEXELS_API_KEY env gerektirir
  if (data.action === 'image-search-pexels') {
    const query = (data.query || '').trim();
    const content = (data.content || '').trim();
    const manualQuery = (data.manualQuery || '').trim();
    if (!query && !content && !manualQuery) {
      return NextResponse.json({ error: 'Başlık, içerik veya arama kelimesi gerekli' }, { status: 400 });
    }

    const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
    if (!PEXELS_API_KEY) {
      return NextResponse.json({
        error: 'PEXELS_API_KEY eksik — .env dosyasına PEXELS_API_KEY ekleyin (https://www.pexels.com/api/)',
      }, { status: 500 });
    }

    try {
      // AI ile sorgu üret — Openverse ile aynı mantık
      const keys = getGeminiKeys();
      let aiSearchQuery = manualQuery || query || content.slice(0, 200);

      if (!manualQuery && keys.length > 0 && (content || query)) {
        const aiPrompt = [
          'You are an image search expert. I will search for images on Pexels (free stock photos).',
          'Generate the BEST single search query (3-5 words, short and clear, in English) for finding relevant photos for this news article.',
          'Translate to English if needed. Use simple, generic terms that match the subject.',
          'Examples: "politics announcement", "earthquake disaster", "financial market", "election results"',
          'Write ONLY the search query, nothing else.',
          '',
          'TITLE: ' + query,
          '',
          'ARTICLE CONTENT:',
          (content || query).slice(0, 3000),
        ].join('\n');

        for (let attempt = 0; attempt < keys.length; attempt++) {
          const key = keys[attempt % keys.length];
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: aiPrompt }] }],
                generationConfig: { maxOutputTokens: 50, temperature: 0.3 },
              }),
              signal: AbortSignal.timeout(15000),
            });
            const result = await resp.json();
            if (result.error) {
              if (result.error.code === 403 || result.error.code === 429) continue;
              continue;
            }
            const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText) {
              aiSearchQuery = aiText.trim().replace(/^["'`]|["'`]$/g, '').split('\n')[0].trim();
              if (aiSearchQuery.length > 0) break;
            }
          } catch { continue; }
        }
      }

      // Pexels API ile görsel ara
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(aiSearchQuery)}&per_page=10`;
      let pexelsResp;
      try {
        pexelsResp = await fetch(pexelsUrl, {
          headers: { Authorization: PEXELS_API_KEY },
          signal: AbortSignal.timeout(15000),
        });
      } catch (fetchErr) {
        return NextResponse.json({
          error: `Pexels API'ye erişilemedi: ${fetchErr instanceof Error ? fetchErr.message : 'hata'}`,
        }, { status: 502 });
      }
      if (!pexelsResp.ok) {
        const errText = await pexelsResp.text().catch(() => '');
        return NextResponse.json({
          error: `Pexels API hatası (HTTP ${pexelsResp.status}): ${errText.slice(0, 300)}`,
        }, { status: 502 });
      }
      const pexelsData = await pexelsResp.json() as { photos?: Array<{ src?: { large?: string; medium?: string; original?: string }; alt?: string; photographer?: string; photographer_url?: string }> };
      const items = (pexelsData.photos || [])
        .filter(photo => photo.src?.large || photo.src?.original)
        .map(photo => ({
          url: photo.src?.large || photo.src?.original || '',
          title: photo.alt || '',
          source: photo.photographer ? `Pexels · ${photo.photographer}` : 'Pexels',
        }));

      return NextResponse.json({
        ok: true,
        query: aiSearchQuery,
        images: items,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Pexels görsel arama hatası' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
}
