/**
 * CommandCenter - a DataV-style operations dashboard that overlays the globe.
 *
 * Dark HUD: a central wireframe globe (the map in globe mode) framed by left and
 * right rails of corner-bracket panels showing PathMap's own live data -
 * telemetry, tracking targets, alerts, and the active target. Original design in
 * the "big screen" data-viz language; all content is PathMap's, charts are the
 * hand-rolled SVG primitives in charts.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useEngineState } from '../../hooks/useEngineState';
import { controlState, CONTROL_STATE_EVENT } from '../../services/controlState';
import { eventBus } from '../../services/eventBus';
import { telemetryBus, TELEMETRY_TICK_EVENT, TelemetrySnapshot } from '../../services/telemetryBus';
import { liveStatus } from '../../services/liveStatus';
import { mapCommandBus } from '../../services/mapCommandBus';
import { AreaSpark, Bars, FlowLines, RingGauge, CalendarDots } from './charts';
import './CommandCenter.css';

export interface CCTarget {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
}
export interface CCRoute {
  distance: number;
  eta: string;
  safety?: number;
  algorithm?: string;
}

interface CommandCenterProps {
  targets: CCTarget[];
  activeTarget: CCTarget | null;
  route: CCRoute | null;
}

const HIST = 28;
function pushCap(arr: number[], v: number): number[] {
  return [...arr.slice(-(HIST - 1)), v];
}

// A deterministic-ish ambient series so the flow/calendar panels look alive even
// before history accumulates (varies by index, never random).
const seed = (n: number, base: number, amp: number) =>
  Array.from({ length: n }, (_, i) => base + Math.sin(i * 0.6) * amp + Math.cos(i * 0.27) * amp * 0.6);

function Panel({
  title,
  tag,
  children,
  className = '',
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`cc-panel ${className}`}>
      <span className="cc-corner tl" />
      <span className="cc-corner tr" />
      <span className="cc-corner bl" />
      <span className="cc-corner br" />
      <header className="cc-panel-head">
        <span className="cc-panel-title">{title}</span>
        {tag && <span className="cc-panel-tag">{tag}</span>}
      </header>
      <div className="cc-panel-body">{children}</div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'warn' | 'ok' }) {
  return (
    <div className="cc-stat">
      <span className="cc-stat-value" data-accent={accent}>
        {value}
      </span>
      <span className="cc-stat-label">{label}</span>
    </div>
  );
}

export default function CommandCenter({ targets, activeTarget, route }: CommandCenterProps) {
  const { commandCenter } = useEngineState(CONTROL_STATE_EVENT, controlState.getSnapshot);
  const [snap, setSnap] = useState<TelemetrySnapshot | null>(null);
  const [fpsHist, setFps] = useState<number[]>(() => seed(HIST, 55, 6));
  const [gpsHist, setGps] = useState<number[]>(() => seed(HIST, 20, 8).map(v => Math.abs(v)));
  const enteredRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // gsap staggered entrance for a smooth power-up of the grid.
  useEffect(() => {
    if (!commandCenter || !rootRef.current) return;
    if (document.documentElement.dataset.reducedMotion === 'true') return;
    const ctx = gsap.context(() => {
      gsap.from('.cc-top', { y: -16, opacity: 0, duration: 0.4, ease: 'power2.out' });
      gsap.from('.cc-panel', { y: 18, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' });
      gsap.from('.cc-bottom', { y: 20, opacity: 0, duration: 0.45, ease: 'power2.out', delay: 0.1 });
    }, rootRef);
    return () => ctx.revert();
  }, [commandCenter]);

  // Toggle the root class that hides the map-app chrome behind the grid.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('cc-active', commandCenter);
    return () => root.classList.remove('cc-active');
  }, [commandCenter]);

  // Drive the dashboard: globe mode + telemetry sampling while active.
  useEffect(() => {
    if (!commandCenter) {
      enteredRef.current = false;
      return;
    }
    telemetryBus.start(800);
    if (!enteredRef.current) {
      enteredRef.current = true;
      void mapCommandBus.setMode('globe');
    }
    const off = eventBus.on<TelemetrySnapshot>(TELEMETRY_TICK_EVENT, s => {
      setSnap(s);
      setFps(h => pushCap(h, s.fps || 0));
      setGps(h => pushCap(h, s.gps.accuracy ?? 0));
    });
    return () => {
      off();
    };
  }, [commandCenter]);

  if (!commandCenter) return null;

  const live = liveStatus.getLiveStatus();
  const alerts: Array<{ k: string; t: string; lvl: 'warn' | 'crit' | 'ok' }> = [];
  if (!live.online) alerts.push({ k: 'net', t: 'Network offline', lvl: 'crit' });
  if (snap && !snap.tunnel.encrypted) alerts.push({ k: 'tun', t: 'Tunnel not encrypted', lvl: 'warn' });
  if (live.gps.stale) alerts.push({ k: 'gps', t: 'GPS signal stale', lvl: 'warn' });
  if (live.gps.quality === 'poor') alerts.push({ k: 'acc', t: 'Low GPS accuracy', lvl: 'warn' });
  if (snap && snap.droppedFrames > 4) alerts.push({ k: 'fps', t: `Frame drops: ${snap.droppedFrames}`, lvl: 'warn' });
  if (!alerts.length) alerts.push({ k: 'ok', t: 'All systems nominal', lvl: 'ok' });

  const targetBars = targets.length
    ? targets.slice(0, 12).map((_, i) => 1 + ((i * 7) % 9))
    : seed(8, 5, 3).map(v => Math.abs(v));

  const flow = [fpsHist, gpsHist, seed(HIST, 30, 10).map(Math.abs)];
  const cal = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const idx = w * 7 + d;
      return Math.min(1, Math.max(0, 0.35 + Math.sin(idx * 0.9) * 0.4 + (idx % 4 === 0 ? 0.3 : 0)));
    })
  );

  const tier = snap?.deviceTier ?? 0;
  const signal =
    live.gps.quality === 'good' ? 0.95 : live.gps.quality === 'fair' ? 0.6 : live.gps.hasFix ? 0.3 : 0.05;

  return (
    <div className="cc" role="region" aria-label="Command Center" ref={rootRef}>
      {/* Top bar */}
      <div className="cc-top">
        <div className="cc-brand">
          <span className="cc-mark" aria-hidden="true" />
          <span className="cc-brand-name">PATHMAP</span>
          <span className="cc-brand-sub">OPERATIONS GRID</span>
        </div>
        <div className="cc-top-ticker" aria-hidden="true">
          <span>NODE 0xPM-{(snap?.ts ?? 0).toString().slice(-5)}</span>
          <span>FPS {snap?.fps ?? '--'}</span>
          <span>TIER T{tier}</span>
          <span>TARGETS {targets.length}</span>
          <span className={live.online ? 'on' : 'off'}>{live.online ? 'LINK OK' : 'LINK LOST'}</span>
        </div>
        <button
          type="button"
          className="cc-exit"
          onClick={() => controlState.toggleFeedback(true)}
        >
          Feedback
        </button>
        <button
          type="button"
          className="cc-exit"
          onClick={() => {
            controlState.toggleCommandCenter(false);
            void mapCommandBus.setMode('2d');
          }}
        >
          Exit grid
        </button>
      </div>

      {/* Left rail */}
      <div className="cc-rail cc-left">
        <Panel title="Operations Summary" tag="LIVE">
          <div className="cc-stat-row">
            <Stat label="Active targets" value={String(targets.length)} />
            <Stat
              label="Tracking"
              value={activeTarget ? 'ON' : 'IDLE'}
              accent={activeTarget ? 'ok' : undefined}
            />
            <Stat label="Device tier" value={`T${tier}`} />
          </div>
          <div className="cc-chart-wrap">
            <Bars values={targetBars} />
          </div>
        </Panel>

        <Panel title="Signal Flow" tag="FPS / GPS">
          <div className="cc-chart-wrap tall">
            <AreaSpark values={fpsHist} />
          </div>
          <div className="cc-legend">
            <span>frame rate</span>
            <span className="mono">{snap?.fps ?? '--'} fps</span>
          </div>
        </Panel>

        <Panel title="Tracked Targets" tag={`${targets.length}`}>
          <ul className="cc-list">
            {targets.length === 0 && <li className="cc-empty">No targets yet</li>}
            {targets.slice(0, 6).map(t => (
              <li key={t.id} className="cc-list-row">
                <span className="cc-dot" data-type={t.type} />
                <span className="cc-list-name">{t.name}</span>
                <span className="cc-list-coord mono">
                  {t.lat.toFixed(3)}, {t.lng.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Center: globe shows through (pointer events pass to the map). */}
      <div className="cc-center" aria-hidden="true">
        <div className="cc-reticle" />
        {route && (
          <div className="cc-route-readout">
            <span className="mono">{(route.distance / 1000).toFixed(2)} km</span>
            <span>{route.eta}</span>
            <span className="mono">{route.algorithm ?? 'route'}</span>
          </div>
        )}
      </div>

      {/* Right rail */}
      <div className="cc-rail cc-right">
        <Panel title="Early Warning" tag="ALERTS">
          <ul className="cc-alerts">
            {alerts.map(a => (
              <li key={a.k} className={`cc-alert lvl-${a.lvl}`}>
                <span className="cc-alert-dot" />
                {a.t}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Active Target" tag={activeTarget ? 'LOCKED' : '---'}>
          <div className="cc-profile">
            <RingGauge value={signal} label={`${Math.round(signal * 100)}`} />
            <div className="cc-profile-info">
              <span className="cc-profile-name">{activeTarget?.name ?? 'No lock'}</span>
              <span className="cc-profile-coord mono">
                {activeTarget ? `${activeTarget.lat.toFixed(4)}, ${activeTarget.lng.toFixed(4)}` : '--'}
              </span>
              <span className="cc-profile-sub">
                ACC {live.gps.accuracy != null ? `${Math.round(live.gps.accuracy)}m` : '--'} ·{' '}
                {live.gps.quality.toUpperCase()}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Telemetry" tag="STREAM">
          <div className="cc-chart-wrap">
            <AreaSpark values={gpsHist} color="var(--cc-warn)" />
          </div>
          <div className="cc-stat-row">
            <Stat label="Frame ms" value={snap ? snap.frameTime.toFixed(1) : '--'} />
            <Stat
              label="Dropped"
              value={snap ? String(snap.droppedFrames) : '--'}
              accent={snap && snap.droppedFrames > 4 ? 'warn' : undefined}
            />
            <Stat label="Mode" value={(snap?.mapMode ?? '--').toString().slice(0, 4)} />
          </div>
          <div className="cc-cal-wrap">
            <span className="cc-cal-title">ACTIVITY</span>
            <CalendarDots weeks={cal} />
          </div>
        </Panel>
      </div>

      {/* Bottom ticker */}
      <div className="cc-bottom">
        <div className="cc-flow">
          <FlowLines series={flow} />
        </div>
        <div className="cc-bottom-stats mono" aria-hidden="true">
          <span>ENC {snap?.tunnel.cipher ?? 'AES-256-GCM'}</span>
          <span>NET {live.online ? 'ONLINE' : 'OFFLINE'}</span>
          <span>VIS {live.visible ? 'FG' : 'BG'}</span>
          <span>WAKELOCK {live.wakeLockActive ? 'ON' : 'OFF'}</span>
        </div>
      </div>
    </div>
  );
}
