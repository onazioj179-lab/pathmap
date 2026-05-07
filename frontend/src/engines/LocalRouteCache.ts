/**
 * PATHFINDER V52 - LOCAL ROUTE CACHE (LRC)
 * 
 * Fast route retrieval with SHA-256 fingerprinting.
 * Performance target: <50ms cache lookup, instant retrieval.
 * Storage: 100 routes max, compressed JSON, LRU eviction.
 */

interface RouteQuery {
  origin: [number, number]; // [lat, lon]
  destination: [number, number];
  waypoints?: Array<[number, number]>;
  profile?: 'walking' | 'cycling' | 'driving';
  avoid?: string[];
}

interface CachedRoute {
  fingerprint: string;
  query: RouteQuery;
  route: any; // Full route object from backend
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  size: number;
}

interface CacheStats {
  routeCount: number;
  totalSize: number;
  hitRate: number;
  avgRetrievalTime: number;
}

const DB_NAME = 'PathfinderRouteCache';
const DB_VERSION = 1;
const STORE_NAME = 'routes';
const MAX_ROUTES = 100;
const LOOKUP_TIMEOUT = 50; // ms

export class LocalRouteCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private stats: CacheStats = {
    routeCount: 0,
    totalSize: 0,
    hitRate: 0,
    avgRetrievalTime: 0
  };
  private hits = 0;
  private misses = 0;
  private retrievalTimes: number[] = [];

  constructor() {
    this.initPromise = this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadStats().then(resolve);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccess', 'lastAccess', { unique: false });
          store.createIndex('accessCount', 'accessCount', { unique: false });
        }
      };
    });
  }

  private async loadStats(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        this.stats.routeCount = request.result;
        
        // Load size info
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const routes: CachedRoute[] = getAllRequest.result;
          this.stats.totalSize = routes.reduce((sum, r) => sum + r.size, 0);
          resolve();
        };
        getAllRequest.onerror = () => resolve();
      };

      request.onerror = () => resolve();
    });
  }

  private async generateFingerprint(query: RouteQuery): Promise<string> {
    // Normalize query for consistent fingerprinting
    const normalized = {
      origin: query.origin.map(c => c.toFixed(6)),
      destination: query.destination.map(c => c.toFixed(6)),
      waypoints: query.waypoints?.map(w => w.map(c => c.toFixed(6))),
      profile: query.profile || 'driving',
      avoid: query.avoid?.sort()
    };

    const queryString = JSON.stringify(normalized);
    const encoder = new TextEncoder();
    const data = encoder.encode(queryString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async getRoute(query: RouteQuery): Promise<any | null> {
    await this.initPromise;
    if (!this.db) return null;

    const start = performance.now();
    const fingerprint = await this.generateFingerprint(query);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.misses++;
        this.recordRetrievalTime(performance.now() - start);
        resolve(null);
      }, LOOKUP_TIMEOUT);

      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(fingerprint);

      request.onsuccess = () => {
        clearTimeout(timeout);
        const elapsed = performance.now() - start;
        this.recordRetrievalTime(elapsed);

        if (request.result) {
          this.hits++;
          
          // Update access stats
          const cached: CachedRoute = request.result;
          cached.accessCount++;
          cached.lastAccess = Date.now();
          store.put(cached);

          console.log(`[LRC] Cache HIT ${fingerprint.substring(0, 8)} (${elapsed.toFixed(1)}ms)`);
          resolve(cached.route);
        } else {
          this.misses++;
          console.log(`[LRC] Cache MISS ${fingerprint.substring(0, 8)} (${elapsed.toFixed(1)}ms)`);
          resolve(null);
        }

        this.updateHitRate();
      };

      request.onerror = () => {
        clearTimeout(timeout);
        this.misses++;
        resolve(null);
      };
    });
  }

  async cacheRoute(query: RouteQuery, route: any): Promise<boolean> {
    await this.initPromise;
    if (!this.db) return false;

    const fingerprint = await this.generateFingerprint(query);
    
    // Compress route data
    const routeJSON = JSON.stringify(route);
    const size = routeJSON.length;

    // Check if cache is full
    if (this.stats.routeCount >= MAX_ROUTES) {
      console.warn(`[LRC] Cache full (${this.stats.routeCount} routes), evicting LRU`);
      await this.evictLRU();
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cached: CachedRoute = {
        fingerprint,
        query,
        route,
        timestamp: Date.now(),
        accessCount: 1,
        lastAccess: Date.now(),
        size
      };

      const request = store.put(cached);

      request.onsuccess = () => {
        this.stats.routeCount++;
        this.stats.totalSize += size;
        console.log(`[LRC] Cached route ${fingerprint.substring(0, 8)} (${(size / 1024).toFixed(1)}KB)`);
        resolve(true);
      };

      request.onerror = () => {
        console.error(`[LRC] Failed to cache route:`, request.error);
        resolve(false);
      };
    });
  }

  private async evictLRU(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('lastAccess');
      const request = index.openCursor();

      let oldest: CachedRoute | null = null;
      let oldestKey: string | null = null;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const cached: CachedRoute = cursor.value;
          if (!oldest || cached.lastAccess < oldest.lastAccess) {
            oldest = cached;
            oldestKey = cached.fingerprint;
          }
          cursor.continue();
        } else {
          // Delete oldest route
          if (oldestKey) {
            store.delete(oldestKey);
            this.stats.routeCount--;
            this.stats.totalSize -= (oldest?.size || 0);
            console.log(`[LRC] Evicted route ${oldestKey.substring(0, 8)}`);
          }
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  }

  private updateHitRate(): void {
    const total = this.hits + this.misses;
    this.stats.hitRate = total > 0 ? (this.hits / total) * 100 : 0;
  }

  private recordRetrievalTime(time: number): void {
    this.retrievalTimes.push(time);
    if (this.retrievalTimes.length > 100) {
      this.retrievalTimes.shift();
    }
    
    this.stats.avgRetrievalTime = this.retrievalTimes.reduce((sum, t) => sum + t, 0) / this.retrievalTimes.length;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  async clearCache(): Promise<void> {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.stats = {
          routeCount: 0,
          totalSize: 0,
          hitRate: 0,
          avgRetrievalTime: 0
        };
        this.hits = 0;
        this.misses = 0;
        this.retrievalTimes = [];
        console.log('[LRC] Cache cleared');
        resolve();
      };

      request.onerror = () => resolve();
    });
  }

  async preloadFrequentRoutes(routes: Array<{ query: RouteQuery; route: any }>): Promise<void> {
    console.log(`[LRC] Preloading ${routes.length} frequent routes`);
    
    for (const { query, route } of routes) {
      await this.cacheRoute(query, route);
    }
    
    console.log(`[LRC] Preload complete (${this.stats.routeCount} routes cached)`);
  }

  async exportCache(): Promise<CachedRoute[]> {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async importCache(routes: CachedRoute[]): Promise<void> {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      routes.forEach(route => {
        store.put(route);
      });

      tx.oncomplete = () => {
        this.loadStats().then(resolve);
        console.log(`[LRC] Imported ${routes.length} routes`);
      };

      tx.onerror = () => resolve();
    });
  }
}
