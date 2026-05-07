import type { RouteLikeV64 } from './types';

export interface SafePathScore {
  score: number; // 0-100
  recommended_reroute: boolean;
  risk_notes?: string[];
}

export function evaluateSafePath(route: RouteLikeV64 | null, opts: {
  ambientLight: number; // 0-1 normalized
  timeOfDay: number; // 0-24 hours
  avgSpeedMps?: number;
  elevationVariance?: number; // normalized 0-1
}): SafePathScore {
  if (!route?.path || route.path.length < 2) {
    return { score: 100, recommended_reroute: false };
  }
  const notes: string[] = [];

  // Lighting factor: night reduces safety
  const night = opts.timeOfDay >= 20 || opts.timeOfDay <= 6;
  const lightPenalty = night ? (1 - Math.min(1, opts.ambientLight)) * 18 : (1 - opts.ambientLight) * 6;

  // Speed factor: higher speed requires safer segments
  const speed = Math.max(0, Math.min(40, opts.avgSpeedMps || 0));
  const speedPenalty = (speed / 40) * 10;

  // Elevation/grade penalty (placeholder)
  const elevPenalty = (opts.elevationVariance || 0) * 12;

  // Urban density/alley detection proxy: short segment jittering
  let jitterPenalty = 0;
  let turnCount = 0;
  for (let i = 0; i < route.path.length - 2; i++) {
    const a = route.path[i];
    const b = route.path[i + 1];
    const c = route.path[i + 2];
    const ang = turnAngle(a, b, c);
    if (ang > 40) turnCount++;
  }
  if (turnCount > 8) {
    jitterPenalty = Math.min(20, (turnCount - 8) * 1.5);
    notes.push('high-turn-density');
  }

  const raw = 100 - (lightPenalty + speedPenalty + elevPenalty + jitterPenalty);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const recommended_reroute = score < 55;
  if (recommended_reroute) notes.push('low-safe-path-score');

  return { score, recommended_reroute, risk_notes: notes };
}

function turnAngle(a: [number, number], b: [number, number], c: [number, number]) {
  const ab = bearing(a, b);
  const bc = bearing(b, c);
  let diff = Math.abs(ab - bc);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function bearing(a: [number, number], b: [number, number]) {
  const [lat1, lon1] = a.map(toRad) as [number, number];
  const [lat2, lon2] = b.map(toRad) as [number, number];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function toRad(d: number) { return d * Math.PI / 180; }
