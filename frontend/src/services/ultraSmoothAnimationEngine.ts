/**
 * PATHFINDER V74 — Ultra-Smooth Animation Engine (USAE)
 *
 * Unified animation core with refresh-aware pacing, sub-frame interpolation,
 * cubic-bezier + spring easing, and optional worker offload for heavy math.
 */

import { framePacingEngine } from './framePacingEngine';

export type EasingFn = (t: number) => number;

export interface SpringConfig {
  stiffness: number; // N/m
  damping: number;   // Ns/m
  mass: number;      // kg
}

export interface AnimationSpec {
  durationMs?: number;           // For bezier/tween
  easing?: EasingFn;             // Easing function
  onUpdate: (t: number, dt: number) => void; // t in [0,1]
  onComplete?: () => void;
}

class UltraSmoothAnimationEngine {
  private active: Set<AnimationSpec> = new Set();
  private running = false;

  // Standard cubic-bezier easing generator
  cubicBezier(p0x: number, p0y: number, p1x: number, p1y: number): EasingFn {
    // Based on https://webkit.org/demos/spring/spring.js (simplified)
    function cubicBezierAtT(t: number, a1: number, a2: number): number {
      const A = 1.0 - 3.0 * a2 + 3.0 * a1;
      const B = 3.0 * a2 - 6.0 * a1;
      const C = 3.0 * a1;
      return ((A * t + B) * t + C) * t;
    }
    function getTForX(x: number): number {
      let t = x;
      for (let i = 0; i < 5; i++) { // Newton-Raphson
        const xEst = cubicBezierAtT(t, p0x, p1x) - x;
        const dEst = 3 * (1 - 3 * p1x + 3 * p0x) * t * t + 2 * (3 * p1x - 6 * p0x) * t + 3 * p0x;
        if (Math.abs(dEst) < 1e-6) break;
        t -= xEst / dEst;
        t = Math.max(0, Math.min(1, t));
      }
      return t;
    }
    return (x: number) => cubicBezierAtT(getTForX(x), p0y, p1y);
  }

  // Critically damped spring motion response (unit step)
  springResponse(config: SpringConfig): (t: number) => number {
    const { stiffness: k, damping: c, mass: m } = config;
    const w0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));
    if (zeta >= 1) {
      // Overdamped
      return (t: number) => 1 - Math.exp(-w0 * t);
    } else {
      // Underdamped / critically damped
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    }
  }

  // Refresh-aware recommended durations
  getTransitionDurations() {
    const target = framePacingEngine.getMetrics().targetRefreshRate || 60;
    // Tune durations to complete on clean frame boundaries
    const frame = 1000 / target; // ms
    const snap = (ms: number) => Math.round(ms / frame) * frame;
    return {
      uiOpenClose: snap(140),
      bottomSheet: snap(130),
      arActivate: snap(180),
      cameraEaseBase: snap(480),
    };
  }

  // Schedule a tween animation (bezier/tween)
  schedule(spec: AnimationSpec): () => void {
    const start = performance.now();
    const duration = spec.durationMs ?? this.getTransitionDurations().uiOpenClose;
    const easing = spec.easing ?? this.cubicBezier(0.16, 0.84, 0.44, 1);
    let stopped = false;
    const tick = (dt: number) => {
      if (stopped) return;
      const t = Math.max(0, Math.min(1, (performance.now() - start) / duration));
      spec.onUpdate(easing(t), dt);
      if (t >= 1) {
        this.active.delete(spec);
        spec.onComplete?.();
      }
    };
    // Wrap onUpdate to include dt via our pacing engine
    const wrapped: AnimationSpec = { ...spec, onUpdate: () => {}, durationMs: duration, easing };
    // Store and start global loop if needed
    this.active.add(wrapped);
    if (!this.running) this.startLoop();

    // Attach our per-frame callback via FPE
    const cb = (deltaMs: number) => tick(deltaMs);
    framePacingEngine.start(cb);

    // Return cancel
    return () => { stopped = true; this.active.delete(wrapped); };
  }

  private startLoop() {
    this.running = true;
    // We rely on framePacingEngine driving callbacks passed at schedule time.
  }

  stopAll() { this.active.clear(); this.running = false; framePacingEngine.stop(); }
}

export const ultraSmoothAnimationEngine = new UltraSmoothAnimationEngine();

// Common easings
export const Easings = {
  // Matches V59 camera curve
  smooth: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};
