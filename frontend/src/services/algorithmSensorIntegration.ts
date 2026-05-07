// PathFinder V36 - Algorithm Integration with Sensor Fusion Layer
// Enhances ShadowPath, HomeGuard, and PathfinderX with sensor fusion data

import { getSensorFusionLayer } from './sensorFusionLayer';
import type { MotionState } from './sensorFusionLayer';

export interface SensorEnhancedRouteOptions {
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  start: [number, number];
  end: [number, number];
  currentHeading?: number;
  currentSpeed?: number;
  motionState?: MotionState;
  useFusedPosition?: boolean;
}

export interface SensorAdjustments {
  algorithm: string;
  adjustments: {
    anticipation_enabled?: boolean;
    next_node_prediction?: [number, number];
    breadcrumb_confidence_boost?: number;
    scan_radius_multiplier?: number;
    safe_return_urgency?: 'normal' | 'elevated' | 'critical';
    path_refinement_active?: boolean;
  };
  reasoning: string[];
}

/**
 * V36 Integration: ShadowPath + Sensor Fusion
 *
 * Enhancements:
 * - Use heading + motion to anticipate next node
 * - Predict user's next likely movement direction
 * - Prevent wasted recalculations
 */
export function enhanceShadowPathWithSensors(
  routeOptions: SensorEnhancedRouteOptions
): SensorAdjustments {
  const sfl = getSensorFusionLayer();
  const fusedPosition = sfl.getFusedPosition();
  const movementPattern = sfl.getMovementPattern();

  const adjustments: SensorAdjustments = {
    algorithm: 'ShadowPath',
    adjustments: {
      anticipation_enabled: false,
      next_node_prediction: undefined,
      path_refinement_active: false,
    },
    reasoning: [],
  };

  if (!fusedPosition || fusedPosition.confidence_level < 0.5) {
    adjustments.reasoning.push('Low sensor confidence - using standard routing');
    return adjustments;
  }

  // Enable anticipation if user is moving consistently
  if (fusedPosition.motion_state === 'walking' || fusedPosition.motion_state === 'jogging') {
    if (fusedPosition.speed > 0.5 && !movementPattern.erratic_movement) {
      adjustments.adjustments.anticipation_enabled = true;
      adjustments.reasoning.push('Consistent movement detected - enabling node anticipation');

      // Predict next position based on heading and speed
      const predictedDistance = fusedPosition.speed * 3; // 3 seconds ahead
      const nextLat =
        fusedPosition.lat +
        (predictedDistance / 111000) * Math.cos((fusedPosition.heading * Math.PI) / 180);
      const nextLon =
        fusedPosition.lon +
        (predictedDistance / 111000) * Math.sin((fusedPosition.heading * Math.PI) / 180);

      adjustments.adjustments.next_node_prediction = [nextLat, nextLon];
      adjustments.reasoning.push(
        `Predicted position: ${predictedDistance.toFixed(1)}m ahead at ${Math.round(fusedPosition.heading)}°`
      );
    }
  }

  // Enable path refinement for high-confidence scenarios
  if (fusedPosition.confidence_level > 0.7 && fusedPosition.heading !== undefined) {
    adjustments.adjustments.path_refinement_active = true;
    adjustments.reasoning.push('High confidence - using heading for path selection refinement');
  }

  // Handle sudden turns - force recalculation
  if (movementPattern.sudden_turn_detected) {
    adjustments.reasoning.push('Sudden turn detected - recommend immediate recalculation');
  }

  // Handle wrong direction
  if (movementPattern.wrong_direction_detected) {
    adjustments.reasoning.push('Wrong direction movement - recommend route reversal check');
  }

  return adjustments;
}

/**
 * V36 Integration: HomeGuard + Sensor Fusion
 *
 * Enhancements:
 * - Strengthen breadcrumb accuracy using motion state
 * - Improve night-mode safety with ambient-light readings
 * - Auto-switch to safe-return if user movement becomes erratic
 */
export function enhanceHomeGuardWithSensors(
  routeOptions: SensorEnhancedRouteOptions
): SensorAdjustments {
  const sfl = getSensorFusionLayer();
  const fusedPosition = sfl.getFusedPosition();
  const movementPattern = sfl.getMovementPattern();
  const sensorState = sfl.getState();

  const adjustments: SensorAdjustments = {
    algorithm: 'HomeGuard',
    adjustments: {
      breadcrumb_confidence_boost: 1.0,
      safe_return_urgency: 'normal',
    },
    reasoning: [],
  };

  if (!fusedPosition) {
    adjustments.reasoning.push('No sensor fusion data - using standard safety routing');
    return adjustments;
  }

  // Boost breadcrumb confidence based on motion stability
  if (fusedPosition.motion_state === 'walking' && fusedPosition.confidence_level > 0.6) {
    adjustments.adjustments.breadcrumb_confidence_boost = 1.3;
    adjustments.reasoning.push('Stable walking motion - breadcrumb confidence +30%');
  }

  // Reduce breadcrumb confidence if motion is erratic
  if (movementPattern.erratic_movement || fusedPosition.motion_state === 'running') {
    adjustments.adjustments.breadcrumb_confidence_boost = 0.7;
    adjustments.reasoning.push('Erratic/fast movement - breadcrumb confidence -30%');
  }

  // Adjust safety based on ambient light
  if (sensorState.raw_sensor_data?.ambientLight !== undefined) {
    const lightLevel = sensorState.raw_sensor_data.ambientLight;

    if (lightLevel < 10) {
      // Dark conditions
      adjustments.adjustments.breadcrumb_confidence_boost! *= 1.2;
      adjustments.reasoning.push('Dark conditions detected - safety priority increased');
    } else if (lightLevel > 10000) {
      // Very bright conditions (possibly disorienting)
      adjustments.adjustments.breadcrumb_confidence_boost! *= 1.1;
      adjustments.reasoning.push('Very bright conditions - slight safety boost');
    }
  }

  // Elevate safe-return urgency if movement becomes erratic
  if (movementPattern.erratic_movement) {
    adjustments.adjustments.safe_return_urgency = 'elevated';
    adjustments.reasoning.push('Erratic movement detected - elevated safe-return priority');
  }

  // Critical urgency if multiple concerning patterns
  if (
    movementPattern.stop_and_start_detected &&
    movementPattern.direction_changes_per_minute > 10 &&
    fusedPosition.confidence_level < 0.4
  ) {
    adjustments.adjustments.safe_return_urgency = 'critical';
    adjustments.reasoning.push('Multiple concerning patterns - CRITICAL safe-return urgency');
  }

  // Auto-trigger safe-return consideration
  if (adjustments.adjustments.safe_return_urgency === 'critical') {
    adjustments.reasoning.push('RECOMMEND: Switch to safe-return mode immediately');
  }

  return adjustments;
}

/**
 * V36 Integration: PathfinderX + Sensor Fusion
 *
 * Enhancements:
 * - Use device movement to start/stop exploration waves
 * - If user is running, reduce scan radius
 * - If walking slowly, increase scan density
 */
export function enhancePathfinderXWithSensors(
  routeOptions: SensorEnhancedRouteOptions
): SensorAdjustments {
  const sfl = getSensorFusionLayer();
  const fusedPosition = sfl.getFusedPosition();
  const movementPattern = sfl.getMovementPattern();

  const adjustments: SensorAdjustments = {
    algorithm: 'PathfinderX',
    adjustments: {
      scan_radius_multiplier: 1.0,
    },
    reasoning: [],
  };

  if (!fusedPosition) {
    adjustments.reasoning.push('No sensor fusion data - using standard exploration');
    return adjustments;
  }

  // Adjust scan radius based on motion state
  switch (fusedPosition.motion_state) {
    case 'stationary':
      adjustments.adjustments.scan_radius_multiplier = 1.5;
      adjustments.reasoning.push('Stationary - increased scan radius (+50%)');
      break;

    case 'walking':
      if (fusedPosition.speed < 1.0) {
        // Slow walking - more thorough exploration
        adjustments.adjustments.scan_radius_multiplier = 1.3;
        adjustments.reasoning.push('Slow walking - increased scan density (+30%)');
      } else {
        // Normal walking - standard exploration
        adjustments.adjustments.scan_radius_multiplier = 1.0;
        adjustments.reasoning.push('Normal walking - standard exploration');
      }
      break;

    case 'jogging':
      adjustments.adjustments.scan_radius_multiplier = 0.8;
      adjustments.reasoning.push('Jogging - reduced scan radius (-20%)');
      break;

    case 'running':
      adjustments.adjustments.scan_radius_multiplier = 0.6;
      adjustments.reasoning.push('Running - focused scan radius (-40%)');
      break;

    default:
      adjustments.reasoning.push('Unknown motion state - standard exploration');
  }

  // Pause exploration if user is exhibiting erratic movement
  if (movementPattern.erratic_movement) {
    adjustments.adjustments.scan_radius_multiplier = 0.5;
    adjustments.reasoning.push('Erratic movement - pausing deep exploration');
  }

  // Stop exploration waves if frequent direction changes (user is lost/confused)
  if (movementPattern.direction_changes_per_minute > 15) {
    adjustments.adjustments.scan_radius_multiplier = 0.3;
    adjustments.reasoning.push(
      'High direction changes - minimal exploration (user may be disoriented)'
    );
  }

  // Boost exploration if user is confidently moving in one direction
  if (
    fusedPosition.confidence_level > 0.8 &&
    fusedPosition.speed > 0.8 &&
    !movementPattern.sudden_turn_detected &&
    movementPattern.direction_changes_per_minute < 3
  ) {
    adjustments.adjustments.scan_radius_multiplier! *= 1.2;
    adjustments.reasoning.push('Confident directional movement - boosted exploration (+20%)');
  }

  return adjustments;
}

/**
 * V36 Master Integration Function
 *
 * Applies sensor-based adjustments to any algorithm
 */
export function applySensorFusionToAlgorithm(
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX',
  routeOptions: SensorEnhancedRouteOptions
): SensorAdjustments {
  const sfl = getSensorFusionLayer();

  // Ensure sensor fusion is active
  if (!sfl.getState().isActive) {
    console.warn('Sensor Fusion Layer not active - skipping enhancements');
    return {
      algorithm,
      adjustments: {},
      reasoning: ['Sensor Fusion Layer inactive'],
    };
  }

  // Apply algorithm-specific enhancements
  switch (algorithm) {
    case 'ShadowPath':
      return enhanceShadowPathWithSensors(routeOptions);

    case 'HomeGuard':
      return enhanceHomeGuardWithSensors(routeOptions);

    case 'PathfinderX':
      return enhancePathfinderXWithSensors(routeOptions);

    default:
      return {
        algorithm,
        adjustments: {},
        reasoning: ['Unknown algorithm'],
      };
  }
}

/**
 * Helper: Check if sensor fusion should override algorithm choice
 *
 * Returns recommended algorithm based on sensor data
 */
export function getSensorRecommendedAlgorithm(): {
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  confidence: number;
  reasoning: string;
} | null {
  const sfl = getSensorFusionLayer();
  const fusedPosition = sfl.getFusedPosition();
  const movementPattern = sfl.getMovementPattern();
  const sensorState = sfl.getState();

  if (!fusedPosition) {
    return null;
  }

  // Critical safety conditions -> HomeGuard
  if (
    movementPattern.erratic_movement ||
    fusedPosition.confidence_level < 0.3 ||
    (sensorState.raw_sensor_data?.ambientLight !== undefined &&
      sensorState.raw_sensor_data.ambientLight < 5)
  ) {
    return {
      algorithm: 'HomeGuard',
      confidence: 0.9,
      reasoning: 'Critical safety conditions detected - prioritizing safe routing',
    };
  }

  // High confidence, directional movement -> PathfinderX for exploration
  if (
    fusedPosition.confidence_level > 0.8 &&
    fusedPosition.speed > 1.0 &&
    movementPattern.direction_changes_per_minute < 3
  ) {
    return {
      algorithm: 'PathfinderX',
      confidence: 0.75,
      reasoning: 'Confident directional movement - optimal for exploration',
    };
  }

  // Standard conditions -> ShadowPath
  if (fusedPosition.confidence_level > 0.5 && fusedPosition.motion_state === 'walking') {
    return {
      algorithm: 'ShadowPath',
      confidence: 0.7,
      reasoning: 'Standard walking conditions - balanced routing recommended',
    };
  }

  return null;
}

export default {
  enhanceShadowPathWithSensors,
  enhanceHomeGuardWithSensors,
  enhancePathfinderXWithSensors,
  applySensorFusionToAlgorithm,
  getSensorRecommendedAlgorithm,
};
