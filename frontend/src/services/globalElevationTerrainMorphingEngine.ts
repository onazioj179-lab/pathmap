/*
 V75: Global Elevation + Terrain Morphing Engine (GETME)
 - Smooths perceived transitions between LODs by coordinating terrain exaggeration
 - Adjusts fog density subtly during quick zoom to hide pop-in
 - Exposes tick() to be called during camera transitions
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type GetmeOptions = {
  fogLayer?: boolean;
};

export const globalElevationTerrainMorphingEngine = {
  _enabled: true,
  _lastZ: 0,
  _fogBackup: null as any,

  init(map: GLMap, _opts?: GetmeOptions) {
    // Nothing heavy here; fog tweaking on demand.
    this._lastZ = map.getZoom ? map.getZoom() : 0;
  },

  /**
   * Call during transitions to ease LOD switch visibility by transiently boosting fog near horizon.
   */
  tick(map: GLMap, dtMs: number) {
    if (!this._enabled || !map.getZoom) return;
    try {
      const z = map.getZoom();
      const dz = Math.abs(z - this._lastZ);
      this._lastZ = z;
      // If zoom is changing quickly, increase horizon blend a bit for a short time.
      if ((map as any).getFog && (map as any).setFog) {
        const fog = (map as any).getFog?.() || {};
        const hb = Math.max(0.1, Math.min(1.2, (fog['horizon-blend'] ?? 0.8) + Math.min(0.4, dz * 0.06)));
        (map as any).setFog({
          ...fog,
          'horizon-blend': fog._baselineHorizonBlend ?? hb,
        });
        // Decay back toward baseline
        setTimeout(() => {
          try {
            const cur = (map as any).getFog?.() || {};
            const base = cur._baselineHorizonBlend ?? 0.8;
            (map as any).setFog({ ...cur, 'horizon-blend': base });
          } catch {}
        }, Math.max(200, Math.min(800, dtMs * 2)));
      }
    } catch {}
  }
};
