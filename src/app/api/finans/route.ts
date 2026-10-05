import { NextResponse } from 'next/server';

// Finans verileri — güvenilir kaynaklar:
// TCMB: https://www.tcmb.gov.tr/kurlar/today.xml (döviz kurları)
// Yahoo Finance: BIST 100 (XU100.IS), Ons Altın (GC=F) — query1/query2 fallback
// Gram Altın hesaplama: (Ons fiyatı × USD kuru) / 31.1035

let cache: { data: Array<{ name: string; value: string; change: string; up: boolean }>; ts: number } | null = null;
const CACHE_MS = 10 * 1000; // 10 saniye — kullanıcı talebi

// TCMB'den döviz kurları çek
async function fetchTcmbRates(): Promise<{ code: string; rate: number; prevRate: number | null }[]> {
  try {
    const r = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HaberOzet/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();

    const parseCurrency = (code: string): { rate: number; prevRate: number | null } | null => {
      const regex = new RegExp(`<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)<\\/Currency>`, 'i');
      const match = xml.match(regex);
      if (!match) return null;
      const body = match[1];
      const sellingMatch = body.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i);
      if (!sellingMatch) return null;
      return { rate: parseFloat(sellingMatch[1]), prevRate: null };
    };

    const currencies = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'];
    return currencies
      .map(code => {
        const parsed = parseCurrency(code);
        if (!parsed) return null;
        return { code, rate: parsed.rate, prevRate: parsed.prevRate };
      })
      .filter((x): x is { code: string; rate: number; prevRate: number | null } => x !== null);
  } catch (e) {
    console.error('TCMB fetch error:', e instanceof Error ? e.message : e);
    return [];
  }
}

// Yahoo Finance helper — belirli bir sembolden chart verisi çek
async function tryYahoo(url: string): Promise<{ current: number | null; prev: number | null }> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { current: null, prev: null };
    const data = await resp.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (closes && Array.isArray(closes)) {
      const validCloses = closes.filter((c: number | null) => c !== null && c !== undefined && !isNaN(c));
      if (validCloses.length >= 2) {
        return {
          current: validCloses[validCloses.length - 1],
          prev: validCloses[validCloses.length - 2],
        };
      }
      if (validCloses.length === 1) {
        return { current: validCloses[0], prev: null };
      }
    }
    return { current: null, prev: null };
  } catch {
    return { current: null, prev: null };
  }
}

// BIST 100 — birden fazla kaynak/endpoint sırayla dene
async function fetchBist100(): Promise<{ current: number | null; prev: number | null }> {
  // 1. Yahoo Finance query1 — XU100.IS (BIST 100)
  let r = await tryYahoo('https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?range=5d&interval=1d');
  if (r.current) return r;

  // 2. Yahoo Finance query2 — XU100.IS
  r = await tryYahoo('https://query2.finance.yahoo.com/v8/finance/chart/XU100.IS?range=5d&interval=1d');
  if (r.current) return r;

  // 3. Yahoo Finance query1 — XU030.IS (BIST 30 fallback)
  r = await tryYahoo('https://query1.finance.yahoo.com/v8/finance/chart/XU030.IS?range=5d&interval=1d');
  if (r.current) return r;

  return { current: null, prev: null };
}

// Ons Altın — Yahoo Finance (GC=F) birden fazla endpoint
async function fetchOnsAltin(): Promise<{ current: number | null; prev: number | null }> {
  let r = await tryYahoo('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d');
  if (r.current) return r;
  r = await tryYahoo('https://query2.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d');
  return r;
}

function calcChange(current: number, prev: number | null): { change: string; up: boolean } | null {
  if (prev === null || prev === 0) return null;
  const diff = current - prev;
  const pct = (diff / prev) * 100;
  return {
    change: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    up: pct >= 0,
  };
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ ok: true, data: cache.data });
  }

  const [tcmbRates, bistData, onsData] = await Promise.all([
    fetchTcmbRates(),
    fetchBist100(),
    fetchOnsAltin(),
  ]);

  const result: Array<{ name: string; value: string; change: string; up: boolean }> = [];

  // BIST 100 (Borsa İstanbul / IMKB)
  if (bistData.current !== null) {
    const ch = calcChange(bistData.current, bistData.prev);
    result.push({
      name: 'BIST 100',
      value: bistData.current.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: ch ? ch.change : '—',
      up: ch ? ch.up : true,
    });
  }

  // TCMB Döviz kurları
  for (const cur of tcmbRates) {
    if (cur.code === 'JPY') {
      result.push({ name: '100 JPY/TL', value: cur.rate.toFixed(2), change: '—', up: true });
    } else {
      result.push({ name: `${cur.code}/TL`, value: cur.rate.toFixed(2), change: '—', up: true });
    }
  }

  // Ons Altın (Yahoo Finance)
  if (onsData.current !== null) {
    const ch = calcChange(onsData.current, onsData.prev);
    result.push({
      name: 'ONS ALTIN',
      value: `$${onsData.current.toFixed(2)}`,
      change: ch ? ch.change : '—',
      up: ch ? ch.up : true,
    });

    // Gram Altın hesapla: (Ons × USD kuru) / 31.1035
    const usdRate = tcmbRates.find(c => c.code === 'USD');
    if (usdRate) {
      const gramAltin = (onsData.current * usdRate.rate) / 31.1035;
      result.push({
        name: 'GRAM ALTIN',
        value: `${gramAltin.toFixed(0)} ₺`,
        change: ch ? ch.change : '—',
        up: ch ? ch.up : true,
      });
    }
  }

  if (result.length > 0) {
    cache = { data: result, ts: Date.now() };
  }

  return NextResponse.json({ ok: result.length > 0, data: result });
}
