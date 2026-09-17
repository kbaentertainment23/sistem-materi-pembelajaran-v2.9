const CACHE_NAME = 'simpel-pwa-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-192.png',
  '/pwa-maskable-512.png',
  '/apple-touch-icon.png',
  '/splash-screen.png',
  '/apple-splash-1170-2532.png',
  '/apple-splash-1284-2778.png',
  '/apple-splash-750-1334.png',
  '/apple-splash-2048-2732.png',
  '/web-icon.png'
];

// Install Event - Pre-cache core app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching offline app shell');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[PWA SW] Pre-caching notice:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[PWA SW] Cleaning old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper: Check if request is dynamic, API, or Firebase/Firestore real-time data
function isRealtimeOrApiRequest(url) {
  const urlString = url.toString().toLowerCase();

  // 1. Never cache internal /api/* endpoints
  if (urlString.includes('/api/')) {
    return true;
  }

  // 2. Never cache Firebase, Firestore, Google Identity, or live backend endpoints
  if (
    urlString.includes('firestore.googleapis.com') ||
    urlString.includes('identitytoolkit.googleapis.com') ||
    urlString.includes('securetoken.googleapis.com') ||
    urlString.includes('firebaseinstallations.googleapis.com') ||
    urlString.includes('firebaseio.com') ||
    urlString.includes('apis.google.com') ||
    urlString.includes('googleapis.com') ||
    urlString.includes('firebaseapp.com')
  ) {
    return true;
  }

  // 3. Skip browser extensions and dev tools
  if (urlString.includes('chrome-extension') || urlString.includes('moz-extension')) {
    return true;
  }

  return false;
}

// Fetch Event - Network First with Cache Fallback for static app shell only
self.addEventListener('fetch', (event) => {
  // Only handle standard HTTP/HTTPS GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Strictly bypass API and Firestore/Firebase requests so data is always 100% real-time
  if (isRealtimeOrApiRequest(event.request.url)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network failed (offline) -> Check Cache for app shell
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fallback for HTML navigation requests offline
        if (
          event.request.mode === 'navigate' ||
          event.request.headers.get('accept')?.includes('text/html')
        ) {
          return (await caches.match('/index.html')) || (await caches.match('/'));
        }

        return new Response('Offline content unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        });
      })
  );
});
