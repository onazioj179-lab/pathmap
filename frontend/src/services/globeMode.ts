/**
 * PATHFINDER V92 — 3D GLOBE / EARTH MODE CONTROLLER
 * ==================================================
 * 
 * Google Earth-style 3D globe system with orbital camera:
 *   - Globe curvature visible at high altitude (150m - 9,000km)
 *   - Free-orbit camera with damped motion (0.11 orbit, 0.18 zoom)
 *   - Dynamic terrain LOD (adjusts to altitude)
 *   - Field of view: 52°
 *   - Rotation speed: 0.35
 *   - Smooth street → orbit zoom transitions
 * 
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import maplibregl from 'maplibre-gl';
import { debugLog } from '../utils/debug';

export interface GlobeModeConfig {
  enabled: boolean;
  camera: {
    type: 'globe';
    fieldOfView: number;
    minAltitude: number;
    maxAltitude: number;
    orbitDamping: number;
    zoomDamping: number;
    rotationSpeed: number;
  };
  terrain: {
    lod: 'dynamic';
    exaggeration: number;
    tileSource: string;
  };
  imagery: {
    satelliteLayer: string;
  };
}

export interface CameraState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  altitude?: number;
}

export class GlobeModeController {
  private map: maplibregl.Map | null = null;
  private config: GlobeModeConfig;
  private isActive: boolean = false;
  private previousCameraState: CameraState | null = null;
  private terrainSourceId: string = 'v92-terrain-source';
  private isDragging: boolean = false;
  // Recent camera samples during a drag, used to derive release velocity.
  private dragSamples: Array<{ t: number; bearing: number; pitch: number }> = [];
  private inertiaFrame: number | null = null;
  private orbitFrame: number | null = null;

  constructor(config?: Partial<GlobeModeConfig>) {
    this.config = {
      enabled: true,
      camera: {
        type: 'globe',
        fieldOfView: 52,
        minAltitude: 150,
        maxAltitude: 9000000,
        orbitDamping: 0.11,
        zoomDamping: 0.18,
        rotationSpeed: 0.35
      },
      terrain: {
        lod: 'dynamic',
        exaggeration: 1.0,
        tileSource: 'http://localhost:8000/api/v1/tiles/proxy/{z}/{x}/{y}'
      },
      imagery: {
        satelliteLayer: 'http://localhost:8000/api/v1/tiles/proxy/{z}/{x}/{y}'
      },
      ...config
    } as GlobeModeConfig;

    debugLog('[V92:GLOBE] Globe Mode Controller initialized');
    debugLog(`[V92:GLOBE] FOV: ${this.config.camera.fieldOfView}°`);
    debugLog(`[V92:GLOBE] Altitude range: ${this.config.camera.minAltitude}m - ${this.config.camera.maxAltitude}m`);
  }

  /**
   * Bind controller to a MapLibre map instance.
   */
  bindMap(map: maplibregl.Map) {
    this.map = map;
    this.setupCameraControls();
    debugLog('[V92:GLOBE] Map instance bound');
  }

  /**
   * Setup enhanced camera controls with damping.
   */
  private setupCameraControls() {
    if (!this.map) return;

    // Sample camera motion during the drag so release inertia follows the
    // user's actual gesture (direction and speed), never a synthetic kick.
    this.map.on('dragstart', () => {
      this.isDragging = true;
      this.stopInertia();
      this.dragSamples = [];
      this.sampleDrag();
    });

    this.map.on('drag', () => this.sampleDrag());

    this.map.on('dragend', () => {
      this.isDragging = false;
      this.applyDragInertia();
    });

    // Smooth zoom damping
    this.map.on('wheel', (e) => {
      if (this.isActive) {
        e.preventDefault();
        this.applyZoomDamping(e.originalEvent.deltaY);
      }
    });
  }

  private sampleDrag() {
    if (!this.map) return;
    this.dragSamples.push({
      t: performance.now(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    });
    if (this.dragSamples.length > 6) this.dragSamples.shift();
  }

  private stopInertia() {
    if (this.inertiaFrame !== null) {
      cancelAnimationFrame(this.inertiaFrame);
      this.inertiaFrame = null;
    }
  }

  /**
   * Continue the camera's measured motion after release, decaying with the
   * configured orbit damping so the globe glides to a stop.
   */
  private applyDragInertia() {
    if (!this.map || !this.isActive || this.dragSamples.length < 2) return;

    const newest = this.dragSamples[this.dragSamples.length - 1];
    const oldest = this.dragSamples[0];
    const dt = newest.t - oldest.t;
    if (dt <= 0 || performance.now() - newest.t > 100) return;

    // Per-frame (~16ms) velocity from the sampled gesture, normalizing the
    // bearing delta across the ±180° seam and capping runaway flicks.
    let bearingDelta = newest.bearing - oldest.bearing;
    if (bearingDelta > 180) bearingDelta -= 360;
    if (bearingDelta < -180) bearingDelta += 360;
    const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
    const velocity = {
      bearing: clamp((bearingDelta / dt) * 16, 4),
      pitch: clamp(((newest.pitch - oldest.pitch) / dt) * 16, 2),
    };

    const damping = this.config.camera.orbitDamping;
    const animate = () => {
      this.inertiaFrame = null;
      if (!this.map || this.isDragging) return;
      if (Math.abs(velocity.bearing) < 0.01 && Math.abs(velocity.pitch) < 0.01) return;

      velocity.bearing *= (1 - damping);
      velocity.pitch *= (1 - damping);

      this.map.setBearing(this.map.getBearing() + velocity.bearing);
      this.map.setPitch(Math.max(0, Math.min(85, this.map.getPitch() + velocity.pitch)));

      this.inertiaFrame = requestAnimationFrame(animate);
    };

    this.inertiaFrame = requestAnimationFrame(animate);
  }

  /**
   * Apply zoom damping for smooth altitude changes.
   */
  private applyZoomDamping(deltaY: number) {
    if (!this.map) return;

    // ~0.45 zoom levels per standard wheel tick; the short ease provides the
    // damped feel without making the wheel sluggish.
    const zoomChange = -deltaY * 0.0045;
    const currentZoom = this.map.getZoom();
    const newZoom = Math.max(0, Math.min(22, currentZoom + zoomChange));

    this.map.easeTo({
      zoom: newZoom,
      duration: 160,
      easing: (t) => t * (2 - t) // Ease out quad
    });
  }

  /**
   * Enable 3D globe mode with orbital camera.
   */
  async enable(): Promise<boolean> {
    if (!this.map) {
      console.error('[V92:GLOBE] Cannot enable - no map bound');
      return false;
    }

    if (this.isActive) {
      debugLog('[V92:GLOBE] Already active');
      return true;
    }

    try {
      debugLog('[V92:GLOBE] Enabling globe mode...');

      // Save current camera state for restoration
      this.previousCameraState = {
        center: this.map.getCenter().toArray() as [number, number],
        zoom: this.map.getZoom(),
        pitch: this.map.getPitch(),
        bearing: this.map.getBearing()
      };

      // Enable 3D terrain
      if (!this.map.getSource(this.terrainSourceId)) {
        this.map.addSource(this.terrainSourceId, {
          type: 'raster-dem',
          tiles: [this.config.terrain.tileSource],
          tileSize: 256,
          maxzoom: 14
        });
        debugLog('[V92:GLOBE] Terrain source added');
      }

      this.map.setTerrain({
        source: this.terrainSourceId,
        exaggeration: this.config.terrain.exaggeration
      });

      // Apply globe camera settings
      await this.transitionToGlobeView();

      this.isActive = true;
      debugLog('[V92:GLOBE] [OK] Globe mode enabled');
      return true;

    } catch (error) {
      console.error('[V92:GLOBE] Enable failed:', error);
      return false;
    }
  }

  /**
   * Disable globe mode and restore 2D view.
   */
  async disable(): Promise<boolean> {
    if (!this.map) {
      console.error('[V92:GLOBE] Cannot disable - no map bound');
      return false;
    }

    if (!this.isActive) {
      debugLog('[V92:GLOBE] Already inactive');
      return true;
    }

    try {
      debugLog('[V92:GLOBE] Disabling globe mode...');

      this.stopFreeOrbit();
      this.stopInertia();

      // Disable 3D terrain
      this.map.setTerrain(null);

      // Restore previous camera state
      if (this.previousCameraState) {
        await this.transitionTo2DView(this.previousCameraState);
      }

      this.isActive = false;
      debugLog('[V92:GLOBE] [OK] Globe mode disabled');
      return true;

    } catch (error) {
      console.error('[V92:GLOBE] Disable failed:', error);
      return false;
    }
  }

  /**
   * Smooth transition to globe view (high altitude, tilted).
   */
  private async transitionToGlobeView(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }

      // Zoom out to orbital view with smooth easing
      this.map.easeTo({
        zoom: 5, // Orbital zoom level
        pitch: 60, // Tilted for globe curvature
        bearing: 0,
        duration: 1500,
        easing: (t) => 1 - Math.pow(1 - t, 3) // Ease out cubic
      });

      setTimeout(() => resolve(), 1500);
    });
  }

  /**
   * Smooth transition back to 2D view.
   */
  private async transitionTo2DView(targetState: CameraState): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }

      this.map.easeTo({
        center: targetState.center,
        zoom: targetState.zoom,
        pitch: 0, // Flat 2D view
        bearing: targetState.bearing,
        duration: 1200,
        easing: (t) => t * (2 - t) // Ease out quad
      });

      setTimeout(() => resolve(), 1200);
    });
  }

  /**
   * Zoom to specific altitude (in meters).
   */
  async zoomToAltitude(altitude: number): Promise<void> {
    if (!this.map || !this.isActive) return;

    const clampedAltitude = Math.max(
      this.config.camera.minAltitude,
      Math.min(this.config.camera.maxAltitude, altitude)
    );

    // Convert altitude to zoom level (approximation)
    // zoom = log2(earthCircumference / (altitude * tileSize / 256))
    const earthCircumference = 40075016.686; // meters
    const zoom = Math.log2(earthCircumference / (clampedAltitude * 256 / 256));

    debugLog(`[V92:GLOBE] Zooming to altitude: ${clampedAltitude}m (zoom ${zoom.toFixed(2)})`);

    this.map.easeTo({
      zoom: Math.max(0, Math.min(22, zoom)),
      duration: 800,
      easing: (t) => t * (2 - t)
    });
  }

  /**
   * Free orbit rotation (continuous rotation).
   */
  startFreeOrbit(speed?: number) {
    if (!this.map || !this.isActive) return;
    this.stopFreeOrbit(); // never stack rotation loops

    const rotationSpeed = speed || this.config.camera.rotationSpeed;

    const rotate = () => {
      this.orbitFrame = null;
      if (!this.map || !this.isActive) return;

      const currentBearing = this.map.getBearing();
      this.map.setBearing((currentBearing + rotationSpeed) % 360);

      this.orbitFrame = requestAnimationFrame(rotate);
    };

    this.orbitFrame = requestAnimationFrame(rotate);
    debugLog('[V92:GLOBE] Free orbit started');
  }

  /**
   * Stop the free-orbit rotation if it is running.
   */
  stopFreeOrbit() {
    if (this.orbitFrame !== null) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }
  }

  /**
   * Check if globe mode is currently active.
   */
  isEnabled(): boolean {
    return this.isActive;
  }

  /**
   * Get current configuration.
   */
  getConfig(): GlobeModeConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources.
   */
  destroy() {
    this.stopFreeOrbit();
    this.stopInertia();
    if (this.map) {
      try {
        this.map.setTerrain(null);
        if (this.map.getSource(this.terrainSourceId)) {
          this.map.removeSource(this.terrainSourceId);
        }
        debugLog('[V92:GLOBE] Resources cleaned up');
      } catch (error) {
        console.warn('[V92:GLOBE] Cleanup warning:', error);
      }
    }
    this.map = null;
    this.isActive = false;
  }
}

// Singleton instance
let globeModeInstance: GlobeModeController | null = null;

export function getGlobeModeController(config?: Partial<GlobeModeConfig>): GlobeModeController {
  if (!globeModeInstance) {
    globeModeInstance = new GlobeModeController(config);
  }
  return globeModeInstance;
}
