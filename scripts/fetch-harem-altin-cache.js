// Harem Altın satış fiyatını çekip /var/www/.harem-altin-cache.json dosyasına yazar
// /api/finans bu dosyayı okuyup InfoBands'da "GRAM ALTIN" satırında gösterir
// Cron: */5 * * * * cd /var/www && node scripts/fetch-harem-altin-cache.js
//
// Puppeteer kullanır (altin-takip.js ile aynı yöntem). Harem Altın fiyatı
// socket.io ile geldiği için direkt HTTP request ile alınamaz.
// socket.io-client yüklü değil, o yüzden Puppeteer kullanıyoruz.

const path = require('path');
const fs = require('fs');

const CACHE_FILE = '/var/www/.harem-altin-cache.json';
const HARREM_URL = 'https://www.haremaltin.com/grafik?tip=altin&birim=KULCEALTIN';

async function fetchHaremAltin() {
  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    console.log('[' + new Date().toISOString() + '] Puppeteer başlatılıyor...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 60000,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    console.log('  Harem Altın grafik sayfası açılıyor...');
    await page.goto(HARREM_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    console.log('  #priceSatis bekleniyor (socket.io fiyat yükleyene kadar)...');
    await page.waitForSelector('#priceSatis', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000)); // Socket.io'nun fiyatı doldurması için 2sn bekle

    const fiyatData = await page.evaluate(() => {
      const satisEl = document.querySelector('#priceSatis');
      const alisEl = document.querySelector('#priceAlis');
      return {
        satis: satisEl ? satisEl.textContent.trim() : '',
        alis: alisEl ? alisEl.textContent.trim() : '',
      };
    });

    console.log('  Alış:  ' + (fiyatData.alis || '(boş)'));
    console.log('  Satış: ' + (fiyatData.satis || '(boş)'));

    let fiyat = fiyatData.satis;
    if (!fiyat || fiyat === '-' || fiyat === '') {
      console.log('  Satış boş, alış deneniyor...');
      fiyat = fiyatData.alis;
    }

    if (!fiyat || fiyat === '-' || fiyat === '') {
      console.log('  ✗ Fiyat alınamadı (socket gelmedi)');
      return null;
    }

    // Fiyatı temizle — "5.234,56 TL" gibi son ekleri temizle
    const fiyatClean = fiyat.replace(/[^0-9.,]/g, '');
    console.log('  ✓ Fiyat çekildi: ' + fiyatClean);
    return {
      satis: fiyatClean,
      alis: fiyatData.alis.replace(/[^0-9.,]/g, '') || null,
      kaynak: 'haremaltin.com (Puppeteer + Socket.io)',
      url: HARREM_URL,
    };
  } catch (e) {
    console.log('  ✗ Puppeteer hatası: ' + e.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

async function main() {
  const fiyat = await fetchHaremAltin();
  if (!fiyat) {
    console.log('✗ Fiyat alınamadı — cache güncellenmedi');
    process.exit(1);
  }

  // Cache dosyası yaz
  const cacheData = {
    fetchedAt: new Date().toISOString(),
    timestamp: Date.now(),
    satis: fiyat.satis,
    alis: fiyat.alis,
    kaynak: fiyat.kaynak,
    url: fiyat.url,
  };

  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log('✓ Cache yazıldı: ' + CACHE_FILE);
    console.log('  Satış: ' + fiyat.satis + ' TL');
    console.log('  Tarih: ' + cacheData.fetchedAt);
  } catch (e) {
    console.log('✗ Cache yazma hatası: ' + e.message);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
