/*
 V75: Atmospheric Rendering Model (ARM)
 - Configures fog and sky-like effects (where supported)
 - Adapts with altitude to show horizon curvature feel via fog gradient
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type ArmOptions = {
  enableSkyLayer?: boolean;
};

export const atmosphericRenderingModel = {
  apply(map: GLMap, opts?: ArmOptions) {
    try {
      const useSky = !!opts?.enableSkyLayer;
      if ((map as any).setFog) {
        (map as any).setFog({
          color: 'rgb(200,220,255)',
          'horizon-blend': 0.8,
          'high-color': 'rgb(255,255,255)',
          'space-color': 'rgb(0,0,0)',
          'star-intensity': 0.0,
          range: [0.5, 10],
          _baselineHorizonBlend: 0.8
        });
      }
      // Mapbox GL only sky layer; MapLibre may not support sky type in all builds.
      if (useSky && map.getLayer && !map.getLayer('v75-sky') && (map as any).addLayer) {
        try {
          map.addLayer({
            id: 'v75-sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0, 0],
              'sky-atmosphere-sun-intensity': 10,
              'sky-atmosphere-color': 'rgb(200,220,255)',
              'sky-atmosphere-halo-color': 'rgb(180,205,255)'
            }
          } as any);
        } catch {}
      }
    } catch (e) {
      console.warn('[V75:ARM] Fog/Sky apply partial', e);
    }
  },

  adaptWithZoom(map: GLMap) {
    try {
      if (!map.getZoom) return;
      const z = map.getZoom();
      const t = Math.max(0, Math.min(1, (z - 3) / 10));
      if ((map as any).getFog && (map as any).setFog) {
        const fog = (map as any).getFog?.() || {};
        const hbBase = fog._baselineHorizonBlend ?? 0.8;
        const hb = hbBase * (1 - t) + 0.5 * t; // slightly thinner at ground
        (map as any).setFog({ ...fog, 'horizon-blend': hb });
      }
    } catch {}
  }
};
