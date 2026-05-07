/**
 * PATHFINDER V37 — BEHAVIOR PREDICTION ENGINE (BPE)
 * 
 * Predicts user intent by analyzing movement patterns, location history,
 * speed changes, familiarity zones, environment context, and sensor data.
 * Enables proactive navigation assistance before explicit user input.
 */

import { sensorFusionLayer, FusedPosition, SensorProfile } from './sensorFusionLayer';
import { familiarityHeatmapEngine } from './familiarityHeatmapEngine';
import { ambientModeEngine } from './ambientModeEngine';

// =====================================================================
// INTERFACES
// =====================================================================

export interface PredictedIntent {
  likely_destination: { lat: number; lon: number; confidence: number } | null;
  route_type: 'direct' | 'safe' | 'exploratory' | 'return' | 'unknown';
  safety_need: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  explore_likelihood: number; // 0-1
  friend_meetup_probability: number; // 0-1
  return_intent_strength: number; // 0-1
  lost_likelihood: number; // 0-1
  confidence_level: number; // 0-1 overall prediction confidence
  primary_intent: IntentCategory;
  intent_scores: IntentScores;
  reasoning: string[];
}

export type IntentCategory = 
  | 'route' 
  | 'safe_return' 
  | 'exploration' 
  | 'friend_meetup' 
  | 'lost' 
  | 'stationary'
  | 'unknown';

export interface IntentScores {
  route: number; // 0-1
  safe_return: number; // 0-1
  exploration: number; // 0-1
  friend_meetup: number; // 0-1
  lost: number; // 0-1
  stationary: number; // 0-1
}

export interface MovementPattern {
  direction_consistency: number; // 0-1, high = consistent direction
  speed_variance: number; // m/s² variance
  heading_stability: number; // 0-1, high = stable heading
  path_straightness: number; // 0-1, high = straight path
  circular_movement_detected: boolean;
  stop_count_per_minute: number;
  direction_changes_per_minute: number;
  avg_speed: number; // m/s
  distance_from_start: number; // meters
}

export interface LocationContext {
  current_familiarity: number; // 0-1
  recent_zone_visits: number; // count in last hour
  home_zone_proximity: number; // 0-1, 1 = at home
  friend_proximity: number; // meters to nearest friend, -1 if no friends
  safety_level: number; // 0-1
  ambient_light: number; // lux
  battery_level: number; // 0-100
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface BehaviorWindow {
  positions: Array<{ lat: number; lon: number; timestamp: number }>;
  headings: number[];
  speeds: number[];
  timestamps: number[];
  maxSize: number;
}

export interface BPEConfiguration {
  prediction_interval_ms: number; // how often to predict
  behavior_window_size: number; // how many samples to analyze
  intent_smoothing_factor: number; // 0-1, higher = more smoothing
  confidence_threshold: number; // 0-1, min confidence to surface predictions
  lost_detection_sensitivity: number; // 0-1, higher = more sensitive
  exploration_detection_sensitivity: number; // 0-1
  enable_friend_tracking: boolean;
}

// =====================================================================
// BEHAVIOR PREDICTION ENGINE
// =====================================================================

export class BehaviorPredictionEngine {
  private static instance: BehaviorPredictionEngine;
  
  private config: BPEConfiguration = {
    prediction_interval_ms: 2000, // predict every 2 seconds
    behavior_window_size: 30, // analyze last 30 samples (60 seconds at 2s interval)
    intent_smoothing_factor: 0.7, // smooth intent scores over time
    confidence_threshold: 0.6, // only surface predictions above 60% confidence
    lost_detection_sensitivity: 0.7,
    exploration_detection_sensitivity: 0.6,
    enable_friend_tracking: true,
  };

  private behaviorWindow: BehaviorWindow = {
    positions: [],
    headings: [],
    speeds: [],
    timestamps: [],
    maxSize: 30,
  };

  private previousIntentScores: IntentScores = {
    route: 0,
    safe_return: 0,
    exploration: 0,
    friend_meetup: 0,
    lost: 0,
    stationary: 0,
  };

  private currentPrediction: PredictedIntent | null = null;
  private predictionInterval: number | null = null;
  private isRunning = false;

  private listeners: Array<(prediction: PredictedIntent) => void> = [];

  // Friend tracking
  private friendPositions: Map<string, { lat: number; lon: number; timestamp: number }> = new Map();

  private constructor() {}

  static getInstance(): BehaviorPredictionEngine {
    if (!BehaviorPredictionEngine.instance) {
      BehaviorPredictionEngine.instance = new BehaviorPredictionEngine();
    }
    return BehaviorPredictionEngine.instance;
  }

  // =====================================================================
  // LIFECYCLE
  // =====================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[BPE] Already running');
      return;
    }

    console.log('[BPE] Starting Behavior Prediction Engine');
    this.isRunning = true;

    // Start prediction loop
    this.predictionInterval = window.setInterval(() => {
      this.updateBehaviorWindow();
      this.runPrediction();
    }, this.config.prediction_interval_ms);

    // Initial prediction
    this.updateBehaviorWindow();
    this.runPrediction();
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[BPE] Stopping Behavior Prediction Engine');
    this.isRunning = false;

    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
  }

  // =====================================================================
  // BEHAVIOR WINDOW MANAGEMENT
  // =====================================================================

  private updateBehaviorWindow(): void {
    const fusedPosition = sensorFusionLayer.getFusedPosition();
    if (!fusedPosition) return;

    const now = Date.now();

    // Add current position
    this.behaviorWindow.positions.push({
      lat: fusedPosition.latitude,
      lon: fusedPosition.longitude,
      timestamp: now,
    });

    this.behaviorWindow.headings.push(fusedPosition.heading);
    this.behaviorWindow.speeds.push(fusedPosition.speed);
    this.behaviorWindow.timestamps.push(now);

    // Trim to max size
    if (this.behaviorWindow.positions.length > this.behaviorWindow.maxSize) {
      this.behaviorWindow.positions.shift();
      this.behaviorWindow.headings.shift();
      this.behaviorWindow.speeds.shift();
      this.behaviorWindow.timestamps.shift();
    }
  }

  // =====================================================================
  // PREDICTION LOGIC
  // =====================================================================

  private runPrediction(): void {
    if (this.behaviorWindow.positions.length < 3) {
      // Not enough data yet
      return;
    }

    const movementPattern = this.analyzeMovementPattern();
    const locationContext = this.analyzeLocationContext();
    const intentScores = this.calculateIntentScores(movementPattern, locationContext);
    
    // Smooth intent scores
    const smoothedScores = this.smoothIntentScores(intentScores);
    
    // Determine primary intent
    const primaryIntent = this.determinePrimaryIntent(smoothedScores);
    
    // Calculate overall confidence
    const confidenceLevel = this.calculateOverallConfidence(smoothedScores, movementPattern, locationContext);
    
    // Build predicted intent
    const prediction: PredictedIntent = {
      likely_destination: this.predictDestination(primaryIntent, movementPattern),
      route_type: this.determineRouteType(primaryIntent, locationContext),
      safety_need: this.determineSafetyNeed(locationContext, smoothedScores),
      explore_likelihood: smoothedScores.exploration,
      friend_meetup_probability: smoothedScores.friend_meetup,
      return_intent_strength: smoothedScores.safe_return,
      lost_likelihood: smoothedScores.lost,
      confidence_level: confidenceLevel,
      primary_intent: primaryIntent,
      intent_scores: smoothedScores,
      reasoning: this.generateReasoning(primaryIntent, smoothedScores, movementPattern, locationContext),
    };

    this.currentPrediction = prediction;
    this.previousIntentScores = smoothedScores;

    // Notify listeners
    this.notifyListeners(prediction);
  }

  // =====================================================================
  // MOVEMENT PATTERN ANALYSIS
  // =====================================================================

  private analyzeMovementPattern(): MovementPattern {
    const positions = this.behaviorWindow.positions;
    const headings = this.behaviorWindow.headings;
    const speeds = this.behaviorWindow.speeds;

    if (positions.length < 2) {
      return {
        direction_consistency: 0,
        speed_variance: 0,
        heading_stability: 0,
        path_straightness: 0,
        circular_movement_detected: false,
        stop_count_per_minute: 0,
        direction_changes_per_minute: 0,
        avg_speed: 0,
        distance_from_start: 0,
      };
    }

    // Direction consistency (how consistent is the heading)
    const headingVariance = this.calculateVariance(headings);
    const direction_consistency = Math.max(0, 1 - headingVariance / 180); // normalize

    // Speed variance
    const speed_variance = this.calculateVariance(speeds);

    // Heading stability (from sensor fusion)
    const recentHeadings = headings.slice(-10);
    const headingChanges = recentHeadings.slice(1).map((h, i) => Math.abs(h - recentHeadings[i]));
    const avgHeadingChange = headingChanges.reduce((sum, c) => sum + c, 0) / headingChanges.length;
    const heading_stability = Math.max(0, 1 - avgHeadingChange / 90);

    // Path straightness (how straight is the path)
    const startPos = positions[0];
    const endPos = positions[positions.length - 1];
    const directDistance = this.calculateDistance(startPos.lat, startPos.lon, endPos.lat, endPos.lon);
    let totalDistance = 0;
    for (let i = 1; i < positions.length; i++) {
      totalDistance += this.calculateDistance(
        positions[i - 1].lat,
        positions[i - 1].lon,
        positions[i].lat,
        positions[i].lon
      );
    }
    const path_straightness = totalDistance > 0 ? directDistance / totalDistance : 0;

    // Circular movement detection
    const circular_movement_detected = this.detectCircularMovement(positions, headings);

    // Stop count (speed < 0.5 m/s)
    const stopCount = speeds.filter(s => s < 0.5).length;
    const durationMinutes = (this.behaviorWindow.timestamps[this.behaviorWindow.timestamps.length - 1] - 
                              this.behaviorWindow.timestamps[0]) / 60000;
    const stop_count_per_minute = durationMinutes > 0 ? stopCount / durationMinutes : 0;

    // Direction changes (heading change > 45 degrees)
    const directionChangeCount = headingChanges.filter(c => c > 45).length;
    const direction_changes_per_minute = durationMinutes > 0 ? directionChangeCount / durationMinutes : 0;

    // Average speed
    const avg_speed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;

    // Distance from start
    const distance_from_start = this.calculateDistance(
      startPos.lat,
      startPos.lon,
      endPos.lat,
      endPos.lon
    );

    return {
      direction_consistency,
      speed_variance,
      heading_stability,
      path_straightness,
      circular_movement_detected,
      stop_count_per_minute,
      direction_changes_per_minute,
      avg_speed,
      distance_from_start,
    };
  }

  // =====================================================================
  // LOCATION CONTEXT ANALYSIS
  // =====================================================================

  private analyzeLocationContext(): LocationContext {
    const fusedPosition = sensorFusionLayer.getFusedPosition();
    const sensorProfile = sensorFusionLayer.getSensorProfile();

    if (!fusedPosition) {
      return {
        current_familiarity: 0,
        recent_zone_visits: 0,
        home_zone_proximity: 0,
        friend_proximity: -1,
        safety_level: 0.5,
        ambient_light: 100,
        battery_level: 100,
        time_of_day: this.getTimeOfDay(),
      };
    }

    // Familiarity
    const current_familiarity = familiarityHeatmapEngine.queryFamiliarity(
      fusedPosition.latitude,
      fusedPosition.longitude
    );

    // Recent zone visits (placeholder - would need history tracking)
    const recent_zone_visits = 0;

    // Home zone proximity (placeholder - would need home location)
    const home_zone_proximity = 0;

    // Friend proximity
    const friend_proximity = this.getNearestFriendDistance(fusedPosition.latitude, fusedPosition.longitude);

    // Safety level (from ambient mode or default)
    const ambientSignals = ambientModeEngine.getCurrentSignals();
    const safety_level = ambientSignals ? (ambientSignals.safety_index || 0.5) : 0.5;

    // Ambient light
    const ambient_light = sensorProfile.ambient_light || 100;

    // Battery level (placeholder - would need battery API)
    const battery_level = 100;

    // Time of day
    const time_of_day = this.getTimeOfDay();

    return {
      current_familiarity,
      recent_zone_visits,
      home_zone_proximity,
      friend_proximity,
      safety_level,
      ambient_light,
      battery_level,
      time_of_day,
    };
  }

  // =====================================================================
  // INTENT SCORE CALCULATION
  // =====================================================================

  private calculateIntentScores(
    movement: MovementPattern,
    context: LocationContext
  ): IntentScores {
    const scores: IntentScores = {
      route: 0,
      safe_return: 0,
      exploration: 0,
      friend_meetup: 0,
      lost: 0,
      stationary: 0,
    };

    // ROUTE INTENT: consistent direction, stable heading, moderate speed, straight path
    scores.route = 
      movement.direction_consistency * 0.3 +
      movement.heading_stability * 0.3 +
      movement.path_straightness * 0.2 +
      (movement.avg_speed > 0.5 && movement.avg_speed < 2.5 ? 0.2 : 0);

    // SAFE RETURN INTENT: high deviation, low safety, low battery, circular movement, low familiarity
    scores.safe_return = 
      (1 - movement.path_straightness) * 0.2 +
      (1 - context.safety_level) * 0.3 +
      (context.battery_level < 30 ? 0.2 : 0) +
      (movement.circular_movement_detected ? 0.2 : 0) +
      (1 - context.current_familiarity) * 0.1;

    // EXPLORATION INTENT: slow speed, frequent stops, cluster movement, high familiarity (exploring known area)
    scores.exploration = 
      (movement.avg_speed < 1.0 ? 0.3 : 0) +
      (movement.stop_count_per_minute > 1 ? 0.2 : 0) +
      (movement.distance_from_start < 100 ? 0.2 : 0) +
      (context.current_familiarity > 0.5 ? 0.3 : 0);

    // FRIEND MEETUP INTENT: friend proximity decreasing, consistent direction toward friend
    if (context.friend_proximity > 0 && context.friend_proximity < 500) {
      scores.friend_meetup = Math.max(0, 1 - context.friend_proximity / 500);
    }

    // LOST INTENT: circular movement, high direction changes, low heading stability, high drift
    scores.lost = 
      (movement.circular_movement_detected ? 0.3 : 0) +
      (movement.direction_changes_per_minute > 3 ? 0.3 : 0) +
      (1 - movement.heading_stability) * 0.2 +
      (1 - context.current_familiarity) * 0.2;

    // Adjust lost intent by sensitivity
    scores.lost = Math.min(1, scores.lost * (1 + this.config.lost_detection_sensitivity));

    // STATIONARY INTENT: very low speed, high stop count
    scores.stationary = 
      (movement.avg_speed < 0.3 ? 0.5 : 0) +
      (movement.stop_count_per_minute > 2 ? 0.5 : 0);

    // Normalize scores
    return this.normalizeIntentScores(scores);
  }

  private normalizeIntentScores(scores: IntentScores): IntentScores {
    // Clamp each score to [0, 1]
    Object.keys(scores).forEach(key => {
      scores[key as keyof IntentScores] = Math.max(0, Math.min(1, scores[key as keyof IntentScores]));
    });
    return scores;
  }

  // =====================================================================
  // INTENT SMOOTHING
  // =====================================================================

  private smoothIntentScores(current: IntentScores): IntentScores {
    const smoothed: IntentScores = { ...current };
    const factor = this.config.intent_smoothing_factor;

    Object.keys(smoothed).forEach(key => {
      const k = key as keyof IntentScores;
      smoothed[k] = factor * this.previousIntentScores[k] + (1 - factor) * current[k];
    });

    return smoothed;
  }

  // =====================================================================
  // PRIMARY INTENT DETERMINATION
  // =====================================================================

  private determinePrimaryIntent(scores: IntentScores): IntentCategory {
    // Find highest scoring intent
    let maxScore = 0;
    let primaryIntent: IntentCategory = 'unknown';

    Object.keys(scores).forEach(key => {
      const score = scores[key as keyof IntentScores];
      if (score > maxScore) {
        maxScore = score;
        primaryIntent = key as IntentCategory;
      }
    });

    // Require minimum score threshold
    if (maxScore < 0.3) {
      return 'unknown';
    }

    return primaryIntent;
  }

  // =====================================================================
  // SUPPORTING FUNCTIONS
  // =====================================================================

  private calculateOverallConfidence(
    scores: IntentScores,
    movement: MovementPattern,
    context: LocationContext
  ): number {
    // Confidence is higher when:
    // - Primary intent score is high
    // - Movement pattern is clear
    // - Sensor data is reliable

    const primaryScore = Math.max(...Object.values(scores));
    const movementClarity = (movement.direction_consistency + movement.heading_stability) / 2;
    const sensorReliability = sensorFusionLayer.getFusedPosition()?.confidence || 0.5;

    return (primaryScore * 0.5 + movementClarity * 0.3 + sensorReliability * 0.2);
  }

  private predictDestination(
    intent: IntentCategory,
    movement: MovementPattern
  ): { lat: number; lon: number; confidence: number } | null {
    if (intent !== 'route' || this.behaviorWindow.positions.length < 5) {
      return null;
    }

    // Simple linear extrapolation
    const positions = this.behaviorWindow.positions;
    const lastPos = positions[positions.length - 1];
    const prevPos = positions[positions.length - 5];

    const deltaLat = lastPos.lat - prevPos.lat;
    const deltaLon = lastPos.lon - prevPos.lon;

    // Project 5 minutes ahead at current rate
    const projectionFactor = 5;
    const predictedLat = lastPos.lat + deltaLat * projectionFactor;
    const predictedLon = lastPos.lon + deltaLon * projectionFactor;

    return {
      lat: predictedLat,
      lon: predictedLon,
      confidence: movement.direction_consistency,
    };
  }

  private determineRouteType(intent: IntentCategory, context: LocationContext): PredictedIntent['route_type'] {
    if (intent === 'route' && context.safety_level > 0.7) return 'direct';
    if (intent === 'safe_return') return 'return';
    if (intent === 'exploration') return 'exploratory';
    if (context.safety_level < 0.4) return 'safe';
    return 'unknown';
  }

  private determineSafetyNeed(
    context: LocationContext,
    scores: IntentScores
  ): PredictedIntent['safety_need'] {
    const safetyScore = 
      (1 - context.safety_level) * 0.4 +
      scores.lost * 0.3 +
      scores.safe_return * 0.2 +
      (context.battery_level < 20 ? 0.1 : 0);

    if (safetyScore > 0.8) return 'critical';
    if (safetyScore > 0.6) return 'high';
    if (safetyScore > 0.4) return 'moderate';
    if (safetyScore > 0.2) return 'low';
    return 'none';
  }

  private generateReasoning(
    primaryIntent: IntentCategory,
    scores: IntentScores,
    movement: MovementPattern,
    context: LocationContext
  ): string[] {
    const reasons: string[] = [];

    if (primaryIntent === 'route') {
      reasons.push(`Consistent directional movement (${(scores.route * 100).toFixed(0)}% confidence)`);
      if (movement.heading_stability > 0.7) reasons.push('Stable heading detected');
      if (movement.path_straightness > 0.6) reasons.push('Path appears direct');
    }

    if (primaryIntent === 'safe_return') {
      reasons.push(`Safe return intent detected (${(scores.safe_return * 100).toFixed(0)}% confidence)`);
      if (context.safety_level < 0.4) reasons.push('Low safety area');
      if (context.battery_level < 30) reasons.push('Low battery level');
      if (movement.circular_movement_detected) reasons.push('Circular movement pattern');
    }

    if (primaryIntent === 'exploration') {
      reasons.push(`Exploratory behavior (${(scores.exploration * 100).toFixed(0)}% confidence)`);
      if (movement.avg_speed < 1.0) reasons.push('Slow wandering detected');
      if (movement.stop_count_per_minute > 1) reasons.push('Frequent stops');
    }

    if (primaryIntent === 'friend_meetup') {
      reasons.push(`Friend meetup likely (${(scores.friend_meetup * 100).toFixed(0)}% confidence)`);
      if (context.friend_proximity > 0 && context.friend_proximity < 500) {
        reasons.push(`Friend ${context.friend_proximity.toFixed(0)}m away`);
      }
    }

    if (primaryIntent === 'lost') {
      reasons.push(`Lost behavior detected (${(scores.lost * 100).toFixed(0)}% confidence)`);
      if (movement.circular_movement_detected) reasons.push('Circular movement');
      if (movement.direction_changes_per_minute > 3) reasons.push('Erratic direction changes');
    }

    if (primaryIntent === 'stationary') {
      reasons.push(`User appears stationary (${(scores.stationary * 100).toFixed(0)}% confidence)`);
    }

    return reasons;
  }

  // =====================================================================
  // HELPER FUNCTIONS
  // =====================================================================

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

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

  private detectCircularMovement(
    positions: Array<{ lat: number; lon: number; timestamp: number }>,
    headings: number[]
  ): boolean {
    if (positions.length < 10) return false;

    // Check if user returns near starting position with high direction change
    const startPos = positions[0];
    const endPos = positions[positions.length - 1];
    const distanceFromStart = this.calculateDistance(
      startPos.lat,
      startPos.lon,
      endPos.lat,
      endPos.lon
    );

    // Check total heading change
    let totalHeadingChange = 0;
    for (let i = 1; i < headings.length; i++) {
      totalHeadingChange += Math.abs(headings[i] - headings[i - 1]);
    }

    // Circular if returned near start with > 270 degrees heading change
    return distanceFromStart < 50 && totalHeadingChange > 270;
  }

  private getTimeOfDay(): LocationContext['time_of_day'] {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private getNearestFriendDistance(lat: number, lon: number): number {
    if (!this.config.enable_friend_tracking || this.friendPositions.size === 0) {
      return -1;
    }

    let minDistance = Infinity;
    this.friendPositions.forEach(friend => {
      const distance = this.calculateDistance(lat, lon, friend.lat, friend.lon);
      if (distance < minDistance) {
        minDistance = distance;
      }
    });

    return minDistance === Infinity ? -1 : minDistance;
  }

  // =====================================================================
  // FRIEND TRACKING
  // =====================================================================

  updateFriendPosition(friendId: string, lat: number, lon: number): void {
    this.friendPositions.set(friendId, {
      lat,
      lon,
      timestamp: Date.now(),
    });
  }

  clearFriendPositions(): void {
    this.friendPositions.clear();
  }

  // =====================================================================
  // LISTENERS
  // =====================================================================

  addListener(callback: (prediction: PredictedIntent) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (prediction: PredictedIntent) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  private notifyListeners(prediction: PredictedIntent): void {
    this.listeners.forEach(listener => {
      try {
        listener(prediction);
      } catch (error) {
        console.error('[BPE] Error in listener:', error);
      }
    });
  }

  // =====================================================================
  // PUBLIC GETTERS
  // =====================================================================

  getCurrentPrediction(): PredictedIntent | null {
    return this.currentPrediction;
  }

  getConfiguration(): BPEConfiguration {
    return { ...this.config };
  }

  updateConfiguration(updates: Partial<BPEConfiguration>): void {
    this.config = { ...this.config, ...updates };
    
    // Update behavior window size if changed
    if (updates.behavior_window_size) {
      this.behaviorWindow.maxSize = updates.behavior_window_size;
    }

    // Restart prediction interval if interval changed
    if (updates.prediction_interval_ms && this.isRunning) {
      if (this.predictionInterval) {
        clearInterval(this.predictionInterval);
      }
      this.predictionInterval = window.setInterval(() => {
        this.updateBehaviorWindow();
        this.runPrediction();
      }, this.config.prediction_interval_ms);
    }
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const behaviorPredictionEngine = BehaviorPredictionEngine.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).behaviorPredictionEngine = behaviorPredictionEngine;
}
