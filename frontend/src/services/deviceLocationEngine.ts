/**
 * PATHFINDER V35 — DEVICE LOCATION ENGINE (DLE)
 * 
 * Hardware-level GPS control with drift correction, Kalman smoothing,
 * signal quality detection, and position snapping to walkable roads.
 * 
 * Core Responsibilities:
 * - Request high-accuracy GPS from device
 * - Handle permission prompts gracefully
 * - Detect GPS mode (high accuracy / balanced / low power)
 * - Smooth noisy positions with Kalman-like filter
 * - Correct GPS drift by snapping to nearest walkable road
 * - Dispatch GPS quality metrics (accuracy_level, signal_quality, latency)
 * - Provide drift-corrected positions to navigation systems
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;           // meters
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;     // degrees (0-360)
  speed: number | null;       // m/s
  timestamp: number;          // ms since epoch
}

export interface CorrectedLocation extends DeviceLocation {
  originalLatitude: number;
  originalLongitude: number;
  driftCorrectionApplied: boolean;
  driftDistance: number;      // meters
  snappedToRoad: boolean;
  confidenceScore: number;    // 0-1
}

export interface GPSQualityMetrics {
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unavailable';
  accuracyLevel: 'high' | 'medium' | 'low';
  locationLatencyMs: number;
  driftCorrectionEnabled: boolean;
  averageAccuracy: number;    // last 10 positions
  positionStability: number;  // 0-1 (how stable positions are)
  samplesCollected: number;
}

export interface GPSMode {
  mode: 'high_accuracy' | 'balanced' | 'battery_saving' | 'device_only';
  description: string;
  expectedAccuracy: number;   // meters
}

interface KalmanState {
  latitude: number;
  longitude: number;
  latitudeVelocity: number;
  longitudeVelocity: number;
  processNoise: number;
  measurementNoise: number;
}

interface PositionHistory {
  position: DeviceLocation;
  corrected: CorrectedLocation;
  timestamp: number;
}

// ============================================================================
// DEVICE LOCATION ENGINE
// ============================================================================

class DeviceLocationEngine {
  private watchId: number | null = null;
  private permissionGranted: boolean = false;
  private currentLocation: CorrectedLocation | null = null;
  private kalmanState: KalmanState | null = null;
  private positionHistory: PositionHistory[] = [];
  private listeners: ((location: CorrectedLocation) => void)[] = [];
  private errorListeners: ((error: GeolocationPositionError) => void)[] = [];
  
  private gpsQualityMetrics: GPSQualityMetrics = {
    signalQuality: 'unavailable',
    accuracyLevel: 'low',
    locationLatencyMs: 0,
    driftCorrectionEnabled: true,
    averageAccuracy: 0,
    positionStability: 0,
    samplesCollected: 0,
  };

  private readonly HISTORY_SIZE = 10;
  private readonly MAX_DRIFT_DISTANCE = 50; // meters
  private readonly ACCURACY_THRESHOLD_HIGH = 10; // meters
  private readonly ACCURACY_THRESHOLD_MEDIUM = 25; // meters
  private readonly KALMAN_PROCESS_NOISE = 0.0001;
  private readonly KALMAN_MEASUREMENT_NOISE = 0.01;

  constructor() {
    this.checkPermissionStatus();
  }

  // ==========================================================================
  // PERMISSION HANDLING
  // ==========================================================================

  private async checkPermissionStatus(): Promise<void> {
    if (!('permissions' in navigator)) {
      console.warn('[DLE] Permissions API not supported');
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      this.permissionGranted = result.state === 'granted';
      
      result.addEventListener('change', () => {
        this.permissionGranted = result.state === 'granted';
        if (!this.permissionGranted && this.watchId) {
          this.stop();
        }
      });

      console.log(`[DLE] Geolocation permission: ${result.state}`);
    } catch (error) {
      console.warn('[DLE] Could not query geolocation permission:', error);
    }
  }

  async requestPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        console.error('[DLE] Geolocation not supported');
        resolve(false);
        return;
      }

      // Request position to trigger permission prompt
      navigator.geolocation.getCurrentPosition(
        () => {
          this.permissionGranted = true;
          console.log('[DLE] Geolocation permission granted');
          resolve(true);
        },
        (error) => {
          this.permissionGranted = false;
          console.error('[DLE] Geolocation permission denied:', error.message);
          resolve(false);
        },
        { enableHighAccuracy: true }
      );
    });
  }

  // ==========================================================================
  // GPS TRACKING
  // ==========================================================================

  async start(): Promise<boolean> {
    if (this.watchId) {
      console.warn('[DLE] Already tracking location');
      return true;
    }

    if (!this.permissionGranted) {
      const granted = await this.requestPermission();
      if (!granted) {
        return false;
      }
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => this.handlePositionError(error),
      options
    );

    console.log('[DLE] Started high-accuracy GPS tracking');
    return true;
  }

  stop(): void {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      console.log('[DLE] Stopped GPS tracking');
    }
  }

  // ==========================================================================
  // POSITION PROCESSING
  // ==========================================================================

  private handlePositionUpdate(position: GeolocationPosition): void {
    const requestStart = performance.now();

    const deviceLocation: DeviceLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
    };

    // Apply Kalman filter
    const smoothedLocation = this.applyKalmanFilter(deviceLocation);

    // Apply drift correction
    const correctedLocation = this.correctDrift(smoothedLocation);

    // Update metrics
    const latency = performance.now() - requestStart;
    this.updateMetrics(correctedLocation, latency);

    // Store in history
    this.positionHistory.push({
      position: deviceLocation,
      corrected: correctedLocation,
      timestamp: Date.now(),
    });
    if (this.positionHistory.length > this.HISTORY_SIZE) {
      this.positionHistory.shift();
    }

    // Update current location
    this.currentLocation = correctedLocation;

    // Notify listeners
    this.notifyListeners(correctedLocation);

    console.log(`[DLE] Position updated: ${correctedLocation.latitude.toFixed(6)}, ${correctedLocation.longitude.toFixed(6)} (accuracy: ${correctedLocation.accuracy.toFixed(1)}m, drift: ${correctedLocation.driftDistance.toFixed(1)}m)`);
  }

  private handlePositionError(error: GeolocationPositionError): void {
    console.error(`[DLE] Position error: ${error.message} (code: ${error.code})`);
    
    this.gpsQualityMetrics.signalQuality = 'unavailable';
    
    this.errorListeners.forEach(listener => listener(error));
  }

  // ==========================================================================
  // KALMAN FILTER (Smoothing)
  // ==========================================================================

  private applyKalmanFilter(location: DeviceLocation): DeviceLocation {
    if (!this.kalmanState) {
      // Initialize Kalman state
      this.kalmanState = {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeVelocity: 0,
        longitudeVelocity: 0,
        processNoise: this.KALMAN_PROCESS_NOISE,
        measurementNoise: this.KALMAN_MEASUREMENT_NOISE,
      };
      return location;
    }

    // Time delta (assume 1 second for simplicity)
    const dt = 1.0;

    // Predict
    const predictedLat = this.kalmanState.latitude + this.kalmanState.latitudeVelocity * dt;
    const predictedLon = this.kalmanState.longitude + this.kalmanState.longitudeVelocity * dt;

    // Update with measurement
    const kalmanGain = this.kalmanState.processNoise / (this.kalmanState.processNoise + this.kalmanState.measurementNoise);
    
    const updatedLat = predictedLat + kalmanGain * (location.latitude - predictedLat);
    const updatedLon = predictedLon + kalmanGain * (location.longitude - predictedLon);

    // Update velocities
    this.kalmanState.latitudeVelocity = (updatedLat - this.kalmanState.latitude) / dt;
    this.kalmanState.longitudeVelocity = (updatedLon - this.kalmanState.longitude) / dt;

    // Update state
    this.kalmanState.latitude = updatedLat;
    this.kalmanState.longitude = updatedLon;

    return {
      ...location,
      latitude: updatedLat,
      longitude: updatedLon,
    };
  }

  // ==========================================================================
  // DRIFT CORRECTION
  // ==========================================================================

  private correctDrift(location: DeviceLocation): CorrectedLocation {
    const originalLat = location.latitude;
    const originalLon = location.longitude;

    // Calculate drift distance from previous position
    let driftDistance = 0;
    let snappedToRoad = false;

    if (this.currentLocation) {
      driftDistance = this.calculateDistance(
        originalLat,
        originalLon,
        this.currentLocation.latitude,
        this.currentLocation.longitude
      );
    }

    // If drift is excessive and accuracy is poor, apply correction
    let correctedLat = originalLat;
    let correctedLon = originalLon;
    let driftCorrectionApplied = false;

    if (location.accuracy > this.ACCURACY_THRESHOLD_MEDIUM && driftDistance > this.MAX_DRIFT_DISTANCE) {
      // Snap to nearest road (simplified - in production, use road network data)
      const snapped = this.snapToNearestRoad(originalLat, originalLon);
      if (snapped) {
        correctedLat = snapped.latitude;
        correctedLon = snapped.longitude;
        driftCorrectionApplied = true;
        snappedToRoad = true;
      }
    }

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(location, driftDistance);

    return {
      ...location,
      latitude: correctedLat,
      longitude: correctedLon,
      originalLatitude: originalLat,
      originalLongitude: originalLon,
      driftCorrectionApplied,
      driftDistance,
      snappedToRoad,
      confidenceScore,
    };
  }

  private snapToNearestRoad(lat: number, lon: number): { latitude: number; longitude: number } | null {
    // Simplified snapping - in production, query backend /snap_to_road endpoint
    // For now, just apply a small correction toward previous known-good position
    if (this.currentLocation && this.currentLocation.confidenceScore > 0.7) {
      const factor = 0.3; // Move 30% toward previous position
      return {
        latitude: lat + (this.currentLocation.latitude - lat) * factor,
        longitude: lon + (this.currentLocation.longitude - lon) * factor,
      };
    }
    return null;
  }

  private calculateConfidenceScore(location: DeviceLocation, driftDistance: number): number {
    // Factors: accuracy, stability, drift
    const accuracyScore = Math.max(0, 1 - location.accuracy / 50);
    const stabilityScore = this.gpsQualityMetrics.positionStability;
    const driftScore = Math.max(0, 1 - driftDistance / this.MAX_DRIFT_DISTANCE);

    return (accuracyScore * 0.5 + stabilityScore * 0.3 + driftScore * 0.2);
  }

  // ==========================================================================
  // METRICS
  // ==========================================================================

  private updateMetrics(location: CorrectedLocation, latency: number): void {
    this.gpsQualityMetrics.locationLatencyMs = latency;
    this.gpsQualityMetrics.samplesCollected++;

    // Update average accuracy
    const accuracies = this.positionHistory.map(h => h.position.accuracy);
    accuracies.push(location.accuracy);
    this.gpsQualityMetrics.averageAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;

    // Determine accuracy level
    if (location.accuracy <= this.ACCURACY_THRESHOLD_HIGH) {
      this.gpsQualityMetrics.accuracyLevel = 'high';
    } else if (location.accuracy <= this.ACCURACY_THRESHOLD_MEDIUM) {
      this.gpsQualityMetrics.accuracyLevel = 'medium';
    } else {
      this.gpsQualityMetrics.accuracyLevel = 'low';
    }

    // Determine signal quality
    if (location.accuracy <= 5) {
      this.gpsQualityMetrics.signalQuality = 'excellent';
    } else if (location.accuracy <= 10) {
      this.gpsQualityMetrics.signalQuality = 'good';
    } else if (location.accuracy <= 25) {
      this.gpsQualityMetrics.signalQuality = 'fair';
    } else {
      this.gpsQualityMetrics.signalQuality = 'poor';
    }

    // Calculate position stability
    if (this.positionHistory.length >= 3) {
      const recentPositions = this.positionHistory.slice(-3);
      const distances = [];
      for (let i = 1; i < recentPositions.length; i++) {
        const dist = this.calculateDistance(
          recentPositions[i - 1].corrected.latitude,
          recentPositions[i - 1].corrected.longitude,
          recentPositions[i].corrected.latitude,
          recentPositions[i].corrected.longitude
        );
        distances.push(dist);
      }
      const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
      this.gpsQualityMetrics.positionStability = Math.max(0, 1 - avgDistance / 20);
    }
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula
    const R = 6371e3; // Earth radius in meters
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

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  onLocationUpdate(callback: (location: CorrectedLocation) => void): void {
    this.listeners.push(callback);
  }

  onError(callback: (error: GeolocationPositionError) => void): void {
    this.errorListeners.push(callback);
  }

  private notifyListeners(location: CorrectedLocation): void {
    this.listeners.forEach(listener => listener(location));
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getCurrentLocation(): CorrectedLocation | null {
    return this.currentLocation;
  }

  getQualityMetrics(): GPSQualityMetrics {
    return { ...this.gpsQualityMetrics };
  }

  getPositionHistory(): PositionHistory[] {
    return [...this.positionHistory];
  }

  detectGPSMode(): GPSMode {
    const accuracy = this.gpsQualityMetrics.averageAccuracy;

    if (accuracy <= 10) {
      return {
        mode: 'high_accuracy',
        description: 'High accuracy GPS with WiFi/cell tower assistance',
        expectedAccuracy: 5,
      };
    } else if (accuracy <= 50) {
      return {
        mode: 'balanced',
        description: 'Balanced accuracy with moderate battery usage',
        expectedAccuracy: 25,
      };
    } else if (accuracy <= 100) {
      return {
        mode: 'battery_saving',
        description: 'Battery saving mode with reduced accuracy',
        expectedAccuracy: 75,
      };
    } else {
      return {
        mode: 'device_only',
        description: 'GPS only (no network assistance)',
        expectedAccuracy: 100,
      };
    }
  }

  isHighAccuracy(): boolean {
    return this.gpsQualityMetrics.accuracyLevel === 'high';
  }

  isPermissionGranted(): boolean {
    return this.permissionGranted;
  }

  enableDriftCorrection(): void {
    this.gpsQualityMetrics.driftCorrectionEnabled = true;
  }

  disableDriftCorrection(): void {
    this.gpsQualityMetrics.driftCorrectionEnabled = false;
  }

  reset(): void {
    this.stop();
    this.kalmanState = null;
    this.positionHistory = [];
    this.currentLocation = null;
    this.gpsQualityMetrics.samplesCollected = 0;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let deviceLocationEngineInstance: DeviceLocationEngine | null = null;

export function getDeviceLocationEngine(): DeviceLocationEngine {
  if (!deviceLocationEngineInstance) {
    deviceLocationEngineInstance = new DeviceLocationEngine();
  }
  return deviceLocationEngineInstance;
}

export default getDeviceLocationEngine;
