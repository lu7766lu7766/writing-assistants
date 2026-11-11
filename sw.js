const CACHE_VERSION = 'v1';
const CACHE_NAME = `essay-helper-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/gemini.js',
  './js/prompt.js',
  './js/storage.js',
  './js/ui.js',
  './js/text.js',
  './js/export.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('essay-helper-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept or cache Gemini API calls
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // Only handle same-origin requests with cache-first + background refresh
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }
        const netResp = await networkPromise;
        if (netResp) return netResp;

        if (request.mode === 'navigate') {
          return cache.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
  }
});
