// TrGündem - Service Worker
// Statik varlıkları önbelleğe alır; API ve navigasyon network-first (cache'lenmez).
const CACHE_NAME = 'trgundem-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/trgundem-logo.png',
  '/trgundem-header.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

// Install: statik varlıkları önbelleğe al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  )
})

// Activate: TÜM eski önbelleği temizle (cache bump ile zorunlu yenileme)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Tüm istemcilere yenilenmelerini söyle
        self.clients.matchAll({ type: 'window' }).then((clients) =>
          clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED' }))
        )
      )
  )
})

// Fetch: API/navigasyon network-first (cache YOK), statik cache-first
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Sadece GET istekleri
  if (request.method !== 'GET') return

  // Aynı kökenli olmayan istekleri atla (görseller, vb.)
  const sameOrigin = url.origin === self.location.origin

  // API istekleri: SADECE network (cache yok — dinamik veri her zaman taze olmalı)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ ok: false, error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // Navigasyon istekleri: network-first, cache fallback (offline sayfa)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/')))
    )
    return
  }

  // Diğer statik varlıklar: cache-first (network fallback)
  if (sameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            }
            return res
          })
          .catch(() => cached)
      })
    )
  }
})
