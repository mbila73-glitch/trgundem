import { useState, useEffect } from 'react';

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

  // localStorage'dan oku (senkron için)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`heart_${articleId}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (typeof data.count === 'number') setHearts(data.count);
        if (typeof data.liked === 'boolean') setUserLiked(data.liked);
      }
    } catch (e) {}
  }, [articleId]);

  const toggleHeart = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newHearts = userLiked ? Math.max(0, hearts - 1) : hearts + 1;
    const newLiked = !userLiked;
    setHearts(newHearts);
    setUserLiked(newLiked);
    try {
      localStorage.setItem(`heart_${articleId}`, JSON.stringify({ count: newHearts, liked: newLiked }));
      // Diğer component'leri uyandır
      window.dispatchEvent(new StorageEvent('storage', {
        key: `heart_${articleId}`,
        newValue: JSON.stringify({ count: newHearts, liked: newLiked }),
      }));
    } catch (e) {}
  };

  // Diğer component'lerin değişikliğini dinle
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === `heart_${articleId}` && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (typeof data.count === 'number') setHearts(data.count);
          if (typeof data.liked === 'boolean') setUserLiked(data.liked);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [articleId]);

  return { hearts, userLiked, toggleHeart };
}
