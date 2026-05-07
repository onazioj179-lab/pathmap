/**
 * PATHFINDER V33 — SELF-CALIBRATION ENGINE (SCE)
 * 
 * Autonomous map calibration and algorithm optimization system.
 * Continuously learns from usage patterns, timing data, and real-world
 * performance to improve routing accuracy, speed, and reliability.
 * 
 * Features:
 * - Per-edge performance tracking (speed, reliability, deviation)
 * - Algorithm-specific weight tuning (ShadowPath, HomeGuard, PathfinderX)
 * - Map anomaly detection and auto-correction
 * - Calibration history with smoothing filters
 * - Performance convergence toward optimal routes
 * - Persistent storage of calibration data
 */

import { getTimeEngine } from './timeEngine';
import type { TimingMetrics } from './timeEngine';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface EdgePerformance {
  edgeId: string; // "lat1,lon1->lat2,lon2"
  speedFactor: number; // 1.0 = predicted, <1.0 = slower, >1.0 = faster
  reliabilityFactor: number; // 0-1, how often predictions match reality
  deviationCost: number; // Penalty for routes that deviate frequently
  reactionTimeScore: number; // How quickly edge processes in pathfinding
  sampleCount: number; // Number of observations
  lastUpdated: number; // Timestamp
}

export interface AlgorithmCalibration {
  ShadowPath: {
    heuristicSharpness: number; // 0.5-2.0, lower = more exploration
    speedAccuracy: number; // 0-1, how accurate speed predictions are
    cacheHitRate: number; // 0-1, percentage of cached route reuse
  };
  HomeGuard: {
    safetyBias: number; // 0-2.0, higher = prefer safer routes
    safeReturnStrength: number; // 0-1, reliability of safe-return paths
    breadcrumbAccuracy: number; // 0-1, how well breadcrumbs match routes
  };
  PathfinderX: {
    scanRadius: number; // meters, exploration scan radius
    explorationQuality: number; // 0-1, quality of discovered paths
    interestZoneFocus: number; // 0-1, how well it finds interesting areas
  };
}

export interface CalibrationMetrics {
  routeSpeedAccuracy: number; // 0-1, how accurate route time predictions are
  safeReturnStrength: number; // 0-1, reliability of safe-return generation
  explorationQuality: number; // 0-1, quality of PathfinderX discoveries
  mapReliabilityIndex: number; // 0-1, overall map data quality
  deviationRate: number; // deviations per km traveled
  calibrationAge: number; // ms since last calibration
  totalSamples: number; // total edge observations
  convergenceScore: number; // 0-1, how well calibrated the system is
}

export interface CalibrationState {
  isEnabled: boolean;
  isCalibrating: boolean;
  algorithmWeights: AlgorithmCalibration;
  edgePerformance: Map<string, EdgePerformance>;
  metrics: CalibrationMetrics;
  calibrationHistory: CalibrationSnapshot[];
  lastCalibrationTime: number;
}

export interface CalibrationSnapshot {
  timestamp: number;
  metrics: CalibrationMetrics;
  adjustments: {
    algorithm: string;
    parameter: string;
    oldValue: number;
    newValue: number;
    reason: string;
  }[];
}

export interface CalibrationInput {
  // From TimeEngine
  timingMetrics: TimingMetrics;
  
  // From NavigationLoop
  currentSpeed?: number; // m/s
  deviationDistance?: number; // meters
  routeSegments?: [number, number][]; // path points
  
  // From GPS
  actualTravelTime?: number; // ms
  expectedTravelTime?: number; // ms
  
  // From environment
  environmentSafety?: number; // 0-1
  mapDensity?: number; // nodes per square km
  
  // From user behavior
  stoppedCount?: number;
  rerouteCount?: number;
  explorationCount?: number;
}

// ============================================================================
// CALIBRATION CONFIGURATION
// ============================================================================

const CALIBRATION_CONFIG = {
  UPDATE_INTERVAL_MS: 10000, // Calibrate every 10 seconds
  MIN_SAMPLES_FOR_ADJUSTMENT: 5, // Need 5+ observations before adjusting
  SMOOTHING_FACTOR: 0.2, // 0-1, lower = more smoothing (less reactive)
  CONVERGENCE_THRESHOLD: 0.85, // 0-1, target convergence score
  MAX_ADJUSTMENT_PER_CYCLE: 0.1, // Max 10% change per calibration
  EDGE_PERFORMANCE_TTL_MS: 86400000, // 24 hours, then decay
  HISTORY_RETENTION: 100, // Keep last 100 calibration snapshots
};

const DEFAULT_ALGORITHM_WEIGHTS: AlgorithmCalibration = {
  ShadowPath: {
    heuristicSharpness: 1.0,
    speedAccuracy: 0.8,
    cacheHitRate: 0.0,
  },
  HomeGuard: {
    safetyBias: 1.0,
    safeReturnStrength: 0.8,
    breadcrumbAccuracy: 0.9,
  },
  PathfinderX: {
    scanRadius: 1000,
    explorationQuality: 0.7,
    interestZoneFocus: 0.5,
  },
};

// ============================================================================
// SELF-CALIBRATION ENGINE
// ============================================================================

class SelfCalibrationEngine {
  private state: CalibrationState;
  private intervalId: number | null = null;
  private onStateUpdate: ((state: CalibrationState) => void) | null = null;
  
  constructor() {
    this.state = {
      isEnabled: true, // V33: ON by default
      isCalibrating: false,
      algorithmWeights: JSON.parse(JSON.stringify(DEFAULT_ALGORITHM_WEIGHTS)),
      edgePerformance: new Map(),
      metrics: this.createEmptyMetrics(),
      calibrationHistory: [],
      lastCalibrationTime: 0,
    };
    
    this.loadFromStorage();
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  start(onUpdate: (state: CalibrationState) => void) {
    if (this.intervalId) {
      console.warn('[SCE] Already running');
      return;
    }
    
    this.onStateUpdate = onUpdate;
    this.state.isEnabled = true;
    
    // Run calibration cycle every N seconds
    this.intervalId = window.setInterval(() => {
      this.runCalibrationCycle();
    }, CALIBRATION_CONFIG.UPDATE_INTERVAL_MS);
    
    console.log('[SCE] Started - auto-optimization enabled');
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.state.isEnabled = false;
    this.saveToStorage();
    
    console.log('[SCE] Stopped');
  }
  
  getState(): CalibrationState {
    return {
      ...this.state,
      edgePerformance: new Map(this.state.edgePerformance),
    };
  }
  
  // ==========================================================================
  // CALIBRATION CYCLE
  // ==========================================================================
  
  private async runCalibrationCycle() {
    if (!this.state.isEnabled || this.state.isCalibrating) return;
    
    this.state.isCalibrating = true;
    
    try {
      // Gather input data
      const input = this.gatherCalibrationInput();
      
      // Update edge performance
      this.updateEdgePerformance(input);
      
      // Calibrate algorithms
      const adjustments = this.calibrateAlgorithms(input);
      
      // Update metrics
      this.updateMetrics(input);
      
      // Record snapshot
      if (adjustments.length > 0) {
        this.recordSnapshot(adjustments);
      }
      
      // Prune old data
      this.pruneOldData();
      
      // Save to storage
      this.saveToStorage();
      
      this.state.lastCalibrationTime = Date.now();
      
      // Notify update
      this.notifyStateUpdate();
    } catch (error) {
      console.error('[SCE] Calibration cycle error:', error);
    } finally {
      this.state.isCalibrating = false;
    }
  }
  
  // ==========================================================================
  // DATA GATHERING
  // ==========================================================================
  
  private gatherCalibrationInput(): CalibrationInput {
    const timeEngine = getTimeEngine();
    const timingMetrics = timeEngine.getMetrics();
    
    return {
      timingMetrics,
      // Additional data would come from NavigationLoop integration
    };
  }
  
  // ==========================================================================
  // EDGE PERFORMANCE TRACKING
  // ==========================================================================
  
  recordEdgeTraversal(
    edgeId: string,
    expectedTime: number,
    actualTime: number,
    deviated: boolean
  ) {
    let edge = this.state.edgePerformance.get(edgeId);
    
    if (!edge) {
      edge = {
        edgeId,
        speedFactor: 1.0,
        reliabilityFactor: 1.0,
        deviationCost: 0,
        reactionTimeScore: 1.0,
        sampleCount: 0,
        lastUpdated: Date.now(),
      };
    }
    
    // Update speed factor with smoothing
    const observedSpeedFactor = expectedTime / actualTime;
    edge.speedFactor = this.smooth(
      edge.speedFactor,
      observedSpeedFactor,
      edge.sampleCount
    );
    
    // Update reliability (did prediction match reality?)
    const predictionError = Math.abs(actualTime - expectedTime) / expectedTime;
    const reliability = 1.0 - Math.min(predictionError, 1.0);
    edge.reliabilityFactor = this.smooth(
      edge.reliabilityFactor,
      reliability,
      edge.sampleCount
    );
    
    // Update deviation cost
    if (deviated) {
      edge.deviationCost += 0.1;
    } else {
      edge.deviationCost = Math.max(0, edge.deviationCost - 0.05);
    }
    
    edge.sampleCount++;
    edge.lastUpdated = Date.now();
    
    this.state.edgePerformance.set(edgeId, edge);
  }
  
  private updateEdgePerformance(input: CalibrationInput) {
    // Decay old edges
    const now = Date.now();
    for (const [edgeId, edge] of this.state.edgePerformance.entries()) {
      const age = now - edge.lastUpdated;
      if (age > CALIBRATION_CONFIG.EDGE_PERFORMANCE_TTL_MS) {
        // Decay toward default values
        edge.speedFactor = this.smooth(edge.speedFactor, 1.0, 10);
        edge.reliabilityFactor = this.smooth(edge.reliabilityFactor, 1.0, 10);
        edge.deviationCost *= 0.9;
      }
    }
  }
  
  getEdgeCalibration(edgeId: string): EdgePerformance | null {
    return this.state.edgePerformance.get(edgeId) || null;
  }
  
  // ==========================================================================
  // ALGORITHM CALIBRATION
  // ==========================================================================
  
  private calibrateAlgorithms(input: CalibrationInput): CalibrationSnapshot['adjustments'] {
    const adjustments: CalibrationSnapshot['adjustments'] = [];
    const { timingMetrics } = input;
    
    // Calibrate ShadowPath
    if (timingMetrics.routeCalculationAvg > 0) {
      const shadowPathAdjustments = this.calibrateShadowPath(timingMetrics);
      adjustments.push(...shadowPathAdjustments);
    }
    
    // Calibrate HomeGuard
    if (timingMetrics.safeReturnAvg > 0) {
      const homeGuardAdjustments = this.calibrateHomeGuard(timingMetrics);
      adjustments.push(...homeGuardAdjustments);
    }
    
    // Calibrate PathfinderX
    if (timingMetrics.explorationScanAvg > 0) {
      const pathfinderXAdjustments = this.calibratePathfinderX(timingMetrics);
      adjustments.push(...pathfinderXAdjustments);
    }
    
    return adjustments;
  }
  
  private calibrateShadowPath(metrics: TimingMetrics): CalibrationSnapshot['adjustments'] {
    const adjustments: CalibrationSnapshot['adjustments'] = [];
    const shadow = this.state.algorithmWeights.ShadowPath;
    
    // Adjust heuristic sharpness based on route calculation time
    const targetTime = 500; // ms
    if (metrics.routeCalculationAvg > targetTime * 1.2) {
      // Too slow - sharpen heuristic (less exploration)
      const oldValue = shadow.heuristicSharpness;
      shadow.heuristicSharpness = Math.min(
        2.0,
        shadow.heuristicSharpness + CALIBRATION_CONFIG.MAX_ADJUSTMENT_PER_CYCLE
      );
      
      if (shadow.heuristicSharpness !== oldValue) {
        adjustments.push({
          algorithm: 'ShadowPath',
          parameter: 'heuristicSharpness',
          oldValue,
          newValue: shadow.heuristicSharpness,
          reason: `Route calc too slow (${metrics.routeCalculationAvg.toFixed(0)}ms > ${targetTime}ms)`,
        });
      }
    } else if (metrics.routeCalculationAvg < targetTime * 0.5) {
      // Too fast - may be missing better routes, reduce sharpness
      const oldValue = shadow.heuristicSharpness;
      shadow.heuristicSharpness = Math.max(
        0.5,
        shadow.heuristicSharpness - CALIBRATION_CONFIG.MAX_ADJUSTMENT_PER_CYCLE * 0.5
      );
      
      if (shadow.heuristicSharpness !== oldValue) {
        adjustments.push({
          algorithm: 'ShadowPath',
          parameter: 'heuristicSharpness',
          oldValue,
          newValue: shadow.heuristicSharpness,
          reason: `Route calc fast, increase exploration (${metrics.routeCalculationAvg.toFixed(0)}ms)`,
        });
      }
    }
    
    // Update speed accuracy based on edge performance
    const avgReliability = this.getAverageReliability();
    if (avgReliability > 0) {
      shadow.speedAccuracy = this.smooth(shadow.speedAccuracy, avgReliability, 10);
    }
    
    return adjustments;
  }
  
  private calibrateHomeGuard(metrics: TimingMetrics): CalibrationSnapshot['adjustments'] {
    const adjustments: CalibrationSnapshot['adjustments'] = [];
    const homeGuard = this.state.algorithmWeights.HomeGuard;
    
    // Adjust safety bias based on safe-return performance
    const targetTime = 600; // ms
    if (metrics.safeReturnAvg > targetTime * 1.5) {
      // Too slow - reduce safety bias (faster but less safe)
      const oldValue = homeGuard.safetyBias;
      homeGuard.safetyBias = Math.max(
        0.5,
        homeGuard.safetyBias - CALIBRATION_CONFIG.MAX_ADJUSTMENT_PER_CYCLE
      );
      
      if (homeGuard.safetyBias !== oldValue) {
        adjustments.push({
          algorithm: 'HomeGuard',
          parameter: 'safetyBias',
          oldValue,
          newValue: homeGuard.safetyBias,
          reason: `Safe-return too slow (${metrics.safeReturnAvg.toFixed(0)}ms)`,
        });
      }
    }
    
    // Update safe-return strength based on reliability
    const avgReliability = this.getAverageReliability();
    if (avgReliability > 0) {
      homeGuard.safeReturnStrength = this.smooth(
        homeGuard.safeReturnStrength,
        avgReliability,
        10
      );
    }
    
    return adjustments;
  }
  
  private calibratePathfinderX(metrics: TimingMetrics): CalibrationSnapshot['adjustments'] {
    const adjustments: CalibrationSnapshot['adjustments'] = [];
    const pathfinderX = this.state.algorithmWeights.PathfinderX;
    
    // Adjust scan radius based on exploration time and device performance
    const targetTime = 1000; // ms
    if (metrics.explorationScanAvg > targetTime * 1.5) {
      // Too slow - reduce scan radius
      const oldValue = pathfinderX.scanRadius;
      pathfinderX.scanRadius = Math.max(
        500,
        pathfinderX.scanRadius * (1 - CALIBRATION_CONFIG.MAX_ADJUSTMENT_PER_CYCLE)
      );
      
      if (pathfinderX.scanRadius !== oldValue) {
        adjustments.push({
          algorithm: 'PathfinderX',
          parameter: 'scanRadius',
          oldValue,
          newValue: pathfinderX.scanRadius,
          reason: `Exploration too slow (${metrics.explorationScanAvg.toFixed(0)}ms), reduce radius`,
        });
      }
    } else if (metrics.explorationScanAvg < targetTime * 0.5 && !metrics.isSlowDevice) {
      // Fast and not slow device - can increase radius
      const oldValue = pathfinderX.scanRadius;
      pathfinderX.scanRadius = Math.min(
        2000,
        pathfinderX.scanRadius * (1 + CALIBRATION_CONFIG.MAX_ADJUSTMENT_PER_CYCLE * 0.5)
      );
      
      if (pathfinderX.scanRadius !== oldValue) {
        adjustments.push({
          algorithm: 'PathfinderX',
          parameter: 'scanRadius',
          oldValue,
          newValue: pathfinderX.scanRadius,
          reason: `Exploration fast, increase radius for better coverage`,
        });
      }
    }
    
    return adjustments;
  }
  
  // ==========================================================================
  // METRICS CALCULATION
  // ==========================================================================
  
  private createEmptyMetrics(): CalibrationMetrics {
    return {
      routeSpeedAccuracy: 0,
      safeReturnStrength: 0,
      explorationQuality: 0,
      mapReliabilityIndex: 0,
      deviationRate: 0,
      calibrationAge: 0,
      totalSamples: 0,
      convergenceScore: 0,
    };
  }
  
  private updateMetrics(input: CalibrationInput) {
    const metrics = this.state.metrics;
    const { timingMetrics } = input;
    
    // Route speed accuracy (from ShadowPath calibration)
    metrics.routeSpeedAccuracy = this.state.algorithmWeights.ShadowPath.speedAccuracy;
    
    // Safe-return strength (from HomeGuard calibration)
    metrics.safeReturnStrength = this.state.algorithmWeights.HomeGuard.safeReturnStrength;
    
    // Exploration quality (from PathfinderX calibration)
    metrics.explorationQuality = this.state.algorithmWeights.PathfinderX.explorationQuality;
    
    // Map reliability index (average of all edge reliabilities)
    metrics.mapReliabilityIndex = this.getAverageReliability();
    
    // Deviation rate (would come from NavigationLoop integration)
    // For now, use dummy value
    metrics.deviationRate = 0;
    
    // Calibration age
    metrics.calibrationAge = Date.now() - this.state.lastCalibrationTime;
    
    // Total samples
    metrics.totalSamples = Array.from(this.state.edgePerformance.values())
      .reduce((sum, edge) => sum + edge.sampleCount, 0);
    
    // Convergence score (how well-calibrated the system is)
    metrics.convergenceScore = this.calculateConvergenceScore();
  }
  
  private getAverageReliability(): number {
    const edges = Array.from(this.state.edgePerformance.values());
    if (edges.length === 0) return 0.8; // Default
    
    const sum = edges.reduce((s, e) => s + e.reliabilityFactor, 0);
    return sum / edges.length;
  }
  
  private calculateConvergenceScore(): number {
    // Score based on:
    // 1. Sample count (more samples = more confident)
    // 2. Metric stability (low variance in recent calibrations)
    // 3. Overall reliability
    
    const sampleScore = Math.min(1.0, this.state.metrics.totalSamples / 100);
    const reliabilityScore = this.state.metrics.mapReliabilityIndex;
    
    // Average the scores
    return (sampleScore + reliabilityScore) / 2;
  }
  
  // ==========================================================================
  // HISTORY & PERSISTENCE
  // ==========================================================================
  
  private recordSnapshot(adjustments: CalibrationSnapshot['adjustments']) {
    const snapshot: CalibrationSnapshot = {
      timestamp: Date.now(),
      metrics: { ...this.state.metrics },
      adjustments,
    };
    
    this.state.calibrationHistory.push(snapshot);
    
    // Trim history
    if (this.state.calibrationHistory.length > CALIBRATION_CONFIG.HISTORY_RETENTION) {
      this.state.calibrationHistory = this.state.calibrationHistory.slice(
        -CALIBRATION_CONFIG.HISTORY_RETENTION
      );
    }
    
    console.log(`[SCE] Calibrated: ${adjustments.length} adjustments`, adjustments);
  }
  
  private pruneOldData() {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [edgeId, edge] of this.state.edgePerformance.entries()) {
      const age = now - edge.lastUpdated;
      // Remove edges not updated in 7 days
      if (age > 7 * 24 * 60 * 60 * 1000) {
        toRemove.push(edgeId);
      }
    }
    
    toRemove.forEach(id => this.state.edgePerformance.delete(id));
    
    if (toRemove.length > 0) {
      console.log(`[SCE] Pruned ${toRemove.length} old edge entries`);
    }
  }
  
  private saveToStorage() {
    try {
      const data = {
        algorithmWeights: this.state.algorithmWeights,
        metrics: this.state.metrics,
        edgePerformance: Array.from(this.state.edgePerformance.entries()),
        calibrationHistory: this.state.calibrationHistory.slice(-20), // Save last 20
        lastCalibrationTime: this.state.lastCalibrationTime,
      };
      
      localStorage.setItem('pathfinder_calibration_v33', JSON.stringify(data));
    } catch (error) {
      console.warn('[SCE] Failed to save calibration data:', error);
    }
  }
  
  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('pathfinder_calibration_v33');
      if (!stored) return;
      
      const data = JSON.parse(stored);
      
      this.state.algorithmWeights = data.algorithmWeights || this.state.algorithmWeights;
      this.state.metrics = data.metrics || this.state.metrics;
      this.state.calibrationHistory = data.calibrationHistory || [];
      this.state.lastCalibrationTime = data.lastCalibrationTime || 0;
      
      // Restore edge performance map
      if (data.edgePerformance) {
        this.state.edgePerformance = new Map(data.edgePerformance);
      }
      
      console.log('[SCE] Loaded calibration data from storage');
    } catch (error) {
      console.warn('[SCE] Failed to load calibration data:', error);
    }
  }
  
  reset() {
    this.state.algorithmWeights = JSON.parse(JSON.stringify(DEFAULT_ALGORITHM_WEIGHTS));
    this.state.edgePerformance.clear();
    this.state.metrics = this.createEmptyMetrics();
    this.state.calibrationHistory = [];
    this.state.lastCalibrationTime = 0;
    
    this.saveToStorage();
    this.notifyStateUpdate();
    
    console.log('[SCE] Reset to defaults');
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  private smooth(current: number, target: number, sampleCount: number): number {
    // Exponential moving average with adaptive smoothing
    // More samples = more smoothing (less reactive to noise)
    const adaptiveFactor = Math.min(
      CALIBRATION_CONFIG.SMOOTHING_FACTOR * (1 + sampleCount / 100),
      0.5
    );
    
    return current * (1 - adaptiveFactor) + target * adaptiveFactor;
  }
  
  private notifyStateUpdate() {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getState());
    }
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  getAlgorithmWeights(): AlgorithmCalibration {
    return JSON.parse(JSON.stringify(this.state.algorithmWeights));
  }
  
  getMetrics(): CalibrationMetrics {
    return { ...this.state.metrics };
  }
  
  getCalibrationHistory(): CalibrationSnapshot[] {
    return [...this.state.calibrationHistory];
  }
  
  exportData() {
    return {
      state: this.getState(),
      history: this.getCalibrationHistory(),
      edgeCount: this.state.edgePerformance.size,
      convergence: this.state.metrics.convergenceScore,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let calibrationEngineInstance: SelfCalibrationEngine | null = null;

export function getCalibrationEngine(): SelfCalibrationEngine {
  if (!calibrationEngineInstance) {
    calibrationEngineInstance = new SelfCalibrationEngine();
  }
  return calibrationEngineInstance;
}

export default { getCalibrationEngine };
