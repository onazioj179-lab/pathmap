/**
 * PATHFINDER V35 — AMBIENT MODE ENGINE
 * 
 * Automatic safety mode switching based on environmental conditions.
 * Triggers based on time_of_day, area_safety_level, familiarity_score,
 * battery_level, and GPS accuracy.
 * 
 * Ambient Mode Behavior:
 * - Auto-switch ShadowPath → HomeGuard at night/unsafe areas
 * - Reduce visual clutter (low-power overlays)
 * - Enable Auto Safe Trail Recording
 * - Boost safe-zone analysis
 * - Increase breadcrumb density
 */

import { getTimeEngine } from './timeEngine';
import { getDeviceLocationEngine, GPSQualityMetrics } from './deviceLocationEngine';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface AmbientConditions {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
  isDark: boolean;
  areaSafetyLevel: number;      // 0-1 (0 = very unsafe, 1 = very safe)
  familiarityScore: number;     // 0-1 (0 = unknown, 1 = very familiar)
  batteryLevel: number;         // 0-100
  gpsAccuracyLevel: 'high' | 'medium' | 'low';
  isMoving: boolean;
  speed: number | null;         // m/s
}

export interface AmbientModeState {
  isActive: boolean;
  reason: string;
  activatedAt: number;
  triggerFactors: string[];
  recommendedAlgorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  recommendedBehaviors: string[];
  safetyBoostLevel: number;     // 1.0 = normal, 2.0 = max boost
}

export interface AmbientModeConfig {
  nightStartHour: number;       // 20 = 8 PM
  nightEndHour: number;         // 6 = 6 AM
  lateNightStartHour: number;   // 23 = 11 PM
  lateNightEndHour: number;     // 5 = 5 AM
  unsafeAreaThreshold: number;  // 0.4 = below 40% safety triggers Ambient
  lowFamiliarityThreshold: number; // 0.3 = below 30% familiarity triggers
  lowBatteryThreshold: number;  // 20 = below 20% triggers
  checkIntervalMs: number;      // 5000 = check every 5 seconds
}

// ============================================================================
// AMBIENT MODE ENGINE
// ============================================================================

class AmbientModeEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentState: AmbientModeState = {
    isActive: false,
    reason: '',
    activatedAt: 0,
    triggerFactors: [],
    recommendedAlgorithm: 'ShadowPath',
    recommendedBehaviors: [],
    safetyBoostLevel: 1.0,
  };

  private config: AmbientModeConfig = {
    nightStartHour: 20,
    nightEndHour: 6,
    lateNightStartHour: 23,
    lateNightEndHour: 5,
    unsafeAreaThreshold: 0.4,
    lowFamiliarityThreshold: 0.3,
    lowBatteryThreshold: 20,
    checkIntervalMs: 5000,
  };

  private listeners: ((state: AmbientModeState) => void)[] = [];
  private conditions: AmbientConditions = {
    timeOfDay: 'afternoon',
    isDark: false,
    areaSafetyLevel: 0.8,
    familiarityScore: 0.5,
    batteryLevel: 100,
    gpsAccuracyLevel: 'high',
    isMoving: false,
    speed: null,
  };

  // Battery API reference
  private batteryManager: any = null;

  constructor() {
    this.initializeBatteryAPI();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[AmbientMode] Already running');
      return;
    }

    await this.initializeBatteryAPI();
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkConditions();
    }, this.config.checkIntervalMs);

    // Initial check
    this.checkConditions();

    console.log('[AmbientMode] Started (checking every 5s)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[AmbientMode] Stopped');
  }

  // ==========================================================================
  // CONDITION MONITORING
  // ==========================================================================

  private async initializeBatteryAPI(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        this.batteryManager = await (navigator as any).getBattery();
        this.conditions.batteryLevel = this.batteryManager.level * 100;
        
        this.batteryManager.addEventListener('levelchange', () => {
          this.conditions.batteryLevel = this.batteryManager.level * 100;
        });
      } catch (error) {
        console.warn('[AmbientMode] Battery API not available:', error);
      }
    }
  }

  private checkConditions(): void {
    // Update all conditions
    this.updateTimeOfDay();
    this.updateGPSConditions();
    this.updateBatteryConditions();
    
    // Determine if Ambient Mode should be active
    const shouldActivate = this.evaluateAmbientTriggers();

    if (shouldActivate && !this.currentState.isActive) {
      this.activateAmbientMode();
    } else if (!shouldActivate && this.currentState.isActive) {
      this.deactivateAmbientMode();
    }

    // Update state if already active
    if (this.currentState.isActive) {
      this.updateAmbientState();
    }
  }

  private updateTimeOfDay(): void {
    const now = new Date();
    const hour = now.getHours();

    if (hour >= this.config.lateNightStartHour || hour < this.config.lateNightEndHour) {
      this.conditions.timeOfDay = 'late_night';
      this.conditions.isDark = true;
    } else if (hour >= this.config.nightStartHour || hour < this.config.nightEndHour) {
      this.conditions.timeOfDay = 'night';
      this.conditions.isDark = true;
    } else if (hour >= 17 && hour < this.config.nightStartHour) {
      this.conditions.timeOfDay = 'evening';
      this.conditions.isDark = false;
    } else if (hour >= 12 && hour < 17) {
      this.conditions.timeOfDay = 'afternoon';
      this.conditions.isDark = false;
    } else {
      this.conditions.timeOfDay = 'morning';
      this.conditions.isDark = false;
    }
  }

  private updateGPSConditions(): void {
    const dle = getDeviceLocationEngine();
    const metrics = dle.getQualityMetrics();
    const location = dle.getCurrentLocation();

    this.conditions.gpsAccuracyLevel = metrics.accuracyLevel;

    if (location) {
      this.conditions.isMoving = (location.speed || 0) > 0.5; // Moving if > 0.5 m/s
      this.conditions.speed = location.speed;
    }
  }

  private updateBatteryConditions(): void {
    if (this.batteryManager) {
      this.conditions.batteryLevel = this.batteryManager.level * 100;
    }
  }

  // ==========================================================================
  // TRIGGER EVALUATION
  // ==========================================================================

  private evaluateAmbientTriggers(): boolean {
    const triggers: string[] = [];

    // Trigger 1: Night time
    if (this.conditions.isDark) {
      triggers.push('night_time');
    }

    // Trigger 2: Unsafe area
    if (this.conditions.areaSafetyLevel < this.config.unsafeAreaThreshold) {
      triggers.push('unsafe_area');
    }

    // Trigger 3: Unfamiliar area
    if (this.conditions.familiarityScore < this.config.lowFamiliarityThreshold) {
      triggers.push('unfamiliar_area');
    }

    // Trigger 4: Low battery
    if (this.conditions.batteryLevel < this.config.lowBatteryThreshold) {
      triggers.push('low_battery');
    }

    // Trigger 5: Poor GPS accuracy
    if (this.conditions.gpsAccuracyLevel === 'low') {
      triggers.push('poor_gps');
    }

    // Activate if 2+ triggers present
    return triggers.length >= 2;
  }

  // ==========================================================================
  // AMBIENT MODE ACTIVATION
  // ==========================================================================

  private activateAmbientMode(): void {
    const triggers: string[] = [];
    
    if (this.conditions.isDark) triggers.push('night_time');
    if (this.conditions.areaSafetyLevel < this.config.unsafeAreaThreshold) triggers.push('unsafe_area');
    if (this.conditions.familiarityScore < this.config.lowFamiliarityThreshold) triggers.push('unfamiliar_area');
    if (this.conditions.batteryLevel < this.config.lowBatteryThreshold) triggers.push('low_battery');
    if (this.conditions.gpsAccuracyLevel === 'low') triggers.push('poor_gps');

    const reason = this.generateActivationReason(triggers);

    this.currentState = {
      isActive: true,
      reason,
      activatedAt: Date.now(),
      triggerFactors: triggers,
      recommendedAlgorithm: this.determineRecommendedAlgorithm(),
      recommendedBehaviors: this.determineRecommendedBehaviors(),
      safetyBoostLevel: this.calculateSafetyBoost(),
    };

    console.log(`[AmbientMode] ACTIVATED - ${reason}`);
    console.log(`[AmbientMode] Triggers: ${triggers.join(', ')}`);
    console.log(`[AmbientMode] Recommended: ${this.currentState.recommendedAlgorithm} (safety boost: ${this.currentState.safetyBoostLevel}x)`);

    this.notifyListeners();
  }

  private deactivateAmbientMode(): void {
    console.log('[AmbientMode] DEACTIVATED - Conditions improved');
    
    this.currentState = {
      isActive: false,
      reason: '',
      activatedAt: 0,
      triggerFactors: [],
      recommendedAlgorithm: 'ShadowPath',
      recommendedBehaviors: [],
      safetyBoostLevel: 1.0,
    };

    this.notifyListeners();
  }

  private updateAmbientState(): void {
    // Recalculate recommendations while active
    this.currentState.recommendedAlgorithm = this.determineRecommendedAlgorithm();
    this.currentState.recommendedBehaviors = this.determineRecommendedBehaviors();
    this.currentState.safetyBoostLevel = this.calculateSafetyBoost();
    
    this.notifyListeners();
  }

  // ==========================================================================
  // RECOMMENDATION LOGIC
  // ==========================================================================

  private determineRecommendedAlgorithm(): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    // Night + unsafe + unfamiliar = HomeGuard
    if (this.conditions.isDark && 
        this.conditions.areaSafetyLevel < 0.5 && 
        this.conditions.familiarityScore < 0.4) {
      return 'HomeGuard';
    }

    // Low battery = HomeGuard (shortest safe path)
    if (this.conditions.batteryLevel < 15) {
      return 'HomeGuard';
    }

    // Poor GPS + unfamiliar = HomeGuard (safer, more predictable)
    if (this.conditions.gpsAccuracyLevel === 'low' && 
        this.conditions.familiarityScore < 0.3) {
      return 'HomeGuard';
    }

    // Default to ShadowPath for less severe conditions
    return 'ShadowPath';
  }

  private determineRecommendedBehaviors(): string[] {
    const behaviors: string[] = [];

    if (this.conditions.isDark) {
      behaviors.push('increase_breadcrumb_density');
      behaviors.push('boost_safe_zone_analysis');
    }

    if (this.conditions.areaSafetyLevel < 0.5) {
      behaviors.push('enable_auto_safe_trail');
      behaviors.push('increase_deviation_monitoring');
    }

    if (this.conditions.familiarityScore < 0.3) {
      behaviors.push('record_exploration_trail');
      behaviors.push('highlight_known_paths');
    }

    if (this.conditions.batteryLevel < 20) {
      behaviors.push('reduce_visual_overlays');
      behaviors.push('lower_api_frequency');
      behaviors.push('disable_heavy_animations');
    }

    if (this.conditions.gpsAccuracyLevel === 'low') {
      behaviors.push('increase_position_smoothing');
      behaviors.push('enable_drift_correction');
    }

    return behaviors;
  }

  private calculateSafetyBoost(): number {
    let boost = 1.0;

    if (this.conditions.timeOfDay === 'late_night') boost += 0.5;
    else if (this.conditions.timeOfDay === 'night') boost += 0.3;

    if (this.conditions.areaSafetyLevel < 0.3) boost += 0.5;
    else if (this.conditions.areaSafetyLevel < 0.5) boost += 0.3;

    if (this.conditions.familiarityScore < 0.2) boost += 0.3;

    return Math.min(boost, 2.0); // Cap at 2.0x
  }

  private generateActivationReason(triggers: string[]): string {
    const reasons: string[] = [];

    if (triggers.includes('night_time')) reasons.push('nighttime');
    if (triggers.includes('unsafe_area')) reasons.push('unsafe area');
    if (triggers.includes('unfamiliar_area')) reasons.push('unfamiliar area');
    if (triggers.includes('low_battery')) reasons.push('low battery');
    if (triggers.includes('poor_gps')) reasons.push('poor GPS');

    return `Activated due to: ${reasons.join(', ')}`;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): AmbientModeState {
    return { ...this.currentState };
  }

  getConditions(): AmbientConditions {
    return { ...this.conditions };
  }

  isActive(): boolean {
    return this.currentState.isActive;
  }

  // Manual condition updates (for testing or external input)
  setAreaSafetyLevel(level: number): void {
    this.conditions.areaSafetyLevel = Math.max(0, Math.min(1, level));
  }

  setFamiliarityScore(score: number): void {
    this.conditions.familiarityScore = Math.max(0, Math.min(1, score));
  }

  forceActivate(): void {
    if (!this.currentState.isActive) {
      this.activateAmbientMode();
    }
  }

  forceDeactivate(): void {
    if (this.currentState.isActive) {
      this.deactivateAmbientMode();
    }
  }

  updateConfig(config: Partial<AmbientModeConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AmbientMode] Config updated:', config);
  }

  onStateChange(callback: (state: AmbientModeState) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  reset(): void {
    this.stop();
    this.currentState = {
      isActive: false,
      reason: '',
      activatedAt: 0,
      triggerFactors: [],
      recommendedAlgorithm: 'ShadowPath',
      recommendedBehaviors: [],
      safetyBoostLevel: 1.0,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let ambientModeEngineInstance: AmbientModeEngine | null = null;

export function getAmbientModeEngine(): AmbientModeEngine {
  if (!ambientModeEngineInstance) {
    ambientModeEngineInstance = new AmbientModeEngine();
  }
  return ambientModeEngineInstance;
}

export default getAmbientModeEngine;
