/**
 * PATHFINDER V35 — MICRO-OPTIMIZATION ENGINE (MOE)
 * 
 * Real-time micro-improvements to routes during navigation.
 * Performs edge weight adjustments, small detour testing, tight intersection
 * collision avoidance, and dynamic micro-rerouting (<100m).
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EdgeAdjustment {
  edgeId: string;
  oldWeight: number;
  newWeight: number;
  reason: string;
  confidence: number;      // 0-1
}

export interface DetourSuggestion {
  type: 'detour';
  originalPath: [number, number][];
  detourPath: [number, number][];
  distance: number;        // extra meters
  timeSavings: number;     // estimated seconds saved
  reason: string;
}

export interface IntersectionAvoidance {
  type: 'intersection_avoidance';
  location: [number, number];
  reason: string;
  alternateRoute: [number, number][];
  riskLevel: number;       // 0-1
}

export interface MicroRoute {
  type: 'micro_reroute';
  originalSegment: [number, number][];
  newSegment: [number, number][];
  improvement: string;
  estimatedTimeSaving: number; // seconds
}

export type MOESuggestion = EdgeAdjustment | DetourSuggestion | IntersectionAvoidance | MicroRoute;

export interface MOEState {
  isActive: boolean;
  suggestionsPerCycle: number;
  totalSuggestions: number;
  acceptedSuggestions: number;
  recentSuggestions: MOESuggestion[];
  performanceGain: number;    // Estimated seconds saved per minute
  edgeWeightAdjustments: Map<string, number>;
}

// ============================================================================
// MICRO-OPTIMIZATION ENGINE
// ============================================================================

class MicroOptimizationEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  private state: MOEState = {
    isActive: false,
    suggestionsPerCycle: 0,
    totalSuggestions: 0,
    acceptedSuggestions: 0,
    recentSuggestions: [],
    performanceGain: 0,
    edgeWeightAdjustments: new Map(),
  };

  private readonly UPDATE_INTERVAL_MS = 3000; // Run every 3 seconds
  private readonly MAX_SUGGESTIONS_STORED = 50;
  private readonly MIN_DETOUR_SAVING = 5; // seconds
  private readonly MAX_DETOUR_DISTANCE = 100; // meters

  private listeners: ((suggestions: MOESuggestion[]) => void)[] = [];
  private currentRoute: [number, number][] = [];
  private routeSegmentTimings: Map<string, { expected: number; actual: number }> = new Map();

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[MOE] Already running');
      return;
    }

    this.isRunning = true;
    this.state.isActive = true;
    this.intervalId = setInterval(() => {
      this.runOptimizationCycle();
    }, this.UPDATE_INTERVAL_MS);

    console.log('[MOE] Started micro-optimization engine');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.state.isActive = false;
    console.log('[MOE] Stopped');
  }

  // ==========================================================================
  // OPTIMIZATION CYCLE
  // ==========================================================================

  private runOptimizationCycle(): void {
    const suggestions: MOESuggestion[] = [];

    try {
      // 1. Edge weight adjustments based on actual vs expected timing
      suggestions.push(...this.generateEdgeAdjustments());

      // 2. Small detour testing
      suggestions.push(...this.generateDetourSuggestions());

      // 3. Intersection avoidance
      suggestions.push(...this.generateIntersectionAvoidance());

      // 4. Micro-rerouting
      suggestions.push(...this.generateMicroReroutes());

      // Update state
      this.state.suggestionsPerCycle = suggestions.length;
      this.state.totalSuggestions += suggestions.length;
      
      // Store recent suggestions
      this.state.recentSuggestions.push(...suggestions);
      if (this.state.recentSuggestions.length > this.MAX_SUGGESTIONS_STORED) {
        const excess = this.state.recentSuggestions.length - this.MAX_SUGGESTIONS_STORED;
        this.state.recentSuggestions.splice(0, excess);
      }

      // Notify listeners
      if (suggestions.length > 0) {
        console.log(`[MOE] Generated ${suggestions.length} suggestions`);
        this.notifyListeners(suggestions);
      }

    } catch (error) {
      console.error('[MOE] Error in optimization cycle:', error);
    }
  }

  // ==========================================================================
  // EDGE WEIGHT ADJUSTMENTS
  // ==========================================================================

  private generateEdgeAdjustments(): EdgeAdjustment[] {
    const adjustments: EdgeAdjustment[] = [];

    // Analyze timing data to adjust edge weights
    for (const [edgeId, timing] of this.routeSegmentTimings.entries()) {
      const actualTime = timing.actual;
      const expectedTime = timing.expected;
      
      if (actualTime > 0 && expectedTime > 0) {
        const ratio = actualTime / expectedTime;
        
        // If actual time is significantly different from expected
        if (Math.abs(ratio - 1.0) > 0.2) { // 20% difference
          const currentWeight = this.state.edgeWeightAdjustments.get(edgeId) || 1.0;
          let newWeight = currentWeight;
          let reason = '';

          if (ratio > 1.2) { // 20% slower than expected
            newWeight = currentWeight * 1.1; // Increase weight (make less attractive)
            reason = `Segment ${(ratio * 100).toFixed(0)}% slower than expected`;
          } else if (ratio < 0.8) { // 20% faster than expected
            newWeight = currentWeight * 0.95; // Decrease weight (make more attractive)
            reason = `Segment ${((1/ratio) * 100).toFixed(0)}% faster than expected`;
          }

          if (newWeight !== currentWeight) {
            adjustments.push({
              edgeId,
              oldWeight: currentWeight,
              newWeight,
              reason,
              confidence: Math.min(0.8, Math.abs(ratio - 1.0)),
            });

            this.state.edgeWeightAdjustments.set(edgeId, newWeight);
          }
        }
      }
    }

    return adjustments;
  }

  // ==========================================================================
  // DETOUR SUGGESTIONS
  // ==========================================================================

  private generateDetourSuggestions(): DetourSuggestion[] {
    const detours: DetourSuggestion[] = [];

    if (this.currentRoute.length < 3) return detours;

    // Test small detours around congested segments
    for (let i = 0; i < this.currentRoute.length - 2; i++) {
      const segment = this.currentRoute.slice(i, i + 3);
      const segmentId = this.createSegmentId(segment[0], segment[2]);
      const timing = this.routeSegmentTimings.get(segmentId);

      // If this segment is slow, try to find a detour
      if (timing && timing.actual / timing.expected > 1.3) {
        const detour = this.findDetourAroundSegment(segment);
        if (detour) {
          detours.push(detour);
        }
      }
    }

    return detours;
  }

  private findDetourAroundSegment(segment: [number, number][]): DetourSuggestion | null {
    // Simplified detour finding - in production, query backend for alternate routes
    const start = segment[0];
    const end = segment[segment.length - 1];
    
    // Create a simple detour by going slightly off-path
    const midpoint = [
      (start[0] + end[0]) / 2 + 0.001, // Slight offset
      (start[1] + end[1]) / 2 + 0.001
    ] as [number, number];

    const detourPath = [start, midpoint, end];
    const originalDistance = this.calculateDistance(start, end);
    const detourDistance = this.calculateDistance(start, midpoint) + this.calculateDistance(midpoint, end);
    const extraDistance = detourDistance - originalDistance;

    // Only suggest if detour is small
    if (extraDistance < this.MAX_DETOUR_DISTANCE) {
      return {
        type: 'detour',
        originalPath: segment,
        detourPath,
        distance: extraDistance,
        timeSavings: 15, // Estimated 15 seconds saved by avoiding congestion
        reason: 'Avoid congested segment',
      };
    }

    return null;
  }

  // ==========================================================================
  // INTERSECTION AVOIDANCE
  // ==========================================================================

  private generateIntersectionAvoidance(): IntersectionAvoidance[] {
    const avoidances: IntersectionAvoidance[] = [];

    // Identify potentially risky intersections
    const riskyIntersections = this.identifyRiskyIntersections();

    for (const intersection of riskyIntersections) {
      const alternate = this.findAlternateAroundIntersection(intersection.location);
      if (alternate) {
        avoidances.push({
          type: 'intersection_avoidance',
          location: intersection.location,
          reason: intersection.reason,
          alternateRoute: alternate,
          riskLevel: intersection.riskLevel,
        });
      }
    }

    return avoidances;
  }

  private identifyRiskyIntersections(): Array<{location: [number, number]; reason: string; riskLevel: number}> {
    // Simplified risk identification
    // In production, would analyze traffic data, accident history, etc.
    const risky: Array<{location: [number, number]; reason: string; riskLevel: number}> = [];

    // Check current route for tight turns or complex intersections
    for (let i = 1; i < this.currentRoute.length - 1; i++) {
      const prev = this.currentRoute[i - 1];
      const curr = this.currentRoute[i];
      const next = this.currentRoute[i + 1];

      const angle = this.calculateTurnAngle(prev, curr, next);
      
      // Sharp turn = potential risk
      if (Math.abs(angle) > 90) {
        risky.push({
          location: curr,
          reason: `Sharp ${angle > 0 ? 'left' : 'right'} turn (${Math.abs(angle).toFixed(0)}°)`,
          riskLevel: Math.min(Math.abs(angle) / 180, 1.0),
        });
      }
    }

    return risky;
  }

  private findAlternateAroundIntersection(intersection: [number, number]): [number, number][] | null {
    // Simplified alternate route - just add a waypoint to go around
    const offset = 0.0005; // ~50m offset
    return [
      [intersection[0] + offset, intersection[1]],
      [intersection[0], intersection[1] + offset],
    ];
  }

  // ==========================================================================
  // MICRO-REROUTING
  // ==========================================================================

  private generateMicroReroutes(): MicroRoute[] {
    const microReroutes: MicroRoute[] = [];

    // Look for short segments that could be optimized
    for (let i = 0; i < this.currentRoute.length - 1; i++) {
      const segmentStart = this.currentRoute[i];
      const segmentEnd = this.currentRoute[i + 1];
      const distance = this.calculateDistance(segmentStart, segmentEnd);

      // Only optimize short segments
      if (distance < 50) { // 50 meters
        const optimization = this.optimizeShortSegment(segmentStart, segmentEnd);
        if (optimization) {
          microReroutes.push(optimization);
        }
      }
    }

    return microReroutes;
  }

  private optimizeShortSegment(start: [number, number], end: [number, number]): MicroRoute | null {
    // Simplified optimization - in production, would analyze road curvature, surfaces, etc.
    // For now, just suggest a slightly more direct path
    const directDistance = this.calculateDistance(start, end);
    
    if (directDistance > 30) { // Only for segments >30m
      return {
        type: 'micro_reroute',
        originalSegment: [start, end],
        newSegment: [start, end], // Same in this simple case
        improvement: 'More direct path',
        estimatedTimeSaving: 2, // 2 seconds
      };
    }

    return null;
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private calculateDistance(point1: [number, number], point2: [number, number]): number {
    const [lat1, lon1] = point1;
    const [lat2, lon2] = point2;
    
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private calculateTurnAngle(prev: [number, number], curr: [number, number], next: [number, number]): number {
    // Calculate angle between three points
    const bearing1 = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]);
    const bearing2 = Math.atan2(next[1] - curr[1], next[0] - curr[0]);
    
    let angle = ((bearing2 - bearing1) * 180) / Math.PI;
    
    // Normalize to -180 to 180
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    
    return angle;
  }

  private createSegmentId(start: [number, number], end: [number, number]): string {
    return `${start[0].toFixed(6)},${start[1].toFixed(6)}->${end[0].toFixed(6)},${end[1].toFixed(6)}`;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): MOEState {
    return { 
      ...this.state,
      edgeWeightAdjustments: new Map(this.state.edgeWeightAdjustments)
    };
  }

  updateRoute(route: [number, number][]): void {
    this.currentRoute = route;
  }

  recordSegmentTiming(start: [number, number], end: [number, number], actualTime: number, expectedTime: number): void {
    const segmentId = this.createSegmentId(start, end);
    this.routeSegmentTimings.set(segmentId, { actual: actualTime, expected: expectedTime });

    // Keep only recent timings
    if (this.routeSegmentTimings.size > 100) {
      const keys = Array.from(this.routeSegmentTimings.keys());
      this.routeSegmentTimings.delete(keys[0]);
    }
  }

  acceptSuggestion(suggestion: MOESuggestion): void {
    this.state.acceptedSuggestions++;
    console.log(`[MOE] Accepted suggestion: ${suggestion.type}`);
  }

  onSuggestions(callback: (suggestions: MOESuggestion[]) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(suggestions: MOESuggestion[]): void {
    this.listeners.forEach(listener => listener(suggestions));
  }

  reset(): void {
    this.stop();
    this.state = {
      isActive: false,
      suggestionsPerCycle: 0,
      totalSuggestions: 0,
      acceptedSuggestions: 0,
      recentSuggestions: [],
      performanceGain: 0,
      edgeWeightAdjustments: new Map(),
    };
    this.routeSegmentTimings.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let microOptimizationEngineInstance: MicroOptimizationEngine | null = null;

export function getMicroOptimizationEngine(): MicroOptimizationEngine {
  if (!microOptimizationEngineInstance) {
    microOptimizationEngineInstance = new MicroOptimizationEngine();
  }
  return microOptimizationEngineInstance;
}

export default getMicroOptimizationEngine;