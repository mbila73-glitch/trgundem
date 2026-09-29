import { NextResponse } from 'next/server';

// GET /api/finans — TCMB'den gerçek döviz kurları
// Kaynak: https://www.tcmb.gov.tr/kurlar/today.xml
// Saatlik önbellek — TCMB gün içinde birkaç kez günceller

let cache: { data: Array<{ name: string; value: string; change: string; up: boolean }>; ts: number } | null = null;
const CACHE_MS = 60 * 60 * 1000; // 1 saat

async function fetchTcmbRates() {
  try {
    const r = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HaberOzet/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`TCMB HTTP ${r.status}`);
    const xml = await r.text();

    // TCMB XML'inden döviz kodu ve kuru çek (regex ile)
    const parseCurrency = (code: string): { buying: number; selling: number; name: string } | null => {
      const regex = new RegExp(
        `<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)<\\/Currency>`,
        'i'
      );
      const match = xml.match(regex);
      if (!match) return null;
      const body = match[1];
      const buyingMatch = body.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/i);
      const sellingMatch = body.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i);
      const nameMatch = body.match(/<CurrencyName>([^<]+)<\/CurrencyName>/i);
      if (!buyingMatch || !sellingMatch) return null;
      return {
        buying: parseFloat(buyingMatch[1]),
        selling: parseFloat(sellingMatch[1]),
        name: nameMatch ? nameMatch[1].trim() : code,
      };
    };

    const usd = parseCurrency('USD');
    const eur = parseCurrency('EUR');
    const gbp = parseCurrency('GBP');
    const chf = parseCurrency('CHF');
    const jpy = parseCurrency('JPY');

    const result: Array<{ name: string; value: string; change: string; up: boolean }> = [];

    // EUR/USD cross'tan USD değişim hesapla (basit yaklaşım)
    // TCMB XML'de önceki gün verisi yok, bu yüzden change'i hesaplayamıyoruz
    // Bunun için "0,00%" göstereceğiz veya veri gelmezse skip

    if (usd) result.push({ name: 'USD/TL', value: usd.selling.toFixed(2), change: 'TCMB', up: true });
    if (eur) result.push({ name: 'EUR/TL', value: eur.selling.toFixed(2), change: 'TCMB', up: true });
    if (gbp) result.push({ name: 'GBP/TL', value: gbp.selling.toFixed(2), change: 'TCMB', up: true });
    if (chf) result.push({ name: 'CHF/TL', value: chf.selling.toFixed(2), change: 'TCMB', up: true });
    if (jpy) result.push({ name: '100 JPY/TL', value: (jpy.selling).toFixed(2), change: 'TCMB', up: true });

    return result;
  } catch (e) {
    console.error('TCMB fetch error:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function GET() {
  // Önbellek kontrolü
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ ok: true, data: cache.data, source: 'TCMB (önbellek)' });
  }

  const data = await fetchTcmbRates();
  if (data && data.length > 0) {
    cache = { data, ts: Date.now() };
    return NextResponse.json({ ok: true, data, source: 'TCMB — Türkiye Cumhuriyet Merkez Bankası' });
  }

  // TCMB erişilemezse boş dön (yanlış veri gösterme)
  return NextResponse.json({ ok: false, data: [], error: 'TCMB verisine erişilemedi' });
}
