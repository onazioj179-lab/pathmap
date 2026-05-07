import { analyzeVisibility } from './visibilityLightLevelAnalyzer';
import { evaluateSafePath } from './safePathEvaluator';
import { detectHazards } from './hazardDetectionLayer';
import { updateTBAE, getTBAEState } from './tunnelBridgeAwareness';
import { updateWrongWay } from './wrongWayMonitor';
import { updateSafeReturn, getSafeReturnState } from './safeReturnReinforcement';
import type { SafetyState, RouteLikeV64, MotionSnapshot } from './types';

type Listener = (s: SafetyState) => void;

class GlobalSafetyEngine {
  private static _instance: GlobalSafetyEngine;
  static get instance() { if (!this._instance) this._instance = new GlobalSafetyEngine(); return this._instance; }

  private route: RouteLikeV64 | null = null;
  private lastSamples: Array<{ t: number; lat: number; lon: number; speed?: number; heading?: number; acc?: number; accuracyM?: number }> = [];
  private ambientLight: number | undefined;
  private listeners: Set<Listener> = new Set();
  private externalHazards: Set<string> = new Set();
  private state: SafetyState = {
    risk_level: 'low',
    visibility_level: 'clear',
    safe_path_rating: 100,
    hazard_flags: [],
    recommended_action: 'none',
    last_update: 0,
  };

  setRoute(route: RouteLikeV64 | null) {
    this.route = route;
  }

  setAmbientLight(normalized01?: number) {
    this.ambientLight = normalized01;
  }

  // V65/V66: external hazard integration (e.g., LiDAR/AR)
  registerExternalHazards(flags: string[] = []) {
    flags.forEach(f => this.externalHazards.add(f));
    // expire next update; no immediate emit here to avoid thrash
  }

  onUpdate(cb: Listener) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  getState() { return this.state; }

  updateFromSensors(loc: { lat: number; lon: number; speed?: number; heading?: number; accuracyM?: number }, motion: MotionSnapshot) {
    const t = Date.now();
    this.lastSamples.push({ t, lat: loc.lat, lon: loc.lon, speed: loc.speed, heading: loc.heading, accuracyM: loc.accuracyM });
    if (this.lastSamples.length > 60) this.lastSamples.shift();

    // Visibility
    const timeOfDay = new Date().getHours() + new Date().getMinutes() / 60;
    const visibility = analyzeVisibility({ timeOfDay, ambientLight: this.ambientLight, gpsAccuracyM: loc.accuracyM });

    // SPE: safe path scoring (fast heuristic)
    const avgSpeed = average(this.lastSamples.slice(-5).map(s => s.speed || 0));
    const spe = evaluateSafePath(this.route, { ambientLight: this.ambientLight ?? 0.7, timeOfDay, avgSpeedMps: avgSpeed, elevationVariance: 0.1 });

    // Distance to route (simple)
    const onRouteDist = this.route?.path ? distanceToPathM(this.route.path, [loc.lat, loc.lon]) : 0;

    // Hazards
    const hazards = detectHazards({ lastPositions: this.lastSamples, route: this.route, onRouteDistanceM: onRouteDist, gpsAccuracyM: loc.accuracyM, visibility });

    // Wrong-way sustained monitor
    const wws = updateWrongWay(this.route, this.lastSamples.map(s => ({ t: s.t, lat: s.lat, lon: s.lon, heading: s.heading })));
    if (wws.sustained) hazards.push({ type: 'wrong_way', severity: 'high', timestamp: t });

    // Tunnel/Bridge awareness
    const tbae = updateTBAE({ ambientLight: this.ambientLight, gpsAccuracyM: loc.accuracyM, elevationDelta: 0 });

    // Safe return reinforcement
    updateSafeReturn({ lat: loc.lat, lon: loc.lon, heading: loc.heading, accuracyM: loc.accuracyM });

    // Risk level synthesis
    const riskScore = 100 - clamp((spe.score), 0, 100);
    const hasHighHazard = hazards.some(h => h.severity === 'high');
    const risk_level = hasHighHazard ? 'high' : (spe.score < 45 ? 'high' : spe.score < 65 ? 'moderate' : 'low');

    // Recommended action
    let recommended: SafetyState['recommended_action'] = 'none';
    if (risk_level === 'high' || visibility === 'low' || visibility === 'critical' || wws.sustained) {
      recommended = wws.sustained ? 'reroute' : 'slowdown';
    }

    const flags = new Set<string>();
    hazards.forEach(h => flags.add(h.type));
    if (tbae.tunnelMode) flags.add('tunnel_mode');
    if (tbae.bridgeLikely) flags.add('bridge');
    // Merge external hazards (from LSE/ARX/ODAL)
    this.externalHazards.forEach(f => flags.add(f));

    this.state = {
      risk_level,
      visibility_level: visibility,
      safe_path_rating: spe.score,
      hazard_flags: Array.from(flags),
      recommended_action: recommended,
      last_update: t,
    };

    this.listeners.forEach(l => l(this.state));

    // clear one-shot external hazards after publishing
    this.externalHazards.clear();
  }
}

function average(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }

function distanceToPathM(path: [number, number][], p: [number, number]) {
  let best = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < path.length; i++) {
    const d = haversineM(path[i], p);
    if (d < best) best = d;
  }
  return best;
}

function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function toRad(d: number) { return d * Math.PI / 180; }

export const globalSafetyEngine = GlobalSafetyEngine.instance;
export const getSafeReturn = getSafeReturnState;
export const getTunnelBridgeState = getTBAEState;
