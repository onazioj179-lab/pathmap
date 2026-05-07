export type EnvironmentType = 'indoor' | 'outdoor-open' | 'outdoor-enclosed' | 'tunnel' | 'parking' | 'unknown';

export interface EnvironmentState {
  env: EnvironmentType;
  context: 'urban' | 'suburban' | 'rural' | 'unknown';
  elevationTrend: 'flat' | 'up' | 'down' | 'mixed';
  signalQuality: 'good' | 'fair' | 'poor';
  reliability: number; // 0-1
}

interface Sample {
  t: number;
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

class EnvironmentDetectionEngine {
  private static _instance: EnvironmentDetectionEngine;
  private window: Sample[] = [];
  private state: EnvironmentState = {
    env: 'unknown',
    context: 'unknown',
    elevationTrend: 'flat',
    signalQuality: 'good',
    reliability: 0.5,
  };

  static get instance() {
    if (!this._instance) this._instance = new EnvironmentDetectionEngine();
    return this._instance;
  }

  update(sample: Sample) {
    const now = sample.t || Date.now();
    this.window.push({ ...sample, t: now });
    // keep last 20s
    const cutoff = now - 20000;
    this.window = this.window.filter(s => s.t >= cutoff);

    // Signal quality heuristic
    const acc = sample.accuracy ?? 30;
    const signalQuality: EnvironmentState['signalQuality'] = acc < 10 ? 'good' : acc < 30 ? 'fair' : 'poor';

    // Tunnel/enclosed detection: good speed with poor accuracy and low heading jitter
    const headings = this.window.map(s => s.heading ?? 0);
    const headingVar = headings.length > 1 ? variance(headings) : 0;
    const speeds = this.window.map(s => s.speed ?? 0).filter(Boolean);
    const avgSpeed = speeds.length ? average(speeds) : 0;

    let env: EnvironmentType = 'outdoor-open';
    if (signalQuality === 'poor' && avgSpeed > 4 && headingVar < 200) {
      env = 'tunnel';
    } else if (signalQuality === 'poor' && avgSpeed < 1) {
      env = 'indoor';
    } else if (signalQuality === 'fair' && headingVar < 300) {
      env = 'outdoor-enclosed';
    }

    // Context heuristic by speed profile (proxy for road density)
    const context: EnvironmentState['context'] = avgSpeed > 8 ? 'urban' : avgSpeed > 4 ? 'suburban' : 'rural';

    // Reliability from data volume and consistency
    const rel = Math.max(0.2, Math.min(1, (this.window.length / 20) * (signalQuality === 'good' ? 1 : 0.8)));

    this.state = {
      env,
      context,
      elevationTrend: 'flat',
      signalQuality,
      reliability: +rel.toFixed(2),
    };
  }

  getState(): EnvironmentState {
    return this.state;
  }
}

function average(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function variance(xs: number[]) {
  const m = average(xs);
  return xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / xs.length;
}

export const environmentDetectionEngine = EnvironmentDetectionEngine.instance;
