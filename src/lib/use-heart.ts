import { useState, useEffect } from 'react';

// Hash seed — ilk yüklemede random başlangıç sayısı (DB'den gelene kadar)
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function seededInt(seed: number, min: number, max: number): number {
  const range = max - min + 1;
  return min + (seed % range);
}

export function useHeart(articleId: string) {
  const seed = hashSeed(articleId);
  const [hearts, setHearts] = useState(() => seededInt(seed, 215, 400));
  const [userLiked, setUserLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Mount olunca: DB'den hearts sayısını ve userLiked (IP'ye göre) çek
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/heart?articleId=${encodeURIComponent(articleId)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return null;
        const json = (await r.json()) as { ok?: boolean; hearts?: number; userLiked?: boolean };
        if (!json.ok) return null;
        return json;
      })
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.hearts === 'number') setHearts(data.hearts);
        if (typeof data.userLiked === 'boolean') setUserLiked(data.userLiked);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const toggleHeart = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (toggling || loading) return;

    // Optimistic update — UI hemen güncelle
    const newHearts = userLiked ? Math.max(0, hearts - 1) : hearts + 1;
    const newLiked = !userLiked;
    setHearts(newHearts);
    setUserLiked(newLiked);
    setToggling(true);

    try {
      const r = await fetch('/api/heart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      const json = (await r.json()) as { ok?: boolean; hearts?: number; userLiked?: boolean; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Beğeni hatası');
      // Server'dan gelen kesin değeri kullan (rollback veya doğrulama)
      if (typeof json.hearts === 'number') setHearts(json.hearts);
      if (typeof json.userLiked === 'boolean') setUserLiked(json.userLiked);
    } catch (e) {
      // Hata — optimistic update'i geri al
      setHearts(userLiked ? hearts : Math.max(0, hearts - 1));
      setUserLiked(userLiked);
    } finally {
      setToggling(false);
    }
  };

  return { hearts, userLiked, toggleHeart, loading };
}
