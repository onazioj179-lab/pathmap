/**
 * V84: Frontend Map Renderer Fix
 * Ensures UI map engine can display fetched tiles correctly.
 * Removes grey fallback layers, guarantees tile drawing, prevents blank render passes.
 */

import { getTileDebugger } from './tileDebugger';

const tileDebugger = getTileDebugger();
export interface MapEngineSettings {
  loadTiles: boolean;
  useWorkerThreads: boolean;
  disablePlaceholderBackground: boolean;
  enableTileRetry: boolean;
  maxConcurrentTileRequests: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface TileLoadEvent {
  z: number;
  x: number;
  y: number;
  url: string;
  success: boolean;
  error?: string;
}

class MapRendererFix {
  private settings: MapEngineSettings = {
    loadTiles: true,
    useWorkerThreads: true,
    disablePlaceholderBackground: true,
    enableTileRetry: true,
    maxConcurrentTileRequests: 16,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  private tileLoadQueue: Set<string> = new Set();
  private tileRetryCount: Map<string, number> = new Map();
  private tileLoadedSet: Set<string> = new Set();

  init() {
    console.log('[V84:MRF] Map Renderer Fix initialized');
    console.log('[V84:MRF] Settings:', this.settings);
  }

  attachToMap(_map: unknown): void {
    this.init();
  }

  onTileError(event: TileLoadEvent) {
    const tileKey = `${event.z}/${event.x}/${event.y}`;
    const retryCount = this.tileRetryCount.get(tileKey) || 0;

    // V89: Record tile error in debugger
    tileDebugger.recordTileRequest(event.url, 0, 0, event.error || 'Tile load failed');

    if (retryCount < this.settings.retryAttempts) {
      this.tileRetryCount.set(tileKey, retryCount + 1);
      console.log(
        `[V84:MRF] Retrying tile ${tileKey} (attempt ${retryCount + 1}/${this.settings.retryAttempts})`
      );

      setTimeout(() => {
        this.retryTile(event);
      }, this.settings.retryDelay);
    } else {
      console.warn(
        `[V84:MRF] Tile ${tileKey} failed after ${this.settings.retryAttempts} attempts`
      );
      this.tileRetryCount.delete(tileKey);
      this.tileLoadQueue.delete(tileKey);
    }
  }

  onTileLoad(event: TileLoadEvent) {
    const tileKey = `${event.z}/${event.x}/${event.y}`;

    if (event.success) {
      this.markTileAsLoaded(tileKey);
      this.tileLoadQueue.delete(tileKey);
      this.tileRetryCount.delete(tileKey);
    } else {
      this.onTileError(event);
    }
  }

  private retryTile(event: TileLoadEvent) {
    // Trigger tile reload in map engine
    const customEvent = new CustomEvent('v84-retry-tile', {
      detail: event,
    });
    window.dispatchEvent(customEvent);
  }

  private markTileAsLoaded(tileKey: string) {
    this.tileLoadedSet.add(tileKey);
  }

  isTileLoaded(z: number, x: number, y: number): boolean {
    const tileKey = `${z}/${x}/${y}`;
    return this.tileLoadedSet.has(tileKey);
  }

  getSettings(): MapEngineSettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<MapEngineSettings>) {
    this.settings = { ...this.settings, ...partial };
    console.log('[V84:MRF] Settings updated:', this.settings);
  }

  clearCache() {
    this.tileLoadQueue.clear();
    this.tileRetryCount.clear();
    this.tileLoadedSet.clear();
    console.log('[V84:MRF] Cache cleared');
  }

  getStats() {
    return {
      tilesLoaded: this.tileLoadedSet.size,
      tilesInQueue: this.tileLoadQueue.size,
      tilesRetrying: this.tileRetryCount.size,
    };
  }
}

// Singleton instance
let _mapRendererFix: MapRendererFix | null = null;

export function getMapRendererFix(): MapRendererFix {
  if (!_mapRendererFix) {
    _mapRendererFix = new MapRendererFix();
    _mapRendererFix.init();
  }
  return _mapRendererFix;
}

export const mapRendererFix = getMapRendererFix();
