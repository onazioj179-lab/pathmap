// PathFinder V29 - Backend API Service Layer
// Complete integration between frontend UI and backend routing logic
// V30 Enhancement: Added visualization metadata support
// V32 Enhancement: Added timing instrumentation

import type { VisualizationMetadata } from './visualization';
import { getTimeEngine } from './timeEngine';

export interface RouteRequest {
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  profile?: 'walking' | 'driving' | 'offroad';
  speed?: number;
  elev_weight?: number;
  include_visualization?: boolean; // V30: Request visualization metadata
  // V35: Advanced safety options
  include_v35_data?: boolean;
  ambient_mode_override?: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  battery_aware?: boolean;
  // V36: Sensor fusion data
  fused_position?: any;
  motion_state?: string;
  heading?: number;
  sensor_confidence?: number;
  ambient_light?: number;
  // V37: Behavior prediction data
  predicted_intent?: any;
  intent_adjustments?: any;
  primary_intent?: string;
  intent_confidence?: number;
}

export interface RouteResponse {
  path: [number, number][];
  steps: number;
  visited: number;
  cost: number;
  weighted_cost: number;
  safety_score: number;
  distance: number;
  time: number;
  algorithm: string;
  visualization?: VisualizationMetadata; // V30: Algorithm reveal data
  // V32: Timing metadata
  timestamp_start?: number;
  timestamp_end?: number;
  duration_ms?: number;
  latency_ms?: number;
  processing_time_ms?: number;
  // V35: Advanced Safety & Location metadata
  device_gps_accuracy?: 'high' | 'medium' | 'low';
  battery_level?: number;
  ambient_mode_signal?: boolean;
  familiarity_score?: number;
  drift_correction_applied?: boolean;
  micro_optimization_data?: any;
  // V36: Sensor fusion metadata
  fused_position?: any;
  motion_state?: string;
  heading?: number;
  confidence_level?: number;
  ambient_light?: number;
  gps_accuracy?: number;
  sensor_profile?: any;
  // V37: Behavior prediction metadata
  predicted_intent?: any;
  intent_adjustments?: any;
  algorithm_recommendation?: string;
  intent_override_applied?: boolean;
}

export interface SafeReturnRequest {
  current_lat: number;
  current_lon: number;
  breadcrumb_trail?: [number, number][];
  profile?: 'walking' | 'driving' | 'offroad';
}

export interface SafeReturnResponse {
  main_route: RouteResponse;
  backup_routes: RouteResponse[];
  safety_score: number;
  routes: RouteResponse[];
  // V32: Timing metadata
  timestamp_start?: number;
  timestamp_end?: number;
  duration_ms?: number;
  processing_time_ms?: number;
  // V35: Advanced Safety metadata
  device_gps_accuracy?: 'high' | 'medium' | 'low';
  battery_level?: number;
  ambient_mode_signal?: boolean;
  familiarity_score?: number;
  drift_correction_applied?: boolean;
}

export interface CompareRequest {
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  algorithms: string[];
  profile?: 'walking' | 'driving' | 'offroad';
  include_visualization?: boolean; // V30: Request visualization metadata
}

export interface CompareResponse {
  results: RouteResponse[];
  winner: string;
  comparison_metrics: {
    fastest: string;
    safest: string;
    shortest: string;
  };
  // V32: Timing metadata
  timestamp_start?: number;
  timestamp_end?: number;
  duration_ms?: number;
  processing_time_ms?: number;
  // V35: Advanced Safety metadata
  device_gps_accuracy?: 'high' | 'medium' | 'low';
  battery_level?: number;
  ambient_mode_signal?: boolean;
  familiarity_score?: number;
}

export interface ExploreRequest {
  start_lat: number;
  start_lon: number;
  radius?: number;
  max_points?: number;
}

export interface ExploreResponse {
  exploration_paths: [number, number][][];
  zone_map: any;
  landmarks: Array<{
    lat: number;
    lon: number;
    name: string;
    type: string;
  }>;
  coverage_score: number;
  // V32: Timing metadata
  timestamp_start?: number;
  timestamp_end?: number;
  duration_ms?: number;
  processing_time_ms?: number;
  // V35: Advanced Safety metadata
  device_gps_accuracy?: 'high' | 'medium' | 'low';
  battery_level?: number;
  ambient_mode_signal?: boolean;
  familiarity_score?: number;
}

export interface LiveRouteRequest {
  user_lat: number;
  user_lon: number;
  friend_lat: number;
  friend_lon: number;
  algorithm?: string;
}

export interface LiveRouteResponse {
  meetup_route: RouteResponse;
  predicted_meet_point: [number, number];
  dynamic_eta: number;
  user_path: [number, number][];
  friend_path: [number, number][];
  // V32: Timing metadata
  timestamp_start?: number;
  timestamp_end?: number;
  duration_ms?: number;
  processing_time_ms?: number;
  // V35: Friend ETA data
  friend_eta_data?: {
    user_movement_vector: { velocity: number; bearing: number; acceleration: number };
    friend_movement_vector: { velocity: number; bearing: number; acceleration: number };
    meet_point_confidence: number;
    user_eta: number;
    friend_eta: number;
  };
}

// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 1;

// Utility: Fetch with timeout and retry
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (retries > 0 && error instanceof Error) {
      console.warn(`Retrying request to ${url}... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchWithRetry(url, options, retries - 1);
    }

    throw error;
  }
}

// Core API Functions

export async function fetchRoute(request: RouteRequest): Promise<RouteResponse> {
  const url = `${API_BASE_URL}/route`;
  const timeEngine = getTimeEngine();
  
  // V32: Start timing
  const timingId = timeEngine.startEvent('route_calculation', {
    algorithm: request.algorithm,
  });
  const requestStartTime = performance.now();
  
  try {
    // V35: Gather additional data if requested
    const v35Data = request.include_v35_data ? gatherV35Data() : {};
    
    const requestBody = {
      start: [request.start_lat, request.start_lon],
      end: [request.end_lat, request.end_lon],
      algorithm: request.ambient_mode_override || request.algorithm, // V35: Allow ambient mode override
      profile: request.profile || 'walking',
      speed: request.speed || 1.0,
      elev_weight: request.elev_weight || 1.0,
      // V35: Include V35 data in request
      ...v35Data
    };
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    // V32: Calculate timing metrics
    const requestEndTime = performance.now();
    const roundtripTime = requestEndTime - requestStartTime;
    const backendDuration = data.duration_ms || data.processing_time_ms;
    
    timeEngine.endEvent(timingId, true, {
      backendDuration,
      roundtripTime,
    });
    
    // Transform backend response to frontend format
    return {
      path: data.path || [],
      steps: data.steps || 0,
      visited: data.visited || 0,
      cost: data.cost || 0,
      weighted_cost: data.weighted_cost || 0,
      safety_score: data.safety_score || 100,
      distance: data.distance || 0,
      time: data.time || 0,
      algorithm: request.algorithm,
      // V32: Include timing metadata
      timestamp_start: data.timestamp_start,
      timestamp_end: data.timestamp_end,
      duration_ms: data.duration_ms,
      latency_ms: roundtripTime,
      processing_time_ms: data.processing_time_ms,
      // V35: Include V35 metadata from response
      device_gps_accuracy: data.device_gps_accuracy,
      battery_level: data.battery_level,
      ambient_mode_signal: data.ambient_mode_signal,
      familiarity_score: data.familiarity_score,
      drift_correction_applied: data.drift_correction_applied,
      micro_optimization_data: data.micro_optimization_data,
    };
  } catch (error) {
    timeEngine.endEvent(timingId, false);
    console.error('fetchRoute failed:', error);
    throw new Error('Failed to calculate route. Please try again.');
  }
}

export async function fetchSafeReturn(request: SafeReturnRequest): Promise<SafeReturnResponse> {
  const url = `${API_BASE_URL}/safe_return`;
  const timeEngine = getTimeEngine();
  
  // V32: Start timing
  const timingId = timeEngine.startEvent('safe_return_calculation');
  const requestStartTime = performance.now();
  
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_position: [request.current_lat, request.current_lon],
        breadcrumb_trail: request.breadcrumb_trail || [],
        profile: request.profile || 'walking'
      })
    });

    const data = await response.json();
    
    // V32: Calculate timing metrics
    const requestEndTime = performance.now();
    const roundtripTime = requestEndTime - requestStartTime;
    
    timeEngine.endEvent(timingId, true, {
      backendDuration: data.duration_ms,
      roundtripTime,
    });
    
    return {
      main_route: data.main_route || { path: [], steps: 0, visited: 0, cost: 0, weighted_cost: 0, safety_score: 100, distance: 0, time: 0, algorithm: 'HomeGuard' },
      backup_routes: data.backup_routes || [],
      safety_score: data.safety_score || 100,
      routes: data.routes || [data.main_route, ...(data.backup_routes || [])],
      // V32: Include timing metadata
      timestamp_start: data.timestamp_start,
      timestamp_end: data.timestamp_end,
      duration_ms: data.duration_ms,
      processing_time_ms: data.processing_time_ms,
    };
  } catch (error) {
    timeEngine.endEvent(timingId, false);
    console.error('fetchSafeReturn failed:', error);
    throw new Error('Failed to calculate safe return routes. Please try again.');
  }
}

export async function fetchComparison(request: CompareRequest): Promise<CompareResponse> {
  const url = `${API_BASE_URL}/compare`;
  const timeEngine = getTimeEngine();
  
  // V32: Start timing
  const timingId = timeEngine.startEvent('comparison_analysis', {
    algorithms: request.algorithms,
  });
  const requestStartTime = performance.now();
  
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: [request.start_lat, request.start_lon],
        end: [request.end_lat, request.end_lon],
        algorithms: request.algorithms,
        profile: request.profile || 'walking'
      })
    });

    const data = await response.json();
    
    // V32: Calculate timing metrics
    const requestEndTime = performance.now();
    const roundtripTime = requestEndTime - requestStartTime;
    
    timeEngine.endEvent(timingId, true, {
      backendDuration: data.duration_ms,
      roundtripTime,
    });
    
    return {
      results: data.results || [],
      winner: data.winner || '',
      comparison_metrics: data.comparison_metrics || {
        fastest: '',
        safest: '',
        shortest: ''
      },
      // V32: Include timing metadata
      timestamp_start: data.timestamp_start,
      timestamp_end: data.timestamp_end,
      duration_ms: data.duration_ms,
      processing_time_ms: data.processing_time_ms,
    };
  } catch (error) {
    timeEngine.endEvent(timingId, false);
    console.error('fetchComparison failed:', error);
    throw new Error('Failed to compare algorithms. Please try again.');
  }
}

export async function fetchExplore(request: ExploreRequest): Promise<ExploreResponse> {
  const url = `${API_BASE_URL}/explore`;
  const timeEngine = getTimeEngine();
  
  // V32: Start timing
  const timingId = timeEngine.startEvent('exploration_scan', {
    radius: request.radius,
    maxPoints: request.max_points,
  });
  const requestStartTime = performance.now();
  
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: [request.start_lat, request.start_lon],
        radius: request.radius || 1000,
        max_points: request.max_points || 50
      })
    });

    const data = await response.json();
    
    // V32: Calculate timing metrics
    const requestEndTime = performance.now();
    const roundtripTime = requestEndTime - requestStartTime;
    
    timeEngine.endEvent(timingId, true, {
      backendDuration: data.duration_ms,
      roundtripTime,
    });
    
    return {
      exploration_paths: data.exploration_paths || [],
      zone_map: data.zone_map || {},
      landmarks: data.landmarks || [],
      coverage_score: data.coverage_score || 0,
      // V32: Include timing metadata
      timestamp_start: data.timestamp_start,
      timestamp_end: data.timestamp_end,
      duration_ms: data.duration_ms,
      processing_time_ms: data.processing_time_ms,
    };
  } catch (error) {
    timeEngine.endEvent(timingId, false);
    console.error('fetchExplore failed:', error);
    throw new Error('Failed to explore area. Please try again.');
  }
}

export async function fetchLiveRoute(request: LiveRouteRequest): Promise<LiveRouteResponse> {
  const url = `${API_BASE_URL}/live_route`;
  
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_position: [request.user_lat, request.user_lon],
        friend_position: [request.friend_lat, request.friend_lon],
        algorithm: request.algorithm || 'ShadowPath'
      })
    });

    const data = await response.json();
    
    return {
      meetup_route: data.meetup_route || { path: [], steps: 0, visited: 0, cost: 0, weighted_cost: 0, safety_score: 100, distance: 0, time: 0, algorithm: 'ShadowPath' },
      predicted_meet_point: data.predicted_meet_point || [0, 0],
      dynamic_eta: data.dynamic_eta || 0,
      user_path: data.user_path || [],
      friend_path: data.friend_path || []
    };
  } catch (error) {
    console.error('fetchLiveRoute failed:', error);
    throw new Error('Failed to calculate live meetup route. Please try again.');
  }
}

export async function fetchContext(): Promise<any> {
  const url = `${API_BASE_URL}/context`;
  
  try {
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    return await response.json();
  } catch (error) {
    console.error('fetchContext failed:', error);
    return null;
  }
}

// Export all API functions as a single object for convenience
export const API = {
  fetchRoute,
  fetchSafeReturn,
  fetchComparison,
  fetchExplore,
  fetchLiveRoute,
  fetchContext,
  fetchShadowReplay,
  gatherV35Data
};

// V35 Shadow Replay Types
export interface ShadowReplayRequest {
  actual_path: Array<[number, number, number]>; // [lat, lon, timestamp]
  algorithm_used: string;
  start_time: number;
  end_time: number;
}

export interface ShadowReplayResponse {
  ideal_path: Array<[number, number]>;
  deviation_metrics: {
    total_deviations: number;
    total_distance_loss: number; // meters
    total_time_loss: number;     // seconds
  };
  deviations: Array<{
    timestamp: number;
    location: [number, number];
    distance: number;
    reason: string;
  }>;
  timestamp_start: number;
  timestamp_end: number;
  duration_ms: number;
}

export async function fetchShadowReplay(request: ShadowReplayRequest): Promise<ShadowReplayResponse> {
  const timeEngine = getTimeEngine();
  const timingId = timeEngine.startEvent('api_request', { endpoint: 'shadow_replay' });

  try {
    const requestStartTime = performance.now();
    
    const response = await fetchWithRetry(`${API_BASE_URL}/shadow_replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data: ShadowReplayResponse = await response.json();
    
    const requestEndTime = performance.now();
    const roundtripTime = requestEndTime - requestStartTime;
    
    timeEngine.endEvent(timingId, true, {
      endpoint: '/shadow_replay',
      roundtripTime,
      backendDuration: data.duration_ms || 0,
    });

    return data;
  } catch (error) {
    timeEngine.endEvent(timingId, false, { 
      endpoint: '/shadow_replay', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    console.error('fetchShadowReplay failed:', error);
    throw new Error('Failed to analyze journey replay. Please try again.');
  }
}

// V35/V36/V37/V38 Helper to gather all V35, V36, V37, and V38 data for API calls
export function gatherV35Data(): {
  device_gps_accuracy: 'high' | 'medium' | 'low';
  battery_level: number;
  ambient_mode_signal: boolean;
  familiarity_score: number;
  drift_correction_applied: boolean;
  micro_optimization_data?: any;
  fused_position?: any;
  motion_state?: string;
  heading?: number;
  confidence_level?: number;
  ambient_light?: number;
  sensor_profile?: any;
  predicted_intent?: any;
  intent_adjustments?: any;
  primary_intent?: string;
  intent_confidence?: number;
} {
  try {
    // Dynamic imports to avoid circular dependencies
    let dle: any, battery: any, ambient: any, heatmap: any, moe: any;
    
    try {
      dle = (window as any).deviceLocationEngine;
      battery = (window as any).batteryAwareRoutingEngine;
      ambient = (window as any).ambientModeEngine;
      heatmap = (window as any).familiarityHeatmapEngine;
      moe = (window as any).microOptimizationEngine;
    } catch {
      // Fallback if engines not available
    }

    if (!dle || !battery || !ambient || !heatmap || !moe) {
      throw new Error('V35 engines not initialized');
    }

    const location = dle.getCurrentLocation();
    const batteryState = battery.getBatteryState();
    const ambientState = ambient.getState();
    const heatmapState = heatmap.getState();
    const moeState = moe.getState();

    // V36: Gather sensor fusion data
    const sfl = (window as any).sensorFusionLayer;
    const fusedPosition = sfl?.getFusedPosition();
    const sensorProfile = sfl?.getSensorProfile();

    // V37: Gather behavior prediction data
    const bpe = (window as any).behaviorPredictionEngine;
    const ims = (window as any).intentModelingSystem;
    const prediction = bpe?.getCurrentPrediction();
    const adjustments = ims?.getCurrentAdjustments();

    return {
      device_gps_accuracy: dle.getQualityMetrics()?.accuracyLevel || 'medium',
      battery_level: batteryState?.level || 100,
      ambient_mode_signal: ambientState?.isActive || false,
      familiarity_score: heatmapState?.currentTileFamiliarity || 0.5,
      drift_correction_applied: location?.driftCorrectionApplied || false,
      micro_optimization_data: moeState?.isActive ? {
        edge_adjustments: Object.fromEntries(moeState.edgeWeightAdjustments || new Map()),
        recent_suggestions: (moeState.recentSuggestions || []).slice(-5),
      } : undefined,
      // V36: Sensor fusion data
      fused_position: fusedPosition,
      motion_state: fusedPosition?.motion_state,
      heading: fusedPosition?.heading,
      confidence_level: fusedPosition?.confidence_level,
      ambient_light: sfl?.getState()?.raw_sensor_data?.ambientLight,
      sensor_profile: sensorProfile,
      // V37: Behavior prediction data
      predicted_intent: prediction,
      intent_adjustments: adjustments,
      primary_intent: prediction?.primary_intent,
      intent_confidence: prediction?.confidence_level,
    };
  } catch (error) {
    console.warn('V35/V36/V37/V38 data gathering failed, using defaults:', error);
    return {
      device_gps_accuracy: 'medium',
      battery_level: 100,
      ambient_mode_signal: false,
      familiarity_score: 0.5,
      drift_correction_applied: false,
    };
  }
}

export default API;
