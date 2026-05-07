/**
 * V61 — AI Route Predictor (AIRP)
 * Projects a point slightly ahead along the current route path.
 */

export interface RouteLike {
  path?: [number, number][]; // [lat, lon]
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function predictAlongRoute(
  route: RouteLike | null,
  current: { lat: number; lon: number },
  lookaheadMeters: number
): [number, number] | null {
  if (!route?.path || route.path.length < 2) return null;

  // Find nearest segment
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const cur: [number, number] = [current[0] ?? current.lat, current[1] ?? current.lon] as any;

  for (let i = 0; i < route.path.length - 1; i++) {
    const a = route.path[i];
    const b = route.path[i + 1];
    const d = haversine(a, cur) + haversine(cur, b) - haversine(a, b);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // Walk forward by lookaheadMeters
  let remain = lookaheadMeters;
  let idx = bestIdx;
  let pos: [number, number] = [route.path[idx][0], route.path[idx][1]];

  while (idx < route.path.length - 1 && remain > 0) {
    const next: [number, number] = route.path[idx + 1];
    const seg = haversine(pos, next);
    if (seg > remain) {
      // interpolate
      const t = remain / seg;
      return [pos[0] + (next[0] - pos[0]) * t, pos[1] + (next[1] - pos[1]) * t];
    } else {
      remain -= seg;
      pos = next;
      idx++;
    }
  }
  return pos;
}
