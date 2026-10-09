import { formatDistanceToNow, format } from 'date-fns';
import { tr } from 'date-fns/locale';

export function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'd MMM yyyy HH:mm', { locale: tr });
}

export function shortDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'd MMM yyyy', { locale: tr });
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'd MMM yyyy HH:mm', { locale: tr });
}

export function truncate(text: string | null | undefined, max = 220): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 40 ? lastSpace : max - 1)}…`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const CATEGORY_COLORS: Record<string, string> = {
  'Güncel': 'bg-sky-500 text-white shadow-sm',
  'Kamu / Resmi': 'bg-blue-700 text-white shadow-sm',
  'Ekonomi / Finans': 'bg-cyan-600 text-white shadow-sm',
  'Spor / Magazin': 'bg-indigo-600 text-white shadow-sm',
  'Bilim / Teknoloji': 'bg-teal-600 text-white shadow-sm',
  'Kültür / Sanat': 'bg-sky-700 text-white shadow-sm',
  'Özel': 'bg-blue-800 text-white shadow-sm',
};

const FALLBACK_COLORS = [
  'bg-sky-500 text-white shadow-sm',
  'bg-blue-700 text-white shadow-sm',
  'bg-cyan-600 text-white shadow-sm',
  'bg-indigo-600 text-white shadow-sm',
  'bg-teal-600 text-white shadow-sm',
  'bg-sky-700 text-white shadow-sm',
];

export function colorForName(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

// Kategori kısa adı (S, E, K, Sp, B, Kü, Ö) — veri sayfasında kaynak sayısı ile birlikte gösterilir
// "S3" = Siyaset, 3 kaynak — "E2" = Ekonomi, 2 kaynak — "Sp4" = Spor/Magazin, 4 kaynak
const CATEGORY_INITIALS: Record<string, string> = {
  'Siyaset': 'S',
  'Ekonomi / Finans': 'E',
  'Kamu / Resmi': 'K',
  'Spor / Magazin': 'Sp',
  'Bilim / Teknoloji': 'B',
  'Kültür / Sanat': 'Kü',
  'Özel': 'Ö',
};

export function categoryInitial(cat: string | null | undefined): string {
  if (!cat) return '?';
  if (CATEGORY_INITIALS[cat]) return CATEGORY_INITIALS[cat];
  // Bilinmeyen kategori — ilk kelimenin ilk harfi
  const parts = cat.trim().split(/\s+/);
  return parts.length > 0 && parts[0].length > 0 ? parts[0][0].toUpperCase() : '?';
}

// Kategori kısa adı + kaynak sayısı — "S3" "E2" "Sp4" "Ö" formatında
// Özel haber sourceCount=999 → "Ö" (sayı gösterme)
export function categoryBadgeText(cat: string | null | undefined, sourceCount: number | null | undefined): string {
  const initial = categoryInitial(cat);
  // 999 (Özel haber) veya 0/null — sadece harf
  if (!sourceCount || sourceCount >= 999 || sourceCount <= 0) return initial;
  return `${initial}${sourceCount}`;
}

export function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Tarih + saat formatı — kısa (5 Eki 22:41)
export function dateTimeShort(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

// Tarih + saat formatı — uzun (5 Ekim 2026 22:41)
export function dateTimeLong(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

// Görsel URL'lerini kendi sunucumuz üzerinden proxy et
// F12'de orijinal kaynak URL görünmesin, trgundem.net üzerinden serve edilsin
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Yerel görseller (/uploads/, /logo_TRG.jpg) — proxy'siz direkt
  if (url.startsWith('/')) return url;
  // Dış URL — proxy et
  return `/api/img?url=${encodeURIComponent(url)}`;
}

// Türkçe karakter normalize — büyük/küçük harf duyarsız arama için
// JavaScript'in toLowerCase() Türkçe karakterleri (İ, ı, Ş, ş, vb.) doğru dönüştürmez
// İspanya → ispanya, Kılıçdaroğlu → kilicdaroglu, Şırnak → sirnak
export function normalizeTr(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ö/g, 'o')
    // Türkçe küçük harfleri de Latin karşılıklarına çevir (ı→i, ş→s, vb.)
    // Böylece arama "İ" ile "i", "I" ile "ı" birbirine karışmaz
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .trim();
}

// Haber başlığını dosya adı slug'ına çevir — SEO friendly
// "Ali Emre Ballı intihar etmiş" → "ali-emre-balli-intihar-etmis"
// Türkçe karakterler normalize edilir, alfanumerik olmayanlar "-" olur
export function slugify(s: string | null | undefined, maxLen: number = 50): string {
  if (!s) return '';
  return normalizeTr(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLen)
    .replace(/-+$/, '');
}

// === GİZLİLİK — Public API'lerden kaynak sızıntısını önle ===
// User: 'rss çekip özet çıkardığımız ya da farklı kaynaklardan görsel/haber çektiğimiz belli olmasın'
//
// Public API'lerde sızdırılmaması gereken alanlar:
//   - sourceArticleIds (CUID'ler — kaynak makale ID'leri)
//   - source.id, source.name (RSS kaynak bilgileri)
//
// imageUrl proxy'e çevrilir (frontend zaten proxyImageUrl kullanıyor ama API de yapsın):
//   - https://www.donanimhaber.com/... → /api/img?url=https%3A%2F%2F...
//   - /uploads/... → koru (kendi görselimiz)
//   - null/empty → null bırak

// Tek makale sanitize — sourceArticleIds ve source alanlarını kaldır, imageUrl'yi proxy'ye çevir
export function sanitizeArticle<T extends Record<string, any>>(a: T | null): Omit<T, 'sourceArticleIds' | 'source'> | null {
  if (!a) return null;
  // Gereksiz alanları çıkar (delete yerine spread)
  const { sourceArticleIds, source, ...publicFields } = a;
  // imageUrl proxy — dış kaynak URL'leri gizle
  const result = publicFields as any;
  if (result.imageUrl && typeof result.imageUrl === 'string' && result.imageUrl.startsWith('http')) {
    result.imageUrl = `/api/img?url=${encodeURIComponent(result.imageUrl)}`;
  }
  return result;
}

// Array sanitize — birden fazla makale
export function sanitizeArticles<T extends Record<string, any>>(articles: (T | null)[]): Array<Omit<T, 'sourceArticleIds' | 'source'> | null> {
  return articles.map(a => sanitizeArticle(a));
}

