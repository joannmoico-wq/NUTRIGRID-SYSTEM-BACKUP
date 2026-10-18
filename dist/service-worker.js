// NutriGrid Service Worker - Offline-First PWA
// This enables offline functionality and app installation

const CACHE_NAME = 'nutrigrid-v2';
const RUNTIME_CACHE = 'nutrigrid-runtime-v1';

// Assets to cache on install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png'
];

// Install event - Cache essential files
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Caching essential files');
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch((error) => {
      console.error('❌ Cache installation failed:', error);
    })
  );
  
  // Skip waiting - activate immediately
  self.skipWaiting();
});

// Activate event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log(`🗑️ Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

// Fetch event - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Handle GET requests only
  if (request.method !== 'GET') {
    return;
  }
  
  // Serve a cached app shell when an offline navigation requests a deep link.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('/', responseToCache));
        }
        return response;
      }).catch(async () => (
        await caches.match(request) ||
        await caches.match('/') ||
        await caches.match('/index.html') ||
        cacheNotFound()
      ))
    );
    return;
  }

  // Strategy: Cache-first for assets, Network-first for API
  if (isAsset(request.url)) {
    // Assets (JS, CSS, fonts) - Cache first
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          
          return response;
        });
      }).catch(() => {
        // Offline - return cached or error page
        return caches.match(request) || cacheNotFound();
      })
    );
  } else {
    // API/HTML - Network first
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          
          return response;
        })
        .catch(() => {
          // Offline - return cached response
          return caches.match(request) || cacheNotFound();
        })
    );
  }
});

// Helper: Check if URL is an asset
function isAsset(url) {
  return /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)(\?|$)/i.test(url);
}

// Helper: Return offline page
function cacheNotFound() {
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>NutriGrid - Offline</title>
        <style>
          body { font-family: Arial; padding: 20px; text-align: center; }
          h1 { color: #3b82f6; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <h1>📴 You're Offline</h1>
        <p>NutriGrid works offline!</p>
        <p>Open the app or refresh to load cached data.</p>
      </body>
    </html>
    `,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// Message handler - For app communication
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync - For future notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});

async function syncRecords() {
  try {
    console.log('🔄 Syncing records...');
    // Records sync logic here
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Sync failed:', error);
    return Promise.reject(error);
  }
}

console.log('✅ NutriGrid Service Worker loaded');