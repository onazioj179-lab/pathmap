/*
 V75: AI Camera Transition Engine (AI-CTE)
 - Orchestrates Google-Earth–style camera transitions from globe → street
 - Uses ultraSmoothAnimationEngine + motionInterpolationEngine under the hood
*/

import { ultraSmoothAnimationEngine } from './ultraSmoothAnimationEngine';
import { motionInterpolationEngine } from './motionInterpolationEngine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type FlyOptions = {
  durationMs?: number; // total nominal duration; adaptive per segment
  maxPitch?: number;
};

export const aiCameraTransitionEngine = {
  async flyEarthStyle(map: GLMap, target: { lat: number; lon: number }, opts?: FlyOptions) {
    const total = Math.max(1200, Math.min(6500, opts?.durationMs ?? 3200));
    const maxPitch = Math.max(45, Math.min(85, opts?.maxPitch ?? 80));

    // Break into staged segments with adaptive durations
    const stages = [
      { z: 2.2, pitch: 0,  bearing: 0,   frac: 0.18 }, // space → see globe
      { z: 4.5, pitch: 15, bearing: -10, frac: 0.16 },
      { z: 6.5, pitch: 25, bearing: -20, frac: 0.16 },
      { z: 9.0, pitch: 35, bearing: -30, frac: 0.16 },
      { z: 12.0, pitch: 48, bearing: -40, frac: 0.17 },
      { z: 15.0, pitch: maxPitch, bearing: -50, frac: 0.17 }, // city/street
    ];

    const bezier = ultraSmoothAnimationEngine.cubicBezier(0.16, 0.84, 0.44, 1);

    // Start from current pose
    let cur = { center: map.getCenter(), zoom: map.getZoom?.() ?? 4, pitch: map.getPitch?.() ?? 0, bearing: map.getBearing?.() ?? 0 };

    for (const s of stages) {
      const dur = Math.max(300, Math.floor(total * s.frac));
      // Interpolate pose frame-by-frame toward new pose centered at target
      motionInterpolationEngine.setTarget(
        { lat: cur.center.lat, lon: cur.center.lng, pitch: cur.pitch, bearing: cur.bearing, zoom: cur.zoom },
        { lat: target.lat,     lon: target.lon,     pitch: s.pitch,   bearing: s.bearing,  zoom: s.z }
      );
      await new Promise<void>((resolve) => {
        ultraSmoothAnimationEngine.schedule({
          durationMs: dur,
          easing: bezier,
          onUpdate: (_t, dt) => {
            const pose = motionInterpolationEngine.update(dt, dur);
            if (pose) {
              map.jumpTo({ center: [pose.lon, pose.lat], pitch: pose.pitch, bearing: pose.bearing, zoom: pose.zoom });
            }
          },
          onComplete: () => resolve()
        });
      });
      cur = { center: map.getCenter(), zoom: map.getZoom?.() ?? s.z, pitch: map.getPitch?.() ?? s.pitch, bearing: map.getBearing?.() ?? s.bearing };
    }
  }
};
