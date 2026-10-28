// Service worker (template: tools/build.mjs fills in the version and the file list).
// The app shell and the lazy chunks are stored on install, so the second launch opens from the device.
const CACHE = 'lingoup-__VERSION__';
const SHELL = __SHELL__;
const TG_SDK = 'https://telegram.org/js/telegram-web-app.js';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lingoup-') && k !== CACHE && k !== 'lingoup-media').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// pictures live in their own cache: their URLs carry a content hash, so they survive app updates
const put = (name, req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    void caches.open(name).then((c) => c.put(req, copy));
  }
  return res;
};
const cacheFirst = (name, req) => caches.match(req).then((hit) => hit || fetch(req).then((r) => put(name, req, r)));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(TG_SDK)) {
    // cached copy at once, refreshed in the background
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((r) => put(CACHE, req, r)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return; // the app caches API data itself
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(cacheFirst(url.pathname.includes('/img/') ? 'lingoup-media' : CACHE, req));
});

// "save everything for offline" in the profile
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache') return;
  const urls = e.data.urls;
  e.waitUntil(
    caches.open('lingoup-media').then(async (c) => {
      let done = 0;
      const next = async () => {
        while (urls.length) {
          const u = urls.shift();
          if (!(await c.match(u))) await c.add(u).catch(() => {});
          done++;
          if (done % 10 === 0 || !urls.length) e.source?.postMessage({ type: 'precache-progress', done, total: done + urls.length });
        }
      };
      await Promise.all([next(), next(), next(), next()]);
      e.source?.postMessage({ type: 'precache-progress', done, total: done });
    }),
  );
});
