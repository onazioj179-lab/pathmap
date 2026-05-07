/*
 V76: Global Offline Terrain Cache (GOTC)
 - Intercepts fetch() for known tile servers
 - Caches tiles in IndexedDB with optional encryption stub
 - Serves from cache when offline or network fails
 - Prunes old entries to respect a max size
*/

import { aiTerrainPatchingEngine } from './aiTerrainPatchingEngine';
import { automaticQualityScalingSystem } from './automaticQualityScalingSystem';
import { deriveDeviceKey } from './deviceBinding';

type CacheEntry = {
  key: string;
  ct: string | null; // content-type
  ts: number;
  data: ArrayBuffer; // iv||ciphertext (encrypted)
  size: number;
};

const DB_NAME = 'pf_tiles_v1';
const STORE = 'tiles';
const MAX_BYTES_DEFAULT = 300 * 1024 * 1024; // 300MB default

let maxBytes = MAX_BYTES_DEFAULT;
let dbPromise: Promise<IDBDatabase> | null = null;
let intercepting = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'key' });
        os.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getSize(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as CacheEntry[];
      resolve(list.reduce((a, b) => a + (b.size || 0), 0));
    };
    req.onerror = () => reject(req.error);
  });
}

async function put(db: IDBDatabase, entry: CacheEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(entry);
  });
}

async function get(db: IDBDatabase, key: string): Promise<CacheEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function pruneIfNeeded(db: IDBDatabase) {
  const total = await getSize(db);
  if (total < maxBytes) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const idx = tx.objectStore(STORE).index('ts');
    const cursorReq = idx.openCursor();
    let freed = 0;
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (!cur) { resolve(); return; }
      const val = cur.value as CacheEntry;
      freed += val.size || 0;
      cur.delete();
      if (total - freed < maxBytes * 0.85) { // leave headroom
        resolve();
      } else {
        cur.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function encryptBytes(plain: ArrayBuffer, purpose: string): Promise<ArrayBuffer> {
  const key = await deriveDeviceKey(purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const out = new Uint8Array(iv.byteLength + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.byteLength);
  return out.buffer;
}

async function decryptBytes(enc: ArrayBuffer, purpose: string): Promise<ArrayBuffer> {
  const key = await deriveDeviceKey(purpose);
  const bytes = new Uint8Array(enc);
  if (bytes.byteLength < 13) throw new Error('bad ciphertext');
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return plain;
}

const TILE_WHITELIST = [
  's3.amazonaws.com', // Terrarium DEM
  'tiles.maps.eox.at', // Sentinel-2 cloudless
  'basemaps.cartocdn.com',
  'demotiles.maplibre.org'
];

function isTileUrl(u: URL) {
  const sameOrigin = u.origin === window.location.origin;
  const backendPath = u.pathname.startsWith('/api/v1/tiles/') || u.pathname.startsWith('/api/v1/terrain/');
  return sameOrigin && backendPath || TILE_WHITELIST.some((h) => u.hostname.endsWith(h));
}

async function handleTileFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const u = new URL(typeof input === 'string' ? input : (input as Request).url);
  const key = u.toString();
  const db = await openDb();
  const online = navigator.onLine;
  const tier = automaticQualityScalingSystem.getTier();

  if (!online) {
    const hit = await get(db, key);
    if (hit) {
      try {
        const plain = await decryptBytes(hit.data, 'GOTC_TILE');
        return new Response(plain, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
      } catch {}
      return new Response(hit.data, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
    }
  }

  try {
    const res = await (globalThis as any).__pf_orig_fetch(input, init);
    if (!res || !res.ok) {
      const hit = await get(db, key);
      if (hit) {
        try {
          const plain = await decryptBytes(hit.data, 'GOTC_TILE');
          return new Response(plain, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
        } catch {}
        return new Response(hit.data, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
      }
      return res;
    }

    let blob = await res.clone().blob();
    const ct = res.headers.get('content-type');

    // ATPE + PEL enhancements (skip heavy on tier 3)
    try {
      if (tier !== 3 && ct && /^image\//i.test(ct)) {
        // Prioritize missing patching then enhancement
        blob = await aiTerrainPatchingEngine.synthesizeIfMissing(key, ct, blob);
        blob = await aiTerrainPatchingEngine.process(key, ct, blob);
      }
    } catch {}

    const bufPlain = await blob.arrayBuffer();
    const buf = await encryptBytes(bufPlain, 'GOTC_TILE');
    await pruneIfNeeded(db);
    await put(db, { key, data: buf, ct, ts: Date.now(), size: buf.byteLength });
    return new Response(bufPlain, { headers: { 'content-type': ct || 'application/octet-stream' } });
  } catch {
    const hit = await get(db, key);
    if (hit) {
      try {
        const plain = await decryptBytes(hit.data, 'GOTC_TILE');
        return new Response(plain, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
      } catch {}
      return new Response(hit.data, { headers: { 'content-type': hit.ct || 'application/octet-stream' } });
    }
    throw new TypeError('Network error and no cache');
  }
}

export const globalOfflineTerrainCache = {
  start(options?: { maxBytes?: number }) {
    if (intercepting) return;
    if (options?.maxBytes && options.maxBytes > 50 * 1024 * 1024) {
      maxBytes = options.maxBytes;
    }
    (globalThis as any).__pf_orig_fetch = (globalThis as any).__pf_orig_fetch || globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = new URL(typeof input === 'string' ? input : (input as Request).url);
        if (isTileUrl(url)) return handleTileFetch(input, init);
      } catch {}
      return (globalThis as any).__pf_orig_fetch(input, init);
    };
    intercepting = true;
  }
};
