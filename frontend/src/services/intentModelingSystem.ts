/**
 * PATHFINDER V37 — INTENT MODELING SYSTEM (IMS)
 *
 * Routes predicted behavior into algorithmic decisions and UI responses.
 * Translates BPE predictions into actionable routing adjustments.
 */

import {
  behaviorPredictionEngine,
  PredictedIntent,
  IntentCategory,
} from './behaviorPredictionEngine';
import { getSensorFusionLayer } from './sensorFusionLayer';
import { getAntiLostModeEngine } from './antiLostModeEngine';

// Engine instances
const sensorFusionLayer = getSensorFusionLayer();
const antiLostModeEngine = getAntiLostModeEngine();

// =====================================================================
// INTERFACES
// =====================================================================

export interface IntentBasedAdjustments {
  recommended_algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  algorithm_confidence: number; // 0-1
  reduce_recalculations: boolean;
  prepare_safe_return: boolean;
  increase_breadcrumb_density: boolean;
  activate_pathfinder_waves: boolean;
  show_interest_nodes: boolean;
  prepare_friend_meetup: boolean;
  activate_anti_lost: boolean;
  simplify_ui: boolean;
  offer_faster_route: boolean;
  suggested_action: string; // user-facing suggestion
  reasoning: string[];
}

export interface IntentRoutingOptions {
  intent_override_enabled: boolean;
  auto_activate_anti_lost: boolean;
  auto_prepare_safe_return: boolean;
  exploration_assistance: boolean;
  friend_meetup_notifications: boolean;
}

// =====================================================================
// INTENT MODELING SYSTEM
// =====================================================================

export class IntentModelingSystem {
  private static instance: IntentModelingSystem;

  private options: IntentRoutingOptions = {
    intent_override_enabled: true,
    auto_activate_anti_lost: true,
    auto_prepare_safe_return: true,
    exploration_assistance: true,
    friend_meetup_notifications: true,
  };

  private currentAdjustments: IntentBasedAdjustments | null = null;
  private listeners: Array<(adjustments: IntentBasedAdjustments) => void> = [];

  private constructor() {
    // Subscribe to BPE predictions
    behaviorPredictionEngine.addListener(this.handlePredictionUpdate.bind(this));
  }

  static getInstance(): IntentModelingSystem {
    if (!IntentModelingSystem.instance) {
      IntentModelingSystem.instance = new IntentModelingSystem();
    }
    return IntentModelingSystem.instance;
  }

  // =====================================================================
  // PREDICTION HANDLING
  // =====================================================================

  private handlePredictionUpdate(prediction: PredictedIntent): void {
    if (!this.options.intent_override_enabled) {
      return;
    }

    // Only process predictions above confidence threshold
    const bpeConfig = behaviorPredictionEngine.getConfiguration();
    if (prediction.confidence_level < bpeConfig.confidence_threshold) {
      return;
    }

    // Generate adjustments based on predicted intent
    const adjustments = this.generateAdjustments(prediction);
    this.currentAdjustments = adjustments;

    // Apply automatic actions
    this.applyAutomaticActions(prediction, adjustments);

    // Notify listeners
    this.notifyListeners(adjustments);
  }

  // =====================================================================
  // ADJUSTMENT GENERATION
  // =====================================================================

  private generateAdjustments(prediction: PredictedIntent): IntentBasedAdjustments {
    const intent = prediction.primary_intent;

    // Base adjustments
    const adjustments: IntentBasedAdjustments = {
      recommended_algorithm: 'ShadowPath',
      algorithm_confidence: prediction.confidence_level,
      reduce_recalculations: false,
      prepare_safe_return: false,
      increase_breadcrumb_density: false,
      activate_pathfinder_waves: false,
      show_interest_nodes: false,
      prepare_friend_meetup: false,
      activate_anti_lost: false,
      simplify_ui: false,
      offer_faster_route: false,
      suggested_action: '',
      reasoning: [...prediction.reasoning],
    };

    // Apply intent-specific logic
    switch (intent) {
      case 'route':
        this.applyRouteIntentAdjustments(adjustments, prediction);
        break;
      case 'safe_return':
        this.applySafeReturnIntentAdjustments(adjustments, prediction);
        break;
      case 'exploration':
        this.applyExplorationIntentAdjustments(adjustments, prediction);
        break;
      case 'friend_meetup':
        this.applyFriendMeetupIntentAdjustments(adjustments, prediction);
        break;
      case 'lost':
        this.applyLostIntentAdjustments(adjustments, prediction);
        break;
      case 'stationary':
        this.applyStationaryIntentAdjustments(adjustments, prediction);
        break;
      default:
        this.applyDefaultAdjustments(adjustments, prediction);
    }

    return adjustments;
  }

  // =====================================================================
  // INTENT-SPECIFIC ADJUSTMENT LOGIC
  // =====================================================================

  private applyRouteIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'ShadowPath';
    adjustments.reduce_recalculations = true;
    adjustments.offer_faster_route = prediction.route_type === 'direct';
    adjustments.suggested_action = 'Continue Straight';
    adjustments.reasoning.push('Route intent: optimize for direct path');

    // High safety need overrides to safe route
    if (prediction.safety_need === 'high' || prediction.safety_need === 'critical') {
      adjustments.recommended_algorithm = 'HomeGuard';
      adjustments.suggested_action = 'Continue on Safe Route';
      adjustments.reasoning.push('Safety concern detected, using HomeGuard');
    }
  }

  private applySafeReturnIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'HomeGuard';
    adjustments.prepare_safe_return = true;
    adjustments.increase_breadcrumb_density = true;
    adjustments.suggested_action = 'Safe Return Recommended';
    adjustments.reasoning.push('Safe return intent: preparing HomeGuard paths');

    // Critical safety activates Anti-Lost Mode
    if (prediction.safety_need === 'critical' || prediction.lost_likelihood > 0.7) {
      adjustments.activate_anti_lost = true;
      adjustments.simplify_ui = true;
      adjustments.suggested_action = 'Safe Return Active';
      adjustments.reasoning.push('Critical safety: activating Anti-Lost Mode');
    }
  }

  private applyExplorationIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'PathfinderX';
    adjustments.activate_pathfinder_waves = true;
    adjustments.show_interest_nodes = true;
    adjustments.suggested_action = 'Exploration Detected';
    adjustments.reasoning.push('Exploration intent: activating PathfinderX waves');
  }

  private applyFriendMeetupIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'ShadowPath';
    adjustments.prepare_friend_meetup = true;
    adjustments.offer_faster_route = true;
    adjustments.suggested_action = 'Meetup Possible';
    adjustments.reasoning.push('Friend meetup intent: preparing live route calculation');
  }

  private applyLostIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'HomeGuard';
    adjustments.activate_anti_lost = true;
    adjustments.simplify_ui = true;
    adjustments.prepare_safe_return = true;
    adjustments.increase_breadcrumb_density = true;
    adjustments.suggested_action = 'You May Be Lost';
    adjustments.reasoning.push('Lost intent detected: activating Anti-Lost Mode');
  }

  private applyStationaryIntentAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    adjustments.recommended_algorithm = 'ShadowPath';
    adjustments.reduce_recalculations = true;
    adjustments.suggested_action = 'Stationary';
    adjustments.reasoning.push('Stationary: reducing calculation frequency');
  }

  private applyDefaultAdjustments(
    adjustments: IntentBasedAdjustments,
    prediction: PredictedIntent
  ): void {
    // Default to ShadowPath
    adjustments.recommended_algorithm = 'ShadowPath';
    adjustments.suggested_action = '';
    adjustments.reasoning.push('No strong intent detected, using default');
  }

  // =====================================================================
  // AUTOMATIC ACTIONS
  // =====================================================================

  private applyAutomaticActions(
    prediction: PredictedIntent,
    adjustments: IntentBasedAdjustments
  ): void {
    // Auto-activate Anti-Lost Mode
    if (this.options.auto_activate_anti_lost && adjustments.activate_anti_lost) {
      this.activateAntiLostMode(prediction);
    }

    // Auto-prepare safe return
    if (this.options.auto_prepare_safe_return && adjustments.prepare_safe_return) {
      this.prepareSafeReturn(prediction);
    }

    // Additional automatic actions can be added here
  }

  private activateAntiLostMode(prediction: PredictedIntent): void {
    const fusedPosition = sensorFusionLayer.getFusedPosition();
    if (!fusedPosition) return;

    console.log('[IMS] Auto-activating Anti-Lost Mode based on prediction');

    // Activate with simplified instruction
    const instruction = this.generateLostInstruction(fusedPosition.heading);

    try {
      void instruction;
      antiLostModeEngine.forceActivate();
    } catch (error) {
      console.error('[IMS] Failed to activate Anti-Lost Mode:', error);
    }
  }

  private prepareSafeReturn(prediction: PredictedIntent): void {
    console.log('[IMS] Preparing safe return paths based on prediction');

    // Trigger HomeGuard breadcrumb density increase
    try {
      // HomeGuard engine would need a method to increase breadcrumb recording
      // This is a placeholder for that integration
      console.log('[IMS] Increasing breadcrumb density for safe return');
    } catch (error) {
      console.error('[IMS] Failed to prepare safe return:', error);
    }
  }

  private generateLostInstruction(heading: number): string {
    // Simple cardinal direction instruction
    const cardinalDir = this.headingToCardinal(heading);
    return `Head ${cardinalDir}`;
  }

  private headingToCardinal(heading: number): string {
    const directions = [
      'North',
      'Northeast',
      'East',
      'Southeast',
      'South',
      'Southwest',
      'West',
      'Northwest',
    ];
    const index = Math.round(heading / 45) % 8;
    return directions[index];
  }

  // =====================================================================
  // PUBLIC API
  // =====================================================================

  getCurrentAdjustments(): IntentBasedAdjustments | null {
    return this.currentAdjustments;
  }

  getOptions(): IntentRoutingOptions {
    return { ...this.options };
  }

  updateOptions(updates: Partial<IntentRoutingOptions>): void {
    this.options = { ...this.options, ...updates };
  }

  // Get recommended algorithm based on current prediction
  getRecommendedAlgorithm(): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    if (!this.currentAdjustments) {
      return 'ShadowPath'; // default
    }
    return this.currentAdjustments.recommended_algorithm;
  }

  // Check if specific action should be taken
  shouldReduceRecalculations(): boolean {
    return this.currentAdjustments?.reduce_recalculations || false;
  }

  shouldPrepareSafeReturn(): boolean {
    return this.currentAdjustments?.prepare_safe_return || false;
  }

  shouldActivatePathfinderWaves(): boolean {
    return this.currentAdjustments?.activate_pathfinder_waves || false;
  }

  shouldShowInterestNodes(): boolean {
    return this.currentAdjustments?.show_interest_nodes || false;
  }

  shouldSimplifyUI(): boolean {
    return this.currentAdjustments?.simplify_ui || false;
  }

  getSuggestedAction(): string {
    return this.currentAdjustments?.suggested_action || '';
  }

  // =====================================================================
  // LISTENERS
  // =====================================================================

  addListener(callback: (adjustments: IntentBasedAdjustments) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (adjustments: IntentBasedAdjustments) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  private notifyListeners(adjustments: IntentBasedAdjustments): void {
    this.listeners.forEach(listener => {
      try {
        listener(adjustments);
      } catch (error) {
        console.error('[IMS] Error in listener:', error);
      }
    });
  }

  // =====================================================================
  // ALGORITHM SELECTION HELPER
  // =====================================================================

  selectAlgorithmWithIntent(
    userPreference?: 'ShadowPath' | 'HomeGuard' | 'PathfinderX'
  ): 'ShadowPath' | 'HomeGuard' | 'PathfinderX' {
    // If intent override is disabled, use user preference or default
    if (!this.options.intent_override_enabled) {
      return userPreference || 'ShadowPath';
    }

    // If no current adjustments, use user preference or default
    if (!this.currentAdjustments) {
      return userPreference || 'ShadowPath';
    }

    // Use intent-based recommendation if confidence is high
    if (this.currentAdjustments.algorithm_confidence > 0.7) {
      return this.currentAdjustments.recommended_algorithm;
    }

    // Otherwise, use user preference or default
    return userPreference || 'ShadowPath';
  }
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const intentModelingSystem = IntentModelingSystem.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).intentModelingSystem = intentModelingSystem;
}
