/**
 * PATHFINDER V35 — BATTERY-AWARE ROUTING ENGINE
 * 
 * Monitors battery level and automatically adjusts PathFinder behavior
 * to conserve power when battery is low.
 * 
 * Behaviors:
 * - <25%: Reduce API calls, lower nav cycle, switch to HomeGuard, disable heavy overlays
 * - <10%: Force safe-return, auto-open HomeGuard, trigger "Return Before Battery Dies" alert
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface BatteryState {
  level: number;              // 0-100
  charging: boolean;
  chargingTime: number | null; // seconds until full (if charging)
  dischargingTime: number | null; // seconds until empty (if discharging)
  powerSaveMode: 'normal' | 'conservative' | 'critical';
}

export interface BatteryAdjustments {
  apiCallFrequencyMultiplier: number; // 1.0 = normal, 0.5 = half frequency
  navigationCycleInterval: number;    // ms
  disableHeavyVisualization: boolean;
  recommendedAlgorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  forceSafeReturn: boolean;
  showBatteryWarning: boolean;
  warningMessage: string;
}

export interface BatteryConfig {
  conservativeModeThreshold: number;  // 25%
  criticalModeThreshold: number;      // 10%
  checkIntervalMs: number;            // 5000 = check every 5s
}

// ============================================================================
// BATTERY-AWARE ROUTING ENGINE
// ============================================================================

class BatteryAwareRoutingEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private batteryManager: any = null;
  
  private batteryState: BatteryState = {
    level: 100,
    charging: false,
    chargingTime: null,
    dischargingTime: null,
    powerSaveMode: 'normal',
  };

  private adjustments: BatteryAdjustments = {
    apiCallFrequencyMultiplier: 1.0,
    navigationCycleInterval: 2000,
    disableHeavyVisualization: false,
    recommendedAlgorithm: 'ShadowPath',
    forceSafeReturn: false,
    showBatteryWarning: false,
    warningMessage: '',
  };

  private config: BatteryConfig = {
    conservativeModeThreshold: 25,
    criticalModeThreshold: 10,
    checkIntervalMs: 5000,
  };

  private listeners: ((state: BatteryState, adjustments: BatteryAdjustments) => void)[] = [];

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.warn('[BatteryAware] Already running');
      return true;
    }

    const initialized = await this.initializeBatteryAPI();
    if (!initialized) {
      console.warn('[BatteryAware] Battery API not available, using default behavior');
      return false;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkBatteryState();
    }, this.config.checkIntervalMs);

    // Initial check
    this.checkBatteryState();

    console.log('[BatteryAware] Started monitoring battery');
    return true;
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[BatteryAware] Stopped');
  }

  // ==========================================================================
  // BATTERY API
  // ==========================================================================

  private async initializeBatteryAPI(): Promise<boolean> {
    if (!('getBattery' in navigator)) {
      return false;
    }

    try {
      this.batteryManager = await (navigator as any).getBattery();
      
      this.batteryState.level = this.batteryManager.level * 100;
      this.batteryState.charging = this.batteryManager.charging;
      this.batteryState.chargingTime = this.batteryManager.chargingTime;
      this.batteryState.dischargingTime = this.batteryManager.dischargingTime;

      // Listen for battery changes
      this.batteryManager.addEventListener('levelchange', () => {
        this.batteryState.level = this.batteryManager.level * 100;
        this.checkBatteryState();
      });

      this.batteryManager.addEventListener('chargingchange', () => {
        this.batteryState.charging = this.batteryManager.charging;
        this.checkBatteryState();
      });

      return true;
    } catch (error) {
      console.error('[BatteryAware] Failed to initialize Battery API:', error);
      return false;
    }
  }

  // ==========================================================================
  // BATTERY MONITORING
  // ==========================================================================

  private checkBatteryState(): void {
    const prevMode = this.batteryState.powerSaveMode;

    // Determine power save mode
    if (this.batteryState.charging) {
      this.batteryState.powerSaveMode = 'normal';
    } else if (this.batteryState.level < this.config.criticalModeThreshold) {
      this.batteryState.powerSaveMode = 'critical';
    } else if (this.batteryState.level < this.config.conservativeModeThreshold) {
      this.batteryState.powerSaveMode = 'conservative';
    } else {
      this.batteryState.powerSaveMode = 'normal';
    }

    // Mode changed
    if (prevMode !== this.batteryState.powerSaveMode) {
      console.log(`[BatteryAware] Mode changed: ${prevMode} → ${this.batteryState.powerSaveMode} (${this.batteryState.level.toFixed(0)}%)`);
    }

    // Apply adjustments
    this.applyBatteryAdjustments();

    // Notify listeners
    this.notifyListeners();
  }

  // ==========================================================================
  // ADJUSTMENT LOGIC
  // ==========================================================================

  private applyBatteryAdjustments(): void {
    const mode = this.batteryState.powerSaveMode;

    switch (mode) {
      case 'critical':
        this.adjustments = {
          apiCallFrequencyMultiplier: 0.3,  // 30% of normal
          navigationCycleInterval: 4000,    // 4s (double normal)
          disableHeavyVisualization: true,
          recommendedAlgorithm: 'HomeGuard', // Shortest safe path
          forceSafeReturn: true,
          showBatteryWarning: true,
          warningMessage: 'CRITICAL BATTERY - Return Before Battery Dies',
        };
        break;

      case 'conservative':
        this.adjustments = {
          apiCallFrequencyMultiplier: 0.6,  // 60% of normal
          navigationCycleInterval: 3000,    // 3s
          disableHeavyVisualization: true,
          recommendedAlgorithm: 'HomeGuard', // Safer, simpler
          forceSafeReturn: false,
          showBatteryWarning: true,
          warningMessage: 'Low Battery - Power Saving Mode Active',
        };
        break;

      case 'normal':
      default:
        this.adjustments = {
          apiCallFrequencyMultiplier: 1.0,  // Normal
          navigationCycleInterval: 2000,    // 2s (normal)
          disableHeavyVisualization: false,
          recommendedAlgorithm: 'ShadowPath',
          forceSafeReturn: false,
          showBatteryWarning: false,
          warningMessage: '',
        };
        break;
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getBatteryState(): BatteryState {
    return { ...this.batteryState };
  }

  getAdjustments(): BatteryAdjustments {
    return { ...this.adjustments };
  }

  getBatteryLevel(): number {
    return this.batteryState.level;
  }

  isCharging(): boolean {
    return this.batteryState.charging;
  }

  isCriticalBattery(): boolean {
    return this.batteryState.powerSaveMode === 'critical';
  }

  isConservativeMode(): boolean {
    return this.batteryState.powerSaveMode === 'conservative';
  }

  shouldForceSafeReturn(): boolean {
    return this.adjustments.forceSafeReturn;
  }

  getRecommendedAlgorithm(): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    return this.adjustments.recommendedAlgorithm;
  }

  getAPICallMultiplier(): number {
    return this.adjustments.apiCallFrequencyMultiplier;
  }

  getNavigationCycleInterval(): number {
    return this.adjustments.navigationCycleInterval;
  }

  shouldDisableHeavyVisualization(): boolean {
    return this.adjustments.disableHeavyVisualization;
  }

  updateConfig(config: Partial<BatteryConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[BatteryAware] Config updated:', config);
  }

  onStateChange(callback: (state: BatteryState, adjustments: BatteryAdjustments) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.batteryState, this.adjustments));
  }

  reset(): void {
    this.stop();
    this.batteryState.powerSaveMode = 'normal';
    this.applyBatteryAdjustments();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let batteryAwareRoutingEngineInstance: BatteryAwareRoutingEngine | null = null;

export function getBatteryAwareRoutingEngine(): BatteryAwareRoutingEngine {
  if (!batteryAwareRoutingEngineInstance) {
    batteryAwareRoutingEngineInstance = new BatteryAwareRoutingEngine();
  }
  return batteryAwareRoutingEngineInstance;
}

export default getBatteryAwareRoutingEngine;
