// LiveChat Service Worker - PWA Support
const CACHE_NAME = 'livechat-cache-v1';
const STATIC_CACHE = 'livechat-static-v1';
const DYNAMIC_CACHE = 'livechat-dynamic-v1';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/notification.mp3',
];

// API routes that should use network-first strategy
const API_ROUTES = ['/api/', '/socket.io/', '/storage/', '/s3/', '/evolution/'];

// Routes that should always use network (no caching)
const NO_CACHE_ROUTES = ['/api/auth/', '/api/whatsapp/webhooks/'];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versions of our caches
              return name.startsWith('livechat-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Check if this is a route that should never be cached
  if (NO_CACHE_ROUTES.some(route => url.pathname.startsWith(route))) {
    event.respondWith(networkOnly(request));
    return;
  }
  
  // Check if this is an API route - use network-first
  if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // For navigation requests (HTML pages), use network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
  
  // For static assets (JS, CSS, images), use cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Check if the request is for a static asset
function isStaticAsset(pathname) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

// Network only - no caching
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network only failed:', error);
    throw error;
  }
}

// Network first with cache fallback
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Clone and cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Cache first with network fallback
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    throw error;
  }
}

// Stale while revalidate
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Revalidation failed:', error);
      return cachedResponse;
    });
  
  return cachedResponse || fetchPromise;
}

// Navigation handler with offline fallback
async function navigationHandler(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful navigation responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Navigation failed, trying cache:', request.url);
    
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fall back to offline page
    console.log('[SW] Serving offline page');
    return caches.match('/offline.html');
  }
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('livechat-'))
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});

// Background sync for offline actions (future use)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  // Implementation for syncing pending messages when back online
  console.log('[SW] Syncing pending messages...');
}

// Push notifications (future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  const options = {
    body: data.body || 'Nova mensagem recebida',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'LiveChat', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window/tab open with the target URL
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // If not, open a new window/tab
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
