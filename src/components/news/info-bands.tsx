'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowUp, ArrowDown, Cloud, Sun, CloudRain, CloudSnow } from 'lucide-react';

// Hava durumu — Open-Meteo (open-meteo.com)
// İlk hardcoded değerler — API gelince değişir
type HavaItem = { sehir: string; derece: number; ikon: 'sun' | 'cloud' | 'rain' | 'snow' };
const HAVA_FIXED_INIT: HavaItem[] = [
  { sehir: 'Ankara', derece: 15, ikon: 'sun' },
  { sehir: 'İstanbul', derece: 18, ikon: 'cloud' },
  { sehir: 'İzmir', derece: 22, ikon: 'sun' },
];
const HAVA_SCROLL_INIT: HavaItem[] = [
  { sehir: 'Antalya', derece: 25, ikon: 'sun' },
  { sehir: 'Bursa', derece: 19, ikon: 'cloud' },
  { sehir: 'Trabzon', derece: 16, ikon: 'rain' },
  { sehir: 'Erzurum', derece: 8, ikon: 'snow' },
  { sehir: 'Diyarbakır', derece: 21, ikon: 'sun' },
  { sehir: 'Hatay', derece: 24, ikon: 'cloud' },
  { sehir: 'Konya', derece: 14, ikon: 'sun' },
];
const HAVA_FIXED_SEHIRLER = ['Ankara', 'İstanbul', 'İzmir'];

function WeatherIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'sun') return <Sun className={className} />;
  if (type === 'rain') return <CloudRain className={className} />;
  if (type === 'snow') return <CloudSnow className={className} />;
  return <Cloud className={className} />;
}

type FinansItem = { name: string; value: string; change: string; up: boolean; source?: 'H' | 'M' };
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
// User: "gram altını da GR ALTIN olarak kısalt"
const FINANS_FIXED_NAMES = ['BIST 100', 'USD/TL', 'EUR/TL', 'GR ALTIN'];

// User: "site hata verdi: Application error: a client-side exception"
// HATA SEBEBİ: sourceMap finansItemRender fonksiyonu İÇİNDE tanımlıydı,
//              ama scroll finans bölümleri (inline JSX) dışarıdan erişiyordu → ReferenceError → crash
// ÇÖZÜM: getFinansTooltip fonksiyonunu modül seviyesine taşı — her yerden erişilebilir
function getFinansTooltip(item: FinansItem): string {
  const staticMap: Record<string, string> = {
    'BIST 100': 'Kaynak: Borsa İstanbul (borsaistanbul.com)',
    'USD/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
    'EUR/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
    'GBP/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
    'CHF/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
    '100 JPY/TL': 'Kaynak: Türkiye Cumhuriyet Merkez Bankası (tcmb.gov.tr)',
    'ONS ALTIN': 'Kaynak: Yahoo Finance (finance.yahoo.com)',
  };
  if (item.name === 'GR ALTIN') {
    return item.source === 'H'
      ? 'Kaynak: Harem Altın (haremaltin.com) — külçe satış fiyatı, her 5 dakikada bir güncellenir. (H) = Harem Altın, (M) = Merkez Bankası'
      : 'Kaynak: Hesaplanan (Ons Altın × USD/TL) — Harem Altın verisi yok. (H) = Harem Altın, (M) = Merkez Bankası';
  }
  return staticMap[item.name] || '';
}

const finansItemRender = (item: FinansItem, keyPrefix: string, i: number) => {
  // User: "gr altın üzerine gelince kaynak açıklaması çıkmasın. m ve h harflerine dokunma. h harfini mavi yap."
  const showSourceLabel = item.name === 'GR ALTIN' && item.source;
  return (
    <span key={`${keyPrefix}-${i}`} className="inline-flex flex-shrink-0 items-center gap-2 text-sm">
      <span className="font-medium text-slate-300">{item.name}</span>
      <span className="font-bold text-white">{item.value}</span>
      {showSourceLabel && (
        <span className={`text-[10px] font-bold ${item.source === 'H' ? 'text-blue-400' : 'text-amber-300'}`}>({item.source})</span>
      )}
      <span className={item.up ? 'text-emerald-400' : 'text-rose-400'}>
        {item.up ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </span>
    </span>
  );
};

export function InfoBands({ cacheMode = false }: { cacheMode?: boolean }) {
  const [sonDakika, setSonDakika] = useState<SonDakikaItem[]>([]);
  const [finans, setFinans] = useState<FinansItem[]>([]);
  const [finansSource, setFinansSource] = useState('TCMB');
  const [havaFixed, setHavaFixed] = useState<HavaItem[]>(HAVA_FIXED_INIT);
  const [havaScroll, setHavaScroll] = useState<HavaItem[]>(HAVA_SCROLL_INIT);

  // User: "kayan 20 li pencerede 7. habere basıp geri geldiğimizde 7. haber olsun"
  // localStorage'dan son tıklanan haber index'ini oku — geri dönünce o habere scroll et
  const [lastClickedIndex, setLastClickedIndex] = useState<number>(-1);

  // Auto-scroll için pause flag — scrollSondakika'dan ÖNCE tanımlanmalı (hoisting)
  const scrollPausedRef = useRef(false);

  // User: "3 saniye aralıklarla sonraki habere geçip loop yapsın"
  // direction: 1 = ileri (sağ), -1 = geri (sol)
  const scrollSondakika = (direction: number) => {
    const container = document.getElementById('sondakika-scroll');
    if (!container) return;
    const itemWidth = 250;
    const halfWidth = container.scrollWidth / 2;

    // Auto-scroll'u 2 sn durdur
    scrollPausedRef.current = true;
    setTimeout(() => { scrollPausedRef.current = false; }, 2000);

    // Tüm scroll'lar INSTANT (behavior: auto) — smooth yok
    if (direction > 0) {
      // SAĞ (ileri)
      if (container.scrollLeft + itemWidth >= halfWidth) {
        // 20 → 1: halfWidth'i geç → başa sıfırla + kalan
        container.scrollTo({ left: (container.scrollLeft + itemWidth) - halfWidth, behavior: 'auto' });
      } else {
        container.scrollTo({ left: container.scrollLeft + itemWidth, behavior: 'auto' });
      }
    } else {
      // SOL (geri)
      if (container.scrollLeft - itemWidth < 0) {
        // 1 → 20: 0'ın altına → halfWidth'e sıfırla - kalan
        container.scrollTo({ left: halfWidth - (itemWidth - container.scrollLeft), behavior: 'auto' });
      } else {
        container.scrollTo({ left: container.scrollLeft - itemWidth, behavior: 'auto' });
      }
    }
  };

  // Mount'ta localStorage'dan index oku
  useEffect(() => {
    try {
      const idx = parseInt(localStorage.getItem('trgundem_last_clicked_index') || '-1', 10);
      if (!isNaN(idx) && idx >= 0) {
        setLastClickedIndex(idx);
      }
    } catch {}
  }, []);

  // İNCE KIRMIZI KAYAN BANT — sürekli kayar (CSS animation), 3 sn yok
  // Hava/finans bandı gibi marquee ile sürekli akar, 20→1 loop
  useEffect(() => {
    if (sonDakika.length === 0) return;
    const container = document.getElementById('sondakika-scroll');
    if (!container) return;

    let paused = false;
    const onHover = () => { paused = true; };
    const onLeave = () => { paused = false; };
    container.addEventListener('mouseenter', onHover);
    container.addEventListener('mouseleave', onLeave);

    // İlk yüklemede: tıklanan index'e scroll
    setTimeout(() => {
      if (lastClickedIndex >= 0) {
        const buttons = container.querySelectorAll('button[data-index]');
        if (buttons[lastClickedIndex]) {
          (buttons[lastClickedIndex] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }, 200);

    // Sürekli kayma — requestAnimationFrame ile scrollLeft += 1.8
    // User: "kayan haber bandını yüzde 20 hızlandır" — 1.5 → 1.8
    let raf: number;
    const tick = () => {
      if (!paused && !scrollPausedRef.current) {
        container.scrollLeft += 1.8;
        const halfWidth = container.scrollWidth / 2;
        if (container.scrollLeft >= halfWidth) {
          container.scrollLeft -= halfWidth;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    setTimeout(() => { raf = requestAnimationFrame(tick); }, 2000);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('mouseenter', onHover);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [sonDakika, lastClickedIndex]);

  // Son dakika haberleri — HER ZAMAN API'den çek (cacheMode fark etmez)
  // User: "kayan bantta 4 haber var ve loop yapmıyor"
  // Sebep: cacheMode=true localStorage'dan okuyordu, orada eski/az veri vardı
  // Çözüm: Her zaman API'den çek — 20 haber garanti
  useEffect(() => {
    const loadArticles = () => {
      fetch('/api/published-articles?layout=all&status=published')
        .then(async (r) => {
          if (!r.ok) return;
          const json = (await r.json()) as { articles: Array<{ id: string; aiTitle: string }> };
          setSonDakika((json.articles ?? []).map(a => ({ id: a.id, title: a.aiTitle })).slice(0, 20));
        })
        .catch(() => {});
    };
    loadArticles();
    // 60 saniyede bir güncelle
    const interval = setInterval(loadArticles, 60000);
    return () => clearInterval(interval);
  }, []);

  // Hava durumu — 10 dakikada bir polling
  useEffect(() => {
    let active = true;
    const loadHava = () => {
      fetch('/api/hava-durumu')
        .then(async (r) => {
          if (!r.ok) return;
          const json = (await r.json()) as { ok: boolean; data?: HavaItem[] };
          if (!active) return;
          if (json.ok && json.data && json.data.length > 0) {
            const fixed = HAVA_FIXED_SEHIRLER
              .map(sehir => json.data!.find(h => h.sehir === sehir))
              .filter((h): h is HavaItem => Boolean(h));
            const scroll = json.data.filter(h => !HAVA_FIXED_SEHIRLER.includes(h.sehir));
            if (fixed.length > 0) setHavaFixed(fixed);
            if (scroll.length > 0) setHavaScroll(scroll);
          }
        })
        .catch(() => {});
    };
    loadHava();
    const interval = setInterval(loadHava, 10 * 60 * 1000); // 10 dakika
    return () => {
      active = false;
      clearInterval(interval);
    };
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

  const openArticle = (id: string, index: number) => {
    // User: "ana sayfadaki 20 lik kayan penceredeki bir habere basıp okuyup geri dönünce
    //        ilk habere dönüyor pencere. bu olmasın, hangi habere basıp okuduysam geri döndüğümde
    //        o haber aşık olsun."
    // Tıklanan haberin ID + index'ini localStorage'a kaydet — geri dönünce buraya scroll edebilmek için
    try {
      localStorage.setItem('trgundem_last_clicked_article', id);
      localStorage.setItem('trgundem_last_clicked_index', String(index));
      localStorage.setItem('trgundem_son_dakika_list', JSON.stringify(sonDakika.map(s => ({ id: s.id, title: s.title }))));
    } catch {}
    const url = new URL(window.location.href);
    const param = window.location.pathname === '/veri' ? 'article' : 'haber';
    url.searchParams.set(param, id);
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
  // Mobilde sabit blok gizli → tüm finans verisi kayan blokta aksın
  const finansAllScroll = finansFixed.concat(finansScroll);
  // Mobilde sabit hava bloğu gizli → tüm hava verisi kayan blokta aksın
  const havaAllScroll = havaFixed.concat(havaScroll);

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl">

        {/* 1. HAVA DURUMU — Ank/İst/İzm sabit, diğerleri kayar (mobilde tümü akar) */}
        <div className="group flex items-center gap-2 overflow-hidden bg-blue-50 dark:bg-blue-950/30 px-3 sm:px-4" style={{ minHeight: '32px' }}>
          <span className="hidden sm:flex-shrink-0 sm:inline font-bold text-blue-700 dark:text-blue-300 text-sm uppercase tracking-wide whitespace-nowrap sm:mr-3">
            HAVA
          </span>

          {/* Sabit iller — mobilde gizli */}
          <div className="hidden sm:flex flex-shrink-0 items-center gap-3 mr-3">
            {havaFixed.map((h, i) => (
              <span key={`fixed-${i}`} className="inline-flex items-center gap-1.5 text-sm" title="Kaynak: Open-Meteo (open-meteo.com)">
                <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-foreground/80">{h.sehir}</span>
                <span className="font-bold text-foreground">{h.derece}°C</span>
              </span>
            ))}
          </div>

          <span className="hidden sm:inline flex-shrink-0 text-border mx-1">|</span>

          {/* Kayan iller — mobil: tümü, masaüstü: sadece diğerleri */}
          <div className="relative flex-1 overflow-hidden">
            <div
              className="flex w-max flex-shrink-0 items-center gap-6 whitespace-nowrap group-hover:[animation-play-state:paused]"
              style={marqueeStyle('22s')}
            >
              {/* Masaüstü (sm+): sadece scroll iller */}
              <span className="hidden sm:contents">
                {havaScroll.concat(havaScroll).map((h, i) => (
                  <span key={`scroll-d-${i}`} className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm" title="Kaynak: Open-Meteo (open-meteo.com)">
                    <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-foreground/80">{h.sehir}</span>
                    <span className="font-bold text-foreground">{h.derece}°C</span>
                    <span className="mx-2 text-border">|</span>
                  </span>
                ))}
              </span>
              {/* Mobil (<sm): tüm iller (sabit + scroll) */}
              <span className="sm:hidden contents">
                {havaAllScroll.concat(havaAllScroll).map((h, i) => (
                  <span key={`scroll-m-${i}`} className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm" title="Kaynak: Open-Meteo (open-meteo.com)">
                    <WeatherIcon type={h.ikon} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-foreground/80">{h.sehir}</span>
                    <span className="font-bold text-foreground">{h.derece}°C</span>
                    <span className="mx-2 text-border">|</span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        {/* 2. FİNANS — BIST/USD/EUR/Gram ALTIN sabit, diğerleri kayar (mobilde tümü akar) */}
        {finans.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-slate-900 px-3 sm:px-4" style={{ minHeight: '32px' }}>
            <span className="hidden sm:inline flex-shrink-0 font-bold text-amber-400 text-sm uppercase tracking-wide whitespace-nowrap sm:mr-3">
              FİNANS
            </span>

            {/* Sabit finans — mobilde gizli */}
            {finansFixed.length > 0 && (
              <div className="hidden sm:flex flex-shrink-0 items-center gap-3 mr-3">
                {finansFixed.map((item, i) => finansItemRender(item, 'finans-fixed', i))}
              </div>
            )}

            <span className="hidden sm:inline flex-shrink-0 text-slate-700 mx-1">|</span>

            {/* Kayan finans — mobil: tümü, masaüstü: sadece diğerleri */}
            <div className="relative flex-1 overflow-hidden">
              <div
                className="flex w-max flex-shrink-0 items-center gap-8 whitespace-nowrap group-hover:[animation-play-state:paused]"
                style={marqueeStyle('24s')}
              >
                {/* Masaüstü (sm+): sadece scroll finans */}
                <span className="hidden sm:contents">
                  {finansScroll.concat(finansScroll).map((item, i) => (
                    <span key={`fscroll-d-${i}`} className="inline-flex flex-shrink-0 items-center gap-2 text-sm">
                      <span className="font-medium text-slate-300">{item.name}</span>
                      <span className="font-bold text-white">{item.value}</span>
                      {item.name === 'GR ALTIN' && item.source && (
                        <span className={`text-[10px] font-bold ${item.source === 'H' ? 'text-blue-400' : 'text-amber-300'}`}>({item.source})</span>
                      )}
                      <span className={item.up ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.up ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      </span>
                      <span className="mx-2 text-slate-700">|</span>
                    </span>
                  ))}
                </span>
                {/* Mobil (<sm): tüm finans (sabit + scroll) */}
                <span className="sm:hidden contents">
                  {finansAllScroll.concat(finansAllScroll).map((item, i) => (
                    <span key={`fscroll-m-${i}`} className="inline-flex flex-shrink-0 items-center gap-2 text-sm">
                      <span className="font-medium text-slate-300">{item.name}</span>
                      <span className="font-bold text-white">{item.value}</span>
                      {item.name === 'GR ALTIN' && item.source && (
                        <span className={`text-[10px] font-bold ${item.source === 'H' ? 'text-blue-400' : 'text-amber-300'}`}>({item.source})</span>
                      )}
                      <span className={item.up ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.up ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      </span>
                      <span className="mx-2 text-slate-700">|</span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 3. SON DAKİKA — hava/finans bandı gibi CSS animation ile sürekli kayar */}
        {/* User: "diğer bantlar gibi loop yapmıyor geri sarıyor" — JS scrollLeft yerine CSS marquee */}
        {sonDakika.length > 0 && (
          <div className="group flex items-center gap-2 overflow-hidden bg-red-600 px-3 sm:px-4" style={{ minHeight: '32px' }}>
            <div className="relative flex-1 overflow-hidden">
              <div
                className="flex w-max flex-shrink-0 gap-10 whitespace-nowrap text-white text-sm sm:text-base tracking-wide group-hover:[animation-play-state:paused]"
                style={marqueeStyle('66s')}
              >
                {/* 2x render — translateX(-50%) ile sonsuz loop */}
                {sonDakika.concat(sonDakika).map((item, i) => {
                  const realIndex = i % sonDakika.length;
                  return (
                    <button
                      key={`sd-${i}`}
                      type="button"
                      onClick={() => openArticle(item.id, realIndex)}
                      className="inline-block flex-shrink-0 font-semibold cursor-pointer hover:underline text-white"
                    >
                      {item.title}
                      <span className="mx-3 opacity-70">•</span>
                    </button>
                  );
                })}
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
