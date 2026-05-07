/**
 * PATHFINDER V92 — UNIFIED MAP MODE CONTROLLER
 * =============================================
 *
 * Central controller for switching between map modes:
 *   - Standard (2D base map)
 *   - Satellite (high-res imagery)
 *   - Globe (3D Earth with orbital camera)
 *
 * Features:
 *   - Smooth transitions between modes
 *   - FPS targets: 60 FPS (2D), 40 FPS (Globe)
 *   - State management and coordination
 *   - Performance monitoring
 *
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import maplibregl from 'maplibre-gl';
import { SatelliteModeController, getSatelliteModeController } from './satelliteMode';
import { GlobeModeController, getGlobeModeController } from './globeMode';

export type MapMode = 'standard' | 'satellite' | 'globe';

export interface MapModeConfig {
  initialMode: MapMode;
  performanceTargets: {
    fps_2d: number;
    fps_globe: number;
    tile_load_max_ms: number;
    proxy_latency_ms: number;
    terrain_update_ms: number;
    camera_interaction_latency_ms: number;
  };
  smoothTransitions: boolean;
  transitionDuration: number;
}

export interface MapModeState {
  currentMode: MapMode;
  previousMode: MapMode | null;
  isTransitioning: boolean;
  performanceMetrics: {
    fps: number;
    frameTime: number;
    lastUpdate: number;
  };
}

export class MapModeController {
  private map: maplibregl.Map | null = null;
  private satelliteController: SatelliteModeController;
  private globeController: GlobeModeController;
  private config: MapModeConfig;
  private state: MapModeState;
  private fpsMonitorId: number | null = null;
  private frameCount: number = 0;
  private lastFpsCheck: number = 0;

  constructor(config?: Partial<MapModeConfig>) {
    this.config = {
      initialMode: 'standard',
      performanceTargets: {
        fps_2d: 60,
        fps_globe: 40,
        tile_load_max_ms: 120,
        proxy_latency_ms: 35,
        terrain_update_ms: 22,
        camera_interaction_latency_ms: 12,
      },
      smoothTransitions: true,
      transitionDuration: 800,
      ...config,
    };

    this.state = {
      currentMode: this.config.initialMode,
      previousMode: null,
      isTransitioning: false,
      performanceMetrics: {
        fps: 0,
        frameTime: 0,
        lastUpdate: 0,
      },
    };

    // Initialize sub-controllers
    this.satelliteController = getSatelliteModeController();
    this.globeController = getGlobeModeController();

    console.log('[V92:MODE] Map Mode Controller initialized');
    console.log(`[V92:MODE] Initial mode: ${this.config.initialMode}`);
    console.log(
      `[V92:MODE] FPS targets: 2D=${this.config.performanceTargets.fps_2d}, Globe=${this.config.performanceTargets.fps_globe}`
    );
  }

  /**
   * Bind controller to a MapLibre map instance.
   */
  bindMap(map: maplibregl.Map) {
    this.map = map;
    this.satelliteController.bindMap(map);
    this.globeController.bindMap(map);
    this.startPerformanceMonitoring();
    console.log('[V92:MODE] Map instance bound to all controllers');
  }

  /**
   * Switch to standard 2D base map mode.
   */
  async switchToStandard(): Promise<boolean> {
    if (this.state.currentMode === 'standard') {
      console.log('[V92:MODE] Already in standard mode');
      return true;
    }

    console.log('[V92:MODE] Switching to standard mode...');
    this.state.isTransitioning = true;
    this.state.previousMode = this.state.currentMode;

    try {
      // Deactivate other modes
      if (this.satelliteController.isEnabled()) {
        await this.satelliteController.deactivate();
      }
      if (this.globeController.isEnabled()) {
        await this.globeController.disable();
      }

      this.state.currentMode = 'standard';
      this.state.isTransitioning = false;

      console.log('[V92:MODE] [OK] Switched to standard mode');
      return true;
    } catch (error) {
      console.error('[V92:MODE] Standard mode switch failed:', error);
      this.state.isTransitioning = false;
      return false;
    }
  }

  /**
   * Switch to satellite imagery mode.
   */
  async switchToSatellite(): Promise<boolean> {
    if (this.state.currentMode === 'satellite') {
      console.log('[V92:MODE] Already in satellite mode');
      return true;
    }

    console.log('[V92:MODE] Switching to satellite mode...');
    this.state.isTransitioning = true;
    this.state.previousMode = this.state.currentMode;

    try {
      // Deactivate globe if active
      if (this.globeController.isEnabled()) {
        await this.globeController.disable();
      }

      // Activate satellite
      const success = await this.satelliteController.activate();

      if (success) {
        this.state.currentMode = 'satellite';
        this.state.isTransitioning = false;
        console.log('[V92:MODE] [OK] Switched to satellite mode');
        return true;
      } else {
        throw new Error('Satellite activation failed');
      }
    } catch (error) {
      console.error('[V92:MODE] Satellite mode switch failed:', error);
      this.state.isTransitioning = false;
      return false;
    }
  }

  /**
   * Switch to 3D globe mode with orbital camera.
   */
  async switchToGlobe(): Promise<boolean> {
    if (this.state.currentMode === 'globe') {
      console.log('[V92:MODE] Already in globe mode');
      return true;
    }

    console.log('[V92:MODE] Switching to globe mode...');
    this.state.isTransitioning = true;
    this.state.previousMode = this.state.currentMode;

    try {
      // Keep satellite active if it is
      const satelliteWasActive = this.satelliteController.isEnabled();

      // Enable globe
      const success = await this.globeController.enable();

      if (success) {
        this.state.currentMode = 'globe';
        this.state.isTransitioning = false;
        console.log('[V92:MODE] [OK] Switched to globe mode');

        if (satelliteWasActive) {
          console.log('[V92:MODE] Satellite imagery remains active in globe mode');
        }

        return true;
      } else {
        throw new Error('Globe activation failed');
      }
    } catch (error) {
      console.error('[V92:MODE] Globe mode switch failed:', error);
      this.state.isTransitioning = false;
      return false;
    }
  }

  /**
   * Switch to specific mode by name.
   */
  async switchToMode(mode: MapMode): Promise<boolean> {
    switch (mode) {
      case 'standard':
        return await this.switchToStandard();
      case 'satellite':
        return await this.switchToSatellite();
      case 'globe':
        return await this.switchToGlobe();
      default:
        console.error(`[V92:MODE] Unknown mode: ${mode}`);
        return false;
    }
  }

  /**
   * Cycle through modes: standard → satellite → globe → standard.
   */
  async cycleMode(): Promise<boolean> {
    const modeOrder: MapMode[] = ['standard', 'satellite', 'globe'];
    const currentIndex = modeOrder.indexOf(this.state.currentMode);
    const nextIndex = (currentIndex + 1) % modeOrder.length;
    const nextMode = modeOrder[nextIndex];

    console.log(`[V92:MODE] Cycling: ${this.state.currentMode} → ${nextMode}`);
    return await this.switchToMode(nextMode);
  }

  /**
   * Start FPS monitoring.
   */
  private startPerformanceMonitoring() {
    this.lastFpsCheck = performance.now();
    this.frameCount = 0;

    const monitor = () => {
      if (!this.map) return;

      this.frameCount++;
      const now = performance.now();
      const elapsed = now - this.lastFpsCheck;

      if (elapsed >= 1000) {
        // Calculate FPS
        const fps = Math.round((this.frameCount * 1000) / elapsed);
        const frameTime = elapsed / this.frameCount;

        this.state.performanceMetrics = {
          fps,
          frameTime,
          lastUpdate: now,
        };

        this.frameCount = 0;
        this.lastFpsCheck = now;
      }

      this.fpsMonitorId = requestAnimationFrame(monitor);
    };

    this.fpsMonitorId = requestAnimationFrame(monitor);
  }

  /**
   * Stop FPS monitoring.
   */
  private stopPerformanceMonitoring() {
    if (this.fpsMonitorId !== null) {
      cancelAnimationFrame(this.fpsMonitorId);
      this.fpsMonitorId = null;
    }
  }

  /**
   * Get current mode.
   */
  getCurrentMode(): MapMode {
    return this.state.currentMode;
  }

  /**
   * Get current state.
   */
  getState(): MapModeState {
    return { ...this.state };
  }

  /**
   * Get performance metrics.
   */
  getPerformanceMetrics() {
    return { ...this.state.performanceMetrics };
  }

  /**
   * Check if currently transitioning between modes.
   */
  isTransitioning(): boolean {
    return this.state.isTransitioning;
  }

  /**
   * Get configuration.
   */
  getConfig(): MapModeConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources.
   */
  destroy() {
    this.stopPerformanceMonitoring();
    this.satelliteController.destroy();
    this.globeController.destroy();
    this.map = null;
    console.log('[V92:MODE] Map Mode Controller destroyed');
  }
}

// Singleton instance
let mapModeControllerInstance: MapModeController | null = null;

export function getMapModeController(config?: Partial<MapModeConfig>): MapModeController {
  if (!mapModeControllerInstance) {
    mapModeControllerInstance = new MapModeController(config);
  }
  return mapModeControllerInstance;
}
