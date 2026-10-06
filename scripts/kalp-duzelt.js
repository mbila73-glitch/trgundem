// Eski yayındaki haberlere random initialHearts ata (223-413)
// clickHearts negatifse 0'a düzelt
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  const all = await db.publishedArticle.findMany({
    where: { status: { in: ['published', 'archived'] } },
    select: { id: true, initialHearts: true, clickHearts: true, aiTitle: true },
  });
  console.log('Toplam haber: ' + all.length);

  let updated = 0;
  let fixedClickHearts = 0;
  for (const a of all) {
    const updates = {};
    // initialHearts 0 ise random ata
    if (!a.initialHearts || a.initialHearts === 0) {
      updates.initialHearts = Math.floor(Math.random() * (413 - 223 + 1)) + 223;
    }
    // clickHearts negatifse 0 yap
    if (a.clickHearts < 0) {
      updates.clickHearts = 0;
      fixedClickHearts++;
    }
    if (Object.keys(updates).length > 0) {
      await db.publishedArticle.update({
        where: { id: a.id },
        data: updates,
      });
      updated++;
      if (updated <= 5) {
        console.log('  ' + (updates.initialHearts || a.initialHearts) + '+' + (updates.clickHearts ?? a.clickHearts) + ' — ' + (a.aiTitle || '').slice(0, 50));
      }
    }
  }
  console.log('');
  console.log('Güncellenen: ' + updated + '/' + all.length);
  console.log('  initialHearts atanmış: ' + updated - fixedClickHearts);
  console.log('  clickHearts düzeltilmiş (negatif→0): ' + fixedClickHearts);
  await db.$disconnect();
})().catch((e) => {
  console.error('Hata:', e.message);
  process.exit(1);
});
