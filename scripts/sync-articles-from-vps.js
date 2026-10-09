// VPS'ten tüm yayınlanmış haberleri çek, local DB'ye yaz
// Kullanım: node scripts/sync-articles-from-vps.js
// Amaç: Local preview'da gerçek haberleri görmek (logo + haberler)

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const VPS_URL = 'https://trgundem.net';

async function fetchAllArticles() {
  const allArticles = [];
  let offset = 0;
  const limit = 50; // tek seferde 50 çek (total 48)
  
  console.log('VPS\'ten haberler çekiliyor...');
  while (true) {
    const url = `${VPS_URL}/api/published-articles?limit=${limit}&offset=${offset}`;
    console.log(`  → ${url}`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    if (!data.articles || data.articles.length === 0) break;
    allArticles.push(...data.articles);
    console.log(`  ✓ ${data.articles.length} haber geldi (toplam: ${allArticles.length}/${data.total})`);
    if (allArticles.length >= data.total) break;
    offset += limit;
    // Güvenlik limiti
    if (offset > 500) break;
  }
  return allArticles;
}

async function main() {
  // Mevcut haber sayısı
  const existingCount = await prisma.publishedArticle.count();
  console.log(`Local DB'de ${existingCount} haber var.`);
  
  if (existingCount > 0) {
    console.log('Mevcut haberler siliniyor (VPS ile senkron için)...');
    await prisma.publishedArticle.deleteMany({});
    console.log('  ✓ Silindi');
  }
  
  // Tüm haberleri çek
  const articles = await fetchAllArticles();
  console.log(`\nToplam ${articles.length} haber çekildi.`);
  
  if (articles.length === 0) {
    console.log('Haber yok, çıkılıyor.');
    return;
  }
  
  // Local DB'ye yaz
  console.log('\nLocal DB\'ye yazılıyor...');
  let inserted = 0;
  let errors = 0;
  
  for (const a of articles) {
    try {
      await prisma.publishedArticle.create({
        data: {
          id: a.id,
          aiTitle: a.aiTitle,
          aiSummary: a.aiSummary,
          imageUrl: a.imageUrl || null,
          category: a.category,
          wordCount: a.wordCount || 0,
          sourceArticleIds: a.sourceArticleIds,
          sourceCount: a.sourceCount || 0,
          earliestPublishedAt: new Date(a.earliestPublishedAt),
          latestPublishedAt: new Date(a.latestPublishedAt),
          status: a.status || 'published',
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
          archivedAt: a.archivedAt ? new Date(a.archivedAt) : null,
          initialHearts: a.initialHearts || 0,
          clickHearts: a.clickHearts || 0,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        }
      });
      inserted++;
    } catch (e) {
      console.error(`  ✗ ${a.id}: ${e.message}`);
      errors++;
    }
  }
  
  console.log(`\n✓ ${inserted} haber local DB'ye yazıldı`);
  if (errors > 0) console.log(`✗ ${errors} hata`);
  
  // Son durum
  const finalCount = await prisma.publishedArticle.count();
  console.log(`\nLocal DB: ${finalCount} haber`);
  
  // Kategori bazında sayım
  const byCategory = await prisma.publishedArticle.groupBy({
    by: ['category'],
    _count: { _all: true },
    orderBy: { _count: { category: 'desc' } }
  });
  console.log('\nKategori bazında:');
  byCategory.forEach(c => {
    console.log(`  ${c._count._all} ${c.category}`);
  });
}

main()
  .catch(e => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
