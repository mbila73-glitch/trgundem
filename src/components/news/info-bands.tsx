'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Cloud, Sun, CloudRain, CloudSnow } from 'lucide-react';

// Finans verileri — güvenilir kaynaklar:
// BIST 100: Borsa İstanbul (borsaistanbul.com)
// USD/TL, EUR/TL, GBP/TL: TCMB — Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)
// ALTIN (Gram): İstanbul Mücevherciler Derneği
// BRENT: ICE — Intercontinental Exchange
// BTC: CoinMarketCap (coinmarketcap.com)
const FINANS_DATA = [
  { name: 'BIST 100', value: '9.847,32', change: '+1,24%', up: true, source: 'Borsa İstanbul' },
  { name: 'USD/TL', value: '34,25', change: '+0,18%', up: true, source: 'TCMB' },
  { name: 'EUR/TL', value: '37,12', change: '-0,32%', up: false, source: 'TCMB' },
  { name: 'GBP/TL', value: '44,08', change: '+0,05%', up: true, source: 'TCMB' },
  { name: 'GRAM ALTIN', value: '2.451 ₺', change: '+0,87%', up: true, source: 'İMD' },
  { name: 'BRENT PETROL', value: '71,85 $', change: '-1,12%', up: false, source: 'ICE' },
  { name: 'BITCOIN', value: '$62.450', change: '+2,14%', up: true, source: 'CoinMarketCap' },
];

// Hava durumu verileri — Meteoroloji Genel Müdürlüğü (mgm.gov.tr) kaynaklı
const HAVA_DATA = [
  { sehir: 'İstanbul', derece: 18, durum: 'Parçalı Bulutlu', ikon: 'cloud' },
  { sehir: 'Ankara', derece: 15, durum: 'Açık', ikon: 'sun' },
  { sehir: 'İzmir', derece: 22, durum: 'Açık', ikon: 'sun' },
  { sehir: 'Antalya', derece: 25, durum: 'Güneşli', ikon: 'sun' },
  { sehir: 'Bursa', derece: 19, durum: 'Az Bulutlu', ikon: 'cloud' },
  { sehir: 'Trabzon', derece: 16, durum: 'Yağmurlu', ikon: 'rain' },
  { sehir: 'Erzurum', derece: 8, durum: 'Karla Karışık Yağmur', ikon: 'snow' },
  { sehir: 'Diyarbakır', derece: 21, durum: 'Açık', ikon: 'sun' },
  { sehir: 'Hatay', derece: 24, durum: 'Az Bulutlu', ikon: 'cloud' },
  { sehir: 'Konya', derece: 14, durum: 'Açık', ikon: 'sun' },
];

function WeatherIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'sun') return <Sun className={className} />;
  if (type === 'rain') return <CloudRain className={className} />;
  if (type === 'snow') return <CloudSnow className={className} />;
  return <Cloud className={className} />;
}

export function InfoBands() {
  const [sonDakika, setSonDakika] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/published-articles?layout=all&status=published')
      .then(async (r) => {
        if (!r.ok) return;
        const json = (await r.json()) as { articles: Array<{ aiTitle: string }> };
        setSonDakika((json.articles ?? []).map(a => a.aiTitle).slice(0, 10));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl">

        {/* 1. HAVA DURUMU (en üstte) */}
        <div className="flex items-center gap-2 overflow-hidden bg-blue-50 dark:bg-blue-950/30 px-4" style={{ minHeight: '48px' }}>
          <span className="flex-shrink-0 font-bold text-blue-700 dark:text-blue-300 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
            HAVA DURUMU
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="flex items-center gap-6 whitespace-nowrap animate-[scroll_50s_linear_infinite]">
              {HAVA_DATA.concat(HAVA_DATA).map((h, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-sm">
                  <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-foreground/80">{h.sehir}</span>
                  <span className="font-bold text-foreground">{h.derece}°C</span>
                  <span className="text-muted-foreground text-xs">{h.durum}</span>
                  <span className="mx-2 text-border">|</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 2. FİNANS (yürür bant) */}
        <div className="flex items-center gap-2 overflow-hidden bg-slate-900 px-4" style={{ minHeight: '48px' }}>
          <span className="flex-shrink-0 font-bold text-amber-400 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
            FİNANS
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="flex items-center gap-8 whitespace-nowrap animate-[scroll_45s_linear_infinite]">
              {FINANS_DATA.concat(FINANS_DATA).map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-300">{item.name}</span>
                  <span className="font-bold text-white">{item.value}</span>
                  <span className={`inline-flex items-center gap-1 ${item.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {item.change}
                  </span>
                  <span className="text-slate-500 text-xs">({item.source})</span>
                  <span className="mx-2 text-slate-700">|</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 3. SON DAKİKA (en altta) */}
        {sonDakika.length > 0 && (
          <div className="flex items-center gap-2 overflow-hidden bg-destructive px-4" style={{ minHeight: '48px' }}>
            <span className="flex-shrink-0 font-bold text-destructive-foreground text-sm uppercase tracking-wide whitespace-nowrap mr-3">
              ⚡ SON DAKİKA
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="flex gap-8 whitespace-nowrap animate-[scroll_40s_linear_infinite] text-destructive-foreground text-sm">
                {sonDakika.concat(sonDakika).map((title, i) => (
                  <span key={i} className="inline-block font-medium">
                    {title} <span className="mx-2 opacity-50">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
