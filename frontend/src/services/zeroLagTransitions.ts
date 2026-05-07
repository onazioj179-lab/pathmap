/**
 * PATHFINDER V74 — Zero-Lag Transition Framework (ZTF)
 *
 * Transform-only, GPU-accelerated UI transitions that precompute states
 * to avoid layout thrash and keep components mounted during animations.
 */

import { ultraSmoothAnimationEngine } from './ultraSmoothAnimationEngine';

export interface TransitionOptions {
  durationMs?: number;
  easing?: (t: number) => number;
}

export function openPanel(el: HTMLElement, opts: TransitionOptions = {}) {
  if (!el) return;
  el.style.willChange = 'transform, opacity';
  el.style.transformOrigin = 'top center';
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px) scale(0.98)';
  const cancel = ultraSmoothAnimationEngine.schedule({
    durationMs: opts.durationMs,
    easing: opts.easing,
    onUpdate: (t) => {
      el.style.opacity = String(Math.max(0, Math.min(1, t)));
      const y = (1 - t) * 8;
      const s = 0.98 + 0.02 * t;
      el.style.transform = `translateY(${y}px) scale(${s})`;
    },
    onComplete: () => {
      el.style.willChange = 'auto';
    }
  });
  return cancel;
}

export function closePanel(el: HTMLElement, opts: TransitionOptions = {}) {
  if (!el) return;
  el.style.willChange = 'transform, opacity';
  el.style.transformOrigin = 'top center';
  const cancel = ultraSmoothAnimationEngine.schedule({
    durationMs: opts.durationMs,
    easing: opts.easing,
    onUpdate: (t) => {
      const r = 1 - t;
      el.style.opacity = String(Math.max(0, Math.min(1, r)));
      const y = r * 8;
      const s = 0.98 + 0.02 * (1 - r);
      el.style.transform = `translateY(${y}px) scale(${s})`;
    },
    onComplete: () => {
      el.style.willChange = 'auto';
      el.style.opacity = '0';
    }
  });
  return cancel;
}
