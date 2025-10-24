const VERSION = 'v1.0.0';
const STATIC_CACHE = `teamhub-static-${VERSION}`;
const DATA_CACHE = `teamhub-data-${VERSION}`;


const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './js/app.js',
    './js/router.js',
    './js/ui.js',
    './js/sw-register.js',
    './vendor/qrcode.min.js',
    './manifest.webmanifest',
    './offline.html'
];


const DATA_FILES = [
    './data/settings.json',
    './data/announcements.json',
    './data/practice_plans.json',
    './data/drills.json',
    './data/mentorship.json',
    './data/videos.json',
    './data/roster.json'
];


self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const s = await caches.open(STATIC_CACHE); await s.addAll(STATIC_ASSETS);
        const d = await caches.open(DATA_CACHE); await d.addAll(DATA_FILES);
        self.skipWaiting();
    })());
});


self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(n => ![STATIC_CACHE, DATA_CACHE].includes(n)).map(n => caches.delete(n)));
        self.clients.claim();
    })());
});


self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);


    // Network-first for JSON data under /data/
    if (url.pathname.startsWith('/data/')) {
        e.respondWith((async () => {
            try {
                const res = await fetch(e.request);
                const cache = await caches.open(DATA_CACHE);
                cache.put(e.request, res.clone());
                return res;
            } catch {
                const cached = await caches.match(e.request);
                return cached || new Response('[]', { headers: { 'Content-Type': 'application/json' } });
            }
        })());
        return;
    }


    // Cache-first for app shell/static
});
