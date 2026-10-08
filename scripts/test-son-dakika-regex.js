// Regex gi flag + Türkçe İ testi
const title = "SON DAKİKA HABERİ: Dışişleri Bakanı Hakan Fidan";
const title2 = "SON DAKİKA | Fatma Betül Sayan Kaya";

console.log("=== TEST 1: Regex gi flag (mevcut yaklaşım) ===");
const regex1 = /^\s*son\s*dakika\s*[.!?\…\|:•\-–—,;]*\s*/gi;
console.log("Test 1 sonuç:", title.replace(regex1, ''));
console.log("Test 2 sonuç:", title2.replace(regex1, ''));

console.log("");
console.log("=== TEST 2: İ → i replace + toLowerCase ===");
const turkishLower = (s) => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
const titleLower1 = turkishLower(title);
console.log("Lowered:", titleLower1);
console.log("indexOf('son dakika'):", titleLower1.indexOf('son dakika'));

console.log("");
console.log("=== TEST 3: Önce İ→i replace, sonra regex gi ===");
const titleReplaced = title.replace(/İ/g, 'i');
console.log("Replaced:", titleReplaced);
const regex2 = /^\s*son\s*dakika\s*[.!?\…\|:•\-–—,;]*\s*/gi;
console.log("Regex gi result:", titleReplaced.replace(regex2, ''));

console.log("");
console.log("=== TEST 4: Önce İ→i replace, sonra plain (g flag, case-sensitive after lowercase) ===");
const cleanLower = title.replace(/İ/g, 'i').toLowerCase();
console.log("Lowered:", cleanLower);
const regex3 = /^\s*son\s*dakika\s*[.!?\…\|:•\-–—,;]*\s*/g;
console.log("Regex g (no i) result:", cleanLower.replace(regex3, ''));

console.log("");
console.log("=== TEST 5: Tüm Haber İçeren Başlıklar ===");
const headlines = [
  "SON DAKİKA HABERİ: Dışişleri Bakanı Hakan Fidan",
  "SON DAKİKA | Fatma Betül Sayan Kaya",
  "SON DAKİKA-Haber: Deprem",
  "SONDAKİKA: Sel",
  "Son Dakika! Yeni karar",
  "SON DAKİKA • Ekonomi"
];
const cleanRegex = /^\s*son\s*dakika\s*[.!?\…\|:•\-–—,;]*\s*/gi;
headlines.forEach(h => {
  const detected = h.replace(/İ/g, 'i').toLowerCase().indexOf('son dakika') >= 0 ||
                   h.replace(/İ/g, 'i').toLowerCase().indexOf('sondakika') >= 0;
  const cleaned = h.replace(/İ/g, 'i').replace(cleanRegex, '').replace(/^\s*sondakika\s*[.!?\…\|:•\-–—,;]*\s*/gi, '').trim();
  console.log(`  "${h}" → detected: ${detected}, cleaned: "${cleaned}"`);
});
