/* V66 — Augmented Reality Experience Layer (ARX)
   Initializes AR session, anchors path markers, and manages AR overlays.
   This is a light controller; actual rendering is device/feature dependent. */

import { lidarSpatialEngine } from './lidarSpatialEngine';
import { setARMode, ensureUIWatermark } from './watermark';
import type { RouteLikeV64 } from './types';
import { uiScaleEngine } from './uiScaleEngine';

type XRSession = any;
type XRReferenceSpace = any;

class ARXController {
  private static _instance: ARXController;
  static get instance() {
    if (!this._instance) this._instance = new ARXController();
    return this._instance;
  }

  private active = false;
  private route: RouteLikeV64 | null = null;
  private session: XRSession | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private anchors: any[] = [];

  async start(route: RouteLikeV64 | null) {
    if (this.active) return true;
    // Ensure LiDAR engine attempts to run for depth
    await lidarSpatialEngine.start({ lowLight: false, walking: true });
    const anyNav: any = navigator;
    if (!anyNav.xr) return false;
    try {
      const features = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['anchors', 'dom-overlay'],
        domOverlay: { root: document.body },
      } as any;
      this.session = await anyNav.xr.requestSession('immersive-ar', features);
      this.refSpace = await this.session.requestReferenceSpace('local-floor');
      this.active = true;
      this.route = route;
      // V67: Ensure UI watermark visible in AR (DOM overlay) and set AR opacity
      ensureUIWatermark((document.querySelector('.glmap-root') as HTMLElement) || document.body);
      setARMode(true);
      try {
        uiScaleEngine.setMode('AR');
      } catch {}
      // Seed anchors (placeholders)
      this.anchors = [];
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    if (!this.active) return;
    try {
      this.session?.end();
    } catch {}
    this.session = null;
    this.refSpace = null;
    this.anchors = [];
    this.active = false;
    // Reset AR watermark attenuation
    setARMode(false);
    try {
      uiScaleEngine.setMode('3D');
    } catch {}
  }

  isActive() {
    return this.active;
  }
  setRoute(route: RouteLikeV64 | null) {
    this.route = route;
  }
}

export const arxController = ARXController.instance;
