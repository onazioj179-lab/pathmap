export type MotionMode = 'walking' | 'driving' | 'cycling' | 'slow-vehicle' | 'stationary';

interface PoseSample {
  t: number;
  lat: number;
  lon: number;
  speed?: number; // m/s
  heading?: number; // deg
}

interface MotionState {
  mode: MotionMode;
  confidence: number; // 0-1
}

class MotionClassificationEngine {
  private static _instance: MotionClassificationEngine;
  private window: PoseSample[] = [];
  private lastStableMode: MotionMode = 'stationary';
  private stableCount = 0;
  private state: MotionState = { mode: 'stationary', confidence: 0.5 };

  static get instance() {
    if (!this._instance) this._instance = new MotionClassificationEngine();
    return this._instance;
  }

  update(sample: PoseSample) {
    const now = sample.t || Date.now();
    this.window.push({ ...sample, t: now });
    const cutoff = now - 5000; // last 5s
    this.window = this.window.filter(s => s.t >= cutoff);

    const speeds = this.window.map(s => s.speed ?? 0);
    const avgSpeed = speeds.length ? average(speeds) : 0;
    const head = this.window.map(s => s.heading ?? 0);
    const headingRate = rate(head, this.window.map(s => s.t));

    // Base classification by speed
    let mode: MotionMode = 'stationary';
    if (avgSpeed < 0.5) mode = 'stationary';
    else if (avgSpeed < 2) mode = 'walking';
    else if (avgSpeed < 6) mode = 'cycling';
    else mode = 'driving';

    // Slow vehicle if driving speeds but very low heading change and low average speed
    if (mode === 'driving' && avgSpeed < 3) mode = 'slow-vehicle';

    // Hysteresis: require 3 consecutive windows before switching
    if (mode === this.lastStableMode) {
      this.stableCount = Math.min(5, this.stableCount + 1);
    } else {
      this.stableCount = Math.max(0, this.stableCount - 1);
      if (this.stableCount <= 0) {
        this.lastStableMode = mode;
        this.stableCount = 1;
      }
    }

    const confidence = Math.min(1, 0.4 + 0.12 * this.stableCount + (avgSpeed > 0 ? 0.1 : 0) - (headingRate > 80 ? 0.05 : 0));
    this.state = { mode: this.lastStableMode, confidence: +confidence.toFixed(2) };
  }

  getState(): MotionState {
    return this.state;
  }
}

function average(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
function rate(values: number[], times: number[]) {
  if (values.length < 2) return 0;
  const dt = (times[times.length - 1] - times[0]) / 1000;
  if (dt <= 0) return 0;
  const delta = Math.abs(values[values.length - 1] - values[0]);
  return delta / dt; // deg per second
}

export const motionClassificationEngine = MotionClassificationEngine.instance;
