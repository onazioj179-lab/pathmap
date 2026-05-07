/**
 * V86: Terrain & Imagery Provider Rebinding
 * Reattaches core providers to the Earth engine.
 * Ensures terrain, base tiles, and satellite layers all have working providers.
 */

export interface ProviderBindings {
  terrainUrl: string | null;
  baseUrl: string | null;
  satelliteUrl: string | null;
}

export interface FallbackConfig {
  fallback_terrain: string;
  fallback_tile: string;
}

class ProviderRebindingEngine {
  private bindings: ProviderBindings = {
    terrainUrl: null,
    baseUrl: null,
    satelliteUrl: null
  };

  private fallback: FallbackConfig = {
    fallback_terrain: '/fallback/terrain_lowres.png',
    fallback_tile: '/fallback/tile_blank.png'
  };

  private map: any = null;
  private bound = false;

  init() {
    console.log('[V86:PRE] Provider Rebinding Engine initialized');
  }

  bindTerrain(url: string) {
    this.bindings.terrainUrl = url;
    console.log(`[V86:PRE] Terrain provider bound: ${url}`);
    if (this.map) this._applyTerrainSource();
  }

  bindImagery(url: string) {
    this.bindings.baseUrl = url;
    console.log(`[V86:PRE] Base imagery provider bound: ${url}`);
    if (this.map) this._applyBaseSource();
  }

  bindSatellite(url: string) {
    this.bindings.satelliteUrl = url;
    console.log(`[V86:PRE] Satellite provider bound: ${url}`);
    if (this.map) this._applySatelliteSource();
  }

  setFallback(config: Partial<FallbackConfig>) {
    this.fallback = { ...this.fallback, ...config };
    console.log('[V86:PRE] Fallback config updated:', this.fallback);
  }

  attachToMap(map: any) {
    this.map = map;
    console.log('[V86:PRE] Attaching providers to map...');
    
    if (!this.bound) {
      this._applyAllSources();
      this.bound = true;
      console.log('[V86:PRE] All providers attached to map');
    }
  }

  private _applyTerrainSource() {
    if (!this.map || !this.bindings.terrainUrl) return;

    try {
      const terrainSourceId = 'v86-terrain-source';
      
      if (this.map.getSource(terrainSourceId)) {
        this.map.removeSource(terrainSourceId);
      }

      this.map.addSource(terrainSourceId, {
        type: 'raster-dem',
        tiles: [this.bindings.terrainUrl],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15
      });

      if (this.map.setTerrain) {
        this.map.setTerrain({
          source: terrainSourceId,
          exaggeration: 1.5
        });
      }

      console.log('[V86:PRE] Terrain source applied');
    } catch (e) {
      console.error('[V86:PRE] Failed to apply terrain source:', e);
    }
  }

  private _applyBaseSource() {
    if (!this.map || !this.bindings.baseUrl) return;

    try {
      const baseSourceId = 'v86-base-source';
      const baseLayerId = 'v86-base-layer';

      if (this.map.getLayer(baseLayerId)) {
        this.map.removeLayer(baseLayerId);
      }
      if (this.map.getSource(baseSourceId)) {
        this.map.removeSource(baseSourceId);
      }

      this.map.addSource(baseSourceId, {
        type: 'raster',
        tiles: [this.bindings.baseUrl],
        tileSize: 256,
        attribution: 'Map tiles'
      });

      this.map.addLayer({
        id: baseLayerId,
        type: 'raster',
        source: baseSourceId,
        paint: {
          'raster-opacity': 1.0
        }
      }, 'v75-satellite'); // Insert below satellite layer if it exists

      console.log('[V86:PRE] Base imagery source applied');
    } catch (e) {
      console.error('[V86:PRE] Failed to apply base source:', e);
    }
  }

  private _applySatelliteSource() {
    if (!this.map || !this.bindings.satelliteUrl) return;

    try {
      const satSourceId = 'v86-satellite-source';
      const satLayerId = 'v86-satellite-layer';

      if (this.map.getLayer(satLayerId)) {
        this.map.removeLayer(satLayerId);
      }
      if (this.map.getSource(satSourceId)) {
        this.map.removeSource(satSourceId);
      }

      this.map.addSource(satSourceId, {
        type: 'raster',
        tiles: [this.bindings.satelliteUrl],
        tileSize: 256,
        attribution: 'Satellite imagery'
      });

      this.map.addLayer({
        id: satLayerId,
        type: 'raster',
        source: satSourceId,
        paint: {
          'raster-opacity': 0.8
        }
      });

      console.log('[V86:PRE] Satellite source applied');
    } catch (e) {
      console.error('[V86:PRE] Failed to apply satellite source:', e);
    }
  }

  private _applyAllSources() {
    this._applyBaseSource();
    this._applySatelliteSource();
    this._applyTerrainSource();
  }

  getBindings(): ProviderBindings {
    return { ...this.bindings };
  }

  getFallback(): FallbackConfig {
    return { ...this.fallback };
  }

  isBound(): boolean {
    return this.bound;
  }

  reset() {
    this.bindings = {
      terrainUrl: null,
      baseUrl: null,
      satelliteUrl: null
    };
    this.bound = false;
    this.map = null;
    console.log('[V86:PRE] Provider bindings reset');
  }
}

// Singleton instance
let _providerRebindingEngine: ProviderRebindingEngine | null = null;

export function getProviderRebindingEngine(): ProviderRebindingEngine {
  if (!_providerRebindingEngine) {
    _providerRebindingEngine = new ProviderRebindingEngine();
    _providerRebindingEngine.init();
  }
  return _providerRebindingEngine;
}

export const providerRebindingEngine = getProviderRebindingEngine();
