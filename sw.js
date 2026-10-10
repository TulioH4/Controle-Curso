// Service worker: offline app shell.
// Pages: network-first (online users always get the latest version, offline falls back to cache).
// Same-origin assets: stale-while-revalidate. Whitelisted CDNs: cache-first.
// Anything else (e.g. the sync API) is never cached.
const VERSION = 'v2';
const CACHE = `controle-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './sync.js',
  './dados_curso.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('controle-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Push reminders sent by the "lembretes" Edge Function
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Centro de Controle', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: './icons/icon-192.png',
    data: { url: d.url || './' },
  }));
});

// Tapping a notification opens the app (or focuses it) on the right screen
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => w.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      if ('navigate' in win) { try { await win.navigate(url); } catch (e) {} }
      return;
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req, {ignoreSearch: true});
        const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
  }
});
