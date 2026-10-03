import { NextResponse } from 'next/server';

// Finans verileri — güvenilir kaynaklar:
// TCMB: https://www.tcmb.gov.tr/kurlar/today.xml (döviz kurları)
// Yahoo Finance: BIST 100 (XU100.IS), Ons Altın (GC=F)
// Gram Altın hesaplama: (Ons fiyatı × USD kuru) / 31.1035

let cache: { data: Array<{ name: string; value: string; change: string; up: boolean }>; ts: number } | null = null;
const CACHE_MS = 30 * 1000; // 30 saniye — kullanıcı talebi

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

// Yahoo Finance'den BIST 100 ve Ons Altın çek
async function fetchYahooData(): Promise<{ bist100: number | null; onsAltin: number | null; bist100Prev: number | null; onsPrev: number | null }> {
  try {
    // BIST 100: XU100.IS
    // Ons Altın: GC=F (Gold Futures)
    const [bistRes, goldRes] = await Promise.allSettled([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?range=2d&interval=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=2d&interval=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    let bist100: number | null = null;
    let bist100Prev: number | null = null;
    let onsAltin: number | null = null;
    let onsPrev: number | null = null;

    if (bistRes.status === 'fulfilled' && bistRes.value.ok) {
      const data = await bistRes.value.json();
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes && closes.length >= 2) {
        // Son iki günün kapanışları: [önceki, bugün]
        const validCloses = closes.filter((c: number | null) => c !== null);
        if (validCloses.length >= 2) {
          bist100Prev = validCloses[validCloses.length - 2];
          bist100 = validCloses[validCloses.length - 1];
        }
      }
    }

    if (goldRes.status === 'fulfilled' && goldRes.value.ok) {
      const data = await goldRes.value.json();
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes && closes.length >= 2) {
        const validCloses = closes.filter((c: number | null) => c !== null);
        if (validCloses.length >= 2) {
          onsPrev = validCloses[validCloses.length - 2];
          onsAltin = validCloses[validCloses.length - 1];
        }
      }
    }

    return { bist100, onsAltin, bist100Prev, onsPrev };
  } catch (e) {
    console.error('Yahoo Finance fetch error:', e instanceof Error ? e.message : e);
    return { bist100: null, onsAltin: null, bist100Prev: null, onsPrev: null };
  }
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

  const [tcmbRates, yahooData] = await Promise.all([fetchTcmbRates(), fetchYahooData()]);

  const result: Array<{ name: string; value: string; change: string; up: boolean }> = [];

  // BIST 100 (Borsa İstanbul / IMKB)
  if (yahooData.bist100 !== null) {
    const ch = calcChange(yahooData.bist100, yahooData.bist100Prev);
    result.push({
      name: 'BIST 100',
      value: yahooData.bist100.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
  if (yahooData.onsAltin !== null) {
    const ch = calcChange(yahooData.onsAltin, yahooData.onsPrev);
    result.push({
      name: 'ONS ALTIN',
      value: `$${yahooData.onsAltin.toFixed(2)}`,
      change: ch ? ch.change : '—',
      up: ch ? ch.up : true,
    });

    // Gram Altın hesapla: (Ons × USD kuru) / 31.1035
    const usdRate = tcmbRates.find(c => c.code === 'USD');
    if (usdRate) {
      const gramAltin = (yahooData.onsAltin * usdRate.rate) / 31.1035;
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
