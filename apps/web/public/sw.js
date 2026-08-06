const CACHE = 'betynz-v5-0-1';
const SHELL = [
  '/', '/styles.css?v=5.0.1', '/motion.js?v=5.0.1', '/app.js?v=5.0.1',
  '/picks.html', '/picks.js?v=5.0.1',
  '/market-route.html', '/market-route.js?v=5.0.1',
  '/ppg-route.html', '/ppg-route.js?v=5.0.1',
  '/convergence.html', '/convergence.js?v=5.0.1',
  '/proof.html', '/proof.js?v=5.0.1',
  '/performance.html', '/performance.js?v=5.0.1',
  '/live.html', '/live.js?v=5.0.1',
  '/odds-movement.html', '/odds-movement.js?v=5.0.1',
  '/leagues.html', '/leagues.js?v=5.0.1',
  '/admin-engine-audit.html', '/admin-engine-audit.js?v=5.0.1',
  '/admin-calibration.html', '/admin-calibration.js?v=5.0.1',
  '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png'
];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Offline' }), { status: 503, headers: { 'content-type': 'application/json' } })));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/'))));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(event.request);
    const update = fetch(event.request).then(response => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }).catch(() => null);
    return hit || update || Response.error();
  }));
});
