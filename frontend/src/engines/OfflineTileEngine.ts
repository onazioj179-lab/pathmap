/**
 * PATHFINDER V52 - OFFLINE TILE ENGINE (OTE)
 * 
 * Tile caching with IndexedDB storage for offline navigation.
 * Performance target: <250ms cache check, <500ms tile retrieval.
 * Storage: 500MB total, 18MB per zoom level, LRU eviction.
 */

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

interface CachedTile {
  coord: TileCoord;
  blob: Blob;
  timestamp: number;
  size: number;
  accessCount: number;
  lastAccess: number;
}

interface CacheStats {
  totalSize: number;
  tileCount: number;
  hitRate: number;
  zoomLevels: Record<number, number>;
}

const DB_NAME = 'PathfinderOfflineTiles';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const ZOOM_BUDGET = 18 * 1024 * 1024; // 18MB per zoom
const CACHE_CHECK_TIMEOUT = 250; // ms
const TILE_RETRIEVAL_TIMEOUT = 500; // ms

export class OfflineTileEngine {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private stats: CacheStats = {
    totalSize: 0,
    tileCount: 0,
    hitRate: 0,
    zoomLevels: {}
  };
  private hits = 0;
  private misses = 0;

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
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccess', 'lastAccess', { unique: false });
          store.createIndex('zoom', 'coord.z', { unique: false });
        }
      };
    });
  }

  private tileKey(coord: TileCoord): string {
    return `${coord.z}/${coord.x}/${coord.y}`;
  }

  private async loadStats(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const tiles: CachedTile[] = request.result;
        this.stats.totalSize = tiles.reduce((sum, t) => sum + t.size, 0);
        this.stats.tileCount = tiles.length;
        
        this.stats.zoomLevels = {};
        tiles.forEach(t => {
          this.stats.zoomLevels[t.coord.z] = (this.stats.zoomLevels[t.coord.z] || 0) + 1;
        });

        resolve();
      };

      request.onerror = () => resolve();
    });
  }

  async getTile(coord: TileCoord): Promise<Blob | null> {
    await this.initPromise;
    if (!this.db) return null;

    const start = performance.now();
    const key = this.tileKey(coord);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.misses++;
        resolve(null);
      }, CACHE_CHECK_TIMEOUT);

      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        clearTimeout(timeout);
        const elapsed = performance.now() - start;

        if (request.result) {
          this.hits++;
          
          // Update access stats
          const tile: CachedTile = request.result;
          tile.accessCount++;
          tile.lastAccess = Date.now();
          store.put({ key, ...tile });

          console.log(`[OTE] Cache HIT ${key} (${elapsed.toFixed(1)}ms)`);
          resolve(tile.blob);
        } else {
          this.misses++;
          console.log(`[OTE] Cache MISS ${key} (${elapsed.toFixed(1)}ms)`);
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

  async cacheTile(coord: TileCoord, blob: Blob): Promise<boolean> {
    await this.initPromise;
    if (!this.db) return false;

    const key = this.tileKey(coord);
    const size = blob.size;

    // Check zoom budget
    const zoomSize = this.stats.zoomLevels[coord.z] || 0;
    if (zoomSize * 100 > ZOOM_BUDGET) { // estimate 100KB per tile
      console.warn(`[OTE] Zoom ${coord.z} budget exceeded, evicting LRU tiles`);
      await this.evictZoomLRU(coord.z);
    }

    // Check total cache size
    if (this.stats.totalSize + size > MAX_CACHE_SIZE) {
      console.warn(`[OTE] Cache full (${(this.stats.totalSize / 1024 / 1024).toFixed(1)}MB), evicting LRU`);
      await this.evictLRU(size);
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const tile: CachedTile = {
        coord,
        blob,
        timestamp: Date.now(),
        size,
        accessCount: 1,
        lastAccess: Date.now()
      };

      const request = store.put({ key, ...tile });

      request.onsuccess = () => {
        this.stats.totalSize += size;
        this.stats.tileCount++;
        this.stats.zoomLevels[coord.z] = (this.stats.zoomLevels[coord.z] || 0) + 1;
        console.log(`[OTE] Cached ${key} (${(size / 1024).toFixed(1)}KB)`);
        resolve(true);
      };

      request.onerror = () => {
        console.error(`[OTE] Failed to cache ${key}:`, request.error);
        resolve(false);
      };
    });
  }

  private async evictLRU(neededSpace: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('lastAccess');
      const request = index.openCursor();

      let freedSpace = 0;
      const toDelete: string[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && freedSpace < neededSpace) {
          const tile: CachedTile = cursor.value;
          toDelete.push(this.tileKey(tile.coord));
          freedSpace += tile.size;
          cursor.continue();
        } else {
          // Delete collected tiles
          toDelete.forEach(key => store.delete(key));
          this.stats.totalSize -= freedSpace;
          this.stats.tileCount -= toDelete.length;
          console.log(`[OTE] Evicted ${toDelete.length} tiles (${(freedSpace / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  }

  private async evictZoomLRU(zoom: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('zoom');
      const range = IDBKeyRange.only(zoom);
      const request = index.openCursor(range);

      const tiles: Array<{ key: string; tile: CachedTile }> = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const tile: CachedTile = cursor.value;
          tiles.push({ key: this.tileKey(tile.coord), tile });
          cursor.continue();
        } else {
          // Sort by LRU and delete oldest 25%
          tiles.sort((a, b) => a.tile.lastAccess - b.tile.lastAccess);
          const toDelete = tiles.slice(0, Math.ceil(tiles.length * 0.25));
          
          toDelete.forEach(({ key, tile }) => {
            store.delete(key);
            this.stats.totalSize -= tile.size;
            this.stats.tileCount--;
          });

          this.stats.zoomLevels[zoom] -= toDelete.length;
          console.log(`[OTE] Evicted ${toDelete.length} tiles from zoom ${zoom}`);
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
          totalSize: 0,
          tileCount: 0,
          hitRate: 0,
          zoomLevels: {}
        };
        this.hits = 0;
        this.misses = 0;
        console.log('[OTE] Cache cleared');
        resolve();
      };

      request.onerror = () => resolve();
    });
  }

  async preloadBounds(bounds: { north: number; south: number; east: number; west: number }, zoom: number): Promise<void> {
    const tiles: TileCoord[] = [];
    
    // Calculate tile range
    const scale = Math.pow(2, zoom);
    const xMin = Math.floor((bounds.west + 180) / 360 * scale);
    const xMax = Math.floor((bounds.east + 180) / 360 * scale);
    const yMin = Math.floor((1 - Math.log(Math.tan(bounds.north * Math.PI / 180) + 1 / Math.cos(bounds.north * Math.PI / 180)) / Math.PI) / 2 * scale);
    const yMax = Math.floor((1 - Math.log(Math.tan(bounds.south * Math.PI / 180) + 1 / Math.cos(bounds.south * Math.PI / 180)) / Math.PI) / 2 * scale);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z: zoom, x, y });
      }
    }

    console.log(`[OTE] Preloading ${tiles.length} tiles for zoom ${zoom}`);
    
    // Fetch and cache tiles (stub - actual fetch would use tile provider)
    for (const coord of tiles) {
      const cached = await this.getTile(coord);
      if (!cached) {
        // In real implementation, fetch from tile provider
        console.log(`[OTE] Would fetch ${this.tileKey(coord)}`);
      }
    }
  }
}
