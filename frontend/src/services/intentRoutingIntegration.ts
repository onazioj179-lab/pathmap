/**
 * PATHFINDER V37 — ALGORITHM INTEGRATION WITH INTENT PREDICTION
 * 
 * Wires predicted intents into routing algorithm selection and behavior.
 * Provides helper functions to apply intent-based adjustments to algorithms.
 */

import { intentModelingSystem, IntentBasedAdjustments } from './intentModelingSystem';
import { behaviorPredictionEngine, PredictedIntent } from './behaviorPredictionEngine';
import { sensorFusionLayer } from './sensorFusionLayer';

// =====================================================================
// INTERFACES
// =====================================================================

export interface IntentEnhancedRouteOptions {
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  intent_override_applied: boolean;
  predicted_intent: PredictedIntent | null;
  intent_adjustments: IntentBasedAdjustments | null;
  
  // Algorithm-specific adjustments
  shadowpath_adjustments?: {
    reduce_recalculations: boolean;
    offer_faster_route: boolean;
    anticipation_factor: number; // 0-1, higher = more anticipation
  };
  
  homeguard_adjustments?: {
    increase_breadcrumb_density: boolean;
    prepare_safe_return: boolean;
    safety_boost_factor: number; // 1.0-2.0, higher = more safety emphasis
  };
  
  pathfinderx_adjustments?: {
    activate_waves: boolean;
    show_interest_nodes: boolean;
    exploration_radius_multiplier: number; // 0.5-2.0
  };
}

export interface IntentPredictionMetrics {
  prediction_count: number;
  intent_distribution: Record<string, number>; // intent -> count
  avg_confidence: number;
  intent_switches_count: number;
  last_prediction_timestamp: number;
}

// =====================================================================
// INTENT-BASED ROUTING INTEGRATION
// =====================================================================

export class IntentRoutingIntegration {
  private static instance: IntentRoutingIntegration;
  
  private metrics: IntentPredictionMetrics = {
    prediction_count: 0,
    intent_distribution: {},
    avg_confidence: 0,
    intent_switches_count: 0,
    last_prediction_timestamp: 0,
  };

  private lastPrimaryIntent: string | null = null;

  private constructor() {
    // Subscribe to intent changes
    intentModelingSystem.addListener(this.handleIntentUpdate.bind(this));
  }

  static getInstance(): IntentRoutingIntegration {
    if (!IntentRoutingIntegration.instance) {
      IntentRoutingIntegration.instance = new IntentRoutingIntegration();
    }
    return IntentRoutingIntegration.instance;
  }

  // =====================================================================
  // INTENT UPDATE HANDLING
  // =====================================================================

  private handleIntentUpdate(adjustments: IntentBasedAdjustments): void {
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    if (!prediction) return;

    // Update metrics
    this.metrics.prediction_count++;
    this.metrics.last_prediction_timestamp = Date.now();

    // Track intent distribution
    const intent = prediction.primary_intent;
    this.metrics.intent_distribution[intent] = (this.metrics.intent_distribution[intent] || 0) + 1;

    // Track intent switches
    if (this.lastPrimaryIntent && this.lastPrimaryIntent !== intent) {
      this.metrics.intent_switches_count++;
    }
    this.lastPrimaryIntent = intent;

    // Update average confidence
    const totalPredictions = this.metrics.prediction_count;
    this.metrics.avg_confidence = 
      (this.metrics.avg_confidence * (totalPredictions - 1) + prediction.confidence_level) / totalPredictions;
  }

  // =====================================================================
  // ROUTE OPTIONS ENHANCEMENT
  // =====================================================================

  enhanceRouteOptions(
    baseAlgorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX'
  ): IntentEnhancedRouteOptions {
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    const adjustments = intentModelingSystem.getCurrentAdjustments();

    // Base options
    const options: IntentEnhancedRouteOptions = {
      algorithm: baseAlgorithm,
      intent_override_applied: false,
      predicted_intent: prediction,
      intent_adjustments: adjustments,
    };

    // If no prediction or adjustments, return base options
    if (!prediction || !adjustments) {
      return options;
    }

    // Apply intent override if confidence is high
    const imsOptions = intentModelingSystem.getOptions();
    if (imsOptions.intent_override_enabled && adjustments.algorithm_confidence > 0.7) {
      options.algorithm = adjustments.recommended_algorithm;
      options.intent_override_applied = true;
    }

    // Apply algorithm-specific adjustments
    switch (options.algorithm) {
      case 'ShadowPath':
        options.shadowpath_adjustments = this.getShadowPathAdjustments(prediction, adjustments);
        break;
      case 'HomeGuard':
        options.homeguard_adjustments = this.getHomeGuardAdjustments(prediction, adjustments);
        break;
      case 'PathfinderX':
        options.pathfinderx_adjustments = this.getPathfinderXAdjustments(prediction, adjustments);
        break;
    }

    return options;
  }

  // =====================================================================
  // ALGORITHM-SPECIFIC ADJUSTMENTS
  // =====================================================================

  private getShadowPathAdjustments(
    prediction: PredictedIntent,
    adjustments: IntentBasedAdjustments
  ): IntentEnhancedRouteOptions['shadowpath_adjustments'] {
    return {
      reduce_recalculations: adjustments.reduce_recalculations,
      offer_faster_route: adjustments.offer_faster_route,
      anticipation_factor: this.calculateAnticipationFactor(prediction),
    };
  }

  private getHomeGuardAdjustments(
    prediction: PredictedIntent,
    adjustments: IntentBasedAdjustments
  ): IntentEnhancedRouteOptions['homeguard_adjustments'] {
    return {
      increase_breadcrumb_density: adjustments.increase_breadcrumb_density,
      prepare_safe_return: adjustments.prepare_safe_return,
      safety_boost_factor: this.calculateSafetyBoostFactor(prediction),
    };
  }

  private getPathfinderXAdjustments(
    prediction: PredictedIntent,
    adjustments: IntentBasedAdjustments
  ): IntentEnhancedRouteOptions['pathfinderx_adjustments'] {
    return {
      activate_waves: adjustments.activate_pathfinder_waves,
      show_interest_nodes: adjustments.show_interest_nodes,
      exploration_radius_multiplier: this.calculateExplorationMultiplier(prediction),
    };
  }

  // =====================================================================
  // FACTOR CALCULATIONS
  // =====================================================================

  private calculateAnticipationFactor(prediction: PredictedIntent): number {
    // Higher anticipation for strong route intent
    if (prediction.primary_intent === 'route') {
      return prediction.intent_scores.route;
    }
    return 0.5; // default moderate anticipation
  }

  private calculateSafetyBoostFactor(prediction: PredictedIntent): number {
    // Higher safety boost for safe_return or lost intent
    const safetyNeedMap = {
      none: 1.0,
      low: 1.1,
      moderate: 1.3,
      high: 1.6,
      critical: 2.0,
    };
    
    return safetyNeedMap[prediction.safety_need] || 1.0;
  }

  private calculateExplorationMultiplier(prediction: PredictedIntent): number {
    // Higher radius for exploration intent
    if (prediction.primary_intent === 'exploration') {
      return 1.0 + prediction.explore_likelihood * 0.5; // 1.0 to 1.5x
    }
    
    // Lower radius for route intent (focused)
    if (prediction.primary_intent === 'route') {
      return 0.7;
    }
    
    return 1.0; // default
  }

  // =====================================================================
  // RECALCULATION TIMING
  // =====================================================================

  shouldRecalculateRoute(timeSinceLastCalc: number): boolean {
    const adjustments = intentModelingSystem.getCurrentAdjustments();
    
    if (!adjustments) {
      // Default: recalculate every 5 seconds
      return timeSinceLastCalc > 5000;
    }

    // Reduce recalculation frequency for route intent
    if (adjustments.reduce_recalculations) {
      return timeSinceLastCalc > 10000; // 10 seconds
    }

    // Increase recalculation frequency for lost intent
    if (adjustments.activate_anti_lost) {
      return timeSinceLastCalc > 2000; // 2 seconds
    }

    // Default
    return timeSinceLastCalc > 5000;
  }

  // =====================================================================
  // BREADCRUMB DENSITY
  // =====================================================================

  getBreadcrumbInterval(): number {
    const adjustments = intentModelingSystem.getCurrentAdjustments();
    
    if (!adjustments) {
      return 10000; // default: 10 seconds
    }

    // Increase density for safe return or lost intent
    if (adjustments.increase_breadcrumb_density) {
      return 5000; // 5 seconds
    }

    // Decrease density for stationary
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    if (prediction && prediction.primary_intent === 'stationary') {
      return 30000; // 30 seconds
    }

    return 10000; // default
  }

  // =====================================================================
  // PATHFINDER WAVE ACTIVATION
  // =====================================================================

  shouldActivatePathfinderWaves(): boolean {
    return intentModelingSystem.shouldActivatePathfinderWaves();
  }

  getWaveExpansionRate(): number {
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    
    if (!prediction || prediction.primary_intent !== 'exploration') {
      return 1.0; // default
    }

    // Slower waves for exploration (more thorough scanning)
    return 0.7 + prediction.explore_likelihood * 0.3; // 0.7 to 1.0x
  }

  // =====================================================================
  // UI SIMPLIFICATION
  // =====================================================================

  shouldSimplifyUI(): boolean {
    return intentModelingSystem.shouldSimplifyUI();
  }

  getUIComplexityLevel(): 'full' | 'simplified' | 'minimal' {
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    const adjustments = intentModelingSystem.getCurrentAdjustments();
    
    if (!prediction || !adjustments) {
      return 'full';
    }

    // Minimal UI for lost intent
    if (adjustments.activate_anti_lost) {
      return 'minimal';
    }

    // Simplified UI for safe return
    if (adjustments.prepare_safe_return && prediction.safety_need === 'high') {
      return 'simplified';
    }

    return 'full';
  }

  // =====================================================================
  // FRIEND MEETUP PREPARATION
  // =====================================================================

  shouldPrepareForMeetup(): boolean {
    const adjustments = intentModelingSystem.getCurrentAdjustments();
    return adjustments?.prepare_friend_meetup || false;
  }

  getMeetupPrediction(): { lat: number; lon: number; confidence: number } | null {
    const prediction = behaviorPredictionEngine.getCurrentPrediction();
    
    if (!prediction || prediction.primary_intent !== 'friend_meetup') {
      return null;
    }

    // Return likely destination if available
    return prediction.likely_destination;
  }

  // =====================================================================
  // METRICS & DEBUGGING
  // =====================================================================

  getMetrics(): IntentPredictionMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      prediction_count: 0,
      intent_distribution: {},
      avg_confidence: 0,
      intent_switches_count: 0,
      last_prediction_timestamp: 0,
    };
    this.lastPrimaryIntent = null;
  }

  // =====================================================================
  // ALGORITHM SELECTION HELPER
  // =====================================================================

  selectBestAlgorithm(
    userPreference?: 'ShadowPath' | 'HomeGuard' | 'PathfinderX'
  ): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    return intentModelingSystem.selectAlgorithmWithIntent(userPreference);
  }
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Apply intent-based adjustments to ShadowPath algorithm
 */
export function applyShadowPathIntentAdjustments(
  baseNodes: any[],
  options: IntentEnhancedRouteOptions
): any[] {
  if (!options.shadowpath_adjustments) {
    return baseNodes;
  }

  const { anticipation_factor } = options.shadowpath_adjustments;

  // Apply anticipation (predict further ahead)
  if (anticipation_factor > 0.7) {
    // Boost scores of nodes in predicted direction
    const prediction = options.predicted_intent;
    if (prediction && prediction.likely_destination) {
      baseNodes.forEach(node => {
        // Calculate alignment with predicted destination
        // (Simplified - actual implementation would calculate bearing)
        const alignmentScore = 0.5; // placeholder
        node.score = node.score * (1 + alignmentScore * anticipation_factor * 0.2);
      });
    }
  }

  return baseNodes;
}

/**
 * Apply intent-based adjustments to HomeGuard algorithm
 */
export function applyHomeGuardIntentAdjustments(
  safetyScore: number,
  options: IntentEnhancedRouteOptions
): number {
  if (!options.homeguard_adjustments) {
    return safetyScore;
  }

  const { safety_boost_factor } = options.homeguard_adjustments;

  // Apply safety boost
  return Math.min(1.0, safetyScore * safety_boost_factor);
}

/**
 * Apply intent-based adjustments to PathfinderX algorithm
 */
export function applyPathfinderXIntentAdjustments(
  baseScanRadius: number,
  options: IntentEnhancedRouteOptions
): number {
  if (!options.pathfinderx_adjustments) {
    return baseScanRadius;
  }

  const { exploration_radius_multiplier } = options.pathfinderx_adjustments;

  return baseScanRadius * exploration_radius_multiplier;
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const intentRoutingIntegration = IntentRoutingIntegration.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).intentRoutingIntegration = intentRoutingIntegration;
}
