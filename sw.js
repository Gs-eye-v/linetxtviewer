const CACHE_NAME = 'ark-ive-v21-force';
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
    './icon.jpg'
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
