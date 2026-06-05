/*
 V75: Earth-Scale Terrain Engine (ESTE)
 - Adds global elevation via raster-dem (Terrarium format)
 - Enables GPU terrain with adjustable exaggeration
 - Provides altitude-aware hooks for stability 500m → 10,000km
 - Curvature and high-altitude stability are handled by map projection; we tune pitch/zoom limits
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type EsteOptions = {
  demUrlTemplate?: string;
  exaggeration?: number;
};

const DEFAULT_TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
// Backend proxy for terrain DEM
const BACKEND_TERRAIN = "/api/v1/terrain/{z}/{x}/{y}";

export const earthScaleTerrainEngine = {
  _inited: false as boolean,
  _sourceId: 'v75-terrain-dem' as const,
  _exaggeration: 1,

  init(map: GLMap, opts?: EsteOptions) {
    if (this._inited) return;
    // Prefer backend proxy on localhost only when backend is ready
    const useBackend = (window as any).__pfBackendReady === true && window.location.hostname === 'localhost';
    const demUrl = opts?.demUrlTemplate || (useBackend ? BACKEND_TERRAIN : DEFAULT_TERRAIN);
    this._exaggeration = Math.max(0.5, Math.min(3, opts?.exaggeration ?? 1.0));

    try {
      if (!map.getSource(this._sourceId)) {
        map.addSource(this._sourceId, {
          type: 'raster-dem',
          tiles: [demUrl],
          tileSize: 256,
          encoding: 'terrarium'
        });
      }
      if (map.setTerrain) {
        map.setTerrain({ source: this._sourceId, exaggeration: this._exaggeration });
      }
      // Prefer high max pitch for cinematic drops
      if (typeof map.setMaxPitch === 'function') {
        map.setMaxPitch(85);
      }
      this._inited = true;
    } catch (e) {
      console.warn('[V75:ESTE] Partial terrain init', e);
    }
  },

  /**
   * Adjust exaggeration slightly with altitude to maintain stability.
   * Call periodically if needed (e.g., per frame or on zoom events).
   */
  adaptWithZoom(map: GLMap) {
    if (!this._inited || !map.getZoom) return;
    try {
      const z = map.getZoom();
      // At globe scale, reduce exaggeration to avoid visual jitter; at ground, restore.
      const target = z < 4 ? 0.6 : z < 7 ? 0.8 : z < 10 ? 1.0 : z < 14 ? 1.2 : 1.4;
      const cur = this._exaggeration;
      const next = cur * 0.85 + target * 0.15;
      if (Math.abs(next - cur) > 0.02 && map.setTerrain) {
        this._exaggeration = next;
        map.setTerrain({ source: this._sourceId, exaggeration: this._exaggeration });
      }
    } catch {}
  }
};
