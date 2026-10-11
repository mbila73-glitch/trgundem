// Kalp (beğeni) localStorage helper — ön sayfa ve detay sayfası aynı değeri görür.
// article.id'ye göre beğeni durumunu saklar. SSR-safe (typeof window kontrolü).

const STORAGE_KEY = 'trgundem_likes';

type LikeState = {
  liked: boolean;
  count: number;
};

// Tüm beğeni state'ini localStorage'dan oku (article.id → { liked, delta })
function readAll(): Record<string, { liked: boolean; delta: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Tüm beğeni state'ini localStorage'a yaz
function writeAll(data: Record<string, { liked: boolean; delta: number }>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage dolu veya erişilemiyor — sessiz geç
  }
}

// Belirli bir article için beğeni durumunu getir.
// seedValue: article.id'ye göre üretilen seeded başlangıç değeri (85-324)
// count = seedValue + delta (kullanıcı tıkladıysa +1, tıklamadıysa 0)
export function getLikeState(articleId: string, seedValue: number): LikeState {
  const all = readAll();
  const entry = all[articleId];
  if (entry) {
    return {
      liked: entry.liked,
      count: Math.max(0, seedValue + entry.delta),
    };
  }
  // İlk kez — liked=false, count=seedValue
  return { liked: false, count: seedValue };
}

// Beğeni durumunu toggle yap (beğen → beğenme, beğenme → beğen).
// Yeni durumu döner.
export function toggleLike(articleId: string, seedValue: number): LikeState {
  const all = readAll();
  const current = all[articleId] ?? { liked: false, delta: 0 };

  let newLiked: boolean;
  let newDelta: number;
  if (current.liked) {
    // Beğeniyi geri al
    newLiked = false;
    newDelta = Math.max(0, current.delta - 1);
  } else {
    // Beğen
    newLiked = true;
    newDelta = current.delta + 1;
  }

  all[articleId] = { liked: newLiked, delta: newDelta };
  writeAll(all);

  return {
    liked: newLiked,
    count: Math.max(0, seedValue + newDelta),
  };
}
