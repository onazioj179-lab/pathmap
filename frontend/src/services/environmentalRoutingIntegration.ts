/**
 * PATHFINDER V38 — ENVIRONMENTAL ALGORITHM INTEGRATION
 * 
 * Wires World Model Engine into routing algorithms to make them
 * react intelligently to real-world environmental conditions.
 */

import { worldModelEngine, WorldModelState, EnvironmentalAdjustments } from './worldModelEngine';
import { intentRoutingIntegration } from './intentRoutingIntegration';
import { sensorFusionLayer } from './sensorFusionLayer';

// =====================================================================
// INTERFACES
// =====================================================================

export interface EnvironmentalRouteOptions {
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  environmental_enabled: boolean;
  world_state: WorldModelState | null;
  environmental_adjustments: EnvironmentalAdjustments | null;
  
  // Combined adjustments (intent + environmental)
  combined_adjustments: {
    node_cost_multiplier: number;        // 0.5-3.0, affects all path costs
    eta_multiplier: number;              // 0.7-2.0, affects time estimates
    safety_priority_boost: number;       // 1.0-3.0, increases safety weight
    exploration_radius_modifier: number; // 0.3-1.5, affects search radius
    recalculation_urgency: number;       // 0-1, triggers more frequent updates
  };
  
  reasoning: string[];
}

export interface EnvironmentalMetrics {
  adjustments_applied: number;
  algorithm_switches_due_to_weather: number;
  emergency_activations: number;
  hazard_zones_avoided: number;
  walkability_influenced_routes: number;
  last_environmental_update: number;
}

// =====================================================================
// ENVIRONMENTAL ROUTING INTEGRATION
// =====================================================================

export class EnvironmentalRoutingIntegration {
  private static instance: EnvironmentalRoutingIntegration;
  
  private metrics: EnvironmentalMetrics = {
    adjustments_applied: 0,
    algorithm_switches_due_to_weather: 0,
    emergency_activations: 0,
    hazard_zones_avoided: 0,
    walkability_influenced_routes: 0,
    last_environmental_update: 0,
  };

  private lastWorldState: WorldModelState | null = null;

  private constructor() {
    // Subscribe to world model updates
    worldModelEngine.addListener(this.handleWorldStateUpdate.bind(this));
  }

  static getInstance(): EnvironmentalRoutingIntegration {
    if (!EnvironmentalRoutingIntegration.instance) {
      EnvironmentalRoutingIntegration.instance = new EnvironmentalRoutingIntegration();
    }
    return EnvironmentalRoutingIntegration.instance;
  }

  // =====================================================================
  // WORLD STATE HANDLING
  // =====================================================================

  private handleWorldStateUpdate(state: WorldModelState): void {
    console.log('[EnvRouting] World state updated');
    this.lastWorldState = state;
    this.metrics.last_environmental_update = Date.now();

    // Check for emergency conditions
    if (state.environmental_scores.emergency_urgency > 0.8) {
      console.warn('[EnvRouting] EMERGENCY: High environmental urgency detected');
      this.metrics.emergency_activations++;
    }

    // Check for hazards
    if (state.hazards.length > 0) {
      console.log(`[EnvRouting] ${state.hazards.length} hazard zones detected`);
      this.metrics.hazard_zones_avoided += state.hazards.length;
    }
  }

  // =====================================================================
  // ROUTE OPTIONS ENHANCEMENT
  // =====================================================================

  enhanceRouteOptions(
    baseAlgorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX'
  ): EnvironmentalRouteOptions {
    const worldState = worldModelEngine.getCurrentState();
    const envAdjustments = worldModelEngine.getEnvironmentalAdjustments();
    const wmeConfig = worldModelEngine.getConfiguration();

    // Get intent-based adjustments
    const intentOptions = intentRoutingIntegration.enhanceRouteOptions(baseAlgorithm);

    // Base options
    const options: EnvironmentalRouteOptions = {
      algorithm: baseAlgorithm,
      environmental_enabled: wmeConfig.auto_adjust_routing,
      world_state: worldState,
      environmental_adjustments: envAdjustments,
      combined_adjustments: {
        node_cost_multiplier: 1.0,
        eta_multiplier: 1.0,
        safety_priority_boost: 1.0,
        exploration_radius_modifier: 1.0,
        recalculation_urgency: 0.5,
      },
      reasoning: [],
    };

    if (!wmeConfig.auto_adjust_routing) {
      options.reasoning.push('Environmental adjustments disabled');
      return options;
    }

    // Calculate combined adjustments
    const combined = this.calculateCombinedAdjustments(
      intentOptions,
      envAdjustments,
      worldState
    );

    options.combined_adjustments = combined.adjustments;
    options.reasoning = combined.reasoning;

    // Algorithm switching based on environment
    if (this.shouldSwitchAlgorithm(worldState, envAdjustments)) {
      const newAlgorithm = this.selectEnvironmentalAlgorithm(worldState, envAdjustments);
      if (newAlgorithm !== baseAlgorithm) {
        options.algorithm = newAlgorithm;
        options.reasoning.push(`Switched to ${newAlgorithm} due to environmental conditions`);
        this.metrics.algorithm_switches_due_to_weather++;
      }
    }

    this.metrics.adjustments_applied++;
    return options;
  }

  // =====================================================================
  // COMBINED ADJUSTMENTS CALCULATION
  // =====================================================================

  private calculateCombinedAdjustments(
    intentOptions: any,
    envAdjustments: EnvironmentalAdjustments,
    worldState: WorldModelState
  ): { adjustments: EnvironmentalRouteOptions['combined_adjustments']; reasoning: string[] } {
    const reasoning: string[] = [];
    
    // Node cost multiplier (environmental friction + hazard avoidance)
    let nodeCostMultiplier = envAdjustments.shadowpath_adjustments.environmental_friction;
    if (envAdjustments.homeguard_adjustments.hazard_avoidance > 0) {
      nodeCostMultiplier *= (1 + envAdjustments.homeguard_adjustments.hazard_avoidance * 0.1);
      reasoning.push(`Hazard zones detected: +${Math.round(envAdjustments.homeguard_adjustments.hazard_avoidance * 10)}% path cost`);
    }
    if (worldState.weather.type === 'rain') {
      reasoning.push('Rain detected: reduced walkability');
    }
    if (worldState.weather.type === 'thunder') {
      reasoning.push('Thunderstorm: prioritizing shelter routes');
    }

    // ETA multiplier (crowd + weather)
    let etaMultiplier = envAdjustments.shadowpath_adjustments.eta_multiplier;
    if (worldState.crowd.density_value > 0.7) {
      reasoning.push(`High crowd density: +${Math.round((etaMultiplier - 1) * 100)}% travel time`);
    }

    // Safety priority boost (weather severity + intent)
    let safetyBoost = envAdjustments.homeguard_adjustments.safety_boost;
    if (intentOptions.intent_adjustments?.prepare_safe_return) {
      safetyBoost *= 1.2; // combine intent + environment
      reasoning.push('Safe return intent + environmental factors');
    }

    // Exploration radius modifier (walkability + intent)
    let explorationModifier = envAdjustments.pathfinderx_adjustments.exploration_radius_modifier;
    if (intentOptions.intent_adjustments?.activate_pathfinder_waves) {
      explorationModifier *= 1.1; // slight boost if intent is exploration
    }
    if (worldState.walkability.overall_score < 0.5) {
      reasoning.push(`Poor walkability (${Math.round(worldState.walkability.overall_score * 100)}%): reduced exploration`);
    }

    // Recalculation urgency (emergency conditions + time pressure)
    let recalculationUrgency = worldState.environmental_scores.time_pressure;
    if (envAdjustments.homeguard_adjustments.emergency_mode) {
      recalculationUrgency = Math.max(recalculationUrgency, 0.9);
      reasoning.push('EMERGENCY: frequent recalculation enabled');
    }

    return {
      adjustments: {
        node_cost_multiplier: Math.max(0.5, Math.min(3.0, nodeCostMultiplier)),
        eta_multiplier: Math.max(0.7, Math.min(2.0, etaMultiplier)),
        safety_priority_boost: Math.max(1.0, Math.min(3.0, safetyBoost)),
        exploration_radius_modifier: Math.max(0.3, Math.min(1.5, explorationModifier)),
        recalculation_urgency: Math.max(0, Math.min(1, recalculationUrgency)),
      },
      reasoning,
    };
  }

  // =====================================================================
  // ALGORITHM SELECTION
  // =====================================================================

  private shouldSwitchAlgorithm(
    worldState: WorldModelState,
    envAdjustments: EnvironmentalAdjustments
  ): boolean {
    // Switch if emergency mode or severe weather
    return (
      envAdjustments.homeguard_adjustments.emergency_mode ||
      worldState.weather.weather_severity === 'extreme' ||
      worldState.environmental_scores.emergency_urgency > 0.8
    );
  }

  private selectEnvironmentalAlgorithm(
    worldState: WorldModelState,
    envAdjustments: EnvironmentalAdjustments
  ): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    // Emergency conditions → HomeGuard
    if (envAdjustments.homeguard_adjustments.emergency_mode) {
      return 'HomeGuard';
    }

    // Severe weather → HomeGuard
    if (worldState.weather.weather_severity === 'extreme' ||
        worldState.weather.type === 'thunder') {
      return 'HomeGuard';
    }

    // Poor walkability → HomeGuard (safer paths)
    if (worldState.walkability.overall_score < 0.4) {
      return 'HomeGuard';
    }

    // Good conditions + high exploration favorability → PathfinderX
    if (worldState.environmental_scores.exploration_favorability > 0.7 &&
        worldState.weather.type === 'clear') {
      return 'PathfinderX';
    }

    // Default → ShadowPath
    return 'ShadowPath';
  }

  // =====================================================================
  // SHADOWPATH ENVIRONMENTAL ADJUSTMENTS
  // =====================================================================

  applyShadowPathEnvironmentalAdjustments(
    baseNodes: any[],
    options: EnvironmentalRouteOptions
  ): any[] {
    if (!options.environmental_enabled || !options.world_state) {
      return baseNodes;
    }

    const { node_cost_multiplier } = options.combined_adjustments;
    const { hazards } = options.world_state;
    const { prefer_covered_routes } = options.environmental_adjustments!.shadowpath_adjustments;

    // Apply environmental friction to all nodes
    baseNodes.forEach(node => {
      node.cost *= node_cost_multiplier;

      // Penalty for hazard proximity
      hazards.forEach(hazard => {
        const distance = this.calculateDistance(
          node.lat, node.lon,
          hazard.lat, hazard.lon
        );
        if (distance < hazard.radius) {
          const proximity = 1 - (distance / hazard.radius);
          node.cost *= (1 + proximity * hazard.avoidance_penalty);
        }
      });

      // Bonus for covered routes if weather requires
      if (prefer_covered_routes && node.is_covered) {
        node.cost *= 0.7; // 30% reduction for covered paths
      }
    });

    this.metrics.walkability_influenced_routes++;
    return baseNodes;
  }

  // =====================================================================
  // HOMEGUARD ENVIRONMENTAL ADJUSTMENTS
  // =====================================================================

  applyHomeGuardEnvironmentalAdjustments(
    baseSafetyScore: number,
    options: EnvironmentalRouteOptions
  ): number {
    if (!options.environmental_enabled || !options.world_state) {
      return baseSafetyScore;
    }

    const { safety_priority_boost } = options.combined_adjustments;
    const { overall_safety } = options.world_state.environmental_scores;

    // Combine base safety with environmental safety
    let adjustedSafety = baseSafetyScore * safety_priority_boost;

    // Weight by environmental safety
    adjustedSafety = (adjustedSafety * 0.7) + (overall_safety * 0.3);

    return Math.min(1.0, adjustedSafety);
  }

  // =====================================================================
  // PATHFINDERX ENVIRONMENTAL ADJUSTMENTS
  // =====================================================================

  applyPathfinderXEnvironmentalAdjustments(
    baseScanRadius: number,
    options: EnvironmentalRouteOptions
  ): number {
    if (!options.environmental_enabled || !options.world_state) {
      return baseScanRadius;
    }

    const { exploration_radius_modifier } = options.combined_adjustments;
    const { avoid_hazard_zones } = options.environmental_adjustments!.pathfinderx_adjustments;

    let adjustedRadius = baseScanRadius * exploration_radius_modifier;

    // Further reduce if hazards present
    if (avoid_hazard_zones && options.world_state.hazards.length > 0) {
      adjustedRadius *= 0.8;
    }

    return adjustedRadius;
  }

  // =====================================================================
  // ETA CALCULATION
  // =====================================================================

  calculateEnvironmentalETA(
    baseETA: number,
    options: EnvironmentalRouteOptions
  ): number {
    if (!options.environmental_enabled) {
      return baseETA;
    }

    const { eta_multiplier } = options.combined_adjustments;
    return baseETA * eta_multiplier;
  }

  // =====================================================================
  // RECALCULATION TIMING
  // =====================================================================

  shouldRecalculateRoute(
    timeSinceLastCalc: number,
    options: EnvironmentalRouteOptions
  ): boolean {
    if (!options.environmental_enabled) {
      // Default: recalculate every 5 seconds
      return timeSinceLastCalc > 5000;
    }

    const { recalculation_urgency } = options.combined_adjustments;

    // Emergency: recalc every 1-2 seconds
    if (recalculation_urgency > 0.8) {
      return timeSinceLastCalc > 1000;
    }

    // High urgency: recalc every 2-3 seconds
    if (recalculation_urgency > 0.6) {
      return timeSinceLastCalc > 2000;
    }

    // Moderate urgency: recalc every 3-5 seconds
    if (recalculation_urgency > 0.4) {
      return timeSinceLastCalc > 3000;
    }

    // Low urgency: recalc every 7-10 seconds
    return timeSinceLastCalc > 7000;
  }

  // =====================================================================
  // HAZARD AVOIDANCE
  // =====================================================================

  isLocationInHazardZone(lat: number, lon: number): boolean {
    const worldState = worldModelEngine.getCurrentState();
    
    for (const hazard of worldState.hazards) {
      if (!hazard.active) continue;
      
      const distance = this.calculateDistance(lat, lon, hazard.lat, hazard.lon);
      if (distance < hazard.radius) {
        return true;
      }
    }
    
    return false;
  }

  getNearestHazard(lat: number, lon: number): any | null {
    const worldState = worldModelEngine.getCurrentState();
    
    let nearestHazard = null;
    let minDistance = Infinity;
    
    for (const hazard of worldState.hazards) {
      if (!hazard.active) continue;
      
      const distance = this.calculateDistance(lat, lon, hazard.lat, hazard.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestHazard = { ...hazard, distance };
      }
    }
    
    return nearestHazard;
  }

  // =====================================================================
  // WALKABILITY SCORING
  // =====================================================================

  getLocationWalkabilityScore(lat: number, lon: number): number {
    const worldState = worldModelEngine.getCurrentState();
    
    // Start with global walkability
    let score = worldState.walkability.overall_score;
    
    // Reduce if in hazard zone
    if (this.isLocationInHazardZone(lat, lon)) {
      score *= 0.3;
    }
    
    // Reduce if in high congestion area
    for (const congestion of worldState.crowd.congestion_areas) {
      const distance = this.calculateDistance(lat, lon, congestion.lat, congestion.lon);
      if (distance < congestion.radius) {
        const proximity = 1 - (distance / congestion.radius);
        score *= (1 - proximity * congestion.severity * 0.3);
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  // =====================================================================
  // WEATHER EFFECTS
  // =====================================================================

  shouldSeekShelter(): boolean {
    const worldState = worldModelEngine.getCurrentState();
    
    return (
      worldState.weather.type === 'thunder' ||
      worldState.weather.weather_severity === 'extreme' ||
      worldState.environmental_scores.emergency_urgency > 0.8
    );
  }

  getShelterUrgency(): number {
    const worldState = worldModelEngine.getCurrentState();
    return worldState.environmental_scores.emergency_urgency;
  }

  // =====================================================================
  // CROWD MANAGEMENT
  // =====================================================================

  shouldAvoidCrowds(): boolean {
    const worldState = worldModelEngine.getCurrentState();
    return worldState.crowd.density_value > 0.7;
  }

  getCrowdDensityModifier(): number {
    const worldState = worldModelEngine.getCurrentState();
    return worldState.crowd.movement_speed_modifier;
  }

  // =====================================================================
  // HELPER METHODS
  // =====================================================================

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // =====================================================================
  // METRICS & DEBUGGING
  // =====================================================================

  getMetrics(): EnvironmentalMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      adjustments_applied: 0,
      algorithm_switches_due_to_weather: 0,
      emergency_activations: 0,
      hazard_zones_avoided: 0,
      walkability_influenced_routes: 0,
      last_environmental_update: 0,
    };
  }

  // =====================================================================
  // ALGORITHM SELECTION HELPER
  // =====================================================================

  selectBestAlgorithm(
    userPreference?: 'ShadowPath' | 'HomeGuard' | 'PathfinderX'
  ): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    const worldState = worldModelEngine.getCurrentState();
    const envAdjustments = worldModelEngine.getEnvironmentalAdjustments();
    const wmeConfig = worldModelEngine.getConfiguration();
    
    // If environmental routing disabled, use intent-based selection
    if (!wmeConfig.auto_adjust_routing) {
      return intentRoutingIntegration.selectAlgorithmWithIntent(userPreference);
    }
    
    // Check if we should switch due to environment
    if (this.shouldSwitchAlgorithm(worldState, envAdjustments)) {
      return this.selectEnvironmentalAlgorithm(worldState, envAdjustments);
    }
    
    // Otherwise use intent-based selection
    return intentRoutingIntegration.selectAlgorithmWithIntent(userPreference);
  }
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Apply environmental adjustments to ShadowPath algorithm
 */
export function applyShadowPathEnvironmentalAdjustments(
  baseNodes: any[],
  options: EnvironmentalRouteOptions
): any[] {
  return environmentalRoutingIntegration.applyShadowPathEnvironmentalAdjustments(baseNodes, options);
}

/**
 * Apply environmental adjustments to HomeGuard algorithm
 */
export function applyHomeGuardEnvironmentalAdjustments(
  safetyScore: number,
  options: EnvironmentalRouteOptions
): number {
  return environmentalRoutingIntegration.applyHomeGuardEnvironmentalAdjustments(safetyScore, options);
}

/**
 * Apply environmental adjustments to PathfinderX algorithm
 */
export function applyPathfinderXEnvironmentalAdjustments(
  baseScanRadius: number,
  options: EnvironmentalRouteOptions
): number {
  return environmentalRoutingIntegration.applyPathfinderXEnvironmentalAdjustments(baseScanRadius, options);
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const environmentalRoutingIntegration = EnvironmentalRoutingIntegration.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).environmentalRoutingIntegration = environmentalRoutingIntegration;
}
