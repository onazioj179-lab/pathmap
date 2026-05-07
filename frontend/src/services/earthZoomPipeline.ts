/*
 V75: Earth-Zoom Pipeline (EZP)
 - Sequences globe→continent→country→city→street and hands off to AR
 - Ensures no popping: coordinates imagery, terrain, fog during camera motion
*/

import { aiCameraTransitionEngine } from './aiCameraTransitionEngine';
import { earthScaleTerrainEngine } from './earthScaleTerrainEngine';
import { satelliteImageryLayer } from './satelliteImageryLayer';
import { globalElevationTerrainMorphingEngine } from './globalElevationTerrainMorphingEngine';
import { atmosphericRenderingModel } from './atmosphericRenderingModel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type EarthZoomOptions = {
  durationMs?: number;
  maxPitch?: number;
  toAR?: boolean;
};

export const earthZoomPipeline = {
  async fly(map: GLMap, target: { lat: number; lon: number }, opts?: EarthZoomOptions) {
    // Ensure layers on before flight
    satelliteImageryLayer.init(map);
    earthScaleTerrainEngine.init(map);
    atmosphericRenderingModel.apply(map, { enableSkyLayer: false });

    const total = Math.max(1500, Math.min(9000, opts?.durationMs ?? 3600));

    // Drive AI Earth-style fly sequence
    await aiCameraTransitionEngine.flyEarthStyle(map, target, { durationMs: total, maxPitch: opts?.maxPitch ?? 82 });

    // Minor finishing: brief morph smoothing pass
    const start = performance.now();
    let now = start;
    while ((now - start) < 600) {
      const dt = 16;
      globalElevationTerrainMorphingEngine.tick(map, dt);
      atmosphericRenderingModel.adaptWithZoom(map);
      earthScaleTerrainEngine.adaptWithZoom(map);
      await new Promise(r => setTimeout(r, dt));
      now = performance.now();
    }
  }
};
