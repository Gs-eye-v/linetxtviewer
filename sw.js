const CACHE_NAME = 'ark-ive-v57';
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
    self.skipWaiting(); // 新しいSWをすぐに待機状態からアクティブにする
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key); // 古いバージョンのキャッシュを自動削除
                }
            }));
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
