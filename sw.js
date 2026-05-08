const CACHE_NAME = 'admin-cache-v15';

const urlsToCache = [
  './admin.html',
  './icon-192.png',
  './icon.png',
  './manifest.json'
];

// تثبيت الكاش
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// تفعيل النسخة الجديدة وحذف القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// جلب الملفات (هاد اللي كان ناقص ليشتغل التثبيت)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
