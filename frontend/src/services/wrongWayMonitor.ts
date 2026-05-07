import type { RouteLikeV64 } from './types';

export interface WrongWayState {
  sustained: boolean;
  since: number | null;
}

let state: WrongWayState = { sustained: false, since: null };

export function updateWrongWay(route: RouteLikeV64 | null, locs: Array<{ t: number; lat: number; lon: number; heading?: number }>): WrongWayState {
  const last = locs[locs.length - 1];
  if (!last || !route?.path || route.path.length < 2 || last.heading == null) {
    state = { sustained: false, since: null };
    return state;
  }
  const idx = nearestIdx(route.path, [last.lat, last.lon]);
  if (idx < 0 || idx >= route.path.length - 1) {
    state = { sustained: false, since: null };
    return state;
  }
  const segBrng = bearing(route.path[idx], route.path[idx + 1]);
  let diff = Math.abs(segBrng - last.heading);
  if (diff > 180) diff = 360 - diff;

  const now = Date.now();
  if (diff > 130) {
    if (!state.since) state.since = now;
    state.sustained = (now - (state.since || now)) >= 2000; // 2s
  } else {
    state = { sustained: false, since: null };
  }
  return state;
}

function nearestIdx(path: [number, number][], p: [number, number]) {
  let idx = -1, best = Number.MAX_SAFE_INTEGER;
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
