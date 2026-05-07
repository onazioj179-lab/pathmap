// V71 — Movement Analytics Engine (MAE)
// Computes movement stability, efficiency, and pattern signature locally.
import { lepl } from './localEncryptedProfile';

type Pose = { t: number; lat: number; lon: number; speed?: number; heading?: number };

function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }
function toRad(d: number) { return d * Math.PI / 180; }
function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

class MovementAnalyticsEngine {
  private static _i: MovementAnalyticsEngine;
  static get instance() { return this._i || (this._i = new MovementAnalyticsEngine()); }

  private last: Pose | null = null;
  private headingDeltas: number[] = [];
  private accelSamples: number[] = [];
  private stops: number = 0;
  private moves: number = 0;
  private lastSave = 0;

  update(pos: { lat: number; lon: number; speedMps?: number; heading?: number }, t: number) {
    const cur: Pose = { t, lat: pos.lat, lon: pos.lon, speed: pos.speedMps, heading: pos.heading };
    if (this.last) {
      const dt = Math.max(0.001, (cur.t - this.last.t) / 1000);
      const dv = (cur.speed ?? 0) - (this.last.speed ?? 0);
      const acc = dv / dt;
      this.accelSamples.push(Math.abs(acc));
      if (this.accelSamples.length > 120) this.accelSamples.shift();

      const dh = Math.abs(((cur.heading ?? 0) - (this.last.heading ?? 0) + 540) % 360 - 180);
      this.headingDeltas.push(dh);
      if (this.headingDeltas.length > 120) this.headingDeltas.shift();

      const v = cur.speed ?? 0;
      if (v < 0.5) this.stops++; else this.moves++;
    }
    this.last = cur;

    // Throttled save
    if (t - this.lastSave > 15000) {
      this.lastSave = t;
      this.save().catch(() => {});
    }
  }

  private async save() {
    const snapshot = this.getSnapshot();
    await lepl.save('analytics.mae.json.enc', snapshot);
  }

  getSnapshot() {
    const avgHeading = this.headingDeltas.length ? this.headingDeltas.reduce((a, b) => a + b, 0) / this.headingDeltas.length : 0;
    const headingStability = clamp(100 - (avgHeading / 180) * 100, 0, 100);
    const avgAcc = this.accelSamples.length ? this.accelSamples.reduce((a, b) => a + b, 0) / this.accelSamples.length : 0;
    const motionEfficiency = clamp(100 - Math.min(100, avgAcc * 20), 0, 100);
    const total = this.stops + this.moves || 1;
    const motionRatio = { stop: this.stops / total, move: this.moves / total };
    const pattern_signature = [headingStability, motionEfficiency, motionRatio.move];
    const environment_class = (this.last?.speed ?? 0) > 3 ? 'outdoor' : 'mixed';
    return {
      stability_score: Math.round(headingStability),
      motion_efficiency: Math.round(motionEfficiency),
      pattern_signature,
      environment_class,
      motion_ratio: motionRatio
    };
  }
}

export const movementAnalyticsEngine = MovementAnalyticsEngine.instance;
