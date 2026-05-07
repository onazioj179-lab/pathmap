/**
 * PATHFINDER V56 — CINEMATIC LIGHTING ENGINE
 * 
 * Real-time sun/sky simulation with dynamic shadows and atmospheric haze.
 * Updates lighting every 30 seconds with smooth transitions.
 */

export interface LightConfig {
  sunAzimuth: number;      // 0-360 degrees
  sunElevation: number;    // 0-90 degrees
  colorTemperature: number; // Kelvin (2000-10000)
  intensity: number;       // 0-1
  shadowIntensity: number; // 0-1
  hazeOpacity: number;     // 0-1
}

export interface AtmosphericConfig {
  fogDensity: number;      // 0-1
  hazeColor: string;       // RGB hex
  horizonBlend: number;    // 0-1
  depthFade: number;       // 0-1
}

export class CinematicLightingEngine {
  private lastUpdate: number = 0;
  private updateInterval = 30000; // 30 seconds
  private currentConfig: LightConfig;
  private targetConfig: LightConfig;
  private transitionProgress = 1;

  constructor() {
    this.currentConfig = this.calculateLightConfig();
    this.targetConfig = { ...this.currentConfig };
  }

  /**
   * Calculate sun position based on current time and location
   */
  calculateLightConfig(lat: number = 40.7128, lon: number = -74.0060): LightConfig {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;

    // Simplified sun position (real impl would use solar calculation library)
    const dayProgress = hour / 24;
    const sunElevation = Math.max(0, Math.sin((dayProgress - 0.25) * Math.PI * 2) * 90);
    const sunAzimuth = (dayProgress * 360) % 360;

    // Color temperature follows sun elevation
    let colorTemperature = 5500; // noon
    if (sunElevation < 10) {
      colorTemperature = 2500; // golden hour / dusk
    } else if (sunElevation < 30) {
      colorTemperature = 3500; // morning/evening
    }

    // Intensity and shadows based on sun elevation
    const intensity = Math.max(0.15, Math.min(1, sunElevation / 60));
    const shadowIntensity = sunElevation > 5 ? Math.min(0.8, sunElevation / 70) : 0;

    // Atmospheric haze increases at low sun angles
    const hazeOpacity = sunElevation < 20 ? 0.3 + (20 - sunElevation) / 60 : 0.15;

    return {
      sunAzimuth,
      sunElevation,
      colorTemperature,
      intensity,
      shadowIntensity,
      hazeOpacity,
    };
  }

  /**
   * Get atmospheric settings based on lighting
   */
  getAtmosphericConfig(): AtmosphericConfig {
    const { sunElevation, colorTemperature, hazeOpacity } = this.currentConfig;

    // Fog density increases at dusk/dawn
    const fogDensity = sunElevation < 15 ? 0.25 : 0.05;

    // Haze color shifts with color temperature
    let hazeColor = '#1a1a2e'; // night
    if (colorTemperature > 4000) {
      hazeColor = '#2a2a3a'; // day
    } else if (colorTemperature > 3000) {
      hazeColor = '#3a2a1a'; // golden hour
    }

    const horizonBlend = sunElevation < 30 ? 0.15 : 0.05;
    const depthFade = 0.6 + (hazeOpacity * 0.4);

    return {
      fogDensity,
      hazeColor,
      horizonBlend,
      depthFade,
    };
  }

  /**
   * Update lighting if enough time has passed
   */
  update(deltaTime: number, lat?: number, lon?: number): boolean {
    this.lastUpdate += deltaTime;

    if (this.lastUpdate >= this.updateInterval) {
      this.lastUpdate = 0;
      this.targetConfig = this.calculateLightConfig(lat, lon);
      this.transitionProgress = 0;
      return true;
    }

    // Smooth transition between configs
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + deltaTime / 2000);
      this.interpolateConfigs();
      return true;
    }

    return false;
  }

  private interpolateConfigs() {
    const t = this.easeInOutQuad(this.transitionProgress);
    this.currentConfig = {
      sunAzimuth: this.lerp(this.currentConfig.sunAzimuth, this.targetConfig.sunAzimuth, t),
      sunElevation: this.lerp(this.currentConfig.sunElevation, this.targetConfig.sunElevation, t),
      colorTemperature: this.lerp(this.currentConfig.colorTemperature, this.targetConfig.colorTemperature, t),
      intensity: this.lerp(this.currentConfig.intensity, this.targetConfig.intensity, t),
      shadowIntensity: this.lerp(this.currentConfig.shadowIntensity, this.targetConfig.shadowIntensity, t),
      hazeOpacity: this.lerp(this.currentConfig.hazeOpacity, this.targetConfig.hazeOpacity, t),
    };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Get current light config for rendering
   */
  getLightConfig(): LightConfig {
    return { ...this.currentConfig };
  }

  /**
   * Convert color temperature to RGB color string
   */
  colorTemperatureToRGB(kelvin: number): string {
    const temp = kelvin / 100;
    let r: number, g: number, b: number;

    // Red
    if (temp <= 66) {
      r = 255;
    } else {
      r = temp - 60;
      r = 329.698727446 * Math.pow(r, -0.1332047592);
      r = Math.max(0, Math.min(255, r));
    }

    // Green
    if (temp <= 66) {
      g = temp;
      g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
      g = temp - 60;
      g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }
    g = Math.max(0, Math.min(255, g));

    // Blue
    if (temp >= 66) {
      b = 255;
    } else if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
      b = Math.max(0, Math.min(255, b));
    }

    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
}

// Singleton instance
export const cinematicLighting = new CinematicLightingEngine();
