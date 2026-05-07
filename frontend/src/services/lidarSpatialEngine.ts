/* V65 — LiDAR Spatial Engine (LSE)
   Feature-detects WebXR depth and starts an AR-compatible session to stream depth frames.
   Falls back gracefully if unsupported. Designed to run only when low light + walking. */

import { globalSafetyEngine } from './globalSafetyEngine';

type XRSession = any; // avoid TS lib dependency
type XRFrame = any;
type XRReferenceSpace = any;
type XRWebGLBinding = any;

export interface LSEUpdate {
  obstacleDistanceM?: number; // min distance ahead
  walkableRegions?: any;
  wallEdges?: any;
  slopeGradient?: number;
  userHeadingEstimate?: number;
}

class LidarSpatialEngine {
  private static _instance: LidarSpatialEngine;
  static get instance() { if (!this._instance) this._instance = new LidarSpatialEngine(); return this._instance; }

  private running = false;
  private xrSession: XRSession | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private binding: XRWebGLBinding | null = null;
  private onUpdateCb: ((u: LSEUpdate) => void) | null = null;
  private denmActive = false; // Dark-Environment Navigation Mode

  async isSupported(): Promise<boolean> {
    try {
      // WebXR AR + depth-sensing
      const anyNav: any = navigator;
      if (!anyNav.xr || !anyNav.xr.isSessionSupported) return false;
      const supported = await anyNav.xr.isSessionSupported('immersive-ar');
      return !!supported;
    } catch { return false; }
  }

  onUpdate(cb: (u: LSEUpdate) => void) { this.onUpdateCb = cb; }

  async start(opts?: { lowLight: boolean; walking: boolean }): Promise<boolean> {
    if (this.running) return true;
    if (!(await this.isSupported())) return false;
    if (!opts?.walking) return false; // only for on-foot

    // Attempt to start AR session with depth
    const anyNav: any = navigator;
    try {
      const canvas = document.createElement('canvas');
      this.gl = (canvas.getContext('webgl2', { xrCompatible: true }) as WebGL2RenderingContext) || null;
      if (!this.gl) return false;

      const features = { requiredFeatures: ['local-floor'], optionalFeatures: ['depth-sensing', 'dom-overlay', 'anchors', 'light-estimation'], domOverlay: { root: document.body } } as any;
      const session: XRSession = await anyNav.xr.requestSession('immersive-ar', features);
      await (this.gl as any).makeXRCompatible?.();
      (session as any).updateRenderState({ baseLayer: new (window as any).XRWebGLLayer(session, this.gl) });
      this.binding = new (window as any).XRWebGLBinding(session, this.gl);
      this.refSpace = await session.requestReferenceSpace('local-floor');
      this.xrSession = session;
      this.running = true;
      this.denmActive = !!opts?.lowLight;

      const onXRFrame = (time: number, frame: XRFrame) => {
        const session = frame.session;
        session.requestAnimationFrame(onXRFrame);
        try { this.processFrame(frame); } catch {}
      };

      (this.xrSession as any).requestAnimationFrame(onXRFrame);
      return true;
    } catch (e) {
      console.warn('[LSE] Failed to start XR session', e);
      this.stop();
      return false;
    }
  }

  stop() {
    if (!this.running) return;
    try { this.xrSession?.end(); } catch {}
    this.xrSession = null;
    this.refSpace = null;
    this.binding = null;
    this.gl = null;
    this.running = false;
    this.denmActive = false;
  }

  private processFrame(frame: XRFrame) {
    // Depth via XRWebGLBinding (if available)
    let minAheadM: number | undefined;
    try {
      const viewerPose = frame.getViewerPose(this.refSpace);
      if (!viewerPose) return;
      const view = viewerPose.views?.[0];
      const depthInfo = (this.binding as any)?.getDepthInformation?.(view);
      if (depthInfo && depthInfo.data && depthInfo.width) {
        minAheadM = this.estimateForwardObstacle(depthInfo);
      }
    } catch {}

    // Emit update
    const update: LSEUpdate = { obstacleDistanceM: minAheadM };
    this.onUpdateCb?.(update);

    // Feed external hazards to GSE (non-spammy): merge and let GSE publish
    const hazards: string[] = [];
    if (typeof minAheadM === 'number') {
      if (minAheadM < 0.5) hazards.push('obstacle_stop');
      else if (minAheadM < 1.0) hazards.push('obstacle_high');
      else if (minAheadM < 2.0) hazards.push('obstacle_caution');
    }
    if (this.denmActive) hazards.push('dark_env');
    if (hazards.length) globalSafetyEngine.registerExternalHazards(hazards);
  }

  private estimateForwardObstacle(depthInfo: any): number | undefined {
    // Simple central-window min distance
    const { width, height } = depthInfo;
    const x0 = Math.floor(width * 0.45);
    const x1 = Math.floor(width * 0.55);
    const y0 = Math.floor(height * 0.45);
    const y1 = Math.floor(height * 0.6);
    let min = Number.POSITIVE_INFINITY;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const z = depthInfo.getDepth(x, y); // meters
        if (z > 0 && z < min) min = z;
      }
    }
    return Number.isFinite(min) ? min : undefined;
  }

  setDarkMode(active: boolean) { this.denmActive = active; }
  isRunning() { return this.running; }
}

export const lidarSpatialEngine = LidarSpatialEngine.instance;
