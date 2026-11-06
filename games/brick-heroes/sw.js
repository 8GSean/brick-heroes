// Brick Heroes service worker: lets the game start offline and load instantly after the first visit.
// Bump VERSION whenever cached files change so players get the update.
const VERSION = 'brick-heroes-v4';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // never touch the co-op server (WebSockets, room links) or anything that isn't plain http(s)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.hostname.endsWith('.workers.dev') || url.pathname.startsWith('/room/')) return;
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/index.html'));
  if (isPage) {
    // the game page: network first so updates show up, cache as the offline fallback
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(k => k.put(req, c)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));   // ?room=... links work offline too
    return;
  }
  // everything else (three.js, fonts, icons): cache first, then network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(k => k.put(req, c)); }
    return r;
  })));
});
