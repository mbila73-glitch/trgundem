// Küfür/argo kelime listesi + kontrol fonksiyonu
// Kullanıcının filtre_mesaj.txt dosyasından alınan liste
// (yazım varyasyonları + yabancı kelimeler dahil)
// AI ile anlam bazlı kontrol de reader-message API'sinde yapılır

export const PROFANITY_WORDS: string[] = [
  // YAZIM VARYASYONLARI — Türkçe küfürlerin karakter değişimli halleri
  "a.m.k.", "a.m.q", "a.m.q.", "a-m-q", "a_m_q", "a m q", "a  m  k",
  "s1k", "s!k", "s@k", "s1kt1m", "$1k", "$1kt1r", "s1kt1r", "sikt1r", "s*kt*r",
  "p1c", "p!c", "p1ç", "p!ç",
  "g0t", "g*t", "g0tl3k", "g*tler",
  "y4rr4k", "y*rr*k", "y-a-r-r-a-k",
  "0r0spu", "0r0sp", "or*spu",
  "aqq", "a.qq", "amqq", "amq1", "amq2", "amq3",
  "a.q", "a.q.", "a-k", "a.k.", "a k",
  "siktirgit", "siktirgitlen", "sikiktir",

  // TÜRKÇE — AĞIR KÜFÜRLER
  "amk", "aq", "amına", "amina", "amın", "amin",
  "amına koyayım", "amina koyayim", "amına koyim", "amina koyim",
  "amına koyarım", "amina koyarim",
  "amcık", "amcik", "amcığı", "amcigi", "amcığını", "amcigini",
  "amcıkherif", "amcıklar", "amcıkları", "amcığım", "amcıklık", "amcığını",
  "amcık suratlı", "amcık kafalı",
  "sik", "siki", "sikin", "sikim", "sikimi", "sikimin", "sikine", "sikini",
  "sikemek", "sikme", "siker", "sikerim", "sikeyim", "sikiyim",
  "sikti", "siktim", "siktin", "siktiğim", "siktigim", "siktiğimin", "siktigimin",
  "siktir", "siktirin", "siktirsin", "siktirgit",
  "siktir ol", "siktir olup git", "hassiktir", "hasiktir", "hassik", "hasik",
  "sikik", "sikikler", "sikik herif", "sikimsonik",
  "sik kafalı", "sik kafali", "sik kafası", "sik kafasi",
  "sik kırığı", "sik kirigi", "sik suratlı", "sik suratli",
  "sikemiyorum", "sikemiyeceğim", "sikemedim",
  "sikiyim", "sikiyormu", "siktiğiminsiktiği",
  "yarrak", "yarak", "yarrağım", "yarragim", "yarrağı", "yarragi",
  "yarağım", "yaragim", "yarrak kafalı", "yarrak kafali",
  "yarak kafalı", "yarak kafali",
  "göt", "got", "götü", "gotu", "götün", "gotun", "götüne", "gotune",
  "götünü", "gotunu", "götüm", "gotum", "götümün", "gotumun",
  "götveren", "gotveren", "götlek", "gotlek", "göt herif", "got herif",
  "göt kafalı", "got kafali", "göt oğlanı", "got oglani",
  "götören", "götüren", "götür",
  "götverenler", "götverenlik",
  "göt yala", "göt yalayıcı", "göt yalamak",
  "orospu", "orospu çocuğu", "orospu cocugu", "orospu çocu", "orospu cocu",
  "orospu evladı", "orospu evladi", "orospu çocuğusun", "orospu cocugusun",
  "oruspu", "oruspu çocuğu", "oruspu evladı",
  "piç", "pic", "piç kurusu", "pic kurusu", "piçlik", "piclik",
  "piç oğlu piç",
  "bok", "boka", "boktan", "bokum", "bokunu", "bok gibi",
  "bok herif", "bok kafalı", "bok kafali", "bok suratlı", "bok suratli",
  "ebeni sikim", "ebenin amına sikim",
  "sülaleni sikim", "sülaleni sikeyim", "sülalen",
  "aileni sikeyim", "aileni sikim",

  // TÜRKÇE — CİNSEL ARGO
  "sikiş", "sikis", "sikişmek", "sikismek", "sikici", "sikici herif",
  "am", "amcık ağızlı", "amcik agizli", "amcık suratlı", "amcik suratli",
  "yavşak", "yavsak", "yavşak herif", "yavsak herif",
  "pezevenk", "pezevenk herif", "pezevenklik", "pezevenkliği", "pezevenkligi",
  "pezeveng", "pezevengi", "pezevenkler",
  "fahişe", "fahise", "sürtük", "surtuk", "kaşar", "kasar",
  "kaşar ağızlı", "kasar agizli",
  "ibne", "ibne herif", "ibnelik", "ibne çocuğu", "ibne evladı", "ibne oğlu", "ibne oglu",
  "top herif", "lavuk", "lavuk herif", "lavuklar",
  "puşt", "pust", "puştluk",
  "kahpe", "kahpe oğlu", "kahpe çocuğu", "kahpelik",
  "kaltak", "kaltaklar", "kaltaklık",
  "kevaşe", "kevaşelik", "kevaşe oğlu",
  "şırfıdı", "şırfıtı",
  "sürtüklük", "kavat", "kavatlık",

  // TÜRKÇE — GENEL HAKARET
  "salak", "salak herif", "salakça", "salakca", "aptal", "aptal herif", "aptalca",
  "ahmak", "budala", "beyinsiz", "beyin yoksunu",
  "gerizekalı", "gerizekali", "geri zekalı", "geri zekali", "embesil",
  "mal", "mal herif", "mal mısın", "mal misin",
  "öküz", "okuz", "eşek", "esek", "hayvan", "it", "köpek", "kopek", "köpek herif",
  "kopek herif", "maymun", "maymun kafalı",
  "şerefsiz", "serefsiz", "şerefsizlik", "serefsizlik", "şerefsiz herif",
  "şerefsiz oğlu", "şerefsizsiniz", "serefsizsiniz",
  "haysiyetsiz", "haysiyetsizlik", "haysiyetsiz herif",
  "namussuz", "namussuzluk", "namussuz herif", "namussuzluk",
  "ahlaksız", "ahlaksiz", "ahlaksız herif", "ahlaksiz herif",
  "karaktersiz", "karaktersizlik", "onursuz", "onursuzluk",
  "alçak", "alcak", "alçak herif", "alcak herif", "adi", "adi herif", "soysuz",
  "soysuz herif", "sahtekar herif",
  "şarlatan", "sarlatan", "yalancı herif", "yalanci herif",
  "manyak", "manyakça", "manyaklık",
  "tımarlı", "tımarhanelik", "kaçık", "kaçıklık",
  "sersem", "sersem kafa", "dombalak", "dangalak", "andaval", "andavalı",
  "ahmakça", "budala gibi", "bön", "bon kafa",
  "dalkavuk", "dalkavukluk", "yalaka", "yalakalık", "yalaka herif",
  "münafık", "münafıklık",
  "rüküş", "rüüş", "rüküşlük",
  "şımarık", "şımarıklık",
  "müptezel", "müptezellik",
  "yobaz", "yobazlık",
  "şoven", "faşist", "faşo", "faşoş",
  "ırkçı", "ırkçılık",
  "lavuk herif",
  "salak",
  "geri zekalı",

  // YABANCI KELİMELER — İngilizce küfürler + varyasyonlar
  "fuck", "fucking", "fucked", "fucker", "fck", "f*ck", "f.u.c.k", "fcku", "fckoff", "fckyou",
  "motherfucker", "motherfucka", "m0therfucker",
  "shit", "sh*t", "sh1t", "sh!t", "bullshit", "horseshit", "dipshit", "jackshit",
  "pieceofshit", "pos", "batshit",
  "bitch", "b*tch", "b1tch", "b!tch", "sonofabitch", "sob",
  "asshole", "a$$hole", "a-hole", "a$$h0le", "asshat", "dumbass", "lazyass",
  "dick", "d*ck", "d1ck", "dickhead", "dickish", "dickweed",
  "pussy", "p*ssy", "puss",
  "cock", "c0ck", "c*ck", "cockhead", "cocky",
  "bastard", "b@stard", "b*stard",
  "wanker", "w@nker", "wank",
  "cunt", "c*nt", "c0nt",
  "slut", "sl*t", "sl*tty", "slutty",
  "whore", "wh*re", "h0e", "ho3", "hoe",
  "damn", "dammit", "goddammit", "goddamit", "goddamn",
  "retard", "rtard", "r*tard", "r3tard", "libtard",
  "idiot", "dumb", "dumbfuck", "dumbsh*t", "moron", "cretin",
  "prick", "pr*ck", "pr1ck",
  "douchebag", "d-bag", "dbag", "d0uche",
  "jerk", "jerkoff", "jackoff",
  "nutjob", "wacko", "psycho",
  "freak", "weirdo", "loser", "l0ser",
  "sucker", "suck3r", "suckmydick",
  "fag", "faggot", "f4ggot", "f4g", "f4gg0t",
  "tranny", "tr4nny",
  "midget", "dwarf",
  "nigger", "nigga", "n1gger", "n1gga", "n!gger",
  "spic", "sp1c",
  "chink", "ch1nk",
  "gook",
  "paki",
  "towelhead",
  "wetback",
  "gringo", "yankee",
  "redneck", "hillbilly", "whitetrash", "trailertrash",
  "cracker", "cracka",
  "coon",
  "kraut",
  "frog",
  "mick",
  "polack",
  "wop",
  "dago",
  "kike", "kyke",
  "stfu", "gtfo", "lmao", "wtf", "bs",

  // TÜRKÇE — KABA ARGO / YÖNLENME
  "ulan", "lan", "geber git", "cehenneme git", "yürü git", "yuru git",
  "bok ye", "bokunu ye",
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
