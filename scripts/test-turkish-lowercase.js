// Türkçe İ karakterinin toLowerCase davranışını test et
const title = "SON DAKİKA HABERİ: Dışişleri Bakanı Hakan Fidan";

console.log("Orijinal başlık:", title);
console.log("");

// Bizim pipeline'da kullanılan yaklaşım
const lower1 = title.toLowerCase();
console.log("toLowerCase() sonrası:", lower1);
console.log("indexOf('son dakika'):", lower1.indexOf('son dakika'));
console.log("indexOf('sondakika'):", lower1.indexOf('sondakika'));
console.log("");

// Karakter karakter İ'yi kontrol et
const testStr = "DAKİKA";
const testLower = testStr.toLowerCase();
console.log("Test string:", testStr);
console.log("Lowered:", testLower);
console.log("Length:", testLower.length, "(orijinal 6 harf, length ne oldu?)");
console.log("");

// Her karakterin codepoint'lerini yazdır
console.log("'DAKİKA'.toLowerCase() karakter karakter:");
for (let i = 0; i < testLower.length; i++) {
  const ch = testLower[i];
  console.log(`  [${i}] '${ch}' = U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}
console.log("");

// Alternatif: replace + normalize
const lower2 = title.replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase();
console.log("İ→i replace + toLowerCase:", lower2);
console.log("indexOf('son dakika'):", lower2.indexOf('son dakika'));
console.log("");

// normalize('NFC') ile
const lower3 = title.toLowerCase().normalize('NFC');
console.log("toLowerCase + normalize('NFC'):", lower3);
console.log("indexOf('son dakika'):", lower3.indexOf('son dakika'));
