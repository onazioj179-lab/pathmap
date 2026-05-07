/**
 * PATHFINDER V73 — UI SCALE ENGINE (FRA-UI + DIS + CVE)
 *
 * Computes responsive UI scale and icon sizes across devices and densities.
 * Exposes CSS variables for layout and icon sizing.
 */

type UIMode = '2D' | '3D' | 'AR';

class UIScaleEngine {
  private mode: UIMode = '3D';
  private raf: number | null = null;

  start() {
    const apply = () => this.applyScale();
    apply();
    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply, { passive: true });
    document.addEventListener('visibilitychange', apply, { passive: true } as any);
  }

  stop() {
    window.removeEventListener('resize', this.applyScale as any);
    window.removeEventListener('orientationchange', this.applyScale as any);
    document.removeEventListener('visibilitychange', this.applyScale as any);
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  setMode(mode: UIMode) {
    this.mode = mode;
    this.applyScale();
  }

  private applyScale() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Breakpoint-based base scale
      let uiScale = 1.0;
      if (w < 360) uiScale = 0.92; // xs
      else if (w < 420) uiScale = 1.0; // sm
      else if (w < 600) uiScale = 1.05; // md
      else if (w < 900) uiScale = 1.10; // lg
      else uiScale = 1.15; // xl

      // Slight adjustment for landscape aspect ratios
      const aspect = w / Math.max(h, 1);
      if (aspect > 1.6) uiScale *= 0.98;

      // Mode bias
      const modeFactor = this.mode === 'AR' ? 1.06 : this.mode === '2D' ? 1.0 : 1.03;
      uiScale *= modeFactor;

      // Density factor (cap to avoid extremes)
      const densityFactor = Math.min(Math.max(dpr / 2, 0.8), 1.4);

      // Compute icon sizes (px)
      const baseSm = 18;
      const baseMd = 20;
      const baseLg = 24;
      const iconSm = Math.round(baseSm * densityFactor * uiScale);
      const iconMd = Math.round(baseMd * densityFactor * uiScale);
      const iconLg = Math.round(baseLg * densityFactor * uiScale);

      // Control/button heights
      const baseBtn = 48;
      const btnH = Math.round(baseBtn * Math.min(uiScale, 1.12));

      // Marker sizes (map pins)
      const baseMarkerW = 34;
      const baseMarkerH = 46;
      const markerW = Math.round(baseMarkerW * Math.min(uiScale * 1.02, 1.25));
      const markerH = Math.round(baseMarkerH * Math.min(uiScale * 1.02, 1.25));

      const root = document.documentElement;
      root.style.setProperty('--v73-ui-scale', uiScale.toFixed(3));
      root.style.setProperty('--v73-density', densityFactor.toFixed(3));
      root.style.setProperty('--v73-icon-sm', `${iconSm}px`);
      root.style.setProperty('--v73-icon-base', `${iconMd}px`);
      root.style.setProperty('--v73-icon-lg', `${iconLg}px`);
      root.style.setProperty('--v73-button-h', `${btnH}px`);
      root.style.setProperty('--v73-marker-w', `${markerW}px`);
      root.style.setProperty('--v73-marker-h', `${markerH}px`);
    });
  }
}

export const uiScaleEngine = new UIScaleEngine();

// No global exposure in production
