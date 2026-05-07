export interface LaneHint {
  lane: 'left' | 'right' | 'center';
  bearingOffset: number; // degrees to align camera
  upcomingRequirement?: 'keep-left' | 'keep-right' | 'merge-left' | 'merge-right' | 'turn-left' | 'turn-right' | 'straight';
  confidence: number; // 0-1
}

export function computeLaneHint(
  path: [number, number][],
  currentIdx: number,
  currentHeadingDeg: number
): LaneHint | null {
  if (!path || path.length < 3) return null;
  const i = Math.min(Math.max(1, currentIdx), path.length - 2);
  const prev = path[i - 1];
  const curr = path[i];
  const next = path[i + 1];

  const routeBearing = bearing(prev, curr);
  const nextBearing = bearing(curr, next);
  const turnAngle = normalizeAngle(nextBearing - routeBearing);
  const headingOffset = normalizeAngle(currentHeadingDeg - routeBearing);

  let lane: LaneHint['lane'] = 'center';
  if (headingOffset > 5) lane = 'right';
  else if (headingOffset < -5) lane = 'left';

  let upcoming: LaneHint['upcomingRequirement'] = 'straight';
  if (turnAngle > 20) upcoming = 'turn-right';
  else if (turnAngle < -20) upcoming = 'turn-left';

  // Modest camera alignment to lane curvature
  const bearingOffset = Math.max(-10, Math.min(10, headingOffset * 0.6));
  const confidence = Math.min(1, 0.6 + Math.abs(headingOffset) / 90 + Math.abs(turnAngle) / 180);

  return { lane, bearingOffset, upcomingRequirement: upcoming, confidence: +confidence.toFixed(2) };
}

function bearing(a: [number, number], b: [number, number]) {
  const [lat1, lon1] = a.map(rad);
  const [lat2, lon2] = b.map(rad);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function rad(d: number) { return (d * Math.PI) / 180; }
function deg(r: number) { return (r * 180) / Math.PI; }
function normalizeAngle(a: number) { let x = ((a + 540) % 360) - 180; return x; }
