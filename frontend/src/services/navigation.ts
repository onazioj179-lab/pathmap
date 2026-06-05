// PathFinder V31 - Real-Time Navigation Loop (RTNL)
// Continuous GPS tracking, adaptive rerouting, and live navigation engine
// V32 Enhancement: Added timing instrumentation

import type { RouteResponse } from './api';
import { fetchRoute } from './api';
import { getTimeEngine } from './timeEngine';

// Navigation state types
export interface GPSPosition {
  lat: number;
  lon: number;
  accuracy: number; // meters
  timestamp: number;
  speed?: number; // m/s
  heading?: number; // degrees
}

export interface NavigationState {
  isActive: boolean;
  currentPosition: GPSPosition | null;
  destination: [number, number] | null;
  activeRoute: RouteResponse | null;
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  breadcrumbTrail: [number, number][];
  deviationDistance: number; // meters from planned route
  lastRerouteTime: number;
  safetyScore: number;
  batteryLevel: number; // percentage
  environmentSignals: EnvironmentSignals;
}

export interface EnvironmentSignals {
  isNightTime: boolean;
  isLowBattery: boolean;
  isUnknownZone: boolean;
  isMovingSlowly: boolean;
  isHighInterestArea: boolean;
}

export interface NavStateRequest {
  current_position: [number, number];
  destination: [number, number];
  algorithm: string;
  breadcrumb_trail?: [number, number][];
  battery_level?: number;
  current_route?: any;
}

export interface NavStateResponse {
  updated_path?: [number, number][];
  warnings: string[];
  safe_return_status: 'ready' | 'recommended' | 'urgent';
  algorithm_hint?: string;
  environment_signals: EnvironmentSignals;
  deviation_info: {
    distance_from_route: number;
    should_reroute: boolean;
    deviation_direction: string;
  };
  next_step_bearing?: number;
}

// Configuration
export const RTNL_CONFIG = {
  UPDATE_INTERVAL_MS: 2000,        // 2 seconds per cycle
  DEVIATION_THRESHOLD_M: 50,       // 50 meters triggers reroute
  MIN_REROUTE_INTERVAL_MS: 5000,   // Wait 5s between reroutes
  GPS_ACCURACY_THRESHOLD_M: 20,    // Warn if accuracy > 20m
  LOW_BATTERY_THRESHOLD: 20,       // 20% battery triggers warnings
  SLOW_SPEED_THRESHOLD_MS: 0.5,    // 0.5 m/s = ~1.8 km/h
  BREADCRUMB_RETENTION: 100,       // Keep last 100 positions
  SAFE_RETURN_CHECK_INTERVAL: 4,   // Check every 4 cycles
};

/**
 * Real-Time Navigation Loop (RTNL) Manager
 * Continuously updates position, route, safety, and environment
 */
export class NavigationLoop {
  private intervalId: number | null = null;
  private state: NavigationState;
  private cycleCount: number = 0;
  private onStateUpdate: ((state: NavigationState) => void) | null = null;
  private gpsWatchId: number | null = null;

  constructor() {
    this.state = {
      isActive: false,
      currentPosition: null,
      destination: null,
      activeRoute: null,
      algorithm: 'ShadowPath',
      breadcrumbTrail: [],
      deviationDistance: 0,
      lastRerouteTime: 0,
      safetyScore: 100,
      batteryLevel: 100,
      environmentSignals: {
        isNightTime: false,
        isLowBattery: false,
        isUnknownZone: false,
        isMovingSlowly: false,
        isHighInterestArea: false,
      },
    };
  }

  /**
   * Start the real-time navigation loop
   */
  start(
    destination: [number, number],
    algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX',
    onUpdate: (state: NavigationState) => void
  ) {
    if (this.state.isActive) {
      console.warn('Navigation loop already running');
      return;
    }

    this.state.destination = destination;
    this.state.algorithm = algorithm;
    this.state.isActive = true;
    this.onStateUpdate = onUpdate;
    this.cycleCount = 0;

    // Start GPS tracking
    this.startGPSTracking();

    // Start navigation loop
    this.intervalId = window.setInterval(() => {
      this.runNavigationCycle();
    }, RTNL_CONFIG.UPDATE_INTERVAL_MS);

    console.log(`[RTNL] Started with ${algorithm} to`, destination);
  }

  /**
   * Stop the navigation loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.gpsWatchId) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    this.state.isActive = false;
    console.log('[RTNL] Stopped');
  }

  /**
   * Get current navigation state
   */
  getState(): NavigationState {
    return { ...this.state };
  }

  /**
   * Start GPS position tracking
   */
  private startGPSTracking() {
    if (!navigator.geolocation) {
      console.error('[RTNL] Geolocation not supported');
      return;
    }

    this.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const gpsPos: GPSPosition = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
        };

        this.updatePosition(gpsPos);
      },
      (error) => {
        console.error('[RTNL] GPS error:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );
  }

  /**
   * Update current position and breadcrumb trail
   */
  private updatePosition(position: GPSPosition) {
    // Track GPS update timing
    const timeEngine = getTimeEngine();
    const timingId = timeEngine.startEvent('gps_update', {
      accuracy: position.accuracy,
      speed: position.speed,
    });
    
    this.state.currentPosition = position;

    // Add to breadcrumb trail
    this.state.breadcrumbTrail.push([position.lat, position.lon]);

    // Retain only last N breadcrumbs
    if (this.state.breadcrumbTrail.length > RTNL_CONFIG.BREADCRUMB_RETENTION) {
      this.state.breadcrumbTrail.shift();
    }

    // Update environment signals
    this.updateEnvironmentSignals(position);

    // Trigger state update callback
    this.notifyStateUpdate();
    
    timeEngine.endEvent(timingId, true);
  }

  /**
   * Main navigation cycle - runs every 1-3 seconds
   */
  private async runNavigationCycle() {
    // Track navigation cycle timing
    const timeEngine = getTimeEngine();
    const cycleTimingId = timeEngine.startEvent('navigation_cycle', {
      cycleNumber: this.cycleCount + 1,
      algorithm: this.state.algorithm,
    });
    
    this.cycleCount++;

    if (!this.state.currentPosition || !this.state.destination) {
      timeEngine.endEvent(cycleTimingId, false);
      return;
    }

    try {
      // Check deviation from planned route
      if (this.state.activeRoute) {
        // Time deviation check
        const deviationTimingId = timeEngine.startEvent('deviation_check');
        const deviation = this.calculateDeviation(
          this.state.currentPosition,
          this.state.activeRoute.path
        );
        this.state.deviationDistance = deviation;
        timeEngine.endEvent(deviationTimingId, true, { deviation });

        // Auto-reroute if deviation exceeds threshold
        if (this.shouldReroute(deviation)) {
          await this.performReroute();
        }
      } else {
        // Initial route calculation
        await this.performReroute();
      }

      // Algorithm-specific reactions
      await this.handleAlgorithmReactions();

      // Safe return checks (every 4th cycle)
      if (this.cycleCount % RTNL_CONFIG.SAFE_RETURN_CHECK_INTERVAL === 0) {
        this.checkSafeReturnStatus();
      }

      // Update safety score
      this.updateSafetyScore();

      // Notify UI of state changes
      this.notifyStateUpdate();
      
      timeEngine.endEvent(cycleTimingId, true);
      
      // Adapt cycle interval if device is slow
      this.adaptCycleInterval();
    } catch (error) {
      console.error('[RTNL] Cycle error:', error);
      timeEngine.endEvent(cycleTimingId, false);
    }
  }

  /**
   * Calculate distance from current position to nearest point on route
   */
  private calculateDeviation(
    position: GPSPosition,
    routePath: [number, number][]
  ): number {
    if (routePath.length === 0) return Infinity;

    let minDistance = Infinity;

    for (const point of routePath) {
      const distance = this.haversineDistance(
        position.lat,
        position.lon,
        point[0],
        point[1]
      );
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  /**
   * Check if rerouting is needed
   */
  private shouldReroute(deviation: number): boolean {
    const timeSinceLastReroute = Date.now() - this.state.lastRerouteTime;
    
    return (
      deviation > RTNL_CONFIG.DEVIATION_THRESHOLD_M &&
      timeSinceLastReroute > RTNL_CONFIG.MIN_REROUTE_INTERVAL_MS
    );
  }

  /**
   * Perform automatic rerouting
   */
  private async performReroute() {
    if (!this.state.currentPosition || !this.state.destination) return;

    console.log('[RTNL] Performing reroute...');

    // Track reroute timing
    const timeEngine = getTimeEngine();
    const rerouteTimingId = timeEngine.startEvent('reroute_trigger', {
      algorithm: this.state.algorithm,
      deviation: this.state.deviationDistance,
    });

    try {
      const newRoute = await fetchRoute({
        start_lat: this.state.currentPosition.lat,
        start_lon: this.state.currentPosition.lon,
        end_lat: this.state.destination[0],
        end_lon: this.state.destination[1],
        algorithm: this.state.algorithm,
        profile: 'walking',
        include_visualization: true,
      });

      this.state.activeRoute = newRoute;
      this.state.lastRerouteTime = Date.now();
      this.state.deviationDistance = 0;

      console.log('[RTNL] Reroute successful:', newRoute.algorithm);
      timeEngine.endEvent(rerouteTimingId, true, {
        pathLength: newRoute.path.length,
        routeTime: newRoute.duration_ms,
      });
    } catch (error) {
      console.error('[RTNL] Reroute failed:', error);
      timeEngine.endEvent(rerouteTimingId, false);
    }
  }
  
  /**
   * Adapt navigation cycle interval based on performance
   */
  private adaptCycleInterval() {
    const timeEngine = getTimeEngine();
    const optimizations = timeEngine.getOptimizations();
    
    // If device is slow, adjust cycle interval
    if (optimizations.shouldSlowNavigationCycle && this.intervalId) {
      const newInterval = optimizations.recommendedCycleInterval;
      
      if (newInterval !== RTNL_CONFIG.UPDATE_INTERVAL_MS) {
        console.log(`[RTNL] Adapting cycle interval to ${newInterval}ms (device optimization)`);
        
        // Restart interval with new timing
        clearInterval(this.intervalId);
        this.intervalId = window.setInterval(() => {
          this.runNavigationCycle();
        }, newInterval);
      }
    }
  }

  /**
   * Algorithm-specific reaction logic
   */
  private async handleAlgorithmReactions() {
    const { algorithm, environmentSignals } = this.state;

    switch (algorithm) {
      case 'ShadowPath':
        // React quickly to deviations - already handled in main cycle
        if (this.state.deviationDistance > 30) {
          console.log('[RTNL] ShadowPath: Quick deviation correction');
        }
        break;

      case 'HomeGuard':
        // React to environment changes
        if (environmentSignals.isLowBattery || environmentSignals.isNightTime) {
          console.log('[RTNL] HomeGuard: Environment warning detected');
          // Trigger safe return logic
        }
        break;

      case 'PathfinderX':
        // Trigger exploration if moving slowly in interesting area
        if (environmentSignals.isMovingSlowly && environmentSignals.isHighInterestArea) {
          console.log('[RTNL] PathfinderX: Exploration opportunity detected');
          // Could trigger local exploration scan
        }
        break;
    }
  }

  /**
   * Check safe return status
   */
  private checkSafeReturnStatus() {
    const { environmentSignals, batteryLevel } = this.state;

    if (batteryLevel < RTNL_CONFIG.LOW_BATTERY_THRESHOLD) {
      console.warn('[RTNL] Low battery - safe return recommended');
    }

    if (environmentSignals.isNightTime && environmentSignals.isUnknownZone) {
      console.warn('[RTNL] Night + unknown zone - safe return urgent');
    }
  }

  /**
   * Update safety score based on current conditions
   */
  private updateSafetyScore() {
    let score = 100;

    // Deduct for poor GPS accuracy
    if (this.state.currentPosition) {
      if (this.state.currentPosition.accuracy > RTNL_CONFIG.GPS_ACCURACY_THRESHOLD_M) {
        score -= 10;
      }
    }

    // Deduct for environment signals
    const { environmentSignals } = this.state;
    if (environmentSignals.isNightTime) score -= 15;
    if (environmentSignals.isUnknownZone) score -= 20;
    if (environmentSignals.isLowBattery) score -= 10;

    // Deduct for large deviation
    if (this.state.deviationDistance > 100) {
      score -= 15;
    }

    this.state.safetyScore = Math.max(0, Math.min(100, score));
  }

  /**
   * Update environment signals
   */
  private updateEnvironmentSignals(position: GPSPosition) {
    const now = new Date();
    const hour = now.getHours();

    this.state.environmentSignals = {
      isNightTime: hour < 6 || hour > 20,
      isLowBattery: this.state.batteryLevel < RTNL_CONFIG.LOW_BATTERY_THRESHOLD,
      isUnknownZone: this.state.breadcrumbTrail.length < 10, // Heuristic
      isMovingSlowly: (position.speed || 0) < RTNL_CONFIG.SLOW_SPEED_THRESHOLD_MS,
      isHighInterestArea: false, // TODO: Integrate with backend landmarks
    };

    // Update battery level (mock - real implementation would use Battery API)
    this.updateBatteryLevel();
  }

  /**
   * Update battery level
   */
  private async updateBatteryLevel() {
    try {
      // @ts-ignore - Battery API not in standard types
      if ('getBattery' in navigator) {
        // @ts-ignore
        const battery = await navigator.getBattery();
        this.state.batteryLevel = Math.round(battery.level * 100);
      }
    } catch (error) {
      // Battery API not available - use mock value
      this.state.batteryLevel = 100;
    }
  }

  /**
   * Notify state update callback
   */
  private notifyStateUpdate() {
    if (this.onStateUpdate) {
      this.onStateUpdate({ ...this.state });
    }
  }

  /**
   * Haversine distance calculation (meters)
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

// Singleton instance
let navigationLoopInstance: NavigationLoop | null = null;

/**
 * Get or create navigation loop singleton
 */
export function getNavigationLoop(): NavigationLoop {
  if (!navigationLoopInstance) {
    navigationLoopInstance = new NavigationLoop();
  }
  return navigationLoopInstance;
}
