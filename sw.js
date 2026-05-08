const CACHE_NAME = 'admin-cache-v14'; // رفعنا رقم الكاش هون

const urlsToCache = [
  './admin.html',
  './icon-192.png',  // ضفنا الأيقونة الصغيرة
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// باقي الكود عندك خليه متل ما هو...
