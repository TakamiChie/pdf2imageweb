const CACHE_NAME = 'pdf2imageweb-cache-v5'
const PDFJS_BASE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/'
const FILES = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  `${PDFJS_BASE_URL}build/pdf.worker.min.js`,
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  '/css/style.css',
  '/icon/image.png',
]


self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
});

// アクティベート時に古いキャッシュ削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// fetch時にキャッシュ利用
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      const url = event.request.url;
      const isFontResource = event.request.method === 'GET' && (
        url.startsWith(`${PDFJS_BASE_URL}cmaps/`) ||
        url.startsWith(`${PDFJS_BASE_URL}standard_fonts/`)
      );
      return fetch(event.request).then(response => {
        // 使用した文字描画用データを保存し、次回のオフライン描画でも利用する
        if (isFontResource && response.ok) {
          const cachedResponse = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cachedResponse)).catch(console.error)
          );
        }
        return response;
      });
    })
  );
});

// 更新通知
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
