/**
 * PATHFINDER V92 — SATELLITE MODE CONTROLLER
 * ===========================================
 * 
 * Full satellite map mode with smooth transitions:
 *   - High-resolution satellite tiles via Python proxy
 *   - Smooth fade transitions (350ms in, 250ms out)
 *   - Terrain shading accuracy maintained
 *   - Blend control with base map layers
 * 
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import maplibregl from 'maplibre-gl';
import { debugLog } from '../utils/debug';

export interface SatelliteModeConfig {
  enabled: boolean;
  tileSourceUrl: string;
  blendWithBase: boolean;
  smoothTransitions: boolean;
  animations: {
    fadeIn: number;
    fadeOut: number;
  };
}

export class SatelliteModeController {
  private map: maplibregl.Map | null = null;
  private config: SatelliteModeConfig;
  private isActive: boolean = false;
  private satelliteLayerId: string = 'v92-satellite-layer';
  private satelliteSourceId: string = 'v92-satellite-source';

  constructor(config?: Partial<SatelliteModeConfig>) {
    this.config = {
      enabled: true,
      tileSourceUrl: 'http://localhost:8000/api/v1/tiles/proxy/{z}/{x}/{y}',
      blendWithBase: false,
      smoothTransitions: true,
      animations: {
        fadeIn: 350,
        fadeOut: 250
      },
      ...config
    };

    debugLog('[V92:SATELLITE] Satellite Mode Controller initialized');
    debugLog(`[V92:SATELLITE] Tile source: ${this.config.tileSourceUrl}`);
  }

  /**
   * Bind controller to a MapLibre map instance.
   */
  bindMap(map: maplibregl.Map) {
    this.map = map;
    debugLog('[V92:SATELLITE] Map instance bound');
  }

  /**
   * Activate satellite mode with smooth fade-in transition.
   */
  async activate(): Promise<boolean> {
    if (!this.map) {
      console.error('[V92:SATELLITE] Cannot activate - no map bound');
      return false;
    }

    if (this.isActive) {
      debugLog('[V92:SATELLITE] Already active');
      return true;
    }

    try {
      debugLog('[V92:SATELLITE] Activating satellite mode...');

      // Add satellite source if not exists
      if (!this.map.getSource(this.satelliteSourceId)) {
        this.map.addSource(this.satelliteSourceId, {
          type: 'raster',
          tiles: [this.config.tileSourceUrl],
          tileSize: 256,
          attribution: 'PathFinder V92 Satellite'
        });
        debugLog('[V92:SATELLITE] Satellite source added');
      }

      // Add satellite layer if not exists
      if (!this.map.getLayer(this.satelliteLayerId)) {
        // Get the first symbol layer to insert satellite below it
        const layers = this.map.getStyle().layers;
        let firstSymbolId: string | undefined;
        for (const layer of layers || []) {
          if (layer.type === 'symbol') {
            firstSymbolId = layer.id;
            break;
          }
        }

        this.map.addLayer(
          {
            id: this.satelliteLayerId,
            type: 'raster',
            source: this.satelliteSourceId,
            paint: {
              'raster-opacity': 0,
              'raster-fade-duration': 0
            }
          },
          firstSymbolId // Insert before first symbol layer
        );
        debugLog('[V92:SATELLITE] Satellite layer added');
      }

      // Smooth fade-in animation
      if (this.config.smoothTransitions) {
        await this.fadeIn();
      } else {
        this.map.setPaintProperty(this.satelliteLayerId, 'raster-opacity', 1);
      }

      this.isActive = true;
      debugLog('[V92:SATELLITE] [OK] Satellite mode activated');
      return true;

    } catch (error) {
      console.error('[V92:SATELLITE] Activation failed:', error);
      return false;
    }
  }

  /**
   * Deactivate satellite mode with smooth fade-out transition.
   */
  async deactivate(): Promise<boolean> {
    if (!this.map) {
      console.error('[V92:SATELLITE] Cannot deactivate - no map bound');
      return false;
    }

    if (!this.isActive) {
      debugLog('[V92:SATELLITE] Already inactive');
      return true;
    }

    try {
      debugLog('[V92:SATELLITE] Deactivating satellite mode...');

      // Smooth fade-out animation
      if (this.config.smoothTransitions) {
        await this.fadeOut();
      } else {
        this.map.setPaintProperty(this.satelliteLayerId, 'raster-opacity', 0);
      }

      this.isActive = false;
      debugLog('[V92:SATELLITE] [OK] Satellite mode deactivated');
      return true;

    } catch (error) {
      console.error('[V92:SATELLITE] Deactivation failed:', error);
      return false;
    }
  }

  /**
   * Toggle satellite mode on/off.
   */
  async toggle(): Promise<boolean> {
    if (this.isActive) {
      return await this.deactivate();
    } else {
      return await this.activate();
    }
  }

  /**
   * Smooth fade-in animation (350ms).
   */
  private async fadeIn(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }

      const startTime = performance.now();
      const duration = this.config.animations.fadeIn;

      const animate = (currentTime: number) => {
        if (!this.map) {
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const opacity = this.easeInOutCubic(progress);

        this.map.setPaintProperty(this.satelliteLayerId, 'raster-opacity', opacity);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * Smooth fade-out animation (250ms).
   */
  private async fadeOut(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }

      const startTime = performance.now();
      const duration = this.config.animations.fadeOut;

      const animate = (currentTime: number) => {
        if (!this.map) {
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const opacity = 1 - this.easeInOutCubic(progress);

        this.map.setPaintProperty(this.satelliteLayerId, 'raster-opacity', opacity);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * Ease-in-out cubic easing function.
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Check if satellite mode is currently active.
   */
  isEnabled(): boolean {
    return this.isActive;
  }

  /**
   * Get current configuration.
   */
  getConfig(): SatelliteModeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires reactivation to take effect).
   */
  updateConfig(newConfig: Partial<SatelliteModeConfig>) {
    this.config = { ...this.config, ...newConfig };
    debugLog('[V92:SATELLITE] Configuration updated');
  }

  /**
   * Cleanup resources.
   */
  destroy() {
    if (this.map) {
      try {
        if (this.map.getLayer(this.satelliteLayerId)) {
          this.map.removeLayer(this.satelliteLayerId);
        }
        if (this.map.getSource(this.satelliteSourceId)) {
          this.map.removeSource(this.satelliteSourceId);
        }
        debugLog('[V92:SATELLITE] Resources cleaned up');
      } catch (error) {
        console.warn('[V92:SATELLITE] Cleanup warning:', error);
      }
    }
    this.map = null;
    this.isActive = false;
  }
}

// Singleton instance
let satelliteModeInstance: SatelliteModeController | null = null;

export function getSatelliteModeController(config?: Partial<SatelliteModeConfig>): SatelliteModeController {
  if (!satelliteModeInstance) {
    satelliteModeInstance = new SatelliteModeController(config);
  }
  return satelliteModeInstance;
}
