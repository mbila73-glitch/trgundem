// Altın Takip Scripti — Her ayın 15'inde (veya tatil kaydırması) saat 13:00'da
// Harem Altın satış fiyatını çekip mail gönderir
//
// Kullanım:
//   node /var/www/scripts/altin-takip.js
//
// Config dosyası: /var/www/altin-config.json
// Format:
// {
//   "2026-10": {
//     "normalDate": "2026-10-15",
//     "triggerDate": "2026-10-15",  ← fiyatın çekileceği tarih
//     "isHoliday": false,           ← 15'i tatil mi?
//     "note": ""                    ← açıklama (opsiyonel)
//   },
//   "2026-11": {
//     "normalDate": "2026-11-15",
//     "triggerDate": "2026-11-17",  ← 15'i Pazar, 17'si Salı
//     "isHoliday": true,
//     "note": "15'i Pazar, 17'si ilk iş günü"
//   }
// }
//
// Her gün 13:00'da cron çalışır:
//   - Bugün triggerDate ise → fiyat çek + "Altın Günü" maili
//   - Bugün normalDate + isHoliday true ise → "Bugün tatil, X tarihinde bildirilecek" maili
//   - Diğer günler → çık

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// === CONFIG OKU ===
const CONFIG_PATH = '/var/www/altin-config.json';
const ENV_PATH = '/var/www/.env';

// .env oku
try {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
      process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
} catch (e) {
  console.log('⚠ .env okunamadı:', e.message);
}

// Config oku
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.log('⚠ Config yok veya hatalı:', e.message);
  console.log('  Beklenen dosya:', CONFIG_PATH);
  process.exit(0);
}

// === MAIL LISTESI ===
const MAIL_LIST = 'metinbila@hotmail.com, metinbila@gmail.com, mbila73@gmail.com';

// === SMTP ===
function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.trgundem.net',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
    auth: {
      user: process.env.SMTP_USER || 'temsilci@trgundem.net',
      pass: process.env.SMTP_PASS,
    },
  });
}

// === HAREM ALTIN FIYAT ÇEK ===
async function fetchHaremAltin() {
  // 1. Önce HTML fetch + regex dene
  try {
    console.log('Harem Altın sitesinden fiyat çekiliyor...');
    const r = await fetch('https://www.haremaltin.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TRGUNDEM-AltinTakip/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    console.log(`  HTML boyutu: ${html.length} byte`);

    // Harem Altın muhtemelen "gram altın" satış fiyatını bir element içinde gösterir
    // Birkaç pattern dene:
    const patterns = [
      // "gram altın": "5.234,56" pattern
      /gram\s*alt[ıi][^0-9]*([\d.,]+)/i,
      // "satış": "5234,56" pattern
      /sat[ıi][şs][^0-9]*([\d.,]+)/i,
      // "alış/satış" çift
      /"sat[ıi][şs]"\s*[:=]\s*"?([\d.,]+)/i,
      // data-price="5234,56"
      /data-price[^0-9]*([\d.,]+)/i,
      // JSON içinde "gram": 5234.56
      /"gram"?\s*[:=]\s*"?([\d.,]+)/i,
      // "gram": "5234,56"
      /"gram"\s*:\s*"([\d.,]+)/i,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const match = html.match(patterns[i]);
      if (match && match[1]) {
        console.log(`  ✓ Pattern ${i + 1} eşleşti: ${match[1]}`);
        return { fiyat: match[1], kaynak: 'haremaltin.com HTML' };
      }
    }

    // HTML'de fiyat yoksa, API endpoint'lerini dene
    console.log('  HTML içinde fiyat bulunamadı, API deneniyor...');

    const apiUrls = [
      'https://www.haremaltin.com/api/prices',
      'https://www.haremaltin.com/api/altin',
      'https://www.haremaltin.com/wp-json/altin/v1/price',
    ];

    for (const apiUrl of apiUrls) {
      try {
        const ar = await fetch(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!ar.ok) continue;
        const data = await ar.json();
        // JSON içinde satış/gram ara
        const text = JSON.stringify(data);
        const match = text.match(/"(?:sat[ıi][şs]|gram|price)"\s*:\s*"?([\d.,]+)/i);
        if (match) {
          console.log(`  ✓ API ${apiUrl}: ${match[1]}`);
          return { fiyat: match[1], kaynak: apiUrl };
        }
      } catch (e) { /* sıradaki */ }
    }

    console.log('  ✗ Fiyat bulunamadı (regex/API)');
    return null;
  } catch (e) {
    console.log('  ✗ Hata:', e.message);
    return null;
  }
}

// === MAIL GÖNDER ===
async function sendMail(subject, text, html) {
  const transport = getTransport();
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'temsilci@trgundem.net',
      to: MAIL_LIST,
      subject,
      text,
      html,
    });
    console.log(`✓ Mail gönderildi! MessageId: ${info.messageId}`);
    console.log(`  Alıcılar: ${MAIL_LIST}`);
    return true;
  } catch (e) {
    console.log('✗ Mail gönderme hatası:', e.message);
    return false;
  }
}

// === TATIL BILDIRIMI MAILI ===
async function sendTatilBildirimi(monthConfig) {
  const subject = `Altın Günü Bildirimi — 15'i Tatil, ${monthConfig.triggerDate} tarihinde fiyat gönderilecek`;
  const text = `Merhaba,

Bu ayın 15'i tatil gününe denk geliyor.

Tatil sebebi: ${monthConfig.note || 'Tatil'}

Harem Altın satış fiyatı, ilk iş günü olan ${monthConfig.triggerDate} tarihinde saat 13:00'da gönderilecek.

İyi günler.

TRGUNDEM.NET Altın Takip`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="background: #f59e0b; color: white; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <h2 style="margin: 0;">Altın Günü — Tatil Bildirimi</h2>
      </div>
      <p>Merhaba,</p>
      <p>Bu ayın <strong>15'i</strong> tatil gününe denk geliyor.</p>
      <p><strong>Tatil sebebi:</strong> ${monthConfig.note || 'Tatil'}</p>
      <p>Harem Altın satış fiyatı, ilk iş günü olan <strong style="color:#0ea5e9;font-size:18px">${monthConfig.triggerDate}</strong> tarihinde saat <strong>13:00</strong>'da gönderilecek.</p>
      <hr style="margin-top:20px;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#9ca3af;margin-top:16px">TRGUNDEM.NET Altın Takip — otomatik bildirim</p>
    </div>
  `;
  return await sendMail(subject, text, html);
}

// Fiyat string'i sayıya çevir, Türk formatı (5.234,56 → 5234.56)
function parseFiyat(fiyatStr) {
  if (!fiyatStr) return null;
  try {
    // "5.234,56" → "5234.56"
    const cleaned = fiyatStr.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  } catch (e) {
    return null;
  }
}

// Sayıyı Türk formatında yaz (5234.56 → "5.234,56")
function formatFiyat(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// === ALTIN GÜNÜ MAILI ===
async function sendAltinMail(fiyatData, triggerDate) {
  // 1 gram fiyat + 2 gram hesapla
  const fiyat1 = parseFiyat(fiyatData.fiyat);
  const fiyat2 = fiyat1 !== null ? fiyat1 * 2 : null;

  const fiyat1Display = fiyat1 !== null ? formatFiyat(fiyat1) : fiyatData.fiyat;
  const fiyat2Display = fiyat2 !== null ? formatFiyat(fiyat2) : '—';

  const subject = `Altın Günü — ${triggerDate} saat 13:00 — Harem Altın: 1gr ${fiyat1Display} TL / 2gr ${fiyat2Display} TL`;
  const text = `Merhaba,

Bugün ${triggerDate} saat 13:00 itibariyle Harem Altın satış fiyatları:

1 GRAM ALTIN: ${fiyat1Display} TL
2 GRAM ALTIN: ${fiyat2Display} TL

Kaynak: ${fiyatData.kaynak}

İyi günler.

TRGUNDEM.NET Altın Takip — otomatik bildirim`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="background: #0ea5e9; color: white; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <h2 style="margin: 0;">Altın Günü Bildirimi</h2>
      </div>
      <p>Tarih: <strong>${triggerDate}</strong> · Saat: <strong>13:00</strong> (Harem Altın referansı)</p>
      <div style="margin-top:20px;padding:20px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0ea5e9">
        <p style="margin:0;font-size:14px;color:#6b7280">HAREM ALTIN SATIŞ FİYATLARI</p>
        <div style="display:flex;gap:24px;margin-top:12px;flex-wrap:wrap">
          <div>
            <p style="margin:0;font-size:13px;color:#6b7280">1 GRAM ALTIN</p>
            <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#0ea5e9">${fiyat1Display} <span style="font-size:14px;color:#6b7280">TL</span></p>
          </div>
          <div>
            <p style="margin:0;font-size:13px;color:#6b7280">2 GRAM ALTIN</p>
            <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#0ea5e9">${fiyat2Display} <span style="font-size:14px;color:#6b7280">TL</span></p>
          </div>
        </div>
      </div>
      <p style="margin-top:16px;font-size:12px;color:#6b7280">Kaynak: <a href="https://www.haremaltin.com/" style="color:#0ea5e9">${fiyatData.kaynak}</a></p>
      <hr style="margin-top:20px;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#9ca3af;margin-top:16px">TRGUNDEM.NET Altın Takip — otomatik bildirim · Saat 13:00 referans fiyatı</p>
    </div>
  `;
  return await sendMail(subject, text, html);
}

// === MAIN ===
async function main() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayDate = `${yearMonth}-${String(now.getDate()).padStart(2, '0')}`;

  console.log('=== Altın Takip ===');
  console.log('Tarih:', todayDate, '/', now.toLocaleTimeString('tr-TR'));
  console.log('');

  // Bu ay config var mı?
  const monthConfig = config[yearMonth];
  if (!monthConfig) {
    console.log(`Bu ay (${yearMonth}) için config yok — çık`);
    return;
  }

  console.log('Ay config:', JSON.stringify(monthConfig));
  console.log('');

  // Bugün triggerDate mi?
  if (monthConfig.triggerDate === todayDate) {
    console.log(`✓ Bugün triggerDate — fiyat çek + mail gönder`);
    const fiyatData = await fetchHaremAltin();
    if (fiyatData) {
      await sendAltinMail(fiyatData, todayDate);
    } else {
      console.log('Fiyat alınamadı — mail gönderilmedi');
      // Yine de mail gönder, fiyat "alınamadı" desin
      const fallbackData = { fiyat: '(alınamadı)', kaynak: 'https://www.haremaltin.com/ — manuel kontrol edin' };
      await sendAltinMail(fallbackData, todayDate);
    }
    return;
  }

  // Bugün normalDate + tatil mi?
  if (monthConfig.normalDate === todayDate && monthConfig.isHoliday) {
    console.log(`✓ Bugün normalDate + tatil — tatil bildirimi gönder`);
    await sendTatilBildirimi(monthConfig);
    return;
  }

  console.log('Bugün tetikleme tarihi değil — çık');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
