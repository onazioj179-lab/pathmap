/**
 * PATHFINDER V35 — ANTI-LOST MODE
 * 
 * Triggered when user shows signs of being lost/confused:
 * - High deviation frequency
 * - Repeated recalculations
 * - Frequent stops with poor direction changes
 * - GPS confusion
 * 
 * Response:
 * - Simplify UI to: arrow direction + distance to next point
 * - Remove complex panels temporarily
 * - Increase breadcrumb drop rate
 * - Provide clear directional commands: "Walk Straight for 50m"
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface LostIndicators {
  deviationFrequency: number;      // deviations per minute
  recalculationCount: number;      // recent recalculations (last 10 min)
  frequentStops: number;           // stops per minute
  directionChanges: number;        // direction changes per minute
  gpsAccuracyPoor: boolean;
  timeAtCurrentLocation: number;   // seconds stationary
}

export interface AntiLostModeState {
  isActive: boolean;
  activatedAt: number;
  confidence: number;              // 0-1 (how confident user is lost)
  triggerReasons: string[];
  simplifiedUIActive: boolean;
  currentInstruction: string;      // "Walk Straight for 50m"
  nextTurnDistance: number | null; // meters
  nextTurnDirection: string | null; // "left", "right", "straight"
}

export interface DirectionalCommand {
  instruction: string;
  distance: number;
  bearing: number;
  simplicity: 'very_simple' | 'simple' | 'normal';
}

// ============================================================================
// ANTI-LOST MODE ENGINE
// ============================================================================

class AntiLostModeEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  private indicators: LostIndicators = {
    deviationFrequency: 0,
    recalculationCount: 0,
    frequentStops: 0,
    directionChanges: 0,
    gpsAccuracyPoor: false,
    timeAtCurrentLocation: 0,
  };

  private state: AntiLostModeState = {
    isActive: false,
    activatedAt: 0,
    confidence: 0,
    triggerReasons: [],
    simplifiedUIActive: false,
    currentInstruction: '',
    nextTurnDistance: null,
    nextTurnDirection: null,
  };

  private readonly CHECK_INTERVAL_MS = 5000;  // Check every 5s
  private readonly ACTIVATION_THRESHOLD = 0.6; // 60% confidence triggers
  private readonly DEACTIVATION_THRESHOLD = 0.3; // 30% confidence deactivates

  private listeners: ((state: AntiLostModeState) => void)[] = [];
  private recentEvents: { type: string; timestamp: number }[] = [];

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[AntiLostMode] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkLostIndicators();
    }, this.CHECK_INTERVAL_MS);

    console.log('[AntiLostMode] Started monitoring');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[AntiLostMode] Stopped');
  }

  // ==========================================================================
  // EVENT RECORDING
  // ==========================================================================

  recordDeviation(): void {
    this.recordEvent('deviation');
  }

  recordRecalculation(): void {
    this.recordEvent('recalculation');
  }

  recordStop(): void {
    this.recordEvent('stop');
  }

  recordDirectionChange(): void {
    this.recordEvent('direction_change');
  }

  recordGPSAccuracyPoor(isPoor: boolean): void {
    this.indicators.gpsAccuracyPoor = isPoor;
  }

  recordTimeStationary(seconds: number): void {
    this.indicators.timeAtCurrentLocation = seconds;
  }

  private recordEvent(type: string): void {
    this.recentEvents.push({ type, timestamp: Date.now() });
    
    // Keep only last 10 minutes of events
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    this.recentEvents = this.recentEvents.filter(e => e.timestamp > tenMinutesAgo);
  }

  // ==========================================================================
  // LOST DETECTION
  // ==========================================================================

  private checkLostIndicators(): void {
    this.updateIndicators();
    
    const confidence = this.calculateLostConfidence();
    this.state.confidence = confidence;

    // Activation logic
    if (!this.state.isActive && confidence >= this.ACTIVATION_THRESHOLD) {
      this.activate();
    } else if (this.state.isActive && confidence < this.DEACTIVATION_THRESHOLD) {
      this.deactivate();
    }

    // Update instructions if active
    if (this.state.isActive) {
      this.updateInstructions();
    }

    this.notifyListeners();
  }

  private updateIndicators(): void {
    const oneMinuteAgo = Date.now() - 60 * 1000;

    // Count events in last minute
    const recentMinute = this.recentEvents.filter(e => e.timestamp > oneMinuteAgo);
    
    this.indicators.deviationFrequency = recentMinute.filter(e => e.type === 'deviation').length;
    this.indicators.frequentStops = recentMinute.filter(e => e.type === 'stop').length;
    this.indicators.directionChanges = recentMinute.filter(e => e.type === 'direction_change').length;

    // Count recalculations in last 10 minutes
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentTenMin = this.recentEvents.filter(e => e.timestamp > tenMinutesAgo);
    this.indicators.recalculationCount = recentTenMin.filter(e => e.type === 'recalculation').length;
  }

  private calculateLostConfidence(): number {
    const indicators = this.indicators;
    const triggers: string[] = [];
    let confidence = 0;

    // Deviation frequency (weight: 0.3)
    if (indicators.deviationFrequency >= 3) {
      confidence += 0.3;
      triggers.push('frequent_deviations');
    } else if (indicators.deviationFrequency >= 2) {
      confidence += 0.15;
    }

    // Recalculation count (weight: 0.25)
    if (indicators.recalculationCount >= 5) {
      confidence += 0.25;
      triggers.push('repeated_recalculations');
    } else if (indicators.recalculationCount >= 3) {
      confidence += 0.12;
    }

    // Frequent stops (weight: 0.2)
    if (indicators.frequentStops >= 4) {
      confidence += 0.2;
      triggers.push('frequent_stops');
    } else if (indicators.frequentStops >= 2) {
      confidence += 0.1;
    }

    // Direction changes (weight: 0.15)
    if (indicators.directionChanges >= 5) {
      confidence += 0.15;
      triggers.push('erratic_direction');
    }

    // GPS accuracy (weight: 0.1)
    if (indicators.gpsAccuracyPoor) {
      confidence += 0.1;
      triggers.push('poor_gps');
    }

    // Time stationary (bonus indicator)
    if (indicators.timeAtCurrentLocation > 60) {
      confidence += 0.1;
      triggers.push('stationary_confusion');
    }

    this.state.triggerReasons = triggers;
    return Math.min(confidence, 1.0);
  }

  // ==========================================================================
  // ACTIVATION & DEACTIVATION
  // ==========================================================================

  private activate(): void {
    this.state.isActive = true;
    this.state.activatedAt = Date.now();
    this.state.simplifiedUIActive = true;

    console.log(`[AntiLostMode] ACTIVATED (confidence: ${(this.state.confidence * 100).toFixed(0)}%)`);
    console.log(`[AntiLostMode] Triggers: ${this.state.triggerReasons.join(', ')}`);
    
    this.notifyListeners();
  }

  private deactivate(): void {
    console.log('[AntiLostMode] DEACTIVATED - User back on track');
    
    this.state.isActive = false;
    this.state.activatedAt = 0;
    this.state.simplifiedUIActive = false;
    this.state.currentInstruction = '';
    this.state.triggerReasons = [];

    this.notifyListeners();
  }

  // ==========================================================================
  // INSTRUCTION GENERATION
  // ==========================================================================

  private updateInstructions(): void {
    // Simplified instructions based on current state
    if (this.state.nextTurnDistance !== null && this.state.nextTurnDirection) {
      if (this.state.nextTurnDistance < 50) {
        this.state.currentInstruction = `Turn ${this.state.nextTurnDirection} NOW`;
      } else if (this.state.nextTurnDistance < 100) {
        this.state.currentInstruction = `Turn ${this.state.nextTurnDirection} in ${Math.round(this.state.nextTurnDistance)}m`;
      } else {
        this.state.currentInstruction = `Walk straight for ${Math.round(this.state.nextTurnDistance)}m`;
      }
    } else {
      this.state.currentInstruction = 'Continue straight ahead';
    }
  }

  setNextTurn(distance: number, direction: 'left' | 'right' | 'straight'): void {
    this.state.nextTurnDistance = distance;
    this.state.nextTurnDirection = direction;
    
    if (this.state.isActive) {
      this.updateInstructions();
      this.notifyListeners();
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): AntiLostModeState {
    return { ...this.state };
  }

  getIndicators(): LostIndicators {
    return { ...this.indicators };
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  getLostConfidence(): number {
    return this.state.confidence;
  }

  getCurrentInstruction(): string {
    return this.state.currentInstruction;
  }

  forceActivate(): void {
    this.state.confidence = 1.0;
    this.activate();
  }

  forceDeactivate(): void {
    this.state.confidence = 0;
    this.deactivate();
  }

  onStateChange(callback: (state: AntiLostModeState) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  reset(): void {
    this.stop();
    this.recentEvents = [];
    this.indicators = {
      deviationFrequency: 0,
      recalculationCount: 0,
      frequentStops: 0,
      directionChanges: 0,
      gpsAccuracyPoor: false,
      timeAtCurrentLocation: 0,
    };
    this.state = {
      isActive: false,
      activatedAt: 0,
      confidence: 0,
      triggerReasons: [],
      simplifiedUIActive: false,
      currentInstruction: '',
      nextTurnDistance: null,
      nextTurnDirection: null,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let antiLostModeEngineInstance: AntiLostModeEngine | null = null;

export function getAntiLostModeEngine(): AntiLostModeEngine {
  if (!antiLostModeEngineInstance) {
    antiLostModeEngineInstance = new AntiLostModeEngine();
  }
  return antiLostModeEngineInstance;
}

export default getAntiLostModeEngine;
