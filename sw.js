const CACHE_NAME = 'line-viewer-v6';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './db.js',
    './parser.js',
    './virtual-scroll.js',
    './search.js',
    './app.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
