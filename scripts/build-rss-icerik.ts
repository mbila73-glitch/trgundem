// Build /home/z/my-project/download/rss_icerik.md from the current DB state.
//
// For every category, group articles by source, then list each article with:
//   - title (linked to the original article URL)
//   - published time, author, source link
//   - AI summary (if generated) or a "(henüz oluşturulmadı)" placeholder
//   - short description snippet
//
// Run: bun /home/z/my-project/scripts/build-rss-icerik.ts

import { db } from '../src/lib/db';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const OUTPUT_PATH = path.join(
  process.cwd(),
  'download',
  'rss_icerik.md',
);

const CATEGORIES = [
  'Güncel',
  'Kamu / Resmi',
  'Ekonomi / Finans',
  'Bilim / Teknoloji',
  'Spor / Magazin',
  'Kültür / Sanat',
];

function escapeMd(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy HH:mm', { locale: tr });
}

async function main() {
  console.log('=== RSS İçerik Dosyası Oluşturma ===');

  const totalArticles = await db.article.count();
  const totalSources = await db.source.count();
  const summarizedCount = await db.article.count({
    where: { summary: { not: null } },
  });

  console.log(
    `Makale: ${totalArticles}, Kaynak: ${totalSources}, Özetlenen: ${summarizedCount}`,
  );

  const lines: string[] = [];
  lines.push('# RSS İçerik Derlemesi');
  lines.push('');
  lines.push('Haber Özet — RSS + AI özetlenen Türkçe haber derlemesi.');
  lines.push('');
  lines.push(`- **Oluşturulma:** ${format(new Date(), 'd MMM yyyy HH:mm', { locale: tr })}`);
  lines.push(`- **Toplam makale:** ${totalArticles}`);
  lines.push(`- **Toplam kaynak:** ${totalSources} (6 kategori)`);
  lines.push(`- **AI özetlenen makale:** ${summarizedCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const category of CATEGORIES) {
    const articles = await db.article.findMany({
      where: {
        OR: [{ category }, { source: { category } }],
      },
      orderBy: { publishedAt: 'desc' },
      include: { source: { select: { name: true, url: true } } },
    });

    lines.push(`## ${category} (${articles.length} makale)`);
    lines.push('');

    if (articles.length === 0) {
      lines.push('_Bu kategoride henüz makale yok._');
      lines.push('');
      lines.push('---');
      lines.push('');
      continue;
    }

    // Group by source
    const bySource = new Map<
      string,
      { name: string; url: string; articles: typeof articles }
    >();
    for (const a of articles) {
      const sName = a.source?.name ?? 'Bilinmiyor';
      const sUrl = a.source?.url ?? '';
      if (!bySource.has(sName)) {
        bySource.set(sName, { name: sName, url: sUrl, articles: [] });
      }
      bySource.get(sName)!.articles.push(a);
    }

    for (const [, info] of Array.from(bySource.entries())) {
      lines.push(`### Kaynak: [${info.name}](${info.url})`);
      lines.push('');
      lines.push(`_${info.articles.length} makale_`);
      lines.push('');

      for (const a of info.articles) {
        const title = escapeMd(a.title) || '(Başlıksız)';
        const link = a.link || a.source?.url || '';
        lines.push(`#### [${title}](${link})`);
        lines.push('');
        lines.push(`- **Yayın:** ${fmtDate(a.publishedAt)}`);
        if (a.author) {
          lines.push(`- **Yazar:** ${escapeMd(a.author)}`);
        }
        if (a.category) {
          lines.push(`- **Kategori:** ${escapeMd(a.category)}`);
        }
        lines.push(
          `- **Kaynak:** [${escapeMd(a.source?.name ?? 'Bilinmiyor')}](${a.source?.url ?? ''})`,
        );
        lines.push('');
        if (a.summary) {
          lines.push('**AI Özet:**');
          lines.push('');
          lines.push('> ' + a.summary.replace(/\r?\n/g, '\n> '));
        } else if (a.summaryError) {
          lines.push('**AI Özet:** _özet oluşturulamadı_');
          lines.push('');
          lines.push(`> Hata: ${escapeMd(a.summaryError)}`);
        } else {
          lines.push('**AI Özet:** _(henüz oluşturulmadı)_');
        }
        lines.push('');
        if (a.description) {
          const desc = a.description.slice(0, 280);
          const suffix = a.description.length > 280 ? '…' : '';
          lines.push(`_${desc}${suffix}_`);
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      }
    }
  }

  // Footer
  lines.push('## Üretim Bilgisi');
  lines.push('');
  lines.push(`- **Oluşturan:** Haber Özet build-rss-icerik.ts`);
  lines.push(`- **Tarih:** ${new Date().toISOString()}`);
  lines.push(`- **Toplam satır:** ${lines.length}`);
  lines.push('');

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf-8');

  const sizeKb = Math.round((lines.join('\n').length / 1024) * 10) / 10;
  console.log(
    `\nDosya yazıldı: ${OUTPUT_PATH} (${sizeKb} KB, ${lines.length} satır)`,
  );
}

main()
  .catch((e) => {
    console.error('Build hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
