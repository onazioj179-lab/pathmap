// V71 — Session Metrics Layer (SML)
// Tracks per-session aggregates; stores last 60 sessions encrypted.
import { lepl } from './localEncryptedProfile';

type Session = {
  startedAtRel: number; // seconds since local midnight
  durationSec: number;
  distanceM: number;
  navTicks: number;
  hazards: number;
  arUses: number;
  driftEvents: number;
};

function secondsSinceMidnight(d: Date) { return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }
function toRad(d: number) { return d * Math.PI / 180; }
function haversineM(a: [number, number], b: [number, number]) {
  const R = 6371000; const dLat = toRad(b[0] - a[0]); const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]); const lat2 = toRad(b[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

class SessionMetricsLayer {
  private static _i: SessionMetricsLayer;
  static get instance() { return this._i || (this._i = new SessionMetricsLayer()); }

  private sessions: Session[] = [];
  private active: { startT: number; startRel: number; lastPos?: [number, number]; s: Session } | null = null;

  async load() {
    const data = await lepl.load('analytics.sml.json.enc');
    if (data && Array.isArray(data.sessions)) this.sessions = data.sessions;
  }

  startSession(now = new Date()) {
    if (this.active) return;
    const startRel = secondsSinceMidnight(now);
    this.active = { startT: Date.now(), startRel, s: { startedAtRel: startRel, durationSec: 0, distanceM: 0, navTicks: 0, hazards: 0, arUses: 0, driftEvents: 0 } };
  }

  recordNavTick(lat: number, lon: number, hazardCount = 0) {
    if (!this.active) return;
    const a = this.active;
    a.s.navTicks++;
    a.s.hazards += hazardCount;
    if (a.lastPos) a.s.distanceM += haversineM(a.lastPos, [lat, lon]);
    a.lastPos = [lat, lon];
  }

  recordARUse() { if (this.active) this.active.s.arUses++; }
  recordDrift() { if (this.active) this.active.s.driftEvents++; }

  async endSession() {
    if (!this.active) return;
    const a = this.active;
    a.s.durationSec = Math.round((Date.now() - a.startT) / 1000);
    this.sessions.push(a.s);
    // keep last 60 sessions
    if (this.sessions.length > 60) this.sessions = this.sessions.slice(-60);
    this.active = null;
    await lepl.save('analytics.sml.json.enc', { sessions: this.sessions });
  }
}

export const sessionMetricsLayer = SessionMetricsLayer.instance;
