/**
 * PATHFINDER V35 — DARKNESS SAFETY ENGINE
 * 
 * Detects night-time, sunset, poor lighting conditions and boosts safety behaviors.
 * Automatically adjusts HomeGuard safety bias, safe-zone sampling, breadcrumb density,
 * and PathfinderX exploration radius based on darkness level.
 * 
 * Triggers "Night Safety Mode Active" UI signal.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DarknessConditions {
  isDark: boolean;
  darknessLevel: number;        // 0-1 (0 = full daylight, 1 = pitch black)
  timeOfDay: 'day' | 'dusk' | 'night' | 'dawn';
  sunsetTime: Date | null;
  sunriseTime: Date | null;
  minutesUntilDark: number | null;
  minutesUntilLight: number | null;
}

export interface DarknessSafetyState {
  isActive: boolean;
  activatedAt: number;
  safetyBoostMultiplier: number; // 1.0 = normal, 2.0 = max night boost
  adjustments: {
    homeGuardBiasBoost: number;   // Added to HomeGuard safety bias
    safeZoneSamplingBoost: number; // Multiplier for safe zone checks
    breadcrumbDensityBoost: number; // Multiplier for breadcrumb frequency
    pathfinderRadiusReduction: number; // Reduction % for exploration radius
  };
  reason: string;
}

export interface DarknessSafetyConfig {
  enableAutomaticDetection: boolean;
  darknessThreshold: number;    // 0.4 = activate at 40% darkness
  maxSafetyBoost: number;       // 2.0 = maximum 2x safety boost
  checkIntervalMs: number;      // 60000 = check every minute
  manualOverride: boolean;      // Allow user to disable
}

// ============================================================================
// DARKNESS SAFETY ENGINE
// ============================================================================

class DarknessSafetyEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentState: DarknessSafetyState = {
    isActive: false,
    activatedAt: 0,
    safetyBoostMultiplier: 1.0,
    adjustments: {
      homeGuardBiasBoost: 0,
      safeZoneSamplingBoost: 1.0,
      breadcrumbDensityBoost: 1.0,
      pathfinderRadiusReduction: 0,
    },
    reason: '',
  };

  private conditions: DarknessConditions = {
    isDark: false,
    darknessLevel: 0,
    timeOfDay: 'day',
    sunsetTime: null,
    sunriseTime: null,
    minutesUntilDark: null,
    minutesUntilLight: null,
  };

  private config: DarknessSafetyConfig = {
    enableAutomaticDetection: true,
    darknessThreshold: 0.4,
    maxSafetyBoost: 2.0,
    checkIntervalMs: 60000, // Check every minute
    manualOverride: false,
  };

  private listeners: ((state: DarknessSafetyState) => void)[] = [];
  private userLatitude: number | null = null;
  private userLongitude: number | null = null;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[DarknessSafety] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkDarkness();
    }, this.config.checkIntervalMs);

    // Initial check
    this.checkDarkness();

    console.log('[DarknessSafety] Started (checking every 60s)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[DarknessSafety] Stopped');
  }

  // ==========================================================================
  // DARKNESS DETECTION
  // ==========================================================================

  private checkDarkness(): void {
    if (!this.config.enableAutomaticDetection || this.config.manualOverride) {
      return;
    }

    this.updateDarknessConditions();

    const shouldActivate = this.conditions.darknessLevel >= this.config.darknessThreshold;

    if (shouldActivate && !this.currentState.isActive) {
      this.activate();
    } else if (!shouldActivate && this.currentState.isActive) {
      this.deactivate();
    }

    // Update adjustments if already active
    if (this.currentState.isActive) {
      this.updateSafetyAdjustments();
    }
  }

  private updateDarknessConditions(): void {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Calculate sun times (simplified - in production, use solar calculation API)
    const { sunrise, sunset } = this.calculateSunTimes(now);
    this.conditions.sunriseTime = sunrise;
    this.conditions.sunsetTime = sunset;

    // Determine time of day
    const currentMinutes = hour * 60 + minute;
    const sunriseMinutes = sunrise.getHours() * 60 + sunrise.getMinutes();
    const sunsetMinutes = sunset.getHours() * 60 + sunset.getMinutes();

    if (currentMinutes < sunriseMinutes - 30) {
      this.conditions.timeOfDay = 'night';
      this.conditions.darknessLevel = 1.0;
    } else if (currentMinutes < sunriseMinutes + 30) {
      this.conditions.timeOfDay = 'dawn';
      this.conditions.darknessLevel = 0.6;
    } else if (currentMinutes < sunsetMinutes - 30) {
      this.conditions.timeOfDay = 'day';
      this.conditions.darknessLevel = 0.0;
    } else if (currentMinutes < sunsetMinutes + 30) {
      this.conditions.timeOfDay = 'dusk';
      this.conditions.darknessLevel = 0.5;
    } else {
      this.conditions.timeOfDay = 'night';
      this.conditions.darknessLevel = 1.0;
    }

    this.conditions.isDark = this.conditions.darknessLevel >= 0.5;

    // Calculate minutes until dark/light
    if (this.conditions.isDark) {
      this.conditions.minutesUntilLight = this.calculateMinutesUntil(now, sunrise);
      this.conditions.minutesUntilDark = null;
    } else {
      this.conditions.minutesUntilDark = this.calculateMinutesUntil(now, sunset);
      this.conditions.minutesUntilLight = null;
    }
  }

  private calculateSunTimes(date: Date): { sunrise: Date; sunset: Date } {
    // Simplified calculation - assumes temperate latitude
    // In production, use SunCalc library or solar API
    const month = date.getMonth();
    
    // Approximate sunrise/sunset times by month (Northern Hemisphere)
    const sunriseTimes = [7, 6.5, 6, 5.5, 5, 5, 5, 5.5, 6, 6.5, 7, 7.5];
    const sunsetTimes = [17, 18, 19, 19.5, 20, 20.5, 20.5, 20, 19, 18, 17, 16.5];

    const sunriseHour = Math.floor(sunriseTimes[month]);
    const sunriseMinute = (sunriseTimes[month] % 1) * 60;
    const sunsetHour = Math.floor(sunsetTimes[month]);
    const sunsetMinute = (sunsetTimes[month] % 1) * 60;

    const sunrise = new Date(date);
    sunrise.setHours(sunriseHour, sunriseMinute, 0, 0);

    const sunset = new Date(date);
    sunset.setHours(sunsetHour, sunsetMinute, 0, 0);

    return { sunrise, sunset };
  }

  private calculateMinutesUntil(now: Date, target: Date): number {
    let diff = target.getTime() - now.getTime();
    
    // Handle next day
    if (diff < 0) {
      const nextDay = new Date(target);
      nextDay.setDate(nextDay.getDate() + 1);
      diff = nextDay.getTime() - now.getTime();
    }

    return Math.floor(diff / 60000);
  }

  // ==========================================================================
  // SAFETY ACTIVATION
  // ==========================================================================

  private activate(): void {
    const reason = this.generateActivationReason();

    this.currentState = {
      isActive: true,
      activatedAt: Date.now(),
      safetyBoostMultiplier: this.calculateSafetyBoost(),
      adjustments: this.calculateAdjustments(),
      reason,
    };

    console.log(`[DarknessSafety] ACTIVATED - ${reason}`);
    console.log(`[DarknessSafety] Darkness level: ${(this.conditions.darknessLevel * 100).toFixed(0)}%`);
    console.log(`[DarknessSafety] Safety boost: ${this.currentState.safetyBoostMultiplier.toFixed(2)}x`);
    console.log('[DarknessSafety] Adjustments:', this.currentState.adjustments);

    this.notifyListeners();
  }

  private deactivate(): void {
    console.log('[DarknessSafety] DEACTIVATED - Daylight returned');

    this.currentState = {
      isActive: false,
      activatedAt: 0,
      safetyBoostMultiplier: 1.0,
      adjustments: {
        homeGuardBiasBoost: 0,
        safeZoneSamplingBoost: 1.0,
        breadcrumbDensityBoost: 1.0,
        pathfinderRadiusReduction: 0,
      },
      reason: '',
    };

    this.notifyListeners();
  }

  private updateSafetyAdjustments(): void {
    this.currentState.safetyBoostMultiplier = this.calculateSafetyBoost();
    this.currentState.adjustments = this.calculateAdjustments();
    this.notifyListeners();
  }

  // ==========================================================================
  // ADJUSTMENT CALCULATIONS
  // ==========================================================================

  private calculateSafetyBoost(): number {
    // Base boost on darkness level
    let boost = 1.0 + (this.conditions.darknessLevel * 0.8);

    // Extra boost for late night (midnight to 4 AM)
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      boost += 0.2;
    }

    return Math.min(boost, this.config.maxSafetyBoost);
  }

  private calculateAdjustments(): {
    homeGuardBiasBoost: number;
    safeZoneSamplingBoost: number;
    breadcrumbDensityBoost: number;
    pathfinderRadiusReduction: number;
  } {
    const darknessLevel = this.conditions.darknessLevel;

    return {
      // HomeGuard: Increase safety bias by up to +0.5
      homeGuardBiasBoost: darknessLevel * 0.5,

      // Safe zone sampling: Increase by up to 2x
      safeZoneSamplingBoost: 1.0 + (darknessLevel * 1.0),

      // Breadcrumbs: Increase density by up to 1.5x
      breadcrumbDensityBoost: 1.0 + (darknessLevel * 0.5),

      // PathfinderX: Reduce exploration radius by up to 30%
      pathfinderRadiusReduction: darknessLevel * 0.3,
    };
  }

  private generateActivationReason(): string {
    switch (this.conditions.timeOfDay) {
      case 'dusk':
        return 'Sunset approaching - boosting safety';
      case 'night':
        return 'Night-time detected - maximum safety mode';
      case 'dawn':
        return 'Dawn - maintaining elevated safety';
      default:
        return 'Low light conditions detected';
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): DarknessSafetyState {
    return { ...this.currentState };
  }

  getConditions(): DarknessConditions {
    return { ...this.conditions };
  }

  isActive(): boolean {
    return this.currentState.isActive;
  }

  isDark(): boolean {
    return this.conditions.isDark;
  }

  getDarknessLevel(): number {
    return this.conditions.darknessLevel;
  }

  getMinutesUntilDark(): number | null {
    return this.conditions.minutesUntilDark;
  }

  getMinutesUntilLight(): number | null {
    return this.conditions.minutesUntilLight;
  }

  setUserLocation(latitude: number, longitude: number): void {
    this.userLatitude = latitude;
    this.userLongitude = longitude;
  }

  forceActivate(): void {
    if (!this.currentState.isActive) {
      this.conditions.darknessLevel = 1.0;
      this.conditions.isDark = true;
      this.activate();
    }
  }

  forceDeactivate(): void {
    if (this.currentState.isActive) {
      this.deactivate();
    }
  }

  enableManualOverride(enabled: boolean): void {
    this.config.manualOverride = enabled;
    console.log(`[DarknessSafety] Manual override ${enabled ? 'enabled' : 'disabled'}`);
  }

  updateConfig(config: Partial<DarknessSafetyConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[DarknessSafety] Config updated:', config);
  }

  onStateChange(callback: (state: DarknessSafetyState) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  reset(): void {
    this.stop();
    this.currentState = {
      isActive: false,
      activatedAt: 0,
      safetyBoostMultiplier: 1.0,
      adjustments: {
        homeGuardBiasBoost: 0,
        safeZoneSamplingBoost: 1.0,
        breadcrumbDensityBoost: 1.0,
        pathfinderRadiusReduction: 0,
      },
      reason: '',
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let darknessSafetyEngineInstance: DarknessSafetyEngine | null = null;

export function getDarknessSafetyEngine(): DarknessSafetyEngine {
  if (!darknessSafetyEngineInstance) {
    darknessSafetyEngineInstance = new DarknessSafetyEngine();
  }
  return darknessSafetyEngineInstance;
}

export default getDarknessSafetyEngine;
