const CACHE_NAME = 'registro-horas-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './app.webmanifest'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});