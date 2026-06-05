/*
 V77: Full Dark Mode Engine (FDME)
 - Applies global dark theme across UI, maps, Earth engine, AR, and 3D layers
 - Manages color system, state persistence, and dynamic toggles
 - Coordinates with V75/V76 engines for map/terrain dark variants
*/

export const DARK_PALETTE = {
  background_main: '#000000',
  surface_layer: '#0A0A0A',
  panel_layer: '#121212',
  border_tone: '#222222',
  icon_primary: '#FFFFFF',
  icon_secondary: '#AAAAAA',
  text_primary: '#FFFFFF',
  text_secondary: '#CCCCCC',
  accent_color: '#5A8FFF'
};

let darkModeActive = true;

function enforceDarkPreference() {
  darkModeActive = true;
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem('pf_dark_mode', 'true'); } catch {}
}

export const fullDarkModeEngine = {
  init() {
    if (typeof document === 'undefined') return;
    enforceDarkPreference();
    this.apply();
  },

  toggle() {
    if (typeof document === 'undefined') return;
    enforceDarkPreference();
    this.apply();
  },

  setDark(dark: boolean) {
    if (typeof document === 'undefined') return;
    if (!dark) {
      // Dark mode is permanently enforced; ignore light requests but overwrite stale storage.
      enforceDarkPreference();
    } else {
      darkModeActive = true;
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem('pf_dark_mode', 'true'); } catch {}
      }
    }
    this.apply();
  },

  isDark() {
    return darkModeActive;
  },

  apply() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    enforceDarkPreference();
    root.classList.add('pf-dark');
    root.style.setProperty('color-scheme', 'dark');
    root.style.setProperty('--pf-bg-main', DARK_PALETTE.background_main);
    root.style.setProperty('--pf-surface', DARK_PALETTE.surface_layer);
    root.style.setProperty('--pf-panel', DARK_PALETTE.panel_layer);
    root.style.setProperty('--pf-border', DARK_PALETTE.border_tone);
    root.style.setProperty('--pf-icon-1', DARK_PALETTE.icon_primary);
    root.style.setProperty('--pf-icon-2', DARK_PALETTE.icon_secondary);
    root.style.setProperty('--pf-text-1', DARK_PALETTE.text_primary);
    root.style.setProperty('--pf-text-2', DARK_PALETTE.text_secondary);
    root.style.setProperty('--pf-accent', DARK_PALETTE.accent_color);

    const body = document.body;
    if (body) {
      body.style.backgroundColor = DARK_PALETTE.background_main;
      body.style.color = DARK_PALETTE.text_primary;
    }
  },

  // Map-specific helpers
  getDarkSatelliteUrl(): string | null {
    // Return dark satellite tile URL if available; null = use existing
    // For now, we'll darken existing tiles via paint properties in MapView3D
    return null;
  },

  getDarkTerrainAdjustments() {
    return darkModeActive
      ? { gamma: 0.85, contrast: 0.9, brightness: 0.88 }
      : { gamma: 1.0, contrast: 1.0, brightness: 1.0 };
  },

  getAROverlayBrightness() {
    // In dark mode, AR overlays need to be brighter for visibility
    return darkModeActive ? 1.3 : 1.0;
  }
};
