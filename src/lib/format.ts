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

export function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
