// V65 — Obstacle Detection & Avoidance Layer (ODAL)
// Processes LSE updates into micro-navigation hints.

export interface AvoidanceHint {
  level: 'none' | 'caution' | 'high' | 'stop';
  lateralAdjustDeg?: number; // suggested sideways adjust in degrees relative to heading
  speedCapMps?: number; // optional cap for walking speed estimates
}

export function obstacleAvoidanceFromDistance(distM?: number): AvoidanceHint {
  if (distM == null) return { level: 'none' };
  if (distM < 0.5) return { level: 'stop', speedCapMps: 0.2 };
  if (distM < 1.0) return { level: 'high', speedCapMps: 0.6, lateralAdjustDeg: 10 };
  if (distM < 2.0) return { level: 'caution', speedCapMps: 1.0, lateralAdjustDeg: 5 };
  return { level: 'none' };
}
