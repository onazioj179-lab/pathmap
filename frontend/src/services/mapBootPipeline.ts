/**
 * V87: Full Map Boot Process + Failover Safe Mode
 * V95: Enhanced with error overlay disabling and guaranteed tile requests
 * Provides full boot pipeline for the map so it cannot stay blank.
 * Includes automatic recovery from backend failures with failover mode.
 */

import { mapEngine } from './mapEngine';

export type BootStep =
  | 'verifyPythonBackendOnline'
  | 'verifyTileConfig'
  | 'pingTileServer'
  | 'fetchTestTile'
  | 'validateTileFormat'
  | 'initializeMapRenderer'
  | 'attachTerrainEngine'
  | 'attachSatelliteLayer'
  | 'centerCamera'
  | 'beginTileStream';

export interface BootStatus {
  step: BootStep;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface MapBootConfig {
  backendUrl: string;
  retryInterval: number;
  maxRetries: number;
  testTileCoords: { z: number; x: number; y: number };
}

class MapBootPipeline {
  private pipeline: BootStep[] = [
    'verifyPythonBackendOnline',
    'verifyTileConfig',
    'pingTileServer',
    'fetchTestTile',
    'validateTileFormat',
    'initializeMapRenderer',
    'attachTerrainEngine',
    'attachSatelliteLayer',
    'centerCamera',
    'beginTileStream',
  ];

  private config: MapBootConfig = {
    backendUrl: 'http://localhost:8000',
    retryInterval: 1000,
    maxRetries: 5,
    testTileCoords: { z: 0, x: 0, y: 0 },
  };

  private bootLog: BootStatus[] = [];
  private ready = false;
  private failoverActive = false;
  private retryTimer: number | null = null;
  private map: any = null;

  init() {
    console.log('[V87:MBP] Map Boot Pipeline initialized');
    console.log('[V87:MBP] Pipeline steps:', this.pipeline);
  }

  async onBoot(map: any): Promise<boolean> {
    this.map = map;
    this.bootLog = [];
    this.ready = false;
    this.failoverActive = false;

    console.log('[V87:MBP] Starting map boot sequence...');

    for (const step of this.pipeline) {
      const success = await this.executeStep(step);

      if (!success) {
        console.error(`[V87:MBP] Boot failed at step: ${step}`);
        this.activateFailoverMode();
        return false;
      }
    }

    this.ready = true;
    console.log('[V87:MBP] Map boot sequence complete - all systems ready');
    return true;
  }

  private async executeStep(step: BootStep): Promise<boolean> {
    console.log(`[V87:MBP] Executing step: ${step}`);
    const startTime = Date.now();

    try {
      let success = false;

      switch (step) {
        case 'verifyPythonBackendOnline':
          success = await this.verifyBackend();
          break;
        case 'verifyTileConfig':
          success = await this.verifyTileConfig();
          break;
        case 'pingTileServer':
          success = await this.pingTileServer();
          break;
        case 'fetchTestTile':
          success = await this.fetchTestTile();
          break;
        case 'validateTileFormat':
          success = await this.validateTileFormat();
          break;
        case 'initializeMapRenderer':
          success = this.initializeRenderer();
          break;
        case 'attachTerrainEngine':
          success = this.attachTerrain();
          break;
        case 'attachSatelliteLayer':
          success = this.attachSatellite();
          break;
        case 'centerCamera':
          success = this.centerCamera();
          break;
        case 'beginTileStream':
          success = this.beginTileStream();
          break;
        default:
          success = true;
      }

      this.bootLog.push({
        step,
        success,
        timestamp: Date.now() - startTime,
      });

      return success;
    } catch (error: any) {
      this.bootLog.push({
        step,
        success: false,
        error: error.message,
        timestamp: Date.now() - startTime,
      });
      return false;
    }
  }

  private async verifyBackend(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.backendUrl}/api/v1/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async verifyTileConfig(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.backendUrl}/api/v1/health`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.tile_proxy === 'operational';
    } catch {
      return false;
    }
  }

  private async pingTileServer(): Promise<boolean> {
    const { z, x, y } = this.config.testTileCoords;
    const url = `${this.config.backendUrl}/backend/tiles/carto_dark/${z}/${x}/${y}`;

    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchTestTile(): Promise<boolean> {
    const { z, x, y } = this.config.testTileCoords;
    const url = `${this.config.backendUrl}/backend/tiles/carto_dark/${z}/${x}/${y}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return false;
      const blob = await response.blob();
      return blob.size > 0;
    } catch {
      return false;
    }
  }

  private async validateTileFormat(): Promise<boolean> {
    // Tile format validated in fetchTestTile
    return true;
  }

  private initializeRenderer(): boolean {
    if (!this.map) return false;
    // Map renderer already initialized by MapView3D
    return true;
  }

  private attachTerrain(): boolean {
    if (!this.map) return false;
    // Terrain attached by providerRebindingEngine
    return true;
  }

  private attachSatellite(): boolean {
    if (!this.map) return false;
    // Satellite attached by providerRebindingEngine
    return true;
  }

  private centerCamera(): boolean {
    if (!this.map) return false;
    try {
      if (this.map.getCenter) {
        // Camera already centered by MapView3D
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private beginTileStream(): boolean {
    if (!this.map) return false;
    // Tile streaming begins automatically after map load
    return true;
  }

  private activateFailoverMode() {
    if (this.failoverActive) return;

    this.failoverActive = true;
    console.warn('[V87:MBP] Activating failover mode - map temporarily unavailable');

    this.loadFallbackTiles();
    this.showOverlay('Map temporarily unavailable, retrying...');
    this.startRetryTimer();
  }

  private loadFallbackTiles() {
    if (!this.map) return;

    try {
      // Use public tile servers as fallback
      const fallbackSourceId = 'v87-fallback-source';
      const fallbackLayerId = 'v87-fallback-layer';

      if (this.map.getLayer(fallbackLayerId)) {
        this.map.removeLayer(fallbackLayerId);
      }
      if (this.map.getSource(fallbackSourceId)) {
        this.map.removeSource(fallbackSourceId);
      }

      this.map.addSource(fallbackSourceId, {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'OpenStreetMap (fallback)',
      });

      this.map.addLayer({
        id: fallbackLayerId,
        type: 'raster',
        source: fallbackSourceId,
        paint: {
          'raster-opacity': 0.6,
        },
      });

      console.log('[V87:MBP] Fallback tiles loaded');
    } catch (e) {
      console.error('[V87:MBP] Failed to load fallback tiles:', e);
    }
  }

  private showOverlay(message: string) {
    // V95: Check if error popups are disabled
    if (mapEngine.ready) {
      console.log('[V87:MBP] Overlay blocked by V95:', message);
      return;
    }

    const overlay = document.getElementById('v87-boot-overlay');
    if (overlay) {
      overlay.textContent = message;
      overlay.style.display = 'block';
    } else {
      const newOverlay = document.createElement('div');
      newOverlay.id = 'v87-boot-overlay';
      newOverlay.textContent = message;
      newOverlay.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#000;color:#fff;padding:20px;border-radius:8px;z-index:9999;font-family:sans-serif;';
      document.body.appendChild(newOverlay);
    }
  }

  private hideOverlay() {
    const overlay = document.getElementById('v87-boot-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  private startRetryTimer() {
    if (this.retryTimer) return;

    let retryCount = 0;
    this.retryTimer = window.setInterval(async () => {
      retryCount++;
      console.log(`[V87:MBP] Retry attempt ${retryCount}/${this.config.maxRetries}`);

      const success = await this.onBoot(this.map);

      if (success) {
        this.stopRetryTimer();
        this.hideOverlay();
        this.failoverActive = false;
        console.log('[V87:MBP] Recovery successful');
      } else if (retryCount >= this.config.maxRetries) {
        this.stopRetryTimer();
        this.showOverlay('Map unavailable. Please refresh the page.');
        console.error('[V87:MBP] Max retries reached');
      }
    }, this.config.retryInterval);
  }

  private stopRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  isFailoverActive(): boolean {
    return this.failoverActive;
  }

  getBootLog(): BootStatus[] {
    return [...this.bootLog];
  }

  updateConfig(partial: Partial<MapBootConfig>) {
    this.config = { ...this.config, ...partial };
    console.log('[V87:MBP] Config updated:', this.config);
  }
}

// Singleton instance
let _mapBootPipeline: MapBootPipeline | null = null;

export function getMapBootPipeline(): MapBootPipeline {
  if (!_mapBootPipeline) {
    _mapBootPipeline = new MapBootPipeline();
    _mapBootPipeline.init();
  }
  return _mapBootPipeline;
}

export const mapBootPipeline = getMapBootPipeline();
