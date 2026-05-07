import type { RouteLikeV64 } from './types';

export interface HazardEvent {
  type:
    | 'sharp_turn'
    | 'low_visibility_intersection'
    | 'tunnel_suspected'
    | 'bridge_segment'
    | 'gps_dead_zone'
    | 'off_route'
    | 'sudden_stop'
    | 'wrong_way';
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface HDLContext {
  lastPositions: Array<{ t: number; lat: number; lon: number; speed?: number; heading?: number; acc?: number }>; // recent samples
  route?: RouteLikeV64 | null;
  onRouteDistanceM?: number; // distance from nearest route point
  gpsAccuracyM?: number;
  visibility: 'clear' | 'dim' | 'low' | 'critical';
}

export function detectHazards(ctx: HDLContext): HazardEvent[] {
  const now = Date.now();
  const events: HazardEvent[] = [];
  const samples = ctx.lastPositions.slice(-5);
  if (samples.length < 2) return events;

  // Sudden stop
  const v = samples[samples.length - 1].speed || 0;
  const vPrev = samples[0].speed || 0;
  if (vPrev > 3 && v < 0.5) {
    events.push({ type: 'sudden_stop', severity: 'low', timestamp: now });
  }

  // Off-route (simple distance threshold)
  if ((ctx.onRouteDistanceM ?? 0) > 25) {
    events.push({ type: 'off_route', severity: 'medium', timestamp: now });
  }

  // Wrong-way detection by heading vs. route segment bearing
  if (ctx.route?.path && ctx.route.path.length > 1) {
    const cur = samples[samples.length - 1];
    const nearestIdx = nearestRouteIndex(ctx.route.path, [cur.lat, cur.lon]);
    if (nearestIdx >= 0 && nearestIdx < ctx.route.path.length - 1 && cur.heading !== undefined) {
      const segBearing = bearing(ctx.route.path[nearestIdx], ctx.route.path[nearestIdx + 1]);
      let diff = Math.abs(segBearing - cur.heading);
      if (diff > 180) diff = 360 - diff;
      if (diff > 130) {
        events.push({ type: 'wrong_way', severity: 'high', timestamp: now });
      }
    }
  }

  // GPS dead zone approximation
  if ((ctx.gpsAccuracyM ?? 0) > 35) {
    events.push({ type: 'gps_dead_zone', severity: 'low', timestamp: now });
  }

  // Low visibility intersection hint
  if (ctx.visibility === 'low' || ctx.visibility === 'critical') {
    events.push({ type: 'low_visibility_intersection', severity: 'medium', timestamp: now });
  }

  return dedupe(events);
}

function dedupe(arr: HazardEvent[]): HazardEvent[] {
  const map = new Map<string, HazardEvent>();
  for (const e of arr) {
    const k = `${e.type}:${e.severity}`;
    map.set(k, e);
  }
  return Array.from(map.values());
}

function nearestRouteIndex(path: [number, number][], p: [number, number]) {
  let idx = -1;
  let best = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < path.length; i++) {
    const d = haversineM(path[i], p);
    if (d < best) { best = d; idx = i; }
  }
  return idx;
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

function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
