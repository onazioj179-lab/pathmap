/**
 * V61 — AI Camera Engine (AICE)
 * Combines AIMM + AIRP + usage to suggest camera center/bearing/pitch.
 */

import { aiMovementModel, Pose } from './aiMovementModel';
import { predictAlongRoute, RouteLike } from './aiRoutePredictor';
import { usagePatternMemory } from './usagePatternMemory';

export interface CameraSuggestion {
  center: { lat: number; lon: number };
  bearing: number;
  pitch: number;
  zoom?: number;
}

class AICameraEngine {
  private lastSuggestion: CameraSuggestion | null = null;

  updateFromPose(pose: Pose) {
    aiMovementModel.update(pose);
    usagePatternMemory.pushHeading(pose.headingDeg);
  }

  suggest(route: RouteLike | null, horizonMs = 800): CameraSuggestion | null {
    const predicted = aiMovementModel.predict(horizonMs);
    if (!predicted) return this.lastSuggestion;

    // If route exists, project tiny lookahead along route proportional to speed
    const lookahead = Math.max(10, Math.min(60, predicted.speedMps * 1.8));
    const ahead = predictAlongRoute(route, { lat: predicted.lat, lon: predicted.lon }, lookahead) || [predicted.lat, predicted.lon];

    // Pitch scales with speed; mild bias from stored preference
    const prefPitch = usagePatternMemory.getSnapshot().preferredPitch ?? 45;
    const pitch = Math.max(20, Math.min(75, prefPitch * 0.6 + (predicted.speedMps * 3)));

    const suggestion: CameraSuggestion = {
      center: { lat: ahead[0], lon: ahead[1] },
      bearing: predicted.headingDeg,
      pitch,
    };

    this.lastSuggestion = suggestion;
    return suggestion;
  }
}

export const aiCameraEngine = new AICameraEngine();
