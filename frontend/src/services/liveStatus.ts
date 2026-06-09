/**
 * PATHMAP - Always-On Live Status Coordinator
 * ===========================================
 * Owns the "full-time functionality" lifecycle that sits above the encrypted
 * transport (tunnelService) and the location stream:
 *
 *   connect -> heartbeat -> (network drop / tab hidden) -> backoff reconnect ->
 *   re-handshake + re-register -> resume. While hidden or offline we stop doing
 *   pointless work; on resume we reconnect and resync.
 *
 * It aggregates tunnel + network + GPS health into a single LiveStatus, emitted
 * on the `live:status` event for the telemetry HUD and status indicators. It
 * also derives an adaptive location sampling interval (slower when stationary or
 * on low battery) and manages a screen wake lock during active navigation.
 *
 * Geofence/landmark delivery survives reconnects automatically: tunnel message
 * handlers live in an in-memory registry that is never cleared on reconnect, and
 * the session is transparently re-registered, so server broadcasts resume.
 *
 * No new dependencies: pub/sub via eventBus, motion derived from recent fixes,
 * battery via the Battery Status API when present.
 */

import { eventBus } from './eventBus';
import { tunnelService, TunnelConnState } from './tunnelService';

// Minimal shape of the Battery Status API (not in the standard TS DOM lib).
interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
}

export type GpsQuality = 'good' | 'fair' | 'poor' | 'none';

export interface GpsHealth {
  hasFix: boolean;
  accuracy: number | null;
  ageMs: number | null;
  stale: boolean;
  quality: GpsQuality;
}

export interface LiveStatus {
  tunnel: TunnelConnState;
  registered: boolean;
  online: boolean;
  visible: boolean;
  gps: GpsHealth;
  recommendedIntervalMs: number;
  wakeLockActive: boolean;
}

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  t: number;
}

// Sampling intervals (ms) the rest of the app can honor for location pushes.
const INTERVAL_MOVING = 2000;
const INTERVAL_WALKING = 3000;
const INTERVAL_STATIONARY = 8000;
const INTERVAL_LOW_BATTERY = 15000;
// A fix older than this while tracking suggests a GPS dead zone (tunnel, indoors).
const DEAD_ZONE_MS = 15000;
// Tunnel disconnected longer than this is surfaced as a user-visible outage.
const OUTAGE_MS = 8000;

class LiveStatusService {
  private started = false;
  private lastFix: Fix | null = null;
  private prevFix: Fix | null = null;
  private speedMps = 0;
  private batteryLow = false;
  private wakeLock: WakeLockSentinel | null = null;
  private navigating = false;
  private precisionMode = false;
  private outageTimer: number | null = null;
  private tunnelState: TunnelConnState = 'disconnected';
  private registered = false;

  /** Begin coordinating always-on behaviour. Idempotent. */
  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    eventBus.on<{ state: TunnelConnState; registered: boolean }>('tunnel:state', s => {
      this.tunnelState = s.state;
      this.registered = s.registered;
      this.onTunnelState(s.state);
      this.emit();
    });

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibility);
    // Re-acquire the wake lock if the page was hidden then shown while navigating.
    document.addEventListener('visibilitychange', this.reacquireWakeLock);

    void this.initBattery();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    document.removeEventListener('visibilitychange', this.reacquireWakeLock);
    void this.releaseWakeLock();
  }

  /**
   * Record a fresh position. Maintains the last-known-good fix, derives speed for
   * adaptive sampling, and recomputes/broadcasts status. Returns the recommended
   * interval so callers can pace their next push.
   */
  updatePosition(lat: number, lng: number, accuracy: number): number {
    const t = Date.now();
    this.prevFix = this.lastFix;
    this.lastFix = { lat, lng, accuracy, t };
    if (this.prevFix) {
      const dt = (t - this.prevFix.t) / 1000;
      if (dt > 0) {
        const d = haversineMeters(this.prevFix.lat, this.prevFix.lng, lat, lng);
        // Light smoothing so a single noisy fix doesn't swing the interval.
        this.speedMps = this.speedMps * 0.5 + (d / dt) * 0.5;
      }
    }
    this.emit();
    return this.recommendedInterval();
  }

  /** The most recent position, used so the UI never shows a blank after a drop. */
  getLastKnownPosition(): Fix | null {
    return this.lastFix;
  }

  /** Enable/disable high-precision mode (tighter sampling). */
  setPrecisionMode(on: boolean): void {
    this.precisionMode = on;
    this.emit();
  }

  /** Recommended location sampling interval given motion, battery and precision. */
  recommendedInterval(): number {
    if (this.batteryLow) return INTERVAL_LOW_BATTERY;
    let interval: number;
    if (this.speedMps < 0.5) interval = INTERVAL_STATIONARY;
    else if (this.speedMps < 2.0) interval = INTERVAL_WALKING;
    else interval = INTERVAL_MOVING;
    // High-precision mode samples roughly twice as often (floored at 1s).
    if (this.precisionMode) interval = Math.max(1000, Math.round(interval / 2));
    return interval;
  }

  /** Map an accuracy (metres) to a coarse quality band for the UI. */
  private gpsQuality(accuracy: number | null, hasFix: boolean): GpsQuality {
    if (!hasFix || accuracy == null) return 'none';
    if (accuracy <= 10) return 'good';
    if (accuracy <= 30) return 'fair';
    return 'poor';
  }

  /** Aggregate current health. */
  getLiveStatus(): LiveStatus {
    const ageMs = this.lastFix ? Date.now() - this.lastFix.t : null;
    return {
      tunnel: this.tunnelState,
      registered: this.registered,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
      gps: {
        hasFix: !!this.lastFix,
        accuracy: this.lastFix?.accuracy ?? null,
        ageMs,
        stale: ageMs !== null && ageMs > DEAD_ZONE_MS,
        quality: this.gpsQuality(this.lastFix?.accuracy ?? null, !!this.lastFix),
      },
      recommendedIntervalMs: this.recommendedInterval(),
      wakeLockActive: !!this.wakeLock,
    };
  }

  /** Mark active navigation on/off; holds a screen wake lock while navigating. */
  setNavigating(active: boolean): void {
    this.navigating = active;
    if (active) void this.requestWakeLock();
    else void this.releaseWakeLock();
  }

  async requestWakeLock(): Promise<void> {
    try {
      const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
      if (!wl || this.wakeLock) return;
      this.wakeLock = await wl.request('screen');
      this.wakeLock.addEventListener?.('release', () => {
        this.wakeLock = null;
      });
      this.emit();
    } catch {
      /* wake lock unsupported or denied; non-fatal */
    }
  }

  async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* ignore */
    }
    this.wakeLock = null;
    this.emit();
  }

  // ----- internal -----

  private handleOnline = (): void => {
    void tunnelService.ensureConnected();
    this.emit();
  };

  private handleOffline = (): void => {
    this.emit();
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      // Resume + resync: reconnect the tunnel if it dropped while hidden.
      void tunnelService.ensureConnected();
    }
    this.emit();
  };

  private reacquireWakeLock = (): void => {
    if (document.visibilityState === 'visible' && this.navigating && !this.wakeLock) {
      void this.requestWakeLock();
    }
  };

  private onTunnelState(state: TunnelConnState): void {
    // Surface a prolonged outage so the UI can show a single reconnect toast.
    if (state === 'reconnecting' || state === 'disconnected' || state === 'failed') {
      if (this.outageTimer == null) {
        this.outageTimer = window.setTimeout(() => {
          eventBus.emit('live:outage', { state });
        }, OUTAGE_MS);
      }
    } else if (state === 'established') {
      if (this.outageTimer != null) {
        clearTimeout(this.outageTimer);
        this.outageTimer = null;
      }
      eventBus.emit('live:recovered', { state });
    }
  }

  private async initBattery(): Promise<void> {
    try {
      const getBattery = (navigator as Navigator & {
        getBattery?: () => Promise<BatteryManager>;
      }).getBattery;
      if (!getBattery) return;
      const battery = await getBattery.call(navigator);
      const update = () => {
        this.batteryLow = !battery.charging && battery.level <= 0.2;
        this.emit();
      };
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
      update();
    } catch {
      /* Battery API unavailable; treat as not-low */
    }
  }

  private emit(): void {
    eventBus.emit('live:status', this.getLiveStatus());
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const liveStatus = new LiveStatusService();
export default liveStatus;
