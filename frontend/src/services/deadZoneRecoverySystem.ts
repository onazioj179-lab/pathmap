import { aiMovementModel } from './aiMovementModel';

export interface DZREstimate {
  lat: number;
  lon: number;
  freshnessMs: number;
}

class DeadZoneRecoverySystem {
  private static _instance: DeadZoneRecoverySystem;
  private lastGood: {
    t: number;
    lat: number;
    lon: number;
    heading?: number;
    speed?: number;
  } | null = null;

  static get instance() {
    if (!this._instance) this._instance = new DeadZoneRecoverySystem();
    return this._instance;
  }

  update(lat: number, lon: number, heading?: number, speedMps?: number) {
    const t = Date.now();
    this.lastGood = { t, lat, lon, heading, speed: speedMps };
    aiMovementModel.update({ lat, lon, headingDeg: heading ?? 0, speedMps: speedMps ?? 0 });
  }

  estimate(maxHorizonMs = 1200): DZREstimate | null {
    if (!this.lastGood) return null;
    const now = Date.now();
    const horizon = Math.min(maxHorizonMs, now - this.lastGood.t);
    const pose = aiMovementModel.predict(now);
    if (!pose) return null;
    return { lat: pose.lat, lon: pose.lon, freshnessMs: horizon };
  }
}

export const deadZoneRecoverySystem = DeadZoneRecoverySystem.instance;
