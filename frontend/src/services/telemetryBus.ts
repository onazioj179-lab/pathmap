/**
 * PATHMAP - Telemetry Bus
 * =======================
 * One pull-based aggregator over the engines that already expose getters, so the
 * flow-tracking HUD can show "what the system is doing right now" without each
 * engine knowing about the HUD. Sampling only runs while started (HUD open), so
 * it costs nothing when closed.
 *
 * Reuses: framePacingEngine, automaticQualityScalingSystem, mapModeController,
 * timeEngine, webVitals, tunnelService, liveStatus, mapCommandBus.
 */

import { eventBus } from './eventBus';
import { framePacingEngine } from './framePacingEngine';
import { automaticQualityScalingSystem } from './automaticQualityScalingSystem';
import { getMapModeController } from './mapModeController';
import { getVitalsSummary } from './webVitals';
import { tunnelService } from './tunnelService';
import { liveStatus } from './liveStatus';
import { mapCommandBus } from './mapCommandBus';

export interface MarkStat {
  last: number;
  avg: number;
  count: number;
}

export interface EngineFlag {
  name: string;
  active: boolean;
}

export interface TelemetrySnapshot {
  ts: number;
  fps: number;
  frameTime: number;
  droppedFrames: number;
  refreshRate: number;
  deviceTier: number;
  mapMode: string | null;
  gps: { accuracy: number | null; hasFix: boolean; stale: boolean; quality: string };
  tunnel: { connected: boolean; registered: boolean; encrypted: boolean; cipher: string };
  network: { online: boolean; visible: boolean };
  vitals: Array<{ name: string; value: number; rating: string }>;
  marks: Record<string, MarkStat>;
  engines: EngineFlag[];
}

export const TELEMETRY_TICK_EVENT = 'telemetry:tick';

class TelemetryBus {
  private timer: number | null = null;
  private marks: Record<string, { sum: number; count: number; last: number }> = {};
  private snapshot: TelemetrySnapshot | null = null;

  /** Begin sampling. Gated by the caller (HUD visibility) so it's free when off. */
  start(intervalMs = 500): void {
    if (this.timer != null || typeof window === 'undefined') return;
    this.sample();
    this.timer = window.setInterval(() => this.sample(), intervalMs);
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer != null;
  }

  /** Record a timing sample (e.g. route calc ms) into a rolling average. */
  mark(name: string, ms: number): void {
    const m = this.marks[name] ?? { sum: 0, count: 0, last: 0 };
    m.sum += ms;
    m.count += 1;
    m.last = ms;
    this.marks[name] = m;
  }

  getSnapshot(): TelemetrySnapshot | null {
    return this.snapshot;
  }

  private sample(): void {
    let fps = 0;
    let frameTime = 0;
    let droppedFrames = 0;
    let refreshRate = 0;
    try {
      const fm = framePacingEngine.getMetrics();
      fps = Math.round(fm.fps);
      frameTime = Math.round(fm.frameTime * 100) / 100;
      droppedFrames = fm.droppedFrames;
      refreshRate = fm.targetRefreshRate;
    } catch {
      /* engine not ready */
    }

    let deviceTier = 0;
    try {
      deviceTier = automaticQualityScalingSystem.getTier();
    } catch {
      /* ignore */
    }

    let mapMode: string | null = null;
    try {
      mapMode = getMapModeController().getCurrentMode();
    } catch {
      /* ignore */
    }

    const live = liveStatus.getLiveStatus();
    const sec = tunnelService.getSecurityState();

    let vitals: Array<{ name: string; value: number; rating: string }> = [];
    try {
      vitals = getVitalsSummary().map(v => ({ name: v.name, value: v.value, rating: v.rating }));
    } catch {
      /* ignore */
    }

    const marks: Record<string, MarkStat> = {};
    for (const [k, v] of Object.entries(this.marks)) {
      marks[k] = { last: v.last, avg: v.count ? v.sum / v.count : 0, count: v.count };
    }

    const engines: EngineFlag[] = [
      { name: 'Frame pacing', active: fps > 0 },
      { name: 'Quality scaling', active: deviceTier > 0 },
      { name: 'Map command bus', active: mapCommandBus.isAttached() },
      { name: 'Encrypted tunnel', active: sec.connected },
      { name: 'Live tracking', active: live.gps.hasFix },
      { name: 'Wake lock', active: live.wakeLockActive },
    ];

    this.snapshot = {
      ts: Date.now(),
      fps,
      frameTime,
      droppedFrames,
      refreshRate,
      deviceTier,
      mapMode,
      gps: {
        accuracy: live.gps.accuracy,
        hasFix: live.gps.hasFix,
        stale: live.gps.stale,
        quality: live.gps.quality,
      },
      tunnel: {
        connected: sec.connected,
        registered: sec.registered,
        encrypted: sec.encrypted,
        cipher: sec.cipher,
      },
      network: { online: live.online, visible: live.visible },
      vitals,
      marks,
      engines,
    };

    eventBus.emit(TELEMETRY_TICK_EVENT, this.snapshot);
  }
}

export const telemetryBus = new TelemetryBus();
export default telemetryBus;
