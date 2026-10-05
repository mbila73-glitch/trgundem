// Küfür/argo kelime listesi + kontrol fonksiyonu

export const PROFANITY_WORDS: string[] = [
  // AĞIR KÜFÜRLER
  "amk", "aq", "a.q", "a.k", "a.k.",
  "amına", "amina", "amın", "amin", "amına koyayım", "amina koyayim",
  "amına koyim", "amina koyim", "amına koyarım", "amina koyarim",
  "amcık", "amcik", "amcığı", "amcigi", "amcığını", "amcigini",
  "sik", "siki", "sikin", "sikim", "sikimi", "sikimin", "sikine", "sikini",
  "sikmek", "sikme", "siker", "sikerim", "sikeyim", "sikiyim",
  "sikti", "siktim", "siktin", "siktiğim", "siktigim", "siktiğimin", "siktigimin",
  "siktir", "siktirin", "siktirsin", "siktirgit", "siktir git",
  "siktir ol", "siktir olup git", "hassiktir", "hasiktir", "hassik", "hasik",
  "sikik", "sikimsonik", "sik kafalı", "sik kafali", "sik kafası", "sik kafasi",
  "sik kırığı", "sik kirigi", "sik suratlı", "sik suratli",
  "yarrak", "yarak", "yarrağım", "yarragim", "yarrağı", "yarragi",
  "yarağım", "yaragim", "yarrak kafalı", "yarrak kafali", "yarak kafalı", "yarak kafali",
  "göt", "got", "götü", "gotu", "götün", "gotun", "götüne", "gotune",
  "götünü", "gotunu", "götüm", "gotum", "götümün", "gotumun",
  "götveren", "gotveren", "götlek", "gotlek", "göt herif", "got herif",
  "göt kafalı", "got kafali", "göt oğlanı", "got oglani",
  "orospu", "orospu çocuğu", "orospu cocugu", "orospu çocu", "orospu cocu",
  "orospu evladı", "orospu evladi", "orospu çocuğusun", "orospu cocugusun",
  "piç", "pic", "piç kurusu", "pic kurusu", "piçlik", "piclik",
  "bok", "boka", "boktan", "bokum", "bokunu", "bok gibi",
  "bok herif", "bok kafalı", "bok kafali", "bok suratlı", "bok suratli",

  // CİNSEL ARGO
  "sikiş", "sikis", "sikişmek", "sikismek", "sikici", "sikici herif", "sikik",
  "am", "amcık ağızlı", "amcik agizli", "amcık suratlı", "amcik suratli",
  "yavşak", "yavsak", "yavşak herif", "yavsak herif",
  "pezevenk", "pezevenk herif", "pezevenklik", "pezevenkliği", "pezevenkligi",
  "fahişe", "fahise", "sürtük", "surtuk", "kaşar", "kasar",
  "kaşar ağızlı", "kasar agizli", "ibne", "ibne herif", "ibnelik",
  "ibne oğlu", "ibne oglu", "top herif", "lavuk", "lavuk herif",

  // GENEL HAKARET
  "salak", "salak herif", "salakça", "salakca", "aptal", "aptal herif", "aptalca",
  "ahmak", "budala", "beyinsiz", "beyin yoksunu", "gerizekalı", "gerizekali",
  "geri zekalı", "geri zekali", "embesil", "mal", "mal herif", "mal mısın", "mal misin",
  "öküz", "okuz", "eşek", "esek", "hayvan", "it", "köpek", "kopek", "köpek herif", "kopek herif",
  "şerefsiz", "serefsiz", "şerefsizlik", "serefsizlik", "haysiyetsiz", "haysiyetsizlik",
  "namussuz", "namussuzluk", "ahlaksız", "ahlaksiz", "ahlaksız herif", "ahlaksiz herif",
  "karaktersiz", "karaktersizlik", "onursuz", "onursuzluk", "alçak", "alcak",
  "alçak herif", "alcak herif", "adi herif", "soysuz", "soysuz herif",
  "şarlatan", "sarlatan", "yalancı herif", "yalanci herif",
  "şerefsiz herif", "şerefsizsiniz", "serefsizsiniz", "sahtekar herif",

  // AİLE ÜZERİNDEN KÜFÜR
  "ananı", "anani", "ananızı", "ananizi", "ananı sikeyim", "anani sikeyim",
  "ananı avradını", "anani avradini", "bacını", "bacini", "bacını sikeyim", "bacini sikeyim",
  "kardeşini sikeyim", "kardesini sikeyim", "evladını sikeyim", "evladini sikeyim",
  "aileni sikeyim", "aileni sikim",

  // KABA ARGO
  "ulan", "lan", "geber git", "cehenneme git", "yürü git", "yuru git", "bok ye", "bokunu ye",

  // YAZIM VARYASYONLARI
  "s.k", "s*k", "s1k", "s!k", "s@k", "s i k", "s-i-k", "s_i_k",
  "a.m.k", "a-m-k", "a_m_k", "a m k", "a  m  k", "a*q", "aqq",
  "o.r.o.s.p.u", "o-r-o-s-p-u", "o r o s p u", "or*spu", "0r0spu",
  "p.i.ç", "p-i-c", "p i c", "p1c", "g.ö.t", "g-o-t", "g o t", "g*t", "g0t",
  "y.a.r.r.a.k", "y-a-r-r-a-k", "y a r r a k", "y*rr*k", "y4rr4k",
  "s.i.k.t.i.r", "s-i-k-t-i-r", "s i k t i r", "s*kt*r", "$1kt1r", "s1kt1r",
];

// Mesajda küfür var mı kontrol et — yakalanan kelimeyi döndür
export function findProfanity(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/Ş/g, 's').replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');

  // Kelime bazlı kontrol
  const words = normalized.split(' ');
  for (const w of words) {
    if (PROFANITY_WORDS.includes(w)) return w;
  }
  // Birleşik kelimeler (örn: "amına koyayım")
  for (const pw of PROFANITY_WORDS) {
    if (pw.includes(' ') && normalized.includes(pw) && pw.length > 3) return pw;
  }
  return null;
}
