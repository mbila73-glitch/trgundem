import { NextResponse } from 'next/server';

// Hava durumu — Open-Meteo (ücretsiz, API key yok)
// https://open-meteo.com/

type HavaData = {
  sehir: string;
  derece: number;
  ikon: 'sun' | 'cloud' | 'rain' | 'snow';
  durum: string;
};

type CacheEntry = { data: HavaData[]; ts: number };
let cache: CacheEntry | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10 dakika

// Şehir koordinatları — TR büyükşehirler
const SEHIRLER: Array<{ sehir: string; lat: number; lon: number }> = [
  { sehir: 'Ankara', lat: 39.92, lon: 32.85 },
  { sehir: 'İstanbul', lat: 41.01, lon: 28.98 },
  { sehir: 'İzmir', lat: 38.42, lon: 27.14 },
  { sehir: 'Antalya', lat: 36.90, lon: 30.68 },
  { sehir: 'Bursa', lat: 40.18, lon: 29.06 },
  { sehir: 'Trabzon', lat: 41.00, lon: 39.73 },
  { sehir: 'Erzurum', lat: 39.90, lon: 41.27 },
  { sehir: 'Diyarbakır', lat: 37.91, lon: 40.23 },
  { sehir: 'Hatay', lat: 36.20, lon: 36.16 },
  { sehir: 'Konya', lat: 37.87, lon: 32.49 },
];

// WMO weather_code → ikon + Türkçe durum
function decodeWeather(code: number): { ikon: 'sun' | 'cloud' | 'rain' | 'snow'; durum: string } {
  if (code === 0) return { ikon: 'sun', durum: 'Açık' };
  if (code <= 3) return { ikon: 'cloud', durum: 'Az Bulutlu' };
  if (code <= 48) return { ikon: 'cloud', durum: 'Sisli' };
  if (code <= 57) return { ikon: 'rain', durum: 'Çisenti' };
  if (code <= 67) return { ikon: 'rain', durum: 'Yağmurlu' };
  if (code <= 77) return { ikon: 'snow', durum: 'Karlı' };
  if (code <= 82) return { ikon: 'rain', durum: 'Sağanak' };
  if (code <= 86) return { ikon: 'snow', durum: 'Kar Sağanağı' };
  if (code >= 95) return { ikon: 'rain', durum: 'Gök Gürülü' };
  return { ikon: 'cloud', durum: 'Bulutlu' };
}

async function fetchSehir(sehir: { sehir: string; lat: number; lon: number }): Promise<HavaData | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${sehir.lat}&longitude=${sehir.lon}&current=temperature_2m,weather_code&timezone=Europe/Istanbul`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TRGUNDEM/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const t = d?.current?.temperature_2m;
    const code = d?.current?.weather_code;
    if (typeof t === 'number' && typeof code === 'number') {
      const dec = decodeWeather(code);
      return { sehir: sehir.sehir, derece: Math.round(t), ikon: dec.ikon, durum: dec.durum };
    }
    return null;
  } catch (e) {
    console.error(`Hava ${sehir.sehir} hata:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchHava(): Promise<HavaData[]> {
  // Şehirleri paralel çek
  const results = await Promise.allSettled(SEHIRLER.map(fetchSehir));
  return results
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter((x): x is HavaData => x !== null);
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ ok: true, data: cache.data, cached: true });
  }

  const data = await fetchHava();

  if (data.length > 0) {
    cache = { data, ts: Date.now() };
    return NextResponse.json({ ok: true, data, cached: false });
  }

  // API hatası — cache varsa eski veriyi dön
  if (cache) {
    return NextResponse.json({ ok: true, data: cache.data, cached: true, stale: true });
  }

  return NextResponse.json({ ok: false, data: [], error: 'Hava verisi alınamadı' }, { status: 502 });
}
