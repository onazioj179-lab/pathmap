/**
 * PATHMAP - Map Command Bus
 * =========================
 * A thin imperative facade over the MapLibre instance that lives inside
 * MapView3D. It lets the rest of the app (control cluster, command palette,
 * telemetry HUD) drive the map - zoom, bearing, pitch, recenter, mode, follow-me
 * - WITHOUT lifting the map into React or rewriting MapView3D.
 *
 * MapView3D registers the already-created map and the existing mode-controller
 * singleton via attach() in its onMapReady. The bus never creates a second map
 * or controller; it only delegates. Camera changes are broadcast (throttled) on
 * the `map:camera` event for reactive UI.
 */

import { eventBus } from './eventBus';
import type { MapMode } from './mapModeController';

export type ViewMode = MapMode | '2d' | '3d';

export interface CameraState {
  zoom: number;
  bearing: number;
  pitch: number;
  lat: number;
  lng: number;
  mode: MapMode | null;
}

// Loose structural types: MapView3D holds the map as `any`, and we only need a
// few methods. Keeping these minimal avoids importing maplibre types here.
interface MapLike {
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getCenter(): { lat: number; lng: number };
  easeTo(opts: Record<string, unknown>): void;
  flyTo(opts: Record<string, unknown>): void;
  on(event: string, handler: () => void): void;
}

interface ModeControllerLike {
  switchToMode(mode: MapMode): Promise<boolean>;
  getCurrentMode(): MapMode;
}

const PITCH_3D = 60;
const TILT_STEP = 15;
const ROTATE_STEP = 30;

class MapCommandBus {
  private map: MapLike | null = null;
  private modeController: ModeControllerLike | null = null;
  private followMe = false;
  private bearingLock = false;
  private lastPos: { lat: number; lng: number } | null = null;
  private cameraThrottle = 0;

  /** Called once by MapView3D when the map and mode controller are ready. */
  attach(map: MapLike, modeController: ModeControllerLike): void {
    this.map = map;
    this.modeController = modeController;
    // Broadcast camera changes (throttled) so controls/HUD can reflect state.
    const onMove = () => this.emitCamera();
    map.on('move', onMove);
    map.on('zoom', onMove);
    map.on('rotate', onMove);
    map.on('pitch', onMove);
    this.emitCamera();
  }

  isAttached(): boolean {
    return !!this.map;
  }

  detach(): void {
    this.map = null;
    this.modeController = null;
  }

  private ensure(): MapLike | null {
    if (!this.map) {
      console.warn('[mapCommandBus] command ignored: map not attached yet');
      return null;
    }
    return this.map;
  }

  // ----- zoom -----
  zoomBy(delta: number): void {
    const m = this.ensure();
    if (!m) return;
    m.easeTo({ zoom: m.getZoom() + delta, duration: 250 });
  }

  zoomTo(level: number): void {
    const m = this.ensure();
    if (!m) return;
    m.easeTo({ zoom: level, duration: 300 });
  }

  // ----- bearing / rotation -----
  setBearing(deg: number): void {
    const m = this.ensure();
    if (!m) return;
    m.easeTo({ bearing: deg, duration: 300 });
  }

  rotateBy(deg = ROTATE_STEP): void {
    const m = this.ensure();
    if (!m) return;
    m.easeTo({ bearing: m.getBearing() + deg, duration: 300 });
  }

  resetNorth(): void {
    this.setBearing(0);
  }

  // ----- pitch / tilt -----
  setPitch(deg: number): void {
    const m = this.ensure();
    if (!m) return;
    m.easeTo({ pitch: Math.max(0, Math.min(75, deg)), duration: 300 });
  }

  tiltBy(deg = TILT_STEP): void {
    const m = this.ensure();
    if (!m) return;
    this.setPitch(m.getPitch() + deg);
  }

  // ----- center / fly -----
  recenter(): void {
    const m = this.ensure();
    if (!m || !this.lastPos) return;
    m.easeTo({ center: [this.lastPos.lng, this.lastPos.lat], duration: 600 });
  }

  flyTo(lat: number, lng: number, opts: Record<string, unknown> = {}): void {
    const m = this.ensure();
    if (!m) return;
    // essential:true so the camera still moves for reduced-motion users.
    m.flyTo({ center: [lng, lat], zoom: 16, duration: 1200, essential: true, ...opts });
  }

  // ----- mode -----
  async setMode(mode: ViewMode): Promise<void> {
    if (mode === '2d') return this.setPitch(0);
    if (mode === '3d') return this.setPitch(PITCH_3D);
    if (!this.modeController) {
      console.warn('[mapCommandBus] mode switch ignored: controller not attached');
      return;
    }
    await this.modeController.switchToMode(mode);
    this.emitCamera();
  }

  // ----- follow-me / bearing lock -----
  toggleFollowMe(): boolean {
    this.setFollowMe(!this.followMe);
    return this.followMe;
  }

  setFollowMe(on: boolean): void {
    this.followMe = on;
    eventBus.emit('map:followMe', on);
    if (on) this.recenter();
  }

  isFollowMe(): boolean {
    return this.followMe;
  }

  setBearingLock(on: boolean): void {
    this.bearingLock = on;
    eventBus.emit('map:bearingLock', on);
  }

  isBearingLock(): boolean {
    return this.bearingLock;
  }

  /**
   * Feed the latest device position (call from the location update path). Drives
   * follow-me recentering and bearing-lock rotation without coupling the bus to
   * any location service.
   */
  notifyPosition(lat: number, lng: number, heading?: number): void {
    this.lastPos = { lat, lng };
    if (this.followMe) this.recenter();
    if (this.bearingLock && typeof heading === 'number' && !Number.isNaN(heading)) {
      this.setBearing(heading);
    }
  }

  getCameraState(): CameraState | null {
    const m = this.map;
    if (!m) return null;
    const c = m.getCenter();
    return {
      zoom: m.getZoom(),
      bearing: m.getBearing(),
      pitch: m.getPitch(),
      lat: c.lat,
      lng: c.lng,
      mode: this.modeController?.getCurrentMode() ?? null,
    };
  }

  private emitCamera(): void {
    // Coalesce rapid move events into ~30fps state emissions.
    const now = Date.now();
    if (now - this.cameraThrottle < 33) return;
    this.cameraThrottle = now;
    const state = this.getCameraState();
    if (state) eventBus.emit('map:camera', state);
  }
}

export const mapCommandBus = new MapCommandBus();
export default mapCommandBus;

// Dev-only handle so every bus method can be exercised from the console before
// (and after) the on-screen controls land. Never present in production builds.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __mapBus?: MapCommandBus }).__mapBus = mapCommandBus;
}
