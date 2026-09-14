// Service worker: makes the app work with no signal.
//
// Gyms have bad reception and this app must open instantly mid-workout, so
// everything is cached on install and served cache-first. There is no API and
// no user data here — all state lives in localStorage on the device — so a
// stale cache can never mean stale workout data, only stale code.
//
// Bump CACHE when shipping a change. The old cache is deleted on activate, and
// clients are claimed immediately so the new version takes effect on next load.

const CACHE = 'reppublic-v5';

const ASSETS = [
  './',
  './index.html',
  './app.html',
  './verify.html',
  './reset.html',
  './manifest.webmanifest',
  './core/store.js',
  './core/exercises.js',
  './core/progression.js',
  './core/splits.js',
  './core/plates.js',
  './core/api.js',
  './core/config.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individual failures must not abort the whole install — a missing
      // optional asset would otherwise leave the app uninstallable.
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Cross-origin requests go straight to the network: fonts, CDNs, and the API
  // Worker. Caching API responses would serve a stale feed or, worse, a stale
  // auth check — and writes already bypass via the method check above.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Serve immediately, then quietly refresh the entry for next time.
        event.waitUntil(
          fetch(request)
            .then((res) => {
              if (res && res.ok) return caches.open(CACHE).then((c) => c.put(request, res));
            })
            .catch(() => {})
        );
        return hit;
      }

      return fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() =>
          // Offline and uncached: a navigation still needs to land somewhere real.
          request.mode === 'navigate' ? caches.match('./app.html') : Response.error()
        );
    })
  );
});
