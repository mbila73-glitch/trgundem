'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Cloud, Sun, CloudRain, CloudSnow } from 'lucide-react';

// Hava durumu — Meteoroloji Genel Müdürlüğü (mgm.gov.tr)
const HAVA_DATA = [
  { sehir: 'İstanbul', derece: 18, durum: 'Parçalı Bulutlu', ikon: 'cloud' },
  { sehir: 'Ankara', derece: 15, durum: 'Açık', ikon: 'sun' },
  { sehir: 'İzmir', derece: 22, durum: 'Açık', ikon: 'sun' },
  { sehir: 'Antalya', derece: 25, durum: 'Güneşli', ikon: 'sun' },
  { sehir: 'Bursa', derece: 19, durum: 'Az Bulutlu', ikon: 'cloud' },
  { sehir: 'Trabzon', derece: 16, durum: 'Yağmurlu', ikon: 'rain' },
  { sehir: 'Erzurum', derece: 8, durum: 'Karla Karışık', ikon: 'snow' },
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

type FinansItem = { name: string; value: string; change: string; up: boolean };
type SonDakikaItem = { id: string; title: string };

export function InfoBands() {
  const [sonDakika, setSonDakika] = useState<SonDakikaItem[]>([]);
  const [finans, setFinans] = useState<FinansItem[]>([]);
  const [finansSource, setFinansSource] = useState('TCMB');

  useEffect(() => {
    fetch('/api/published-articles?layout=all&status=published')
      .then(async (r) => {
        if (!r.ok) return;
        const json = (await r.json()) as { articles: Array<{ id: string; aiTitle: string }> };
        setSonDakika((json.articles ?? []).map(a => ({ id: a.id, title: a.aiTitle })).slice(0, 10));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/finans')
      .then(async (r) => {
        const json = (await r.json()) as { ok: boolean; data?: FinansItem[]; source?: string };
        if (json.ok && json.data && json.data.length > 0) {
          setFinans(json.data);
          if (json.source) setFinansSource(json.source.split('—')[0].trim());
        }
      })
      .catch(() => {});
  }, []);

  const openArticle = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('article', id);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl">

        {/* 1. HAVA DURUMU */}
        <div className="group flex items-center gap-2 overflow-hidden bg-blue-50 dark:bg-blue-950/30 px-4" style={{ minHeight: '32px' }}>
          <span className="flex-shrink-0 font-bold text-blue-700 dark:text-blue-300 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
            HAVA
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="flex items-center gap-6 whitespace-nowrap group-hover:[animation-play-state:paused] animate-[scroll_11s_linear_infinite]">
              {HAVA_DATA.concat(HAVA_DATA).map((h, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-sm" title="Kaynak: Meteoroloji Genel Müdürlüğü (mgm.gov.tr)">
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

        {/* 2. FİNANS */}
        {finans.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-slate-900 px-4" style={{ minHeight: '32px' }}>
            <span className="flex-shrink-0 font-bold text-amber-400 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
              FİNANS
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="flex items-center gap-8 whitespace-nowrap group-hover:[animation-play-state:paused] animate-[scroll_10s_linear_infinite]">
                {finans.concat(finans).map((item, i) => {
                  const sourceMap: Record<string, string> = {
                    'BIST 100': 'Kaynak: Borsa İstanbul (borsaistanbul.com)',
                    'USD/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
                    'EUR/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
                    'GBP/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
                    'CHF/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
                    '100 JPY/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
                    'ONS ALTIN': 'Kaynak: Yahoo Finance (finance.yahoo.com)',
                    'GRAM ALTIN': 'Hesaplanan: (Ons Altın × USD/TL) / 31,1035',
                  };
                  return (
                  <span key={i} className="inline-flex items-center gap-2 text-sm" title={sourceMap[item.name] || ''}>
                    <span className="font-medium text-slate-300">{item.name}</span>
                    <span className="font-bold text-white">{item.value}</span>
                    {item.change !== '—' && (
                      <span className={`inline-flex items-center gap-0.5 ${item.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {item.change}
                      </span>
                    )}
                    <span className="mx-2 text-slate-700">|</span>
                  </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. SON DAKİKA */}
        {sonDakika.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-destructive px-4" style={{ minHeight: '32px' }}>
            <span className="flex-shrink-0 font-bold text-destructive-foreground text-base uppercase tracking-wider whitespace-nowrap mr-3">
              ⚡ SON DAKİKA
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="flex gap-10 whitespace-nowrap group-hover:[animation-play-state:paused] animate-[scroll_9s_linear_infinite] text-destructive-foreground text-base tracking-wide">
                {sonDakika.concat(sonDakika).map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openArticle(item.id)}
                    className="inline-block font-semibold cursor-pointer hover:underline"
                  >
                    {item.title}
                    <span className="mx-3 opacity-50">•</span>
                  </button>
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
