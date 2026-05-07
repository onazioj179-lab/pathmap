/**
 * V61 — AI Movement Model (AIMM)
 * Low-latency kinematic predictor using recent velocity/heading samples.
 */

export interface Pose {
  lat: number;
  lon: number;
  headingDeg: number; // 0..360
  speedMps: number;   // meters per second
}

class AIMovementModel {
  private history: Pose[] = [];
  private max = 30; // last ~1-2 seconds at 15-30Hz

  update(pose: Pose) {
    this.history.push(pose);
    if (this.history.length > this.max) this.history.shift();
  }

  // Predict position after dtMs (clamped 0..1200ms)
  predict(dtMs: number): Pose | null {
    if (this.history.length === 0) return null;
    const dt = Math.max(0, Math.min(1200, dtMs)) / 1000;
    const last = this.history[this.history.length - 1];

    // Simple constant-velocity prediction in lat/lon space
    const metersPerDegLat = 111_320; // approximate
    const metersPerDegLon = 111_320 * Math.cos((last.lat * Math.PI) / 180);

    const headingRad = (last.headingDeg * Math.PI) / 180;
    const dx = Math.cos(headingRad) * last.speedMps * dt; // meters east
    const dy = Math.sin(headingRad) * last.speedMps * dt; // meters north

    const dLon = dx / metersPerDegLon;
    const dLat = dy / metersPerDegLat;

    return {
      lat: last.lat + dLat,
      lon: last.lon + dLon,
      headingDeg: last.headingDeg,
      speedMps: last.speedMps,
    };
  }
}

export const aiMovementModel = new AIMovementModel();
