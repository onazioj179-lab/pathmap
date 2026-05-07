// PathMap Service Worker
// Handles offline caching, background sync, and push notifications

const CACHE_NAME = 'pathmap-v1';
const STATIC_CACHE = 'pathmap-static-v1';
const DYNAMIC_CACHE = 'pathmap-dynamic-v1';
const TILE_CACHE = 'pathmap-tiles-v1';
const ROUTE_HISTORY_CACHE = 'pathmap-route-history-v1';

// V97: Cache size limits (in bytes and entries)
const CACHE_LIMITS = {
  TILE_MAX_ENTRIES: 500, // Max 500 tiles (~50MB at 100KB avg)
  TILE_MAX_SIZE: 50 * 1024 * 1024, // 50MB max for tiles
  DYNAMIC_MAX_ENTRIES: 100,
  ROUTE_HISTORY_MAX_ENTRIES: 50,
  STATIC_MAX_SIZE: 10 * 1024 * 1024, // 10MB for static assets
};

// Static assets to cache on install
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Tile server URLs to cache
const TILE_ORIGINS = [
  'https://tile.openstreetmap.org',
  'https://api.maptiler.com',
  'https://tiles.stadiamaps.com',
  'https://basemaps.cartocdn.com',
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker');
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => {
              return (
                name.startsWith('pathmap-') &&
                name !== STATIC_CACHE &&
                name !== DYNAMIC_CACHE &&
                name !== TILE_CACHE
              );
            })
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Handle tile requests with cache-first strategy
  if (TILE_ORIGINS.some(origin => url.href.startsWith(origin))) {
    event.respondWith(handleTileRequest(event.request));
    return;
  }

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(handleStaticRequest(event.request));
});

// Cache-first for tiles with size limits
async function handleTileRequest(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    // Return cached and update in background
    fetchAndCache(request, TILE_CACHE);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      // V97: Check cache size before adding
      await enforceCacheLimit(TILE_CACHE, CACHE_LIMITS.TILE_MAX_ENTRIES);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Tile fetch failed:', error);
    return new Response('', { status: 503 });
  }
}

// V97: Enforce cache entry limits (LRU eviction)
async function enforceCacheLimit(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length >= maxEntries) {
      // Remove oldest entries (first 10% of cache)
      const removeCount = Math.ceil(keys.length * 0.1);
      for (let i = 0; i < removeCount; i++) {
        await cache.delete(keys[i]);
      }
      console.log(`[SW] Cache ${cacheName}: removed ${removeCount} old entries`);
    }
  } catch (error) {
    console.log('[SW] Cache limit enforcement failed:', error);
  }
}

// Network-first for API calls
async function handleApiRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Try cache for GET requests
    if (request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    // Return offline response
    return new Response(JSON.stringify({ error: 'offline', message: 'You are offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Cache-first for static assets
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline page for navigation
    if (request.mode === 'navigate') {
      return cache.match('/index.html');
    }
    throw error;
  }
}

// Helper to fetch and cache in background
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response);
    }
  } catch (error) {
    // Ignore background fetch errors
  }
}

// Background sync for location updates
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'location-sync') {
    event.waitUntil(syncPendingLocations());
  }
});

// Sync pending location updates
async function syncPendingLocations() {
  try {
    const db = await openDB();
    const pending = await db.getAll('pending-locations');

    for (const location of pending) {
      try {
        const response = await fetch('/api/v1/tracking/location/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(location),
        });

        if (response.ok) {
          await db.delete('pending-locations', location.id);
        }
      } catch (error) {
        console.log('[SW] Failed to sync location:', error);
      }
    }
  } catch (error) {
    console.log('[SW] Sync error:', error);
  }
}

// Simple IndexedDB wrapper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pathmap-sw', 2); // V97: Bumped version for route-history

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        getAll: store =>
          new Promise((res, rej) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          }),
        delete: (store, key) =>
          new Promise((res, rej) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).delete(key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          }),
        // V97: Add method for route history
        transaction: (store, mode) => db.transaction(store, mode),
      });
    };

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-locations')) {
        db.createObjectStore('pending-locations', { keyPath: 'id' });
      }
      // V97: Route history store for replay functionality
      if (!db.objectStoreNames.contains('route-history')) {
        const routeStore = db.createObjectStore('route-history', { keyPath: 'id' });
        routeStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Push notification handling
self.addEventListener('push', event => {
  console.log('[SW] Push received');

  let data = { title: 'PathMap', body: 'New update', icon: '/icon-192.png' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {},
      actions: data.actions || [],
    })
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  if (data && data.url) {
    url = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Periodic background sync for continuous tracking
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync:', event.tag);

  if (event.tag === 'location-update') {
    event.waitUntil(updateLocationInBackground());
  }
});

async function updateLocationInBackground() {
  // Get current position and send to server
  // This requires geolocation permission to be granted
  console.log('[SW] Background location update triggered');
}

// Message handling from main app
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_TILES') {
    event.waitUntil(cacheTiles(event.data.tiles));
  }

  if (event.data.type === 'STORE_LOCATION') {
    event.waitUntil(storeLocationForSync(event.data.location));
  }

  // V97: Route history persistence
  if (event.data.type === 'STORE_ROUTE') {
    event.waitUntil(storeRouteHistory(event.data.route));
  }

  if (event.data.type === 'GET_ROUTE_HISTORY') {
    getRouteHistory(event.data.limit || 20).then(history => {
      event.ports[0]?.postMessage({ type: 'ROUTE_HISTORY', history });
    });
  }

  // V97: WebSocket backoff utilities
  if (event.data.type === 'WS_RESET_BACKOFF') {
    resetBackoff();
    event.ports[0]?.postMessage({ type: 'WS_BACKOFF_RESET', attempts: 0 });
  }

  if (event.data.type === 'WS_GET_BACKOFF') {
    const delay = incrementBackoff();
    event.ports[0]?.postMessage({
      type: 'WS_BACKOFF_DELAY',
      delay,
      attempts: WS_BACKOFF.attempts,
    });
  }
});

// Pre-cache map tiles for offline use
async function cacheTiles(tiles) {
  const cache = await caches.open(TILE_CACHE);

  for (const tileUrl of tiles) {
    try {
      const response = await fetch(tileUrl);
      if (response.ok) {
        await cache.put(tileUrl, response);
      }
    } catch (error) {
      console.log('[SW] Failed to cache tile:', tileUrl);
    }
  }
}

// Store location for background sync
async function storeLocationForSync(location) {
  try {
    const db = await openDB();
    const tx = db.transaction('pending-locations', 'readwrite');
    tx.objectStore('pending-locations').add({
      id: Date.now(),
      ...location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log('[SW] Failed to store location:', error);
  }
}

console.log('[SW] Service Worker loaded');

// V97: Route History Persistence - Store routes for replay
async function storeRouteHistory(routeData) {
  try {
    const db = await openDB();
    const tx = db.transaction('route-history', 'readwrite');
    tx.objectStore('route-history').add({
      id: Date.now(),
      route: routeData,
      timestamp: new Date().toISOString(),
    });

    // Enforce limit
    const all = await db.getAll('route-history');
    if (all.length > CACHE_LIMITS.ROUTE_HISTORY_MAX_ENTRIES) {
      // Remove oldest
      const oldest = all.slice(0, all.length - CACHE_LIMITS.ROUTE_HISTORY_MAX_ENTRIES);
      for (const item of oldest) {
        await db.delete('route-history', item.id);
      }
    }
  } catch (error) {
    console.log('[SW] Route history store failed:', error);
  }
}

// V97: Get route history for replay
async function getRouteHistory(limit = 20) {
  try {
    const db = await openDB();
    const all = await db.getAll('route-history');
    return all.slice(-limit).reverse();
  } catch (error) {
    console.log('[SW] Route history fetch failed:', error);
    return [];
  }
}

// V97: WebSocket reconnection with exponential backoff
const WS_BACKOFF = {
  base: 1000, // Start at 1 second
  max: 30000, // Max 30 seconds
  multiplier: 2,
  jitter: 0.1, // 10% jitter
  attempts: 0,
};

function calculateBackoff() {
  const delay = Math.min(
    WS_BACKOFF.base * Math.pow(WS_BACKOFF.multiplier, WS_BACKOFF.attempts),
    WS_BACKOFF.max
  );
  // Add jitter
  const jitter = delay * WS_BACKOFF.jitter * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

function resetBackoff() {
  WS_BACKOFF.attempts = 0;
}

function incrementBackoff() {
  WS_BACKOFF.attempts++;
  return calculateBackoff();
}

// Expose backoff utilities via message passing
self.WS_BACKOFF_UTILS = {
  calculate: calculateBackoff,
  reset: resetBackoff,
  increment: incrementBackoff,
  getAttempts: () => WS_BACKOFF.attempts,
};
