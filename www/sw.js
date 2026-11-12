// Bump CACHE on every release so old cached files are dropped.
const CACHE = 'chessvsbots-v13';
const ASSETS = [
  './',
  './index.html',
  './chess.min.js',
  './privacy-config.js',
  './i18n.js',
  './pieces-extra.js',
  './engine.js',
  './avatars.js',
  './bots.js',
  './engine/stockfish-19-lite-single.js',
  './engine/stockfish-19-lite-single.wasm',
  './chess-core.js',
  './accuracy.js',
  './game.js',
  './native-services.bundle.js',
  './privacy.html',
  './support.html',
  './manifest.webmanifest',
  './icon.png',
  './icon512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('chessvsbots-') && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first (fresh code when online), cache fallback (offline).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.includes('/engine/')) {   // big engine files: cache first
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => { if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return resp; })));
    return;
  }
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
