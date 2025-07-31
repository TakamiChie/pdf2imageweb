const CACHE_NAME = 'pdf2imageweb-cache-v2'
const FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
]

/* インストール時にキャッシュ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  )
})

/* fetchイベントでStale-While-Revalidate */
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone())
          return res
        })
        event.waitUntil(fetchPromise)
        return cached || fetchPromise
      })
    )
  )
})
