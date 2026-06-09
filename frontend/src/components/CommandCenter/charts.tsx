/**
 * charts.tsx - tiny hand-rolled SVG chart primitives for the Command Center.
 * No chart library: pure SVG so it stays dependency-free and themes via tokens.
 * All take plain number arrays and a viewBox of 100x40 unless noted.
 */
import { useId } from 'react';

const W = 100;
const H = 40;

function norm(values: number[], h = H, pad = 2): number[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map(v => h - pad - ((v - min) / span) * (h - pad * 2));
}

/** Filled area line - telemetry over time. */
export function AreaSpark({ values, color = 'var(--cc-accent)' }: { values: number[]; color?: string }) {
  const gid = useId();
  if (values.length < 2) return <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const ys = norm(values);
  const step = W / (values.length - 1);
  const line = ys.map((y, i) => `${(i * step).toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#a${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Vertical bars - counts. */
export function Bars({ values, color = 'var(--cc-accent)' }: { values: number[]; color?: string }) {
  if (!values.length) return <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const max = Math.max(...values) || 1;
  const bw = (W / values.length) * 0.62;
  const gap = (W / values.length) * 0.38;
  return (
    <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => {
        const h = (v / max) * (H - 4);
        return (
          <rect
            key={i}
            x={i * (bw + gap) + gap / 2}
            y={H - h}
            width={bw}
            height={Math.max(0.5, h)}
            fill={color}
            opacity={0.55 + 0.45 * (v / max)}
          />
        );
      })}
    </svg>
  );
}

/** Multiple faint flowing lines - the ambient bottom chart. */
export function FlowLines({ series, color = 'var(--cc-accent)' }: { series: number[][]; color?: string }) {
  return (
    <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {series.map((vals, s) => {
        if (vals.length < 2) return null;
        const ys = norm(vals);
        const step = W / (vals.length - 1);
        const line = ys.map((y, i) => `${(i * step).toFixed(1)},${y.toFixed(1)}`).join(' ');
        return (
          <polyline
            key={s}
            points={line}
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
            opacity={0.2 + (s / series.length) * 0.5}
          />
        );
      })}
    </svg>
  );
}

/** Circular gauge ring - a single 0..1 metric. */
export function RingGauge({
  value,
  label,
  color = 'var(--cc-accent)',
}: {
  value: number;
  label?: string;
  color?: string;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg className="cc-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--cc-grid)" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${(c * v).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 22 22)"
      />
      {label && (
        <text x="22" y="25" textAnchor="middle" className="cc-ring-label">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Calendar-style dot grid (activity by day) - 7 columns. */
export function CalendarDots({ weeks }: { weeks: number[][] }) {
  return (
    <div className="cc-cal" role="img" aria-label="Activity calendar">
      {weeks.flat().map((v, i) => (
        <span key={i} className="cc-cal-dot" style={{ opacity: 0.15 + 0.85 * v, transform: `scale(${0.5 + v * 0.5})` }} />
      ))}
    </div>
  );
}
