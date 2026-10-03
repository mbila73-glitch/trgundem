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
  'Güncel': 'bg-blue-600 text-white',
  'Kamu / Resmi': 'bg-purple-600 text-white',
  'Ekonomi / Finans': 'bg-green-600 text-white',
  'Spor / Magazin': 'bg-red-500 text-white',
  'Bilim / Teknoloji': 'bg-cyan-600 text-white',
  'Kültür / Sanat': 'bg-orange-500 text-white',
  'Özel': 'bg-indigo-600 text-white',
};

const FALLBACK_COLORS = [
  'bg-blue-600 text-white',
  'bg-purple-600 text-white',
  'bg-green-600 text-white',
  'bg-red-500 text-white',
  'bg-cyan-600 text-white',
  'bg-orange-500 text-white',
];

export function colorForName(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
