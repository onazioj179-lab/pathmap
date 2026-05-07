/*
 V78: Dark-Mode Adaptive Atmosphere Model (DAAM)
 - Applies dark atmospheric colors and satellite adjustments in dark mode
*/

import { satelliteImageryLayer } from './satelliteImageryLayer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export const darkAdaptiveAtmosphere = {
  apply(map: GLMap) {
    try {
      if ((map as any).setFog) {
        (map as any).setFog({
          color: 'rgb(12,12,16)',
          'horizon-blend': 0.7,
          'high-color': 'rgb(26,28,34)',
          'space-color': 'rgb(0,0,0)',
          'star-intensity': 0.2,
          range: [0.3, 8],
          _baselineHorizonBlend: 0.7
        });
      }
    } catch {}
    try { satelliteImageryLayer.nightPreset(map); } catch {}
  },

  adaptLowAltitude(map: GLMap) {
    try {
      // Slightly increase contrast at very low altitude for readability
      map.setPaintProperty('v75-satellite', 'raster-contrast', 0.2);
    } catch {}
  }
};
