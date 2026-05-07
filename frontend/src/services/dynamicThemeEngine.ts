/**
 * PATHFINDER V60 — DYNAMIC THEME ENGINE (DTE)
 * 
 * Complete theming system that adapts intelligently to:
 *   - Time of day (day/night)
 *   - Weather conditions
 *   - Ambient brightness
 *   - Accessibility needs
 */

export type ThemeMode = 'day' | 'night' | 'auto';
export type WeatherCondition = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'clear';
export type AccessibilityMode = 'none' | 'high-contrast' | 'color-blind' | 'large-text' | 'reduced-motion';

interface ThemePalette {
  bg: string;
  fg: string;
  panel: string;
  accent: string;
  line: string;
  muted: string;
  nav: string;
  navActive: string;
  shadowSoft: string;
  shadowStrong: string;
}

interface ThemeState {
  mode: ThemeMode;
  activeTheme: 'day' | 'night';
  weather: WeatherCondition;
  ambientBrightness: number; // 0-1
  accessibilityMode: AccessibilityMode;
  palette: ThemePalette;
}

class DynamicThemeEngine {
  private static instance: DynamicThemeEngine;
  private state: ThemeState;
  private brightnessCheckInterval: number | null = null;
  private transitionDuration: number = 160; // ms

  // Theme palettes
  private readonly dayPalette: ThemePalette = {
    bg: '#f8f9fa',
    fg: '#1a1a1a',
    panel: 'rgba(255, 255, 255, 0.95)',
    accent: '#10b981',
    line: 'rgba(0, 0, 0, 0.12)',
    muted: '#6b7280',
    nav: '#4b5563',
    navActive: '#10b981',
    shadowSoft: 'rgba(0, 0, 0, 0.08)',
    shadowStrong: 'rgba(0, 0, 0, 0.15)',
  };

  private readonly nightPalette: ThemePalette = {
    bg: '#0a0a0a',
    fg: '#e8e8e8',
    panel: 'rgba(18, 18, 18, 0.92)',
    accent: '#10b981',
    line: 'rgba(255, 255, 255, 0.12)',
    muted: '#9ca3af',
    nav: '#a0a0a0',
    navActive: '#10b981',
    shadowSoft: 'rgba(0, 0, 0, 0.25)',
    shadowStrong: 'rgba(0, 0, 0, 0.4)',
  };

  private constructor() {
    this.state = {
      mode: 'auto',
      activeTheme: this.detectInitialTheme(),
      weather: 'clear',
      ambientBrightness: 0.5,
      accessibilityMode: 'none',
      palette: this.nightPalette,
    };

    this.loadUserPreferences();
    this.applyTheme();
    this.startBrightnessMonitoring();
  }

  public static getInstance(): DynamicThemeEngine {
    if (!DynamicThemeEngine.instance) {
      DynamicThemeEngine.instance = new DynamicThemeEngine();
    }
    return DynamicThemeEngine.instance;
  }

  /**
   * Detect initial theme based on time of day
   */
  private detectInitialTheme(): 'day' | 'night' {
    const hour = new Date().getHours();
    // Day: 6am - 6pm, Night: 6pm - 6am
    return hour >= 6 && hour < 18 ? 'day' : 'night';
  }

  /**
   * Load user preferences from localStorage
   */
  private loadUserPreferences(): void {
    try {
      const savedMode = localStorage.getItem('v60-theme-mode');
      if (savedMode && (savedMode === 'day' || savedMode === 'night' || savedMode === 'auto')) {
        this.state.mode = savedMode as ThemeMode;
      }

      const savedAccessibility = localStorage.getItem('v60-accessibility-mode');
      if (savedAccessibility) {
        this.state.accessibilityMode = savedAccessibility as AccessibilityMode;
      }
    } catch (e) {
      console.debug('[DTE] Failed to load preferences:', e);
    }
  }

  /**
   * Set theme mode (day/night/auto)
   */
  public setMode(mode: ThemeMode): void {
    this.state.mode = mode;
    localStorage.setItem('v60-theme-mode', mode);

    if (mode === 'auto') {
      this.state.activeTheme = this.detectInitialTheme();
    } else {
      this.state.activeTheme = mode;
    }

    this.applyTheme();
  }

  /**
   * Set weather condition
   */
  public setWeather(weather: WeatherCondition): void {
    this.state.weather = weather;
    this.applyTheme();
  }

  /**
   * Set ambient brightness (0-1)
   */
  public setAmbientBrightness(brightness: number): void {
    this.state.ambientBrightness = Math.max(0, Math.min(1, brightness));
    this.applyTheme();
  }

  /**
   * Set accessibility mode
   */
  public setAccessibilityMode(mode: AccessibilityMode): void {
    this.state.accessibilityMode = mode;
    localStorage.setItem('v60-accessibility-mode', mode);
    this.applyTheme();
  }

  /**
   * Apply current theme to document
   */
  private applyTheme(): void {
    // Select base palette
    const basePalette = this.state.activeTheme === 'day' ? this.dayPalette : this.nightPalette;
    
    // Apply weather adjustments
    const weatherAdjusted = this.applyWeatherAdjustments(basePalette);
    
    // Apply brightness scaling
    const brightnessAdjusted = this.applyBrightnessScaling(weatherAdjusted);
    
    // Apply accessibility adjustments
    const finalPalette = this.applyAccessibilityAdjustments(brightnessAdjusted);
    
    this.state.palette = finalPalette;

    // Apply to CSS variables
    const root = document.documentElement;
    root.style.setProperty('--v60-bg', finalPalette.bg);
    root.style.setProperty('--v60-fg', finalPalette.fg);
    root.style.setProperty('--v60-panel', finalPalette.panel);
    root.style.setProperty('--v60-accent', finalPalette.accent);
    root.style.setProperty('--v60-line', finalPalette.line);
    root.style.setProperty('--v60-muted', finalPalette.muted);
    root.style.setProperty('--v60-nav', finalPalette.nav);
    root.style.setProperty('--v60-nav-active', finalPalette.navActive);
    root.style.setProperty('--v60-shadow-soft', finalPalette.shadowSoft);
    root.style.setProperty('--v60-shadow-strong', finalPalette.shadowStrong);

    // Set transition duration
    root.style.setProperty('--v60-theme-transition', `${this.transitionDuration}ms`);

    // Apply theme class to body
    document.body.classList.remove('v60-day', 'v60-night');
    document.body.classList.add(`v60-${this.state.activeTheme}`);

    // Apply accessibility classes
    document.body.classList.remove('v60-high-contrast', 'v60-color-blind', 'v60-large-text', 'v60-reduced-motion');
    if (this.state.accessibilityMode !== 'none') {
      document.body.classList.add(`v60-${this.state.accessibilityMode}`);
    }

    // Apply weather class
    document.body.classList.remove('v60-weather-sunny', 'v60-weather-cloudy', 'v60-weather-rain', 'v60-weather-snow', 'v60-weather-fog');
    document.body.classList.add(`v60-weather-${this.state.weather}`);
  }

  /**
   * Apply weather-based color adjustments
   */
  private applyWeatherAdjustments(palette: ThemePalette): ThemePalette {
    const adjusted = { ...palette };

    switch (this.state.weather) {
      case 'sunny':
        // Increase vibrancy slightly
        adjusted.accent = this.adjustColor(palette.accent, 1.05);
        break;

      case 'cloudy':
        // Desaturate slightly
        adjusted.accent = this.adjustColor(palette.accent, 0.95);
        adjusted.muted = this.adjustColor(palette.muted, 0.98);
        break;

      case 'rain':
        // Cooler tones
        adjusted.bg = this.shiftHue(palette.bg, -5);
        adjusted.panel = this.shiftHue(palette.panel, -5);
        break;

      case 'snow':
        // Brighten foreground/panel
        adjusted.fg = this.adjustColor(palette.fg, 1.05);
        adjusted.panel = this.adjustColor(palette.panel, 1.02);
        break;

      case 'fog':
        // Subtle haze effect (handled via overlay in CSS)
        adjusted.shadowSoft = this.adjustColor(palette.shadowSoft, 1.2);
        break;
    }

    return adjusted;
  }

  /**
   * Apply ambient brightness scaling
   */
  private applyBrightnessScaling(palette: ThemePalette): ThemePalette {
    const adjusted = { ...palette };
    const brightness = this.state.ambientBrightness;

    if (brightness > 0.7) {
      // High ambient light - increase contrast
      adjusted.fg = this.adjustColor(palette.fg, 1.1);
      adjusted.shadowStrong = this.adjustColor(palette.shadowStrong, 1.15);
    } else if (brightness < 0.3) {
      // Low ambient light - reduce glare
      adjusted.bg = this.adjustColor(palette.bg, 0.95);
      adjusted.panel = this.adjustColor(palette.panel, 0.97);
    }

    return adjusted;
  }

  /**
   * Apply accessibility mode adjustments
   */
  private applyAccessibilityAdjustments(palette: ThemePalette): ThemePalette {
    const adjusted = { ...palette };

    switch (this.state.accessibilityMode) {
      case 'high-contrast':
        // Reinforce contrast
        adjusted.fg = this.state.activeTheme === 'day' ? '#000000' : '#ffffff';
        adjusted.bg = this.state.activeTheme === 'day' ? '#ffffff' : '#000000';
        adjusted.line = this.state.activeTheme === 'day' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
        break;

      case 'color-blind':
        // Blue/orange palette instead of green
        adjusted.accent = '#3b82f6'; // Blue
        adjusted.navActive = '#3b82f6';
        break;

      case 'large-text':
        // Handled via CSS font scaling
        break;

      case 'reduced-motion':
        // Disable transitions
        this.transitionDuration = 0;
        break;
    }

    return adjusted;
  }

  /**
   * Adjust color brightness
   */
  private adjustColor(color: string, factor: number): string {
    // Simple brightness adjustment (works for hex and rgba)
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (match) {
        const r = Math.min(255, Math.floor(parseInt(match[1]) * factor));
        const g = Math.min(255, Math.floor(parseInt(match[2]) * factor));
        const b = Math.min(255, Math.floor(parseInt(match[3]) * factor));
        return `rgba(${r}, ${g}, ${b}, ${match[4]})`;
      }
    } else if (color.startsWith('#')) {
      const r = Math.min(255, Math.floor(parseInt(color.slice(1, 3), 16) * factor));
      const g = Math.min(255, Math.floor(parseInt(color.slice(3, 5), 16) * factor));
      const b = Math.min(255, Math.floor(parseInt(color.slice(5, 7), 16) * factor));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return color;
  }

  /**
   * Shift color hue
   */
  private shiftHue(color: string, degrees: number): string {
    // Simplified hue shift (full implementation would use HSL conversion)
    return color; // Placeholder - keep original for now
  }

  /**
   * Start ambient brightness monitoring
   */
  private startBrightnessMonitoring(): void {
    // Check for Ambient Light Sensor API support
    if ('AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor();
        sensor.addEventListener('reading', () => {
          // Convert lux to 0-1 brightness scale
          const lux = sensor.illuminance;
          const brightness = Math.min(1, lux / 1000);
          this.setAmbientBrightness(brightness);
        });
        sensor.start();
      } catch (e) {
        console.debug('[DTE] Ambient light sensor not available:', e);
      }
    }

    // Fallback: periodic time-based theme update
    this.brightnessCheckInterval = window.setInterval(() => {
      if (this.state.mode === 'auto') {
        const newTheme = this.detectInitialTheme();
        if (newTheme !== this.state.activeTheme) {
          this.state.activeTheme = newTheme;
          this.applyTheme();
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get current theme state
   */
  public getState(): Readonly<ThemeState> {
    return { ...this.state };
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.brightnessCheckInterval) {
      clearInterval(this.brightnessCheckInterval);
    }
  }
}

// =====================================================================
// SINGLETON INSTANCE
// =====================================================================

export const dynamicThemeEngine = DynamicThemeEngine.getInstance();
// Production: no global debug exposure (HEPS)
