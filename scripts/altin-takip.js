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

// === HAREM ALTIN FIYAT ÇEK (Puppeteer ile) ===
async function fetchHaremAltin() {
  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    console.log('Puppeteer başlatılıyor (headless Chrome)...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 60000,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    const url = 'https://www.haremaltin.com/grafik?tip=altin&birim=KULCEALTIN';
    console.log('Harem Altın grafik sayfası açılıyor...');
    console.log('URL:', url);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // #priceSatis elementini bekle — socket.io fiyat yükleyene kadar
    console.log('Fiyat elementi bekleniyor (#priceSatis)...');
    await page.waitForSelector('#priceSatis', { timeout: 30000 });

    // Socket.io'nun fiyatı doldurması için 2 saniye bekle
    await new Promise(r => setTimeout(r, 2000));

    // #priceSatis ve #priceAlis elementlerinden text çek
    const fiyatData = await page.evaluate(() => {
      const satisEl = document.querySelector('#priceSatis');
      const alisEl = document.querySelector('#priceAlis');
      return {
        satis: satisEl ? satisEl.textContent.trim() : '',
        alis: alisEl ? alisEl.textContent.trim() : '',
      };
    });

    console.log(`  Alış:  ${fiyatData.alis || '(boş)'}`);
    console.log(`  Satış: ${fiyatData.satis || '(boş)'}`);

    // Satış fiyatı (kullanıcı bunu istiyor)
    let fiyat = fiyatData.satis;

    // Boşsa veya "-" ise, alış'ı dene (fallback)
    if (!fiyat || fiyat === '-' || fiyat === '') {
      console.log('  Satış boş, alış deneniyor...');
      fiyat = fiyatData.alis;
    }

    if (!fiyat || fiyat === '-' || fiyat === '') {
      console.log('  ✗ Fiyat alınamadı (socket gelmedi)');
      return null;
    }

    // Fiyatı temizle — bazen "5.234,56 TL" gibi son ek geliyor
    const fiyatClean = fiyat.replace(/[^0-9.,]/g, '');
    console.log(`  ✓ Fiyat çekildi: ${fiyatClean}`);
    return { fiyat: fiyatClean, kaynak: 'haremaltin.com (Puppeteer + Socket.io)' };
  } catch (e) {
    console.log('  ✗ Puppeteer hatası:', e.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
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

// Fiyat string'i sayıya çevir — hem Türk (5.234,56) hem Amerikan (5,234.56) formatı destekler
function parseFiyat(fiyatStr) {
  if (!fiyatStr) return null;
  const cleaned = fiyatStr.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);

  if (lastSep === -1) {
    // Hiç ayraç yok — tam sayı
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  const afterSep = cleaned.substring(lastSep + 1);
  const beforeSep = cleaned.substring(0, lastSep);

  // Eğer son ayractan sonra 1-2 hane varsa → ondalık ayraç
  // Eğer 3+ hane varsa → binlik ayraç (3 hane = binlik, virgülden sonra 3 hane normalde)
  if (afterSep.length <= 2) {
    // Ondalık ayraç — öncesi binlik ayraçları temizle
    const integerPart = beforeSep.replace(/[.,]/g, '');
    const result = parseFloat(integerPart + '.' + afterSep);
    return isNaN(result) ? null : result;
  } else {
    // Binlik ayraç — tüm ayraçları kaldır, tam sayı
    const allDigits = cleaned.replace(/[.,]/g, '');
    const result = parseFloat(allDigits);
    return isNaN(result) ? null : result;
  }
}

// === AY BAZLI ALTIN SAHIPLERI ===
// JS Date.getMonth() 0-11 arası döner (0=Ocak, 11=Aralık)
const AY_SAHIPLERI = {
  0:  { ad: 'Adem',    cinsiyet: 'Bey'   },  // Ocak
  1:  { ad: 'İlknur',  cinsiyet: 'Hanım' },  // Şubat
  2:  { ad: 'Büşra',   cinsiyet: 'Hanım' },  // Mart
  3:  { ad: 'Fatma',   cinsiyet: 'Hanım' },  // Nisan
  4:  { ad: 'Enver',   cinsiyet: 'Bey'   },  // Mayıs
  5:  { ad: 'Metin',   cinsiyet: 'Bey'   },  // Haziran
  6:  { ad: 'Dinçer',  cinsiyet: 'Bey'   },  // Temmuz
  // 7 = Ağustos (yaz tatili — altın günü yok)
  8:  { ad: 'Ercan',   cinsiyet: 'Bey'   },  // Eylül
  9:  { ad: 'Olcay',   cinsiyet: 'Bey'   },  // Ekim
  10: { ad: 'Öztürk',  cinsiyet: 'Bey'   },  // Kasım
  11: { ad: 'Murat',   cinsiyet: 'Bey'   },  // Aralık
};

// === TATIL GÜNLERI (2026-2027) ===
// Resmi tatiller + dini bayramlar (her yıl güncellenmeli)
// Hafta sonu otomatik kontrol edilir, buraya sadece tatil günleri yazılır
const TATIL_GUNLERI_2026_2027 = [
  // 2026 — Resmi tatiller (her yıl aynı tarih)
  '2026-01-01', // Yeni Yıl
  '2026-04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01', // Emek ve Dayanışma Günü
  '2026-05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı (Perşembe)
  // 2026 — Dini bayramlar (her yıl farklı)
  '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', // Ramazan (arife + 3 gün)
  '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', // Kurban (arife + 4 gün)

  // 2027 — Resmi tatiller
  '2027-01-01', // Yeni Yıl
  '2027-04-23', // Ulusal Egemenlik
  '2027-05-01', // Emek
  '2027-05-19', // Atatürk
  '2027-08-30', // Zafer
  '2027-10-29', // Cumhuriyet
  // 2027 — Dini bayramlar (tahmini, yıl başında Diyanet'ten doğrula)
  '2027-03-20', '2027-03-21', '2027-03-22', '2027-03-23', // Ramazan (tahmini)
  '2027-05-27', '2027-05-28', '2027-05-29', '2027-05-30', '2027-05-31', // Kurban (tahmini)
];

// Verilen tarihin tatil olup olmadığını kontrol et (hafta sonu + tatil listesi)
function isTatilGun(dateStr) {
  // YYYY-MM-DD → Date (yerel saat ile)
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Pazar, 6=Cumartesi

  // Hafta sonu kontrolü
  if (day === 0 || day === 6) return { tatil: true, sebep: day === 0 ? 'Pazar' : 'Cumartesi' };

  // Tatil listesi kontrolü
  if (TATIL_GUNLERI_2026_2027.includes(dateStr)) {
    return { tatil: true, sebep: 'Resmi/Dini tatil' };
  }

  return { tatil: false, sebep: '' };
}

// Verilen tarihten itibaren ilk iş gününü bul
function getIlkIsGunu(dateStr) {
  let [y, m, d] = dateStr.split('-').map(Number);
  let date = new Date(y, m - 1, d);
  let dateStr2 = dateStr;
  let attempts = 0;
  while (isTatilGun(dateStr2).tatil && attempts < 10) {
    date.setDate(date.getDate() + 1);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    dateStr2 = `${yy}-${mm}-${dd}`;
    attempts++;
  }
  return dateStr2;
}

// Verilen ay için tetikleme tarihini hesapla
// Öncelik: manuel config > otomatik hesaplama
function getTriggerDateForMonth(yearMonth) {
  // Manuel config varsa onu kullan
  if (config[yearMonth] && config[yearMonth].triggerDate) {
    return {
      triggerDate: config[yearMonth].triggerDate,
      isHoliday: config[yearMonth].isHoliday || false,
      note: config[yearMonth].note || '',
      source: 'config'
    };
  }

  // Otomatik hesapla
  const normalDate = `${yearMonth}-15`;
  const tatilKontrol = isTatilGun(normalDate);
  if (tatilKontrol.tatil) {
    const ilkIsGunu = getIlkIsGunu(normalDate);
    return {
      triggerDate: ilkIsGunu,
      isHoliday: true,
      note: `15'i ${tatilKontrol.sebep}, ilk iş günü ${ilkIsGunu}`,
      source: 'auto'
    };
  }
  return {
    triggerDate: normalDate,
    isHoliday: false,
    note: '',
    source: 'auto'
  };
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

  // Bu ayki altın sahibi
  const now = new Date();
  const aySahibi = AY_SAHIPLERI[now.getMonth()];
  const sahibiMetin = aySahibi ? `${aySahibi.ad} ${aySahibi.cinsiyet}` : '(liste dışı ay)';

  const subject = `Altın Günü — ${triggerDate} saat 13:00 — Sahibi: ${sahibiMetin} — 1gr ${fiyat1Display} TL / 2gr ${fiyat2Display} TL`;
  const text = `Merhaba,

Bugün ${triggerDate} saat 13:00 itibariyle Harem Altın satış fiyatları:

1 GRAM ALTIN: ${fiyat1Display} TL
2 GRAM ALTIN: ${fiyat2Display} TL

Bu ayki altınların sahibi: ${sahibiMetin}

Kaynak: ${fiyatData.kaynak}

İyi günler.

TRGUNDEM.NET Altın Takip — otomatik bildirim`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="background: #0ea5e9; color: white; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <h2 style="margin: 0;">Altın Günü Bildirimi</h2>
      </div>
      <p>Tarih: <strong>${triggerDate}</strong> · Saat: <strong>13:00</strong> (Harem Altın referansı)</p>
      <div style="margin-top:12px;padding:14px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b">
        <p style="margin:0;font-size:13px;color:#92400e">BU AYKİ ALTINLARIN SAHİBİ</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:bold;color:#7c2d12">${sahibiMetin}</p>
      </div>
      <div style="margin-top:16px;padding:20px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0ea5e9">
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

  // Ağustos → yaz tatili, altın günü yok
  if (now.getMonth() === 7) {
    console.log('Ağustos — yaz tatili, altın günü yok — çık');
    return;
  }

  // Ay sahibi
  const aySahibi = AY_SAHIPLERI[now.getMonth()];
  console.log(`Bu ayki altın sahibi: ${aySahibi.ad} ${aySahibi.cinsiyet}`);
  console.log('');

  // Tetikleme tarihini hesapla (manuel config > otomatik)
  const triggerInfo = getTriggerDateForMonth(yearMonth);
  console.log('Tetikleme bilgisi:');
  console.log(`  normalDate: ${yearMonth}-15`);
  console.log(`  triggerDate: ${triggerInfo.triggerDate}`);
  console.log(`  isHoliday: ${triggerInfo.isHoliday}`);
  console.log(`  note: ${triggerInfo.note || '(yok)'}`);
  console.log(`  source: ${triggerInfo.source}`);
  console.log('');

  // Bugün triggerDate mi?
  if (triggerInfo.triggerDate === todayDate) {
    console.log(`✓ Bugün triggerDate — fiyat çek + mail gönder`);
    const fiyatData = await fetchHaremAltin();
    if (fiyatData) {
      await sendAltinMail(fiyatData, todayDate);
    } else {
      console.log('Fiyat alınamadı — fallback mail gönderiliyor');
      const fallbackData = { fiyat: '(alınamadı)', kaynak: 'https://www.haremaltin.com/ — manuel kontrol edin' };
      await sendAltinMail(fallbackData, todayDate);
    }
    return;
  }

  // Bugün normalDate + tatil mi? (tatil bildirimi gönder)
  const normalDate = `${yearMonth}-15`;
  if (normalDate === todayDate && triggerInfo.isHoliday) {
    console.log(`✓ Bugün 15'i tatil — tatil bildirimi gönder`);
    const tatilConfig = {
      normalDate,
      triggerDate: triggerInfo.triggerDate,
      isHoliday: triggerInfo.isHoliday,
      note: triggerInfo.note,
    };
    await sendTatilBildirimi(tatilConfig);
    return;
  }

  console.log('Bugün tetikleme tarihi değil — çık');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
