// MARKA BLOK LİSTESİ — başlıkta bu markalardan herhangi biri geçerse HABER YAYINLANMAZ
// User: "tesla fabrikası yandı bile deseler yayınlamayalaım. iphone ile adam öldürdü haberini bile engelleyelim"
// Kural: marka adı başlıkta varsa = ATLA (AI özet bile üretme, API çağrısı yapma)
//
// Tüm markalar lowercase + Türkçe karakterler ASCII'ye çevrilmiş
// Match: title normalize edilip \b kelime sınırı ile kontrol edilir
module.exports = [
  // === OTOMOBIL MARKALARI ===
  'alfa romeo','alpine','aston martin','audi','bentley','bmw','byd','chery','citroen','cupra',
  'dacia','dfsk','ds automobiles','ferrari','fiat','ford','honda','hongqi','hyundai','jaecoo',
  'jaguar','jeep','kia','kgm','lamborghini','leapmotor','lexus','lada','land rover','lancia',
  'lotus','maserati','maxus','mazda','mercedes-benz','mg','mini','mitsubishi','nissan','opel',
  'peugeot','porsche','renault','rolls-royce','seat','skoda','skywell','smart','subaru',
  'suzuki','swm','tesla','togg','toyota','volkswagen','volvo','aion','forthing','omoda',
  'seres','voyah',
  // === TELEFON / ELEKTRONIK MARKALARI ===
  'apple','iphone','samsung','galaxy','xiaomi','redmi','poco','huawei','honor','oppo',
  'oneplus','realme','vivo','iqoo','tecno','infinix','itel','motorola','moto','google pixel',
  'nothing','cmf','tcl','nokia','hmd','zte','nubia','redmagic','asus','rog phone',
  'general mobile','gm','casper','reeder','omix','hiking','oukitel','doogee','ulefone',
  'blackview','cubot','tcl nxtpaper'
];
