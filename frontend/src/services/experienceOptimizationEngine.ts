// V71 — Experience Optimization Engine (EOE)
// Returns tiny UI/map tuning adjustments based on learned patterns.
import { movementAnalyticsEngine } from './movementAnalyticsEngine';
import { travelPatternModel } from './travelPatternModel';

type Adjustments = { pitchBias: number; zoomBias: number; durationBiasMs: number };

class ExperienceOptimizationEngine {
  private static _i: ExperienceOptimizationEngine;
  static get instance() { return this._i || (this._i = new ExperienceOptimizationEngine()); }

  getAdjustments(): Adjustments {
    const mae = movementAnalyticsEngine.getSnapshot();
    const tpm = travelPatternModel.getSummary();
    // Small biases based on stability and favorite hours (night → slower transitions)
    const stable = mae.stability_score; // 0..100
    const pitchBias = stable > 70 ? 1 : -1; // very small
    const zoomBias = mae.motion_efficiency > 70 ? 0.1 : -0.1;
    const night = (tpm.favHour >= 20 || tpm.favHour <= 6);
    const durationBiasMs = night ? 40 : 0;
    return { pitchBias, zoomBias, durationBiasMs };
  }
}

export const experienceOptimizationEngine = ExperienceOptimizationEngine.instance;
