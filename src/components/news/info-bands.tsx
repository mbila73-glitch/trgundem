'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Cloud, Sun, CloudRain, CloudSnow } from 'lucide-react';

// Hava durumu — Meteoroloji Genel Müdürlüğü (mgm.gov.tr)
// Sabit gösterilecek iller (Ankara, İstanbul, İzmir sırasıyla)
const HAVA_FIXED = [
  { sehir: 'Ankara', derece: 15, ikon: 'sun' },
  { sehir: 'İstanbul', derece: 18, ikon: 'cloud' },
  { sehir: 'İzmir', derece: 22, ikon: 'sun' },
];
// Kayan (dönen) iller
const HAVA_SCROLL = [
  { sehir: 'Antalya', derece: 25, ikon: 'sun' },
  { sehir: 'Bursa', derece: 19, ikon: 'cloud' },
  { sehir: 'Trabzon', derece: 16, ikon: 'rain' },
  { sehir: 'Erzurum', derece: 8, ikon: 'snow' },
  { sehir: 'Diyarbakır', derece: 21, ikon: 'sun' },
  { sehir: 'Hatay', derece: 24, ikon: 'cloud' },
  { sehir: 'Konya', derece: 14, ikon: 'sun' },
];

function WeatherIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'sun') return <Sun className={className} />;
  if (type === 'rain') return <CloudRain className={className} />;
  if (type === 'snow') return <CloudSnow className={className} />;
  return <Cloud className={className} />;
}

type FinansItem = { name: string; value: string; change: string; up: boolean };
type SonDakikaItem = { id: string; title: string };

// Stable inline style objects so React doesn't re-create them on each render.
// w-max + flex-shrink-0 ile parent'ı içeriğin doğal genişliğinde tutuyoruz,
// böylece translateX(-50%) animasyonu gerçek "ring" (sonsuz) döngü yapıyor.
const marqueeStyle = (duration: string): React.CSSProperties => ({
  animationName: 'bandScroll',
  animationDuration: duration,
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  willChange: 'transform',
});

// Finans'ta sabit tutulacak item'lar (BIST, USD, EUR, Gram Altın sırasıyla)
const FINANS_FIXED_NAMES = ['BIST 100', 'USD/TL', 'EUR/TL', 'GRAM ALTIN'];
const finansItemRender = (item: FinansItem, keyPrefix: string, i: number) => {
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
    <span key={`${keyPrefix}-${i}`} className="inline-flex flex-shrink-0 items-center gap-2 text-sm" title={sourceMap[item.name] || ''}>
      <span className="font-medium text-slate-300">{item.name}</span>
      <span className="font-bold text-white">{item.value}</span>
      {item.change !== '—' && (
        <span className={`inline-flex items-center gap-0.5 ${item.up ? 'text-emerald-400' : 'text-rose-400'}`}>
          {item.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {item.change}
        </span>
      )}
    </span>
  );
};

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
    let active = true;
    const loadFinans = () => {
      fetch('/api/finans')
        .then(async (r) => {
          const json = (await r.json()) as { ok: boolean; data?: FinansItem[]; source?: string };
          if (!active) return;
          if (json.ok && json.data && json.data.length > 0) {
            setFinans(json.data);
            if (json.source) setFinansSource(json.source.split('—')[0].trim());
          }
        })
        .catch(() => {});
    };
    loadFinans();
    // Her 10 saniyede bir yenile
    const interval = setInterval(loadFinans, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const openArticle = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('article', id);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  void finansSource;

  // Finans item'ları sabit ve kayan olarak ayır
  const finansFixed = FINANS_FIXED_NAMES
    .map(name => finans.find(f => f.name === name))
    .filter((f): f is FinansItem => Boolean(f));
  const finansScroll = finans.filter(f => !FINANS_FIXED_NAMES.includes(f.name));

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl">

        {/* 1. HAVA DURUMU — Ankara/İstanbul/İzmir sabit, diğerleri kayar (hız 22s, değişmedi) */}
        <div className="group flex items-center gap-2 overflow-hidden bg-blue-50 dark:bg-blue-950/30 px-4" style={{ minHeight: '32px' }}>
          <span className="flex-shrink-0 font-bold text-blue-700 dark:text-blue-300 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
            HAVA
          </span>

          {/* Sabit iller (Ankara, İstanbul, İzmir sırasıyla) */}
          <div className="flex flex-shrink-0 items-center gap-3 mr-3">
            {HAVA_FIXED.map((h, i) => (
              <span key={`fixed-${i}`} className="inline-flex items-center gap-1.5 text-sm" title="Kaynak: Meteoroloji Genel Müdürlüğü (mgm.gov.tr)">
                <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-foreground/80">{h.sehir}</span>
                <span className="font-bold text-foreground">{h.derece}°C</span>
              </span>
            ))}
          </div>

          <span className="flex-shrink-0 text-border mx-1">|</span>

          {/* Kayan diğer iller */}
          <div className="relative flex-1 overflow-hidden">
            <div
              className="flex w-max flex-shrink-0 items-center gap-6 whitespace-nowrap group-hover:[animation-play-state:paused]"
              style={marqueeStyle('22s')}
            >
              {HAVA_SCROLL.concat(HAVA_SCROLL).map((h, i) => (
                <span key={`scroll-${i}`} className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm" title="Kaynak: Meteoroloji Genel Müdürlüğü (mgm.gov.tr)">
                  <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-foreground/80">{h.sehir}</span>
                  <span className="font-bold text-foreground">{h.derece}°C</span>
                  <span className="mx-2 text-border">|</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 2. FİNANS — BIST/USD/EUR/Gram ALTIN sabit, diğerleri kayar (hız 24s, %20 yavaşlatıldı) */}
        {finans.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-slate-900 px-4" style={{ minHeight: '32px' }}>
            <span className="flex-shrink-0 font-bold text-amber-400 text-sm uppercase tracking-wide whitespace-nowrap mr-3">
              FİNANS
            </span>

            {/* Sabit finans item'ları (BIST, USD, EUR, GRAM ALTIN sırasıyla) */}
            {finansFixed.length > 0 && (
              <div className="flex flex-shrink-0 items-center gap-3 mr-3">
                {finansFixed.map((item, i) => finansItemRender(item, 'finans-fixed', i))}
              </div>
            )}

            <span className="flex-shrink-0 text-slate-700 mx-1">|</span>

            {/* Kayan diğer finans item'ları */}
            {finansScroll.length > 0 && (
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="flex w-max flex-shrink-0 items-center gap-8 whitespace-nowrap group-hover:[animation-play-state:paused]"
                  style={marqueeStyle('24s')}
                >
                  {finansScroll.concat(finansScroll).map((item, i) => (
                    <span key={`scroll-${i}`} className="inline-flex flex-shrink-0 items-center gap-2 text-sm">
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
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. SON DAKİKA — bariz kırmızı zemin, beyaz yazılar. Hız 36s (yarıya indirildi). */}
        {sonDakika.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-red-600 px-4" style={{ minHeight: '32px' }}>
            <span
              className="flex-shrink-0 whitespace-nowrap mr-3 text-white font-bold uppercase tracking-wider"
              style={{
                fontSize: '20px',
                lineHeight: '32px',
                display: 'inline-block',
              }}
            >
              ⚡ SON DAKİKA
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div
                className="flex w-max flex-shrink-0 gap-10 whitespace-nowrap text-white text-base tracking-wide group-hover:[animation-play-state:paused]"
                style={marqueeStyle('36s')}
              >
                {sonDakika.concat(sonDakika).map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openArticle(item.id)}
                    className="inline-block flex-shrink-0 font-semibold cursor-pointer hover:underline text-white"
                  >
                    {item.title}
                    <span className="mx-3 opacity-70">•</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Global style — keyframes global olmalı ki inline animation referansları çalışsın.
          pulseScale artık sadece site başlığında (page.tsx) kullanılıyor. */}
      <style jsx global>{`
        @keyframes bandScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulseScale {
          0%, 100% { transform: scale(0.85); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
