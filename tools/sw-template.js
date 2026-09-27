// SPDX-License-Identifier: GPL-3.0-only
// Snuggle Sorcery's service worker (generated at build time from tools/sw-template.js by vite.config.js).
// Caches the whole game after the first visit so a returning player starts at once, even offline.
// The page itself is network-first, so a new deploy is picked up on the next load. A new version waits
// until the old one's tabs are closed (no skipWaiting), and until then the old cache keeps serving the
// chunks an open tab of the old build asks for.
const VERSION = '__VERSION__';
const CACHE = 'snuggle-' + VERSION;
const PRECACHE = ['__PRECACHE__'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('snuggle-') && k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // the page: the network first (a new deploy), the cached page when offline
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('./', res.clone()));
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true })),
    );
    return;
  }
  // everything else is content-addressed (hashed chunks, models with ?v=): the cache first
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && new URL(req.url).pathname.includes('/assets/')) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});
