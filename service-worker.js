const CACHE_NAME = 'bapperida-v5.3.1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    // We will dynamically cache CDNs when they are fetched
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle http/https requests
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // Avoid caching API requests to Supabase or other external dynamic APIs
    // Also skip non-GET requests
    if (event.request.url.includes('supabase.co') || 
        event.request.url.includes('mindcloud.my.id') || 
        event.request.method !== 'GET') {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return from cache, but also update the cache in the background (stale-while-revalidate)
                event.waitUntil(
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                    }).catch(() => {}) // Ignore background update failures
                );
                return cachedResponse;
            }

            // If not in cache, fetch from network
            return fetch(event.request).then((networkResponse) => {
                // Cache responses from network (basic or cors for CDNs)
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                console.log('[Service Worker] Fetch failed; offline mode.');
                // Return a generic offline fallback or a 503 status
                return new Response('Internet sedang bermasalah atau Anda sedang offline.', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
                });
            });
        })
    );
});
