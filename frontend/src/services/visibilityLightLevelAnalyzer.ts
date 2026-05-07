import type { VisibilityLevel } from './types';

export interface VLLAInput {
  ambientLight?: number; // 0..1 normalized if available
  timeOfDay: number; // 0..24 hours
  gpsAccuracyM?: number;
}

export function analyzeVisibility(input: VLLAInput): VisibilityLevel {
  const night = input.timeOfDay >= 20 || input.timeOfDay <= 6;
  const light = clamp(input.ambientLight ?? (night ? 0.15 : 0.7), 0, 1);
  const acc = input.gpsAccuracyM ?? 10;

  // Simple rule set blending night/ambient and GPS quality
  if (light < 0.2 || acc > 45) return 'critical';
  if (light < 0.35 || acc > 30) return 'low';
  if (light < 0.55 || acc > 20) return 'dim';
  return 'clear';
}

function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }
