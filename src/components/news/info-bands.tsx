'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Cloud, Sun, CloudRain, AlertCircle } from 'lucide-react';

// Static finans verileri (gerçek API ile güncellenebilir)
const FINANS_DATA = [
  { name: 'BIST 100', value: '9.847,32', change: '+1,24%', up: true },
  { name: 'USD/TL', value: '34,25', change: '+0,18%', up: true },
  { name: 'EUR/TL', value: '37,12', change: '-0,32%', up: false },
  { name: 'GBP/TL', value: '44,08', change: '+0,05%', up: true },
  { name: 'ALTIN', value: '2.451', change: '+0,87%', up: true },
  { name: 'BRENT', value: '71,85', change: '-1,12%', up: false },
  { name: 'BTC', value: '$62.450', change: '+2,14%', up: true },
];

// Static hava durumu verileri
const HAVA_DATA = [
  { sehir: 'İstanbul', derece: 18, durum: 'Parçalı Bulutlu', ikon: 'cloud' },
  { sehir: 'Ankara', derece: 15, durum: 'Açık', ikon: 'sun' },
  { sehir: 'İzmir', derece: 22, durum: 'Açık', ikon: 'sun' },
  { sehir: 'Antalya', derece: 25, durum: 'Güneşli', ikon: 'sun' },
  { sehir: 'Bursa', derece: 19, durum: 'Az Bulutlu', ikon: 'cloud' },
  { sehir: 'Trabzon', derece: 16, durum: 'Yağmurlu', ikon: 'rain' },
];

function WeatherIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'sun') return <Sun className={className} />;
  if (type === 'rain') return <CloudRain className={className} />;
  return <Cloud className={className} />;
}

export function InfoBands() {
  const [sonDakika, setSonDakika] = useState<string[]>([]);

  // Son dakika için yayındaki haber başlıklarını çek
  useEffect(() => {
    fetch('/api/published-articles?layout=all&status=published')
      .then(async (r) => {
        if (!r.ok) return;
        const json = (await r.json()) as { articles: Array<{ aiTitle: string }> };
        const titles = (json.articles ?? []).map(a => a.aiTitle).slice(0, 10);
        setSonDakika(titles);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="border-b border-border bg-card">
      {/* Son Dakika Bandı */}
      {sonDakika.length > 0 && (
        <div className="flex items-center gap-2 overflow-hidden bg-destructive px-4 py-1.5">
          <span className="flex-shrink-0 font-bold text-destructive-foreground text-xs uppercase tracking-wide whitespace-nowrap">
            ⚡ SON DAKİKA
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="flex gap-8 whitespace-nowrap animate-[scroll_40s_linear_infinite] text-destructive-foreground text-xs">
              {sonDakika.concat(sonDakika).map((title, i) => (
                <span key={i} className="inline-block">
                  {title} <span className="mx-2 opacity-50">•</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Finans Bandı */}
      <div className="flex items-center gap-1 overflow-x-auto bg-muted/50 px-4 py-1.5 scrollbar-none">
        {FINANS_DATA.map((item, i) => (
          <div key={i} className="flex flex-shrink-0 items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground/70">{item.name}</span>
            <span className="font-bold text-foreground">{item.value}</span>
            <span className={`inline-flex items-center gap-0.5 ${item.up ? 'text-emerald-600' : 'text-rose-600'}`}>
              {item.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {item.change}
            </span>
            {i < FINANS_DATA.length - 1 && <span className="mx-1 text-border">|</span>}
          </div>
        ))}
      </div>

      {/* Hava Durumu Bandı */}
      <div className="flex items-center gap-1 overflow-x-auto bg-muted/30 px-4 py-1 scrollbar-none">
        <span className="flex-shrink-0 font-medium text-xs text-muted-foreground mr-2">HAVA</span>
        {HAVA_DATA.map((h, i) => (
          <div key={i} className="flex flex-shrink-0 items-center gap-1 text-xs">
            <WeatherIcon type={h.ikon} className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{h.sehir}</span>
            <span className="font-bold text-foreground">{h.derece}°</span>
            {i < HAVA_DATA.length - 1 && <span className="mx-1 text-border">|</span>}
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
