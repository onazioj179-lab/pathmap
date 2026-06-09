/**
 * TelemetryHUD - live "what is the system doing right now" panel.
 *
 * Gated by controlState.hudVisible (toggled from the command palette). While
 * visible it starts the telemetryBus sampler and renders the live snapshot:
 * FPS sparkline, frame time, device tier, map mode, GPS, route latency, the
 * encrypted-tunnel state, network, web vitals and the active-engine list.
 *
 * Draggable, keyboard-movable, dismissible; position persists on-device. Honors
 * reduced motion (no sparkline animation) and announces via aria-live.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEngineState } from '../../hooks/useEngineState';
import { controlState, CONTROL_STATE_EVENT } from '../../services/controlState';
import { eventBus } from '../../services/eventBus';
import {
  telemetryBus,
  TELEMETRY_TICK_EVENT,
  TelemetrySnapshot,
} from '../../services/telemetryBus';
import { lepl } from '../../services/localEncryptedProfile';
import './TelemetryHUD.css';

const POS_KEY = 'telemetry_hud_pos';
const FPS_HISTORY = 40;

function Sparkline({ values, max }: { values: number[]; max: number }) {
  if (values.length < 2) return <svg className="hud-spark" aria-hidden="true" />;
  const w = 120;
  const h = 28;
  const step = w / (FPS_HISTORY - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(v, max) / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="hud-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export default function TelemetryHUD() {
  const { hudVisible } = useEngineState(CONTROL_STATE_EVENT, controlState.getSnapshot);
  const [snap, setSnap] = useState<TelemetrySnapshot | null>(null);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 80 });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Start/stop sampling with visibility so it costs nothing when closed.
  useEffect(() => {
    if (!hudVisible) {
      telemetryBus.stop();
      return;
    }
    telemetryBus.start(500);
    const off = eventBus.on<TelemetrySnapshot>(TELEMETRY_TICK_EVENT, s => {
      setSnap(s);
      setFpsHistory(prev => [...prev.slice(-(FPS_HISTORY - 1)), s.fps]);
    });
    return () => {
      off();
      telemetryBus.stop();
    };
  }, [hudVisible]);

  // Restore saved position.
  useEffect(() => {
    let alive = true;
    void lepl
      .load(POS_KEY)
      .then((p: { x?: number; y?: number } | null) => {
        if (alive && p && typeof p.x === 'number' && typeof p.y === 'number') {
          setPos({ x: p.x, y: p.y });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
  };
  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      void lepl.save(POS_KEY, pos).catch(() => {});
    }
  };

  // Keyboard move (arrow keys nudge the panel) for non-pointer users.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const d = 12;
    if (e.key === 'ArrowLeft') setPos(p => ({ ...p, x: p.x - d }));
    else if (e.key === 'ArrowRight') setPos(p => ({ ...p, x: p.x + d }));
    else if (e.key === 'ArrowUp') setPos(p => ({ ...p, y: p.y - d }));
    else if (e.key === 'ArrowDown') setPos(p => ({ ...p, y: p.y + d }));
    else return;
    e.preventDefault();
  };

  const copyDiagnostics = useCallback(() => {
    if (snap) void navigator.clipboard?.writeText(JSON.stringify(snap, null, 2)).catch(() => {});
  }, [snap]);

  if (!hudVisible) return null;

  const routeMark = snap?.marks.routeCalc;

  return (
    <section
      className="hud"
      style={{ left: pos.x, top: pos.y }}
      role="region"
      aria-label="System telemetry"
    >
      <header
        className="hud-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="toolbar"
        aria-label="Telemetry HUD - drag or use arrow keys to move"
      >
        <span className="hud-title">Flow tracking</span>
        <span className="hud-fps" aria-live="polite">
          {snap ? `${snap.fps} fps` : '--'}
        </span>
        <button
          type="button"
          className="hud-icon-btn"
          aria-label={collapsed ? 'Expand telemetry' : 'Collapse telemetry'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? '+' : '−'}
        </button>
        <button
          type="button"
          className="hud-icon-btn"
          aria-label="Close telemetry"
          onClick={() => controlState.toggleHud(false)}
        >
          {'×'}
        </button>
      </header>

      {!collapsed && (
        <div className="hud-body" aria-live="polite">
          <div className="hud-row hud-spark-row">
            <Sparkline values={fpsHistory} max={snap?.refreshRate || 120} />
            <span className="hud-sub">
              {snap ? `${snap.frameTime}ms / ${snap.droppedFrames} dropped` : ''}
            </span>
          </div>

          <Stat label="Device tier" value={snap ? `T${snap.deviceTier}` : '--'} />
          <Stat label="Map mode" value={snap?.mapMode ?? '--'} />
          <Stat
            label="GPS"
            value={
              snap?.gps.hasFix
                ? `${Math.round(snap.gps.accuracy ?? 0)}m · ${snap.gps.quality}${snap.gps.stale ? ' (stale)' : ''}`
                : 'no fix'
            }
            ok={snap?.gps.quality === 'good'}
            warn={!!snap?.gps.stale || snap?.gps.quality === 'poor'}
          />
          <Stat
            label="Route calc"
            value={routeMark ? `${Math.round(routeMark.last)}ms (avg ${Math.round(routeMark.avg)})` : '--'}
          />
          <Stat
            label="Tunnel"
            value={
              snap?.tunnel.connected
                ? `${snap.tunnel.encrypted ? 'encrypted' : 'open'}${snap.tunnel.registered ? ', auth' : ''}`
                : 'offline'
            }
            ok={!!snap?.tunnel.encrypted}
          />
          <Stat label="Cipher" value={snap?.tunnel.cipher ?? '--'} mono />
          <Stat
            label="Network"
            value={snap ? (snap.network.online ? 'online' : 'offline') : '--'}
            warn={snap ? !snap.network.online : false}
          />

          {snap && snap.vitals.length > 0 && (
            <div className="hud-vitals">
              {snap.vitals.map(v => (
                <span key={v.name} className={`hud-vital is-${v.rating}`}>
                  {v.name} {v.value}
                </span>
              ))}
            </div>
          )}

          <div className="hud-engines">
            {snap?.engines.map(e => (
              <span key={e.name} className={`hud-engine${e.active ? ' is-on' : ''}`}>
                <span className="hud-dot" aria-hidden="true" />
                {e.name}
              </span>
            ))}
          </div>

          <button type="button" className="hud-copy" onClick={copyDiagnostics}>
            Copy diagnostics
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  ok,
  warn,
  mono,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="hud-row">
      <span className="hud-label">{label}</span>
      <span className={`hud-value${ok ? ' is-ok' : ''}${warn ? ' is-warn' : ''}${mono ? ' is-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
