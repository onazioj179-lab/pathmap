/**
 * PATHFINDER V32 — TIME ENGINE
 * 
 * Central timing service for measuring, tracking, and optimizing
 * performance across all PathFinder operations.
 * 
 * Purpose:
 * - Capture timestamps for every major operation
 * - Measure durations (route calc, safe-return, exploration, rendering)
 * - Track backend latency and roundtrip times
 * - Provide analytics for performance tuning
 * - Enable time-based algorithm optimizations
 * 
 * Features:
 * - Event timing capture with start/end timestamps
 * - Duration calculation for all operations
 * - Rolling averages for latency metrics
 * - Performance target monitoring
 * - Automatic slowness detection
 * - Time-based optimization triggers
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TimingEventType =
  | 'route_calculation'
  | 'safe_return_calculation'
  | 'exploration_scan'
  | 'comparison_analysis'
  | 'navigation_cycle'
  | 'deviation_check'
  | 'reroute_trigger'
  | 'map_render'
  | 'visualization_frame'
  | 'breadcrumb_update'
  | 'gps_update'
  | 'api_request'
  | 'algorithm_switch';

export interface TimingEvent {
  id: string;
  type: TimingEventType;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  algorithm?: string;
  success?: boolean;
}

export interface TimingMetrics {
  // Route calculation metrics
  routeCalculationTime: number | null;
  routeCalculationAvg: number;
  routeCalculationMax: number;
  
  // Safe-return metrics
  safeReturnTime: number | null;
  safeReturnAvg: number;
  safeReturnMax: number;
  
  // Exploration metrics
  explorationScanTime: number | null;
  explorationScanAvg: number;
  explorationScanMax: number;
  
  // Navigation metrics
  navigationCycleTime: number | null;
  navigationCycleAvg: number;
  navigationCycleMax: number;
  navigationCycleRate: number; // cycles per second
  
  // Rendering metrics
  mapRenderTime: number | null;
  mapRenderAvg: number;
  mapRenderMax: number;
  visualizationFPS: number;
  
  // API latency metrics
  apiLatencyAvg: number;
  apiLatencyMax: number;
  backendProcessingAvg: number;
  roundtripTimeAvg: number;
  
  // GPS metrics
  gpsUpdateInterval: number | null;
  gpsUpdateAvg: number;
  
  // Performance status
  isSlowDevice: boolean;
  slowestOperation: string | null;
  longestRecentDelay: number;
  
  // Totals
  totalEvents: number;
  totalDuration: number;
}

export interface PerformanceThresholds {
  routeCalculation: number; // 500-800ms target
  safeReturn: number; // 600ms target
  explorationScan: number; // 1000ms target
  mapRender: number; // 150ms target
  navigationCycle: number; // 150ms target
  visualizationFPS: number; // 40-60fps target
  apiLatency: number; // 200-400ms acceptable
}

export interface TimeBasedOptimization {
  shouldCachePaths: boolean;
  shouldThrottleBreadcrumbs: boolean;
  shouldReduceScanRadius: boolean;
  shouldPauseVisualization: boolean;
  shouldSlowNavigationCycle: boolean;
  recommendedCycleInterval: number;
}

// ============================================================================
// PERFORMANCE THRESHOLDS
// ============================================================================

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  routeCalculation: 800, // ms
  safeReturn: 600,
  explorationScan: 1000,
  mapRender: 150,
  navigationCycle: 150,
  visualizationFPS: 40,
  apiLatency: 400,
};

// ============================================================================
// TIME ENGINE CLASS
// ============================================================================

class TimeEngine {
  private events: Map<string, TimingEvent> = new Map();
  private completedEvents: TimingEvent[] = [];
  private metrics: TimingMetrics;
  private thresholds: PerformanceThresholds;
  private maxHistorySize = 100; // Keep last 100 events for rolling averages
  
  constructor() {
    this.thresholds = { ...DEFAULT_THRESHOLDS };
    this.metrics = this.createEmptyMetrics();
  }
  
  // ==========================================================================
  // EVENT TRACKING
  // ==========================================================================
  
  /**
   * Start timing an operation
   */
  startEvent(
    type: TimingEventType,
    metadata?: Record<string, any>
  ): string {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const event: TimingEvent = {
      id,
      type,
      startTime: performance.now(),
      metadata,
      algorithm: metadata?.algorithm,
    };
    
    this.events.set(id, event);
    return id;
  }
  
  /**
   * End timing an operation
   */
  endEvent(
    id: string,
    success = true,
    additionalMetadata?: Record<string, any>
  ): number | null {
    const event = this.events.get(id);
    if (!event) {
      console.warn(`TimeEngine: Event ${id} not found`);
      return null;
    }
    
    event.endTime = performance.now();
    event.duration = event.endTime - event.startTime;
    event.success = success;
    
    if (additionalMetadata) {
      event.metadata = { ...event.metadata, ...additionalMetadata };
    }
    
    // Move to completed events
    this.completedEvents.push(event);
    this.events.delete(id);
    
    // Trim history
    if (this.completedEvents.length > this.maxHistorySize) {
      this.completedEvents = this.completedEvents.slice(-this.maxHistorySize);
    }
    
    // Update metrics
    this.updateMetrics();
    
    return event.duration;
  }
  
  /**
   * Measure the duration of an async operation
   */
  async measureAsync<T>(
    type: TimingEventType,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; duration: number }> {
    const eventId = this.startEvent(type, metadata);
    
    try {
      const result = await operation();
      const duration = this.endEvent(eventId, true) || 0;
      return { result, duration };
    } catch (error) {
      this.endEvent(eventId, false, { error: String(error) });
      throw error;
    }
  }
  
  /**
   * Measure the duration of a sync operation
   */
  measureSync<T>(
    type: TimingEventType,
    operation: () => T,
    metadata?: Record<string, any>
  ): { result: T; duration: number } {
    const eventId = this.startEvent(type, metadata);
    
    try {
      const result = operation();
      const duration = this.endEvent(eventId, true) || 0;
      return { result, duration };
    } catch (error) {
      this.endEvent(eventId, false, { error: String(error) });
      throw error;
    }
  }
  
  // ==========================================================================
  // METRICS CALCULATION
  // ==========================================================================
  
  private createEmptyMetrics(): TimingMetrics {
    return {
      routeCalculationTime: null,
      routeCalculationAvg: 0,
      routeCalculationMax: 0,
      safeReturnTime: null,
      safeReturnAvg: 0,
      safeReturnMax: 0,
      explorationScanTime: null,
      explorationScanAvg: 0,
      explorationScanMax: 0,
      navigationCycleTime: null,
      navigationCycleAvg: 0,
      navigationCycleMax: 0,
      navigationCycleRate: 0,
      mapRenderTime: null,
      mapRenderAvg: 0,
      mapRenderMax: 0,
      visualizationFPS: 0,
      apiLatencyAvg: 0,
      apiLatencyMax: 0,
      backendProcessingAvg: 0,
      roundtripTimeAvg: 0,
      gpsUpdateInterval: null,
      gpsUpdateAvg: 0,
      isSlowDevice: false,
      slowestOperation: null,
      longestRecentDelay: 0,
      totalEvents: 0,
      totalDuration: 0,
    };
  }
  
  private updateMetrics(): void {
    const metrics = this.createEmptyMetrics();
    
    // Calculate metrics for each event type
    const eventsByType = this.groupEventsByType();
    
    // Route calculation metrics
    this.updateEventMetrics(
      eventsByType.get('route_calculation') || [],
      (avg, max, last) => {
        metrics.routeCalculationAvg = avg;
        metrics.routeCalculationMax = max;
        metrics.routeCalculationTime = last;
      }
    );
    
    // Safe-return metrics
    this.updateEventMetrics(
      eventsByType.get('safe_return_calculation') || [],
      (avg, max, last) => {
        metrics.safeReturnAvg = avg;
        metrics.safeReturnMax = max;
        metrics.safeReturnTime = last;
      }
    );
    
    // Exploration metrics
    this.updateEventMetrics(
      eventsByType.get('exploration_scan') || [],
      (avg, max, last) => {
        metrics.explorationScanAvg = avg;
        metrics.explorationScanMax = max;
        metrics.explorationScanTime = last;
      }
    );
    
    // Navigation cycle metrics
    const navEvents = eventsByType.get('navigation_cycle') || [];
    this.updateEventMetrics(
      navEvents,
      (avg, max, last) => {
        metrics.navigationCycleAvg = avg;
        metrics.navigationCycleMax = max;
        metrics.navigationCycleTime = last;
      }
    );
    
    // Calculate cycle rate (cycles per second)
    if (navEvents.length >= 2) {
      const recentNav = navEvents.slice(-10);
      const timeSpan = recentNav[recentNav.length - 1].startTime - recentNav[0].startTime;
      metrics.navigationCycleRate = (recentNav.length / (timeSpan / 1000));
    }
    
    // Map render metrics
    this.updateEventMetrics(
      eventsByType.get('map_render') || [],
      (avg, max, last) => {
        metrics.mapRenderAvg = avg;
        metrics.mapRenderMax = max;
        metrics.mapRenderTime = last;
      }
    );
    
    // Visualization FPS (from visualization_frame events)
    const vizEvents = eventsByType.get('visualization_frame') || [];
    if (vizEvents.length >= 2) {
      const recentViz = vizEvents.slice(-30); // Last 30 frames
      const timeSpan = recentViz[recentViz.length - 1].startTime - recentViz[0].startTime;
      metrics.visualizationFPS = (recentViz.length / (timeSpan / 1000));
    }
    
    // GPS update metrics
    const gpsEvents = eventsByType.get('gps_update') || [];
    if (gpsEvents.length >= 2) {
      const intervals = [];
      for (let i = 1; i < gpsEvents.length; i++) {
        intervals.push(gpsEvents[i].startTime - gpsEvents[i - 1].startTime);
      }
      metrics.gpsUpdateAvg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      metrics.gpsUpdateInterval = intervals[intervals.length - 1];
    }
    
    // API latency metrics
    const apiEvents = eventsByType.get('api_request') || [];
    if (apiEvents.length > 0) {
      const durations = apiEvents.map(e => e.duration || 0);
      metrics.apiLatencyAvg = durations.reduce((a, b) => a + b, 0) / durations.length;
      metrics.apiLatencyMax = Math.max(...durations);
      
      // Backend processing time (from metadata if available)
      const backendTimes = apiEvents
        .map(e => e.metadata?.backendDuration)
        .filter(d => d !== undefined);
      if (backendTimes.length > 0) {
        metrics.backendProcessingAvg = backendTimes.reduce((a, b) => a + b, 0) / backendTimes.length;
      }
      
      metrics.roundtripTimeAvg = metrics.apiLatencyAvg;
    }
    
    // Overall statistics
    metrics.totalEvents = this.completedEvents.length;
    metrics.totalDuration = this.completedEvents.reduce((sum, e) => sum + (e.duration || 0), 0);
    
    // Detect slow device
    metrics.isSlowDevice = this.detectSlowDevice(metrics);
    
    // Find slowest operation
    const allDurations = this.completedEvents
      .filter(e => e.duration !== undefined)
      .map(e => ({ type: e.type, duration: e.duration! }))
      .sort((a, b) => b.duration - a.duration);
    
    if (allDurations.length > 0) {
      metrics.slowestOperation = allDurations[0].type;
      metrics.longestRecentDelay = allDurations[0].duration;
    }
    
    this.metrics = metrics;
  }
  
  private groupEventsByType(): Map<TimingEventType, TimingEvent[]> {
    const map = new Map<TimingEventType, TimingEvent[]>();
    
    for (const event of this.completedEvents) {
      if (!map.has(event.type)) {
        map.set(event.type, []);
      }
      map.get(event.type)!.push(event);
    }
    
    return map;
  }
  
  private updateEventMetrics(
    events: TimingEvent[],
    callback: (avg: number, max: number, last: number | null) => void
  ): void {
    if (events.length === 0) {
      callback(0, 0, null);
      return;
    }
    
    const durations = events.map(e => e.duration || 0);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const last = durations[durations.length - 1];
    
    callback(avg, max, last);
  }
  
  private detectSlowDevice(metrics: TimingMetrics): boolean {
    const slowChecks = [
      metrics.routeCalculationAvg > this.thresholds.routeCalculation * 1.5,
      metrics.navigationCycleAvg > this.thresholds.navigationCycle * 1.5,
      metrics.mapRenderAvg > this.thresholds.mapRender * 2,
      metrics.visualizationFPS < this.thresholds.visualizationFPS * 0.7,
    ];
    
    // Device is slow if 2 or more checks fail
    return slowChecks.filter(Boolean).length >= 2;
  }
  
  // ==========================================================================
  // GETTERS
  // ==========================================================================
  
  getMetrics(): TimingMetrics {
    return { ...this.metrics };
  }
  
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }
  
  getRecentEvents(type?: TimingEventType, limit = 10): TimingEvent[] {
    let events = this.completedEvents;
    
    if (type) {
      events = events.filter(e => e.type === type);
    }
    
    return events.slice(-limit);
  }
  
  // ==========================================================================
  // TIME-BASED OPTIMIZATIONS
  // ==========================================================================
  
  /**
   * Get optimization recommendations based on current performance
   */
  getOptimizations(): TimeBasedOptimization {
    const m = this.metrics;
    const t = this.thresholds;
    
    return {
      // Cache paths if route calculation is slow
      shouldCachePaths: m.routeCalculationAvg > t.routeCalculation,
      
      // Throttle breadcrumbs if safe-return is slow or device is slow
      shouldThrottleBreadcrumbs: 
        m.safeReturnAvg > t.safeReturn || m.isSlowDevice,
      
      // Reduce scan radius if exploration is slow
      shouldReduceScanRadius: m.explorationScanAvg > t.explorationScan,
      
      // Pause visualization if rendering is slow
      shouldPauseVisualization: 
        m.mapRenderAvg > t.mapRender || m.visualizationFPS < t.visualizationFPS,
      
      // Slow navigation cycle if device is struggling
      shouldSlowNavigationCycle: 
        m.navigationCycleAvg > t.navigationCycle || m.isSlowDevice,
      
      // Recommended cycle interval (increase if device is slow)
      recommendedCycleInterval: m.isSlowDevice ? 3000 : 2000,
    };
  }
  
  /**
   * Check if a specific operation is performing poorly
   */
  isOperationSlow(type: TimingEventType): boolean {
    const typeToThreshold: Partial<Record<TimingEventType, keyof PerformanceThresholds>> = {
      route_calculation: 'routeCalculation',
      safe_return_calculation: 'safeReturn',
      exploration_scan: 'explorationScan',
      map_render: 'mapRender',
      navigation_cycle: 'navigationCycle',
    };
    
    const thresholdKey = typeToThreshold[type];
    if (!thresholdKey) return false;
    
    const events = this.getRecentEvents(type, 5);
    if (events.length === 0) return false;
    
    const avgDuration = events.reduce((sum, e) => sum + (e.duration || 0), 0) / events.length;
    return avgDuration > this.thresholds[thresholdKey];
  }
  
  // ==========================================================================
  // PERFORMANCE STATUS
  // ==========================================================================
  
  /**
   * Get overall performance status
   */
  getPerformanceStatus(): 'excellent' | 'good' | 'fair' | 'poor' {
    const m = this.metrics;
    const t = this.thresholds;
    
    const scores = [
      m.routeCalculationAvg <= t.routeCalculation ? 1 : 0,
      m.safeReturnAvg <= t.safeReturn ? 1 : 0,
      m.explorationScanAvg <= t.explorationScan ? 1 : 0,
      m.navigationCycleAvg <= t.navigationCycle ? 1 : 0,
      m.mapRenderAvg <= t.mapRender ? 1 : 0,
      m.visualizationFPS >= t.visualizationFPS ? 1 : 0,
    ];
    
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    if (score >= 0.9) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'fair';
    return 'poor';
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  /**
   * Reset all metrics and history
   */
  reset(): void {
    this.events.clear();
    this.completedEvents = [];
    this.metrics = this.createEmptyMetrics();
  }
  
  /**
   * Export timing data for debugging
   */
  exportData(): {
    metrics: TimingMetrics;
    recentEvents: TimingEvent[];
    optimizations: TimeBasedOptimization;
    performanceStatus: string;
  } {
    return {
      metrics: this.getMetrics(),
      recentEvents: this.getRecentEvents(undefined, 50),
      optimizations: this.getOptimizations(),
      performanceStatus: this.getPerformanceStatus(),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let timeEngineInstance: TimeEngine | null = null;

export function getTimeEngine(): TimeEngine {
  if (!timeEngineInstance) {
    timeEngineInstance = new TimeEngine();
  }
  return timeEngineInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Start timing an event (convenience wrapper)
 */
export function startTiming(
  type: TimingEventType,
  metadata?: Record<string, any>
): string {
  return getTimeEngine().startEvent(type, metadata);
}

/**
 * End timing an event (convenience wrapper)
 */
export function endTiming(
  id: string,
  success = true,
  metadata?: Record<string, any>
): number | null {
  return getTimeEngine().endEvent(id, success, metadata);
}

/**
 * Measure async operation (convenience wrapper)
 */
export async function measureAsync<T>(
  type: TimingEventType,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<{ result: T; duration: number }> {
  return getTimeEngine().measureAsync(type, operation, metadata);
}

/**
 * Measure sync operation (convenience wrapper)
 */
export function measureSync<T>(
  type: TimingEventType,
  operation: () => T,
  metadata?: Record<string, any>
): { result: T; duration: number } {
  return getTimeEngine().measureSync(type, operation, metadata);
}
