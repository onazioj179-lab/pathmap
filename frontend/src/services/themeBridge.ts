/**
 * V60 — Theme Bridge
 * Polls dynamicThemeEngine and applies palette to CSS variables on <html>.
 * This minimizes coupling and keeps runtime light.
 */

import { dynamicThemeEngine } from './dynamicThemeEngine';

let initialized = false;

export function initThemeBridge() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  const apply = () => {
    try {
      const s = dynamicThemeEngine.getState();
      const root = document.documentElement;
      if (s?.palette) {
        root.style.setProperty('--v60-bg', s.palette.bg);
        root.style.setProperty('--v60-fg', s.palette.fg);
        root.style.setProperty('--v60-panel', s.palette.panel);
        root.style.setProperty('--v60-accent', s.palette.accent);
        root.style.setProperty('--v60-line', 'rgba(255,255,255,0.12)');
        root.style.setProperty('--v60-muted', s.palette.muted ?? '#9ca3af');
      }
      if (s?.activeTheme === 'day') {
        document.body.classList.add('v60-day');
        document.body.classList.remove('v60-night');
      } else if (s?.activeTheme === 'night') {
        document.body.classList.add('v60-night');
        document.body.classList.remove('v60-day');
      }
      // Accessibility modes
      document.body.classList.toggle('v60-high-contrast', s?.accessibilityMode === 'high-contrast');
      document.body.classList.toggle('v60-large-text', s?.accessibilityMode === 'large-text');
      document.body.classList.toggle('v60-color-blind', s?.accessibilityMode === 'color-blind');
      document.body.classList.toggle('v60-reduced-motion', s?.accessibilityMode === 'reduced-motion');
    } catch {
      // noop
    }
  };

  // Force uniform dark mode unless user overrides later
  try { dynamicThemeEngine.setMode('night'); } catch {}

  apply();
  const id = window.setInterval(apply, 1000);
  // Store id on window for optional cleanup
  (window as any).__v60ThemeInterval = id;
}
