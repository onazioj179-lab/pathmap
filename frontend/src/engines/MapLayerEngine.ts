import maplibregl from 'maplibre-gl';

export type MapLayer = 'normal' | 'satellite' | 'hybrid' | '3d';

interface MapLayerConfig {
  style: string;
  supportsTerrainAndBuildings: boolean;
}

const LAYER_CONFIGS: Record<MapLayer, MapLayerConfig> = {
  normal: {
    style: 'https://tiles.stadiamaps.com/styles/osm_bright.json',
    supportsTerrainAndBuildings: false
  },
  satellite: {
    style: 'https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_key',
    supportsTerrainAndBuildings: true
  },
  hybrid: {
    style: 'https://api.maptiler.com/maps/streets/style.json?key=get_your_own_key',
    supportsTerrainAndBuildings: true
  },
  '3d': {
    style: 'https://api.maptiler.com/maps/streets/style.json?key=get_your_own_key',
    supportsTerrainAndBuildings: true
  }
};

export class MapLayerEngine {
  private map: maplibregl.Map;
  private currentLayer: MapLayer = 'normal';
  private performanceLevel: 'high' | 'medium' | 'low' = 'medium';
  private transitioning = false;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.detectPerformance();
  }

  private detectPerformance(): void {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      this.performanceLevel = 'low';
      return;
    }

    const fps = this.measureFPS();
    if (fps > 50) {
      this.performanceLevel = 'high';
    } else if (fps > 30) {
      this.performanceLevel = 'medium';
    } else {
      this.performanceLevel = 'low';
    }
  }

  private measureFPS(): number {
    let lastTime = performance.now();
    let frames = 0;
    let totalFPS = 0;
    let samples = 0;

    const measure = () => {
      const now = performance.now();
      frames++;
      
      if (now >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (now - lastTime));
        totalFPS += fps;
        samples++;
        frames = 0;
        lastTime = now;
        
        if (samples >= 3) {
          return totalFPS / samples;
        }
      }
      
      if (samples < 3) {
        requestAnimationFrame(measure);
      }
    };

    requestAnimationFrame(measure);
    return 45;
  }

  async switchLayer(targetLayer: MapLayer): Promise<void> {
    if (this.transitioning || targetLayer === this.currentLayer) {
      return;
    }

    if (targetLayer === '3d' && this.performanceLevel === 'low') {
      console.warn('3D mode disabled on low-performance device');
      targetLayer = 'satellite';
    }

    this.transitioning = true;
    const startTime = performance.now();

    try {
      const center = this.map.getCenter();
      const zoom = this.map.getZoom();
      const bearing = this.map.getBearing();
      const pitch = this.map.getPitch();

      const container = this.map.getContainer();
      container.style.transition = 'opacity 250ms ease-in-out';
      container.style.opacity = '0';

      await new Promise(resolve => setTimeout(resolve, 250));

      const config = LAYER_CONFIGS[targetLayer];
      this.map.setStyle(config.style);

      await new Promise<void>((resolve) => {
        this.map.once('style.load', () => resolve());
      });

      this.map.setCenter(center);
      this.map.setZoom(zoom);
      this.map.setBearing(bearing);

      if (targetLayer === '3d' && config.supportsTerrainAndBuildings) {
        this.map.setPitch(60);
        if (this.map.getSource('terrain-source')) {
          this.map.setTerrain({ source: 'terrain-source', exaggeration: 1.5 });
        }
      } else {
        this.map.setPitch(pitch);
      }

      container.style.opacity = '1';

      this.currentLayer = targetLayer;

      const elapsed = performance.now() - startTime;
      console.log(`Layer switch completed in ${elapsed.toFixed(0)}ms`);

    } catch (error) {
      console.error('Layer switch failed:', error);
    } finally {
      this.transitioning = false;
    }
  }

  getCurrentLayer(): MapLayer {
    return this.currentLayer;
  }

  getPerformanceLevel(): 'high' | 'medium' | 'low' {
    return this.performanceLevel;
  }

  canUse3D(): boolean {
    return this.performanceLevel !== 'low';
  }

  async preloadTiles(layer: MapLayer): Promise<void> {
    // Tile preloading logic would go here
    // For now, just a placeholder
    console.log(`Preloading tiles for ${layer}`);
  }
}
