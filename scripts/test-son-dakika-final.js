// Final test — düzeltilmiş yaklaşımı test et
const headlines = [
  "SON DAKİKA HABERİ: Dışişleri Bakanı Hakan Fidan, Suriyeli mevkidaşı ile görüştü",
  "SON DAKİKA | Fatma Betül Sayan Kaya",
  "SON DAKİKA-Haber: Deprem",
  "SONDAKİKA: Sel",
  "Son Dakika! Yeni karar",
  "SON DAKİKA • Ekonomi",
  "SON DAKİKA HABERİDİR: Yeni karar",
  "SON DAKİKA HABERI: Test"
];

const cleanRegex = /^\s*son\s*dakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi;
const cleanRegex2 = /^\s*sondakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi;
const cleanRegex3 = /\bson\s*dakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi;
const cleanRegex4 = /\bsondakika\s*(haber[a-zçğıüşöç]*)?\s*[.!?\…\|:•\-–—,;]*\s*/gi;

console.log("=== Final Test: Önce İ→i replace, sonra regex ===");
headlines.forEach(h => {
  const detected = h.replace(/İ/g, 'i').toLowerCase().indexOf('son dakika') >= 0 ||
                   h.replace(/İ/g, 'i').toLowerCase().indexOf('sondakika') >= 0;
  const cleaned = h
    .replace(/İ/g, 'i')
    .replace(cleanRegex, '')
    .replace(cleanRegex2, '')
    .replace(cleanRegex3, '')
    .replace(cleanRegex4, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  console.log(`  "${h}"`);
  console.log(`    → detected: ${detected}, cleaned: "${cleaned}"`);
});
