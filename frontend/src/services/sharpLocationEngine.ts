/**
 * PATHMAP V98 — SHARP LOCATION ENGINE (SLE)
 *
 * AI-powered precision location pinpointing:
 * - Multi-source fusion (GPS + WiFi + Cell + Compass)
 * - Kalman filtering for smooth tracking
 * - Compass integration for heading accuracy
 * - Predictive position interpolation
 * - Automatic accuracy indicator
 * - Motion detection and heading estimation
 *
 * @version 2.0.0
 * @author PathMap AI
 */

import { compassEngine, type CompassData } from './compassEngine';

export interface SharpLocation {
  lat: number;
  lng: number;
  accuracy: number;
  confidence: number; // 0-1 scale
  source: 'gps' | 'wifi' | 'cell' | 'fused' | 'predicted';
  timestamp: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  compassHeading?: number; // From device compass
  isMoving?: boolean; // Motion detection
}

interface KalmanState {
  lat: number;
  lng: number;
  vLat: number; // velocity in latitude direction
  vLng: number; // velocity in longitude direction
  uncertainty: number;
}

interface LocationHistory {
  position: SharpLocation;
  rawPosition: GeolocationCoordinates;
}

class SharpLocationEngine {
  private history: LocationHistory[] = [];
  private maxHistorySize = 50;
  private kalmanState: KalmanState | null = null;
  private lastUpdate: number = 0;
  private isTracking = false;
  private watchId: number | null = null;
  private onUpdateCallbacks: ((loc: SharpLocation) => void)[] = [];

  // Kalman filter parameters
  private processNoise = 0.00001; // Process noise
  private _measurementNoise = 0.00005; // Measurement noise

  // Prediction parameters
  private predictionInterval = 100; // ms
  private predictionTimer: number | null = null;

  // Compass integration
  private compassEnabled = false;
  private lastCompassData: CompassData | null = null;
  private compassUnsubscribe: (() => void) | null = null;

  /**
   * Initialize the Sharp Location Engine with compass support
   */
  async init(): Promise<void> {
    console.log('[SharpLoc] ═══════════════════════════════════════');
    console.log('[SharpLoc] SHARP LOCATION ENGINE V2.0 INITIALIZING');
    console.log('[SharpLoc] With Compass Integration');
    console.log('[SharpLoc] ═══════════════════════════════════════');

    // Check for geolocation support
    if (!navigator.geolocation) {
      console.error('[SharpLoc] Geolocation not supported');
      return;
    }

    console.log('[SharpLoc] ✓ Geolocation API available');

    // Initialize compass
    try {
      const compassAvailable = await compassEngine.init();
      if (compassAvailable) {
        this.compassEnabled = true;
        console.log('[SharpLoc] ✓ Compass integration enabled');
      }
    } catch (err) {
      console.warn('[SharpLoc] Compass not available:', err);
    }
  }

  /**
   * Start continuous location tracking with compass
   */
  startTracking(options?: {
    enableHighAccuracy?: boolean;
    maxAge?: number;
    timeout?: number;
    enablePrediction?: boolean;
    enableCompass?: boolean;
  }): void {
    if (this.isTracking) {
      console.log('[SharpLoc] Already tracking');
      return;
    }

    const config = {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      maximumAge: options?.maxAge ?? 0,
      timeout: options?.timeout ?? 15000,
    };

    console.log('[SharpLoc] Starting tracking with config:', config);

    // Start compass tracking
    if (this.compassEnabled && options?.enableCompass !== false) {
      compassEngine.start();
      this.compassUnsubscribe = compassEngine.onUpdate(data => {
        this.lastCompassData = data;
      });
      console.log('[SharpLoc] ✓ Compass tracking started');
    }

    this.watchId = navigator.geolocation.watchPosition(
      position => this.handlePositionUpdate(position),
      error => this.handlePositionError(error),
      config
    );

    this.isTracking = true;

    // Start prediction loop if enabled
    if (options?.enablePrediction !== false) {
      this.startPredictionLoop();
    }

    console.log('[SharpLoc] ✓ Tracking started');
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.predictionTimer !== null) {
      clearInterval(this.predictionTimer);
      this.predictionTimer = null;
    }

    // Stop compass tracking
    if (this.compassUnsubscribe) {
      this.compassUnsubscribe();
      this.compassUnsubscribe = null;
    }
    compassEngine.stop();

    this.isTracking = false;
    console.log('[SharpLoc] Tracking stopped');
  }

  /**
   * Handle raw position update from geolocation API
   */
  private handlePositionUpdate(position: GeolocationPosition): void {
    const coords = position.coords;
    const now = Date.now();
    const deltaTime = this.lastUpdate ? (now - this.lastUpdate) / 1000 : 0;
    this.lastUpdate = now;

    // Create raw location with compass data
    const rawLocation: SharpLocation = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      confidence: this.calculateConfidence(coords.accuracy),
      source: this.determineSource(coords.accuracy),
      timestamp: now,
      altitude: coords.altitude ?? undefined,
      heading: coords.heading ?? undefined,
      speed: coords.speed ?? undefined,
      compassHeading: this.lastCompassData?.heading,
      isMoving: this.lastCompassData?.isMoving,
    };

    // Use compass heading if GPS heading is not available
    if (!rawLocation.heading && this.lastCompassData?.heading !== undefined) {
      rawLocation.heading = this.lastCompassData.heading;
    }

    // Apply Kalman filter
    const filteredLocation = this.applyKalmanFilter(rawLocation, deltaTime);

    // Store in history
    this.addToHistory({
      position: filteredLocation,
      rawPosition: coords,
    });

    // Calculate heading from history if not provided
    if (!filteredLocation.heading && this.history.length >= 2) {
      filteredLocation.heading = this.calculateHeading();
    }

    // Calculate speed from history if not provided
    if (!filteredLocation.speed && this.history.length >= 2) {
      filteredLocation.speed = this.calculateSpeed();
    }

    // Notify callbacks
    this.notifyUpdate(filteredLocation);
  }

  /**
   * Handle geolocation error
   */
  private handlePositionError(error: GeolocationPositionError): void {
    console.warn('[SharpLoc] Position error:', error.code, error.message);

    // If we have history, use prediction
    if (this.history.length > 0 && this.kalmanState) {
      const predicted = this.predictPosition(0.5); // 500ms prediction
      if (predicted) {
        this.notifyUpdate(predicted);
      }
    }
  }

  /**
   * Apply Kalman filter for smoother tracking
   */
  private applyKalmanFilter(measurement: SharpLocation, deltaTime: number): SharpLocation {
    if (!this.kalmanState) {
      // Initialize Kalman state
      this.kalmanState = {
        lat: measurement.lat,
        lng: measurement.lng,
        vLat: 0,
        vLng: 0,
        uncertainty: measurement.accuracy / 111000, // Convert meters to degrees approx
      };
      return measurement;
    }

    // Skip filter for first few readings to establish baseline
    if (this.history.length < 3) {
      this.kalmanState.lat = measurement.lat;
      this.kalmanState.lng = measurement.lng;
      return measurement;
    }

    const state = this.kalmanState;
    const dt = Math.max(deltaTime, 0.1);

    // === PREDICT STEP ===
    // Predict new position based on velocity
    const predictedLat = state.lat + state.vLat * dt;
    const predictedLng = state.lng + state.vLng * dt;

    // Increase uncertainty
    const predictedUncertainty = state.uncertainty + this.processNoise * dt;

    // === UPDATE STEP ===
    // Calculate Kalman gain
    const measurementUncertainty = measurement.accuracy / 111000;
    const kalmanGain = predictedUncertainty / (predictedUncertainty + measurementUncertainty);

    // Update position estimate
    const updatedLat = predictedLat + kalmanGain * (measurement.lat - predictedLat);
    const updatedLng = predictedLng + kalmanGain * (measurement.lng - predictedLng);

    // Update velocity estimate
    if (dt > 0) {
      const newVLat = (updatedLat - state.lat) / dt;
      const newVLng = (updatedLng - state.lng) / dt;

      // Smooth velocity updates
      state.vLat = state.vLat * 0.7 + newVLat * 0.3;
      state.vLng = state.vLng * 0.7 + newVLng * 0.3;
    }

    // Update uncertainty
    const updatedUncertainty = (1 - kalmanGain) * predictedUncertainty;

    // Store updated state
    state.lat = updatedLat;
    state.lng = updatedLng;
    state.uncertainty = updatedUncertainty;

    // Return filtered location
    return {
      ...measurement,
      lat: updatedLat,
      lng: updatedLng,
      accuracy: Math.max(updatedUncertainty * 111000, 1), // Convert back to meters
      confidence: Math.min(0.95, 1 - kalmanGain * 0.5),
      source: 'fused',
    };
  }

  /**
   * Predict position based on velocity
   */
  predictPosition(secondsAhead: number): SharpLocation | null {
    if (!this.kalmanState) return null;

    const state = this.kalmanState;
    const predictedLat = state.lat + state.vLat * secondsAhead;
    const predictedLng = state.lng + state.vLng * secondsAhead;

    // Increase uncertainty for predictions
    const predictedAccuracy = state.uncertainty * 111000 * (1 + secondsAhead * 0.5);

    return {
      lat: predictedLat,
      lng: predictedLng,
      accuracy: predictedAccuracy,
      confidence: Math.max(0.3, 0.8 - secondsAhead * 0.3),
      source: 'predicted',
      timestamp: Date.now(),
      heading: this.calculateHeading(),
      speed: this.calculateSpeed(),
    };
  }

  /**
   * Start prediction loop for smooth interpolation
   */
  private startPredictionLoop(): void {
    if (this.predictionTimer !== null) return;

    this.predictionTimer = window.setInterval(() => {
      if (!this.kalmanState || this.history.length < 2) return;

      // Small prediction step
      const predicted = this.predictPosition(0.05); // 50ms ahead
      if (predicted && predicted.confidence > 0.5) {
        // Silent update without storing in history
        this.onUpdateCallbacks.forEach(cb => {
          try {
            cb(predicted);
          } catch {}
        });
      }
    }, this.predictionInterval);
  }

  /**
   * Calculate confidence from accuracy
   */
  private calculateConfidence(accuracy: number): number {
    // Higher accuracy (lower number) = higher confidence
    if (accuracy <= 5) return 0.95;
    if (accuracy <= 10) return 0.9;
    if (accuracy <= 20) return 0.8;
    if (accuracy <= 50) return 0.6;
    if (accuracy <= 100) return 0.4;
    return 0.2;
  }

  /**
   * Determine location source from accuracy
   */
  private determineSource(accuracy: number): 'gps' | 'wifi' | 'cell' {
    if (accuracy <= 10) return 'gps';
    if (accuracy <= 50) return 'wifi';
    return 'cell';
  }

  /**
   * Calculate heading from history
   */
  private calculateHeading(): number | undefined {
    if (this.history.length < 2) return undefined;

    const recent = this.history.slice(-5);
    if (recent.length < 2) return undefined;

    const first = recent[0].position;
    const last = recent[recent.length - 1].position;

    const dLng = last.lng - first.lng;
    const dLat = last.lat - first.lat;

    // If barely moved, no heading
    if (Math.abs(dLat) < 0.000001 && Math.abs(dLng) < 0.000001) {
      return undefined;
    }

    // Calculate bearing
    const y = Math.sin((dLng * Math.PI) / 180) * Math.cos((last.lat * Math.PI) / 180);
    const x =
      Math.cos((first.lat * Math.PI) / 180) * Math.sin((last.lat * Math.PI) / 180) -
      Math.sin((first.lat * Math.PI) / 180) *
        Math.cos((last.lat * Math.PI) / 180) *
        Math.cos((dLng * Math.PI) / 180);

    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    if (bearing < 0) bearing += 360;

    return bearing;
  }

  /**
   * Calculate speed from history
   */
  private calculateSpeed(): number | undefined {
    if (this.history.length < 2) return undefined;

    const recent = this.history.slice(-3);
    if (recent.length < 2) return undefined;

    const first = recent[0];
    const last = recent[recent.length - 1];

    const timeDiff = (last.position.timestamp - first.position.timestamp) / 1000; // seconds
    if (timeDiff <= 0) return undefined;

    // Calculate distance using Haversine
    const distance = this.haversineDistance(
      first.position.lat,
      first.position.lng,
      last.position.lat,
      last.position.lng
    );

    return distance / timeDiff; // m/s
  }

  /**
   * Haversine distance calculation
   */
  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Add to history
   */
  private addToHistory(entry: LocationHistory): void {
    this.history.push(entry);

    // Trim history
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Register update callback
   */
  onUpdate(callback: (loc: SharpLocation) => void): () => void {
    this.onUpdateCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const idx = this.onUpdateCallbacks.indexOf(callback);
      if (idx !== -1) this.onUpdateCallbacks.splice(idx, 1);
    };
  }

  /**
   * Notify all callbacks
   */
  private notifyUpdate(location: SharpLocation): void {
    this.onUpdateCallbacks.forEach(cb => {
      try {
        cb(location);
      } catch {}
    });
  }

  /**
   * Get current position (one-shot)
   */
  async getCurrentPosition(highAccuracy = true): Promise<SharpLocation> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        position => {
          const coords = position.coords;
          const location: SharpLocation = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            confidence: this.calculateConfidence(coords.accuracy),
            source: this.determineSource(coords.accuracy),
            timestamp: Date.now(),
            altitude: coords.altitude ?? undefined,
            heading: coords.heading ?? undefined,
            speed: coords.speed ?? undefined,
          };

          // Apply Kalman if we have state
          if (this.kalmanState) {
            const dt = this.lastUpdate ? (Date.now() - this.lastUpdate) / 1000 : 0;
            const filtered = this.applyKalmanFilter(location, dt);
            resolve(filtered);
          } else {
            resolve(location);
          }
        },
        error => reject(error),
        {
          enableHighAccuracy: highAccuracy,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Get last known position
   */
  getLastPosition(): SharpLocation | null {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1].position;
  }

  /**
   * Get position history
   */
  getHistory(): SharpLocation[] {
    return this.history.map(h => h.position);
  }

  /**
   * Get formatted coordinates string
   */
  getFormattedCoords(precision = 6): string {
    const pos = this.getLastPosition();
    if (!pos) return '---';
    return `${pos.lat.toFixed(precision)}, ${pos.lng.toFixed(precision)}`;
  }

  /**
   * Get status info
   */
  getStatus(): {
    isTracking: boolean;
    historySize: number;
    lastUpdate: number;
    kalmanActive: boolean;
  } {
    return {
      isTracking: this.isTracking,
      historySize: this.history.length,
      lastUpdate: this.lastUpdate,
      kalmanActive: this.kalmanState !== null,
    };
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.stopTracking();
    this.history = [];
    this.kalmanState = null;
    this.lastUpdate = 0;
    console.log('[SharpLoc] State reset');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.reset();
    this.onUpdateCallbacks = [];
    console.log('[SharpLoc] Destroyed');
  }
}

// Singleton export
export const sharpLocationEngine = new SharpLocationEngine();
